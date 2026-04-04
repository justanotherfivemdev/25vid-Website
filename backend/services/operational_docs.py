import hashlib
import io
import json
import logging
import os
import re
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from xml.etree import ElementTree

from config import (
    OPERATIONAL_DOC_AI_COOLDOWN_MINUTES,
    OPERATIONAL_DOC_AI_MAX_EVENTS_PER_RUN,
    OPERATIONAL_DOC_AI_MODEL,
    UPLOAD_DIR,
)
from database import db
from services.threat_intel import (
    classify_category,
    classify_threat_level,
    extract_keywords_from_text,
)

logger = logging.getLogger(__name__)

OPERATIONAL_DOCS_DIR = UPLOAD_DIR / "operational-docs"
OPERATIONAL_DOCS_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_DOCUMENT_EXTENSIONS = {
    ".pdf": {"application/pdf", "application/octet-stream"},
    ".docx": {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
    },
    ".txt": {"text/plain", "text/markdown", "application/octet-stream"},
}
ALLOWED_DOCUMENT_TYPES = set(ALLOWED_DOCUMENT_EXTENSIONS.keys())
MAX_OPERATIONAL_DOC_SIZE = 15 * 1024 * 1024

_WHITESPACE_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n{3,}")
_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def sanitize_filename(filename: str) -> str:
    candidate = Path(filename or "document").name
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(candidate).stem).strip("-") or "document"
    ext = Path(candidate).suffix.lower()
    if ext not in ALLOWED_DOCUMENT_TYPES:
        ext = ".txt"
    return f"{stem}{ext}"


def document_checksum(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def generation_signature(checksum: str, campaign_id: str, operation_id: Optional[str]) -> str:
    return f"{checksum}:{campaign_id}:{operation_id or 'none'}"


def _clean_extracted_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [_WHITESPACE_RE.sub(" ", line).strip() for line in text.split("\n")]
    cleaned = "\n".join(line for line in lines if line)
    cleaned = _BLANK_LINES_RE.sub("\n\n", cleaned)
    return cleaned.strip()


def _coerce_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _extract_docx_text(data: bytes) -> str:
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        xml = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml)
    parts = [chunk.strip() for chunk in root.itertext() if chunk and chunk.strip()]
    return _clean_extracted_text("\n".join(parts))


def _extract_pdf_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ModuleNotFoundError as exc:
        raise RuntimeError("PDF parser unavailable: install pypdf") from exc

    reader = PdfReader(io.BytesIO(data))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return _clean_extracted_text("\n\n".join(pages))


def extract_text_from_document(
    filename: str,
    content_type: str,
    data: bytes,
) -> Tuple[str, str, Optional[str]]:
    ext = Path(filename).suffix.lower()
    try:
        if ext == ".txt":
            return _clean_extracted_text(data.decode("utf-8", errors="ignore")), "parsed", None
        if ext == ".docx":
            return _extract_docx_text(data), "parsed", None
        if ext == ".pdf":
            return _extract_pdf_text(data), "parsed", None
        return "", "failed", f"Unsupported document type: {content_type or ext}"
    except RuntimeError as exc:
        return "", "parser_unavailable", str(exc)
    except Exception as exc:
        logger.exception("Document extraction failed for %s", filename)
        return "", "failed", str(exc)


def store_document_file(data: bytes, original_filename: str) -> Tuple[str, Path]:
    safe_name = sanitize_filename(original_filename)
    stored_name = (
        f"{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}_"
        f"{hashlib.sha1(data).hexdigest()[:10]}{Path(safe_name).suffix.lower()}"
    )
    file_path = OPERATIONAL_DOCS_DIR / stored_name
    with open(file_path, "wb") as handle:
        handle.write(data)
    return stored_name, file_path


