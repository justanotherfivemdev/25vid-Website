import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from config import UPLOAD_DIR
from database import db
from middleware.rbac import Permission, require_any_permission
from models.operational_doc import OperationDocument
from services.operational_docs import (
    ALLOWED_DOCUMENT_EXTENSIONS,
    MAX_OPERATIONAL_DOC_SIZE,
    document_checksum,
    extract_text_from_document,
    generate_campaign_event_drafts,
    sanitize_filename,
    store_document_file,
)

router = APIRouter()


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {key: _serialize_value(item) for key, item in value.items()}
    return value


def _serialize_document(document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not document:
        return None
    doc = _serialize_value({key: value for key, value in document.items() if key != "_id"})
    if doc.get("stored_filename"):
        doc["download_url"] = f"/api/admin/operational-docs/{doc['id']}/download"
    return doc


def _safe_relative_doc_path(file_path: Path) -> str:
    try:
        relative = file_path.relative_to(UPLOAD_DIR)
        return str(relative).replace("\\", "/")
    except Exception:
        return str(file_path).replace("\\", "/")


async def _resolve_campaign_and_operation(campaign_id: str, operation_id: Optional[str]) -> Tuple[dict, Optional[dict]]:
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    operation = None
    if operation_id:
        operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})
        if not operation:
            raise HTTPException(status_code=404, detail="Operation not found")
        if operation.get("campaign_id") and operation.get("campaign_id") != campaign_id:
            raise HTTPException(status_code=400, detail="Operation does not belong to the selected campaign")

    return campaign, operation


@router.get("/admin/operational-docs")
async def list_operational_documents(
    campaign_id: Optional[str] = None,
    operation_id: Optional[str] = None,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    query: Dict[str, Any] = {}
    if campaign_id:
        query["campaign_id"] = campaign_id
    if operation_id:
        query["operation_id"] = operation_id

    documents = (
        await db.operation_documents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    )
    return {
        "documents": [_serialize_document(document) for document in documents],
        "count": len(documents),
    }


@router.post("/admin/operational-docs/upload")
async def upload_operational_document(
    file: UploadFile = File(...),
    document_type: str = Form(...),
    campaign_id: str = Form(...),
    operation_id: Optional[str] = Form(None),
    title: Optional[str] = Form(None),
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    normalized_document_type = (document_type or "").strip().lower()
    if normalized_document_type not in {"opord", "aar"}:
        raise HTTPException(status_code=400, detail="document_type must be 'opord' or 'aar'")

    campaign, operation = await _resolve_campaign_and_operation(campaign_id, operation_id)

    original_filename = sanitize_filename(file.filename or "document")
    extension = Path(original_filename).suffix.lower()
    allowed_types = ALLOWED_DOCUMENT_EXTENSIONS.get(extension)
    if not allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported document type")

    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type '{content_type}' for {extension} upload",
        )

    try:
        data = await file.read()
    finally:
        await file.close()

    if not data:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    if len(data) > MAX_OPERATIONAL_DOC_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(data)} bytes). Maximum: {MAX_OPERATIONAL_DOC_SIZE} bytes.",
        )

    checksum = document_checksum(data)
    duplicate = await db.operation_documents.find_one(
        {
            "document_type": normalized_document_type,
            "campaign_id": campaign_id,
            "operation_id": operation_id,
            "checksum": checksum,
        },
        {"_id": 0},
    )
    if duplicate:
        return {
            "document": _serialize_document(duplicate),
            "duplicate": True,
            "generated": None,
        }

    extracted_text, parse_status, parse_error = extract_text_from_document(
        original_filename,
        content_type,
        data,
    )
    stored_filename, file_path = store_document_file(data, original_filename)

    document = OperationDocument(
        title=(title or Path(original_filename).stem).strip(),
        document_type=normalized_document_type,
        campaign_id=campaign_id,
        campaign_name=campaign.get("name", ""),
        operation_id=operation_id,
        operation_title=(operation or {}).get("title", ""),
        original_filename=file.filename or original_filename,
        stored_filename=stored_filename,
        file_path=_safe_relative_doc_path(file_path),
        content_type=content_type,
        extension=extension,
        file_size=len(data),
        checksum=checksum,
        extracted_text=extracted_text,
        parse_status=parse_status,
        parse_error=parse_error,
        uploaded_by=current_user.get("id", ""),
        uploaded_by_username=current_user.get("username", ""),
        generation_status="pending" if normalized_document_type == "aar" else "not_applicable",
    )
    doc = document.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    doc["updated_at"] = doc["updated_at"].isoformat()
    await db.operation_documents.insert_one(doc)

    generated = None
    if normalized_document_type == "aar":
        generated = await generate_campaign_event_drafts(doc)
        refreshed = await db.operation_documents.find_one({"id": document.id}, {"_id": 0})
        if refreshed:
            doc = refreshed

    return {
        "document": _serialize_document(doc),
        "duplicate": False,
        "generated": generated,
    }