async def fetch_generation_context(
    campaign_id: str,
    operation_id: Optional[str] = None,
) -> Tuple[dict, Optional[dict], Optional[dict]]:
    campaign = await db.campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not campaign:
        raise ValueError("Campaign not found")

    operation = None
    if operation_id:
        operation = await db.operations.find_one({"id": operation_id}, {"_id": 0})

    opord_query: Dict[str, Any] = {"campaign_id": campaign_id, "document_type": "opord"}
    if operation_id:
        opord_query["$or"] = [{"operation_id": operation_id}, {"operation_id": None}]

    opord_doc = await db.operation_documents.find_one(
        opord_query,
        {"_id": 0},
        sort=[("created_at", -1)],
    )

    return campaign, operation, opord_doc


def _candidate_locations(campaign: dict, operation: Optional[dict]) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []

    def add_candidate(name: str, latitude: Any, longitude: Any, place_name: Optional[str] = None):
        if latitude is None or longitude is None:
            return
        try:
            lat = float(latitude)
            lng = float(longitude)
        except (TypeError, ValueError):
            return
        candidates.append(
            {
                "name": name,
                "latitude": lat,
                "longitude": lng,
                "placeName": place_name or name,
                "country": place_name or name,
            }
        )

    if operation:
        add_candidate(
            operation.get("title") or "Operation Area",
            operation.get("lat"),
            operation.get("lng"),
            operation.get("region_label") or operation.get("theater") or campaign.get("theater") or campaign.get("name"),
        )

    for objective in campaign.get("objectives", []):
        add_candidate(
            objective.get("name") or "Objective",
            objective.get("lat"),
            objective.get("lng"),
            objective.get("region_label") or campaign.get("theater") or campaign.get("name"),
        )

    add_candidate(
        campaign.get("name") or "Campaign Theater",
        campaign.get("lat"),
        campaign.get("lng"),
        campaign.get("region") or campaign.get("theater") or campaign.get("name"),
    )

    if not candidates:
        candidates.append(
            {
                "name": campaign.get("name") or "Campaign Theater",
                "latitude": 0.0,
                "longitude": 0.0,
                "placeName": campaign.get("region") or campaign.get("theater") or campaign.get("name") or "Unknown Theater",
                "country": campaign.get("region") or campaign.get("theater") or campaign.get("name") or "Unknown Theater",
            }
        )

    return candidates


def _operation_start(operation: Optional[dict], fallback_iso: str) -> datetime:
    if operation and operation.get("date"):
        date = operation.get("date")
        raw_time = (operation.get("time") or "00:00").replace(" UTC", "")
        try:
            return datetime.fromisoformat(f"{date}T{raw_time}:00").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return _coerce_datetime(fallback_iso)


def _fallback_generated_events(
    campaign: dict,
    operation: Optional[dict],
    aar_doc: dict,
    opord_doc: Optional[dict],
    max_events: int,
) -> List[Dict[str, Any]]:
    aar_text = aar_doc.get("extracted_text") or ""
    base_sentences = [part.strip() for part in _SENTENCE_SPLIT_RE.split(aar_text) if part.strip()]
    if not base_sentences:
        base_sentences = [
            f"{campaign.get('name', 'Campaign')} concluded a major phase with mission outcomes documented in the after action report.",
            "Field elements reported contested objectives, adjusted force posture, and follow-on planning requirements.",
        ]

    objective_names = [obj.get("name") for obj in campaign.get("objectives", []) if obj.get("name")]
    operation_title = operation.get("title") if operation else campaign.get("name", "Operation")
    opord_hint = ""
    if opord_doc and opord_doc.get("extracted_text"):
        opord_hint = _clean_extracted_text(opord_doc["extracted_text"])[:280]

    drafts = [
        {
            "title": f"{operation_title}: After-Action Summary",
            "summary": base_sentences[0],
            "category": classify_category(base_sentences[0]),
            "threatLevel": classify_threat_level(base_sentences[0]),
            "location_label": objective_names[0] if objective_names else campaign.get("region") or campaign.get("theater"),
            "hours_after_start": 2,
        },
        {
            "title": f"{campaign.get('name', 'Campaign')} force posture updated",
            "summary": base_sentences[1] if len(base_sentences) > 1 else f"Units from {campaign.get('name', 'the campaign')} are repositioning after the latest operation outcome.",
            "category": "military",
            "threatLevel": "medium",
            "location_label": objective_names[1] if len(objective_names) > 1 else objective_names[0] if objective_names else campaign.get("name"),
            "hours_after_start": 6,
        },
        {
            "title": f"{campaign.get('name', 'Campaign')} follow-on assessment issued",
            "summary": (
                f"Command elements are refining follow-on actions after reviewing reported mission effects."
                + (f" Planning context: {opord_hint}" if opord_hint else "")
            )[:440],
            "category": "diplomatic" if "coordination" in aar_text.lower() else "military",
            "threatLevel": "low",
            "location_label": campaign.get("region") or campaign.get("theater") or campaign.get("name"),
            "hours_after_start": 12,
        },
    ]
    return drafts[:max_events]


def _normalize_llm_event(raw_event: dict, fallback_index: int) -> dict:
    return {
        "title": (raw_event.get("title") or f"Campaign Event {fallback_index + 1}").strip(),
        "summary": (raw_event.get("summary") or raw_event.get("description") or "").strip(),
        "category": (raw_event.get("category") or "").strip().lower(),
        "threatLevel": (raw_event.get("threatLevel") or raw_event.get("threat_level") or "").strip().lower(),
        "location_label": (raw_event.get("location_label") or raw_event.get("locationName") or raw_event.get("placeName") or "").strip(),
        "hours_after_start": raw_event.get("hours_after_start", fallback_index * 3 + 2),
        "keywords": raw_event.get("keywords") or [],
        "layer": raw_event.get("layer"),
    }


def _build_openai_prompt(
    campaign: dict,
    operation: Optional[dict],
    aar_doc: dict,
    opord_doc: Optional[dict],
    locations: List[Dict[str, Any]],
    max_events: int,
) -> str:
    campaign_summary = {
        "name": campaign.get("name"),
        "theater": campaign.get("theater"),
        "status": campaign.get("status"),
        "region": campaign.get("region"),
        "threat_level": campaign.get("threat_level"),
        "objectives": [
            {
                "name": obj.get("name"),
                "status": obj.get("status"),
                "priority": obj.get("priority"),
                "region_label": obj.get("region_label"),
            }
            for obj in campaign.get("objectives", [])[:8]
        ],
    }
    operation_summary = None
    if operation:
        operation_summary = {
            "title": operation.get("title"),
            "description": operation.get("description"),
            "operation_type": operation.get("operation_type"),
            "date": operation.get("date"),
            "time": operation.get("time"),
            "region_label": operation.get("region_label"),
        }
    return (
        "Generate simulated post-operation campaign events from this AAR.\n"
        "These events must be fictional/milsim timeline items, not claims of real journalism or government reporting.\n"
        "Return JSON only in the shape {\"events\":[...]}. Each event needs: "
        "title, summary, category, threatLevel, location_label, hours_after_start, keywords, layer.\n"
        f"Create no more than {max_events} events.\n"
        "Prefer the provided location labels exactly as written.\n\n"
        f"Campaign:\n{json.dumps(campaign_summary, ensure_ascii=False)}\n\n"
        f"Operation:\n{json.dumps(operation_summary, ensure_ascii=False)}\n\n"
        f"Available locations:\n{json.dumps(locations, ensure_ascii=False)}\n\n"
        f"OPORD context:\n{(opord_doc or {}).get('extracted_text', '')[:3500]}\n\n"
        f"AAR content:\n{aar_doc.get('extracted_text', '')[:5000]}"
    )