@router.post("/admin/operational-docs/{document_id}/reprocess")
async def reprocess_operational_document(
    document_id: str,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    document = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(document.get("file_path") or "")
    if not file_path.is_absolute():
        file_path = UPLOAD_DIR / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stored document file not found")

    data = file_path.read_bytes()
    extracted_text, parse_status, parse_error = extract_text_from_document(
        document.get("stored_filename") or document.get("original_filename") or "document.txt",
        document.get("content_type") or "application/octet-stream",
        data,
    )
    updates: Dict[str, Any] = {
        "extracted_text": extracted_text,
        "parse_status": parse_status,
        "parse_error": parse_error,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.operation_documents.update_one({"id": document_id}, {"$set": updates})

    refreshed = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    generated = None
    if refreshed and refreshed.get("document_type") == "aar":
        generated = await generate_campaign_event_drafts(refreshed, force=True)
        refreshed = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})

    return {
        "document": _serialize_document(refreshed),
        "generated": generated,
    }


@router.post("/admin/operational-docs/{document_id}/publish-generated-events")
async def publish_generated_events(
    document_id: str,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    document = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    event_ids = document.get("generated_event_ids") or []
    now_iso = datetime.now(timezone.utc).isoformat()
    if event_ids:
        await db.community_events.update_many(
            {"id": {"$in": event_ids}},
            {
                "$set": {
                    "approved": True,
                    "visible": True,
                    "generation_status": "published",
                    "updated_at": now_iso,
                }
            },
        )
        await db.operation_documents.update_one(
            {"id": document_id},
            {"$set": {"generation_status": "published", "updated_at": now_iso}},
        )

    events = await db.community_events.find({"id": {"$in": event_ids}}, {"_id": 0}).to_list(200)
    return {"published": len(events), "events": _serialize_value(events)}


@router.post("/admin/operational-docs/{document_id}/hide-generated-events")
async def hide_generated_events(
    document_id: str,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    document = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    event_ids = document.get("generated_event_ids") or []
    now_iso = datetime.now(timezone.utc).isoformat()
    if event_ids:
        await db.community_events.update_many(
            {"id": {"$in": event_ids}},
            {
                "$set": {
                    "visible": False,
                    "generation_status": "hidden",
                    "updated_at": now_iso,
                }
            },
        )
        await db.operation_documents.update_one(
            {"id": document_id},
            {"$set": {"generation_status": "hidden", "updated_at": now_iso}},
        )

    events = await db.community_events.find({"id": {"$in": event_ids}}, {"_id": 0}).to_list(200)
    return {"hidden": len(events), "events": _serialize_value(events)}


@router.get("/admin/operational-docs/{document_id}/download")
async def download_operational_document(
    document_id: str,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    document = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(document.get("file_path") or "")
    if not file_path.is_absolute():
        file_path = UPLOAD_DIR / file_path
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Stored document file not found")

    return FileResponse(
        path=str(file_path),
        media_type=document.get("content_type", "application/octet-stream"),
        filename=document.get("original_filename") or document.get("stored_filename") or "document",
    )


@router.delete("/admin/operational-docs/{document_id}")
async def delete_operational_document(
    document_id: str,
    current_user: dict = Depends(
        require_any_permission(Permission.MANAGE_OPERATIONS, Permission.MANAGE_CAMPAIGNS)
    ),
):
    document = await db.operation_documents.find_one({"id": document_id}, {"_id": 0})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    event_ids = document.get("generated_event_ids") or []
    if event_ids:
        await db.community_events.update_many(
            {"id": {"$in": event_ids}},
            {
                "$set": {
                    "visible": False,
                    "approved": False,
                    "generation_status": "removed",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    result = await db.operation_documents.delete_one({"id": document_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = Path(document.get("file_path") or "")
    if not file_path.is_absolute():
        file_path = UPLOAD_DIR / file_path
    try:
        if file_path.exists():
            os.remove(file_path)
    except OSError:
        pass

    return {"deleted": True, "id": document_id}