def _generate_with_openai(
    campaign: dict,
    operation: Optional[dict],
    aar_doc: dict,
    opord_doc: Optional[dict],
    max_events: int,
) -> Tuple[List[Dict[str, Any]], str]:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return [], "heuristic"

    try:
        from openai import OpenAI
    except Exception as exc:
        logger.warning("OpenAI client unavailable for operational doc generation: %s", exc)
        return [], "heuristic"

    locations = _candidate_locations(campaign, operation)
    client = OpenAI(api_key=api_key)
    prompt = _build_openai_prompt(campaign, operation, aar_doc, opord_doc, locations, max_events)

    try:
        completion = client.chat.completions.create(
            model=OPERATIONAL_DOC_AI_MODEL,
            temperature=0.3,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You generate concise simulated campaign events for a military exercise website. "
                        "Do not claim real-world sourcing. Keep each summary under 320 characters."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
        )
        raw = completion.choices[0].message.content if completion.choices else "{}"
        payload = json.loads(raw or "{}")
        events = payload.get("events") or []
        return events[:max_events], "openai"
    except Exception as exc:
        logger.warning("Operational document AI generation failed, falling back: %s", exc)
        return [], "heuristic"


def _resolve_location(
    preferred_label: str,
    index: int,
    candidates: List[Dict[str, Any]],
) -> Dict[str, Any]:
    lowered = preferred_label.lower().strip()
    for candidate in candidates:
        name = (candidate.get("name") or "").lower()
        place_name = (candidate.get("placeName") or "").lower()
        if lowered and (lowered in name or lowered in place_name):
            return candidate
    return candidates[index % len(candidates)]


def normalize_generated_events(
    raw_events: List[Dict[str, Any]],
    campaign: dict,
    operation: Optional[dict],
    aar_doc: dict,
    opord_doc: Optional[dict],
    provider: str,
) -> List[Dict[str, Any]]:
    candidates = _candidate_locations(campaign, operation)
    max_events = min(OPERATIONAL_DOC_AI_MAX_EVENTS_PER_RUN, max(len(raw_events), 1))
    if not raw_events:
        raw_events = _fallback_generated_events(campaign, operation, aar_doc, opord_doc, max_events)

    base_dt = _operation_start(operation, aar_doc.get("created_at"))
    signature = generation_signature(aar_doc["checksum"], aar_doc["campaign_id"], aar_doc.get("operation_id"))

    events: List[Dict[str, Any]] = []
    for index, raw in enumerate(raw_events[:OPERATIONAL_DOC_AI_MAX_EVENTS_PER_RUN]):
        normalized = _normalize_llm_event(raw, index)
        location = _resolve_location(normalized["location_label"], index, candidates)
        summary = normalized["summary"] or normalized["title"]
        event_dt = base_dt + timedelta(hours=float(normalized["hours_after_start"] or 0))
        map_worthy = location["latitude"] != 0.0 or location["longitude"] != 0.0

        events.append(
            {
                "title": normalized["title"],
                "summary": summary[:500],
                "category": normalized["category"] or classify_category(summary),
                "threatLevel": normalized["threatLevel"] or classify_threat_level(summary),
                "location": {
                    "latitude": location["latitude"],
                    "longitude": location["longitude"],
                    "placeName": location.get("placeName") or location.get("name"),
                    "country": location.get("country") or location.get("placeName") or location.get("name"),
                },
                "timestamp": event_dt.replace(tzinfo=timezone.utc).isoformat(),
                "source": "simulated-intel",
                "sourceUrl": None,
                "keywords": (normalized["keywords"] or extract_keywords_from_text(summary))[:8],
                "event_nature": "fictional",
                "layer": normalized.get("layer") or "military",
                "approved": False,
                "visible": False,
                "campaign_id": aar_doc["campaign_id"],
                "campaign_name": campaign.get("name", ""),
                "operation_id": aar_doc.get("operation_id"),
                "source_document_ids": [doc_id for doc_id in [aar_doc["id"], (opord_doc or {}).get("id")] if doc_id],
                "generation_provider": provider,
                "generation_status": "draft",
                "generation_signature": signature,
                "is_simulated": True,
                "map_worthy": map_worthy,
                "location_precision": "objective" if map_worthy else "unresolved",
                "rawContent": summary[:1000],
            }
        )
    return events


async def generate_campaign_event_drafts(
    document: dict,
    *,
    force: bool = False,
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()

    if document.get("document_type") != "aar":
        return {"events": [], "status": "not_applicable", "provider": None}

    if document.get("parse_status") not in {"parsed", "parser_unavailable"}:
        await db.operation_documents.update_one(
            {"id": document["id"]},
            {
                "$set": {
                    "generation_status": "failed",
                    "generation_error": "Document text is not available",
                    "updated_at": now_iso,
                }
            },
        )
        return {"events": [], "status": "failed", "provider": None, "error": "Document text is not available"}

    last_generated = document.get("last_generated_at")
    if last_generated and not force:
        last_dt = datetime.fromisoformat(str(last_generated).replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - last_dt < timedelta(minutes=OPERATIONAL_DOC_AI_COOLDOWN_MINUTES):
            await db.operation_documents.update_one(
                {"id": document["id"]},
                {
                    "$set": {
                        "generation_status": "cooldown",
                        "generation_error": None,
                        "updated_at": now_iso,
                    }
                },
            )
            return {"events": [], "status": "cooldown", "provider": document.get("generation_provider")}

    campaign, operation, opord_doc = await fetch_generation_context(
        document["campaign_id"],
        document.get("operation_id"),
    )
    signature = generation_signature(document["checksum"], document["campaign_id"], document.get("operation_id"))

    if not force:
        existing = await db.community_events.find(
            {"generation_signature": signature, "generation_status": {"$in": ["draft", "published"]}},
            {"_id": 0},
        ).to_list(100)
        if existing:
            await db.operation_documents.update_one(
                {"id": document["id"]},
                {
                    "$set": {
                        "generated_event_ids": [event.get("id") for event in existing if event.get("id")],
                        "generated_event_count": len(existing),
                        "generation_status": "skipped",
                        "generation_provider": existing[0].get("generation_provider"),
                        "generation_signature": signature,
                        "generation_error": None,
                        "updated_at": now_iso,
                    }
                },
            )
            return {
                "events": existing,
                "status": "skipped",
                "provider": existing[0].get("generation_provider"),
            }

    if force:
        await db.community_events.update_many(
            {
                "generation_signature": signature,
                "generation_status": "draft",
            },
            {
                "$set": {
                    "visible": False,
                    "generation_status": "superseded",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    raw_events, provider = _generate_with_openai(
        campaign,
        operation,
        document,
        opord_doc,
        OPERATIONAL_DOC_AI_MAX_EVENTS_PER_RUN,
    )
    normalized_events = normalize_generated_events(raw_events, campaign, operation, document, opord_doc, provider)

    stored_events = []
    for event in normalized_events:
        dedupe_key = f"{signature}:{event['title']}:{event['timestamp']}"
        event_id = f"cev_{hashlib.sha1(dedupe_key.encode()).hexdigest()[:12]}"
        event["id"] = event_id
        event["created_at"] = now_iso
        event["updated_at"] = now_iso
        await db.community_events.update_one(
            {"id": event_id},
            {"$set": event},
            upsert=True,
        )
        stored_events.append(event)

    await db.operation_documents.update_one(
        {"id": document["id"]},
        {
            "$set": {
                "generated_event_ids": [evt["id"] for evt in stored_events],
                "generated_event_count": len(stored_events),
                "generation_status": "generated" if stored_events else "failed",
                "generation_provider": provider,
                "generation_error": None if stored_events else "No event drafts were generated",
                "generation_signature": signature,
                "last_generated_at": now_iso,
                "updated_at": now_iso,
            }
        },
    )

    return {
        "events": stored_events,
        "status": "generated" if stored_events else "failed",
        "provider": provider,
    }
