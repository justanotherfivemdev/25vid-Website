"""
25th Infantry Division – Research Agent Service
================================================
Provides an intelligent research agent that combines:
  - OpenAI **Responses API** (NOT Chat Completions) for multi-step reasoning
  - Valyu as a tool provider for real-world intelligence search
  - Structured output compatible with Campaigns, Global Threat Map, and Intel Board

Why Responses API instead of Chat Completions?
-----------------------------------------------
The OpenAI **Responses API** (client.responses.create) was released in
March 2025 and is purpose-built for agentic / tool-use workflows.
Key differences vs Chat Completions:

  1. Stateful conversation via `previous_response_id` – tool outputs are fed
     back without rebuilding the full message history on every turn.
  2. Typed output items – `response.output` is a list of typed objects
     (ResponseOutputMessage, ResponseFunctionToolCall, etc.) with clear
     `type` discriminators.
  3. Designed for multi-step agent loops – cleaner than maintaining a manual
     `messages` list as required by Chat Completions.

Requires openai Python SDK >= 1.26.0 (when responses.create was introduced).
If an older SDK version is detected the service raises a clear RuntimeError.

Usage
-----
  from backend.services.research_agent import run_research_query

  result = await run_research_query(
      "Assess current threat environment for 25th ID deployment in Fallujah"
  )
  # result keys: summary, key_findings, threat_level, regions,
  #              coordinates, recommended_actions, full_report,
  #              sources, query, timestamp
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("research_agent")

# ---------------------------------------------------------------------------
# Configuration (all from environment – never hard-code keys)
# ---------------------------------------------------------------------------
OPENAI_API_KEY: str = os.environ.get("OPENAI_API_KEY", "")
VALYU_API_KEY: str = os.environ.get("VALYU_API_KEY", "")

OPENAI_MODEL: str = os.environ.get("RESEARCH_AGENT_MODEL", "gpt-4o")
VALYU_BASE_URL: str = "https://api.valyu.ai/v1"

# Maximum tool-call iterations to prevent runaway loops
MAX_ITERATIONS: int = int(os.environ.get("RESEARCH_AGENT_MAX_ITERATIONS", "8"))
# Retry behaviour for transient API failures
MAX_RETRIES: int = 3
RETRY_BASE_DELAY: float = 1.5

# ---------------------------------------------------------------------------
# System prompt – tailored to the 25th Infantry Division platform
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """\
You are an intelligence analyst for the 25th Infantry Division (Tropic Lightning),
US Army.  Your role is to conduct thorough, multi-step research and produce
structured military intelligence assessments that support:
  - Campaign planning and theater operations
  - Global Threat Map overlay population
  - Intel Board briefings for unit members

Conduct research step-by-step.  Use your tools to gather information from
multiple sources before forming conclusions.  When searching, use specific
military, geopolitical, and regional terminology to maximise result quality.

In your final response include ALL of the following sections:

EXECUTIVE SUMMARY
[2-4 sentence assessment]

KEY FINDINGS
• [finding 1]
• [finding 2]
• (continue as needed)

THREAT LEVEL ASSESSMENT
[One of: LOW / MEDIUM / HIGH / CRITICAL with brief rationale]

REGIONS AFFECTED
[Comma-separated list of regions/countries]

GEOGRAPHIC COORDINATES
[Any relevant lat/lng pairs you identified, one per line: lat, lng – location name]

RECOMMENDED ACTIONS
• [action 1]
• [action 2]
• (continue as needed)

Cite key facts with source names where possible.
"""

# ---------------------------------------------------------------------------
# Custom Valyu tools (used when the `valyu` Python package is unavailable)
# ---------------------------------------------------------------------------
_FALLBACK_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "name": "valyu_search",
        "description": (
            "Search the web and intelligence databases using Valyu for current "
            "events, military operations, geopolitical developments, and threat "
            "intelligence.  Returns a list of relevant documents."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Specific search query optimised for intelligence research",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (1-20, default 10)",
                    "default": 10,
                },
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "valyu_deepsearch",
        "description": (
            "Perform a deep research query using Valyu, which synthesises "
            "information from multiple sources into a comprehensive answer. "
            "Use for complex analytical questions requiring aggregated intelligence."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Detailed research question",
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum sources to consider (1-15, default 10)",
                    "default": 10,
                },
            },
            "required": ["query"],
        },
    },
]


# ---------------------------------------------------------------------------
# Valyu HTTP helpers (fallback when valyu package unavailable)
# ---------------------------------------------------------------------------
async def _valyu_search_http(query: str, max_results: int = 10) -> Dict[str, Any]:
    """Call Valyu /search via HTTP and return structured results."""
    if not VALYU_API_KEY:
        return {"results": [], "error": "VALYU_API_KEY not configured"}
    headers = {"x-api-key": VALYU_API_KEY, "Content-Type": "application/json"}
    payload = {"query": query, "search_type": "all", "max_num_results": max_results}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{VALYU_BASE_URL}/search", json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning("Valyu search HTTP %s: %s", resp.status_code, resp.text[:200])
                return {"results": [], "error": f"HTTP {resp.status_code}"}
            data = resp.json()
            return {"results": data.get("results", [])}
    except Exception as exc:
        logger.error("Valyu search HTTP error: %s", exc)
        return {"results": [], "error": str(exc)}


async def _valyu_deepsearch_http(query: str, max_results: int = 10) -> Dict[str, Any]:
    """Call Valyu /deepsearch via HTTP and return structured results."""
    if not VALYU_API_KEY:
        return {"summary": "VALYU_API_KEY not configured", "sources": []}
    headers = {"x-api-key": VALYU_API_KEY, "Content-Type": "application/json"}
    payload = {"query": query, "search_type": "all", "max_num_results": max_results}
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{VALYU_BASE_URL}/deepsearch", json=payload, headers=headers)
            if resp.status_code != 200:
                logger.warning("Valyu deepsearch HTTP %s: %s", resp.status_code, resp.text[:200])
                return {"summary": f"Search failed (HTTP {resp.status_code})", "sources": []}
            data = resp.json()
            return {
                "summary": data.get("answer", data.get("summary", "")),
                "sources": [
                    {"title": s.get("title", ""), "url": s.get("url", "")}
                    for s in data.get("results", [])[:20]
                ],
            }
    except Exception as exc:
        logger.error("Valyu deepsearch HTTP error: %s", exc)
        return {"summary": f"Search error: {exc}", "sources": []}


# ---------------------------------------------------------------------------
# Lazy client factories
# ---------------------------------------------------------------------------
def _openai_client():
    """Return an initialised OpenAI client (raises RuntimeError if unavailable)."""
    try:
        from openai import OpenAI  # type: ignore[import-untyped]
        import openai as _oai_pkg
    except ImportError as exc:
        raise RuntimeError(
            "openai package not installed – run: pip install openai"
        ) from exc
    if not OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY environment variable is not set")
    client = OpenAI(api_key=OPENAI_API_KEY)
    # Verify the Responses API is present (added in openai >= 1.26.0)
    if not hasattr(client, "responses"):
        ver = getattr(_oai_pkg, "__version__", "unknown")
        raise RuntimeError(
            f"OpenAI Responses API not available in SDK version {ver}. "
            "Upgrade to openai >= 1.26.0: pip install 'openai>=1.26.0'"
        )
    return client


def _valyu_client_and_tools() -> Tuple[Optional[Any], List[Dict[str, Any]]]:
    """
    Try to load the Valyu Python SDK.

    Returns (client, tools) where:
      - client is a Valyu instance (or None if unavailable)
      - tools is the list of OpenAI-compatible tool definitions to pass
    """
    if not VALYU_API_KEY:
        logger.warning("VALYU_API_KEY not set – research agent will have limited capability")
        return None, _FALLBACK_TOOLS

    try:
        from valyu import Valyu  # type: ignore[import-untyped]

        vc = Valyu(api_key=VALYU_API_KEY)
        tools = vc.get_tools()
        logger.info("Valyu SDK loaded – %d tools available", len(tools))
        return vc, tools
    except ImportError:
        logger.info(
            "valyu package not installed – using HTTP fallback tools "
            "(run `pip install valyu` for native SDK support)"
        )
        return None, _FALLBACK_TOOLS
    except Exception as exc:
        logger.warning("Valyu SDK init failed (%s) – using HTTP fallback", exc)
        return None, _FALLBACK_TOOLS


# ---------------------------------------------------------------------------
# Tool execution dispatcher
# ---------------------------------------------------------------------------
async def _execute_tool(
    name: str,
    args: Dict[str, Any],
    valyu_client: Optional[Any],
) -> str:
    """
    Execute a tool call returned by the model.

    If the Valyu SDK client is available it delegates to `client.call_tool`.
    Otherwise the HTTP fallback functions are used.

    Returns a JSON string suitable for feeding back to the model.
    """
    logger.info("Tool call: %s(%s)", name, args)
    try:
        if valyu_client is not None:
            result = valyu_client.call_tool(name, **args)
            return json.dumps(result) if not isinstance(result, str) else result

        # HTTP fallback
        query = args.get("query", "")
        max_results = int(args.get("max_results", 10))
        if name == "valyu_search":
            data = await _valyu_search_http(query, max_results)
        elif name == "valyu_deepsearch":
            data = await _valyu_deepsearch_http(query, max_results)
        else:
            data = {"error": f"Unknown tool: {name}"}
        return json.dumps(data)
    except Exception as exc:
        logger.error("Tool execution error [%s]: %s", name, exc)
        return json.dumps({"error": str(exc), "tool": name})


# ---------------------------------------------------------------------------
# Output parsing helpers
# ---------------------------------------------------------------------------
_SECTION_PATTERNS = {
    "summary": re.compile(
        r"EXECUTIVE SUMMARY[:\s]*\n(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
    "key_findings": re.compile(
        r"KEY FINDINGS[:\s]*\n(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
    "threat_level": re.compile(
        r"THREAT LEVEL[^:\n]*[:\s]*\n?(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
    "regions": re.compile(
        r"REGIONS AFFECTED[:\s]*\n(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
    "coordinates": re.compile(
        r"GEOGRAPHIC COORDINATES[:\s]*\n(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
    "recommended_actions": re.compile(
        r"RECOMMENDED ACTIONS[:\s]*\n(.*?)(?=\n[A-Z]{3}|\Z)", re.S | re.I
    ),
}

_BULLET_RE = re.compile(r"^[•\-\*\d\.\)]+\s*")
_COORD_RE = re.compile(r"(-?\d{1,3}\.\d{2,6})[,\s]+(-?\d{1,3}\.\d{2,6})")
_THREAT_WORDS = {
    "critical": "critical",
    "high": "high",
    "medium": "medium",
    "moderate": "medium",
    "low": "low",
    "minimal": "low",
}


def _extract_bullets(text: str) -> List[str]:
    items: List[str] = []
    for line in text.splitlines():
        line = line.strip()
        cleaned = _BULLET_RE.sub("", line).strip()
        if cleaned and len(cleaned) > 5:
            items.append(cleaned)
    return items


def _parse_threat_level(text: str) -> str:
    lower = text.lower()
    for word, level in _THREAT_WORDS.items():
        if word in lower:
            return level
    return "medium"


def _parse_coordinates(text: str) -> List[Dict[str, float]]:
    coords: List[Dict[str, float]] = []
    for match in _COORD_RE.finditer(text):
        lat, lng = float(match.group(1)), float(match.group(2))
        if -90 <= lat <= 90 and -180 <= lng <= 180:
            coords.append({"lat": lat, "lng": lng})
    return coords[:10]


def _build_structured_output(
    query: str,
    full_text: str,
    sources: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Parse the agent's final text response into the canonical structured format."""

    def _section(key: str) -> str:
        m = _SECTION_PATTERNS[key].search(full_text)
        return m.group(1).strip() if m else ""

    summary_text = _section("summary")
    if not summary_text:
        # Fall back: use first non-empty paragraph
        paras = [p.strip() for p in full_text.split("\n\n") if len(p.strip()) > 40]
        summary_text = paras[0][:600] if paras else full_text[:600]

    findings_text = _section("key_findings")
    key_findings = _extract_bullets(findings_text) if findings_text else []
    if not key_findings:
        key_findings = ["See full report for detailed findings."]

    threat_text = _section("threat_level")
    threat_level = _parse_threat_level(threat_text or full_text)

    regions_text = _section("regions")
    regions: List[str] = []
    if regions_text:
        regions = [r.strip() for r in re.split(r"[,\n]", regions_text) if r.strip()]

    coords_text = _section("coordinates")
    coordinates = _parse_coordinates(coords_text or full_text)

    actions_text = _section("recommended_actions")
    recommended_actions = _extract_bullets(actions_text) if actions_text else []
    if not recommended_actions:
        recommended_actions = ["Review full report and coordinate with S2 for operational planning."]

    return {
        "summary": summary_text[:800],
        "key_findings": key_findings[:12],
        "threat_level": threat_level,
        "regions": regions[:10],
        "coordinates": coordinates,
        "recommended_actions": recommended_actions[:6],
        "full_report": full_text,
        "sources": sources[:20],
        "query": query,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Core agent loop (OpenAI Responses API)
# ---------------------------------------------------------------------------
def _extract_text_from_output(output: list) -> str:
    """Walk a response.output list and collect all text content."""
    parts: List[str] = []
    for item in output:
        item_type = getattr(item, "type", None)
        if item_type == "message":
            content = getattr(item, "content", [])
            for block in content:
                text = getattr(block, "text", None)
                if text:
                    parts.append(text)
        elif item_type == "text":
            text = getattr(item, "text", None)
            if text:
                parts.append(text)
    return "\n".join(parts)


async def run_research_query(query: str) -> Dict[str, Any]:
    """
    Run the 25th ID research agent.

    Uses the OpenAI **Responses API** (not Chat Completions) in a tool-call
    loop with Valyu search tools to gather and synthesise intelligence.

    Args:
        query: Natural-language intelligence research question.

    Returns:
        Structured intelligence dict with keys:
            summary, key_findings, threat_level, regions, coordinates,
            recommended_actions, full_report, sources, query, timestamp
    """
    # ---- Validate prerequisites ----------------------------------------
    if not OPENAI_API_KEY:
        return _error_result(query, "OPENAI_API_KEY not configured")
    if not VALYU_API_KEY:
        logger.warning("VALYU_API_KEY not set – research will rely on model knowledge only")

    try:
        oai = _openai_client()
    except (RuntimeError, ValueError) as exc:
        return _error_result(query, str(exc))

    valyu_client, tools = _valyu_client_and_tools()
    all_sources: List[Dict[str, Any]] = []

    # ---- Initial call --------------------------------------------------
    logger.info("Research agent START – query: %s", query[:120])

    initial_input = (
        f"Conduct a comprehensive intelligence assessment for the 25th Infantry "
        f"Division regarding the following:\n\n{query}\n\n"
        f"Use your search tools to gather current information from multiple sources "
        f"before writing your final assessment."
    )

    response = None
    for attempt in range(MAX_RETRIES):
        try:
            response = oai.responses.create(
                model=OPENAI_MODEL,
                instructions=_SYSTEM_PROMPT,
                input=initial_input,
                tools=tools,
            )
            break
        except Exception as exc:
            if attempt < MAX_RETRIES - 1:
                wait = RETRY_BASE_DELAY * (2 ** attempt)
                logger.warning("OpenAI API error (attempt %d): %s – retrying in %.1fs", attempt + 1, exc, wait)
                await asyncio.sleep(wait)
            else:
                logger.error("OpenAI API failed after %d attempts: %s", MAX_RETRIES, exc)
                return _error_result(query, f"OpenAI API error: {exc}")

    # ---- Tool-call loop ------------------------------------------------
    for iteration in range(MAX_ITERATIONS):
        # Check if there are tool calls in the output
        tool_calls = [item for item in response.output if getattr(item, "type", None) == "function_call"]

        if not tool_calls:
            logger.info("Research agent COMPLETE – no more tool calls (iteration %d)", iteration)
            break

        logger.info("Iteration %d – executing %d tool call(s)", iteration + 1, len(tool_calls))

        # Execute all tool calls (run concurrently for speed)
        async def _run_tool(tc) -> Dict[str, Any]:
            raw_args = getattr(tc, "arguments", "{}")
            args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
            result_str = await _execute_tool(tc.name, args, valyu_client)
            # Collect sources from search results
            try:
                result_data = json.loads(result_str)
                for key in ("results", "sources"):
                    if isinstance(result_data.get(key), list):
                        all_sources.extend(
                            {"title": s.get("title", ""), "url": s.get("url", "")}
                            for s in result_data[key][:5]
                            if isinstance(s, dict)
                        )
            except (json.JSONDecodeError, AttributeError):
                pass
            return {"type": "function_call_output", "call_id": tc.call_id, "output": result_str}

        tool_outputs = await asyncio.gather(*[_run_tool(tc) for tc in tool_calls])

        # Feed tool results back via previous_response_id
        for attempt in range(MAX_RETRIES):
            try:
                response = oai.responses.create(
                    model=OPENAI_MODEL,
                    previous_response_id=response.id,
                    input=list(tool_outputs),
                    tools=tools,
                )
                break
            except Exception as exc:
                if attempt < MAX_RETRIES - 1:
                    wait = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "OpenAI tool-result call error (attempt %d): %s – retrying in %.1fs",
                        attempt + 1, exc, wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error("OpenAI tool-result call failed: %s", exc)
                    # Return partial result with whatever text we have so far
                    partial_text = _extract_text_from_output(response.output)
                    return _build_structured_output(query, partial_text or "Research incomplete due to API error.", all_sources)

    # ---- Extract final text -------------------------------------------
    final_text = _extract_text_from_output(response.output)
    if not final_text:
        final_text = "Research completed but no text response was generated. Please retry."
        logger.warning("Research agent produced no text output")

    logger.info("Research agent DONE – response length %d chars, %d sources", len(final_text), len(all_sources))
    return _build_structured_output(query, final_text, all_sources)


def _error_result(query: str, message: str) -> Dict[str, Any]:
    """Return a well-formed error result dict."""
    return {
        "summary": f"Research agent unavailable: {message}",
        "key_findings": [message],
        "threat_level": "unknown",
        "regions": [],
        "coordinates": [],
        "recommended_actions": ["Check API configuration and retry."],
        "full_report": "",
        "sources": [],
        "query": query,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "error": message,
    }


# ---------------------------------------------------------------------------
# Integration helpers – convert agent output into platform entities
# ---------------------------------------------------------------------------

def result_to_campaign_intel(
    result: Dict[str, Any],
    campaign_id: str,
    author_id: str = "research_agent",
    author_name: str = "Research Agent",
) -> Dict[str, Any]:
    """
    Convert a research-agent result into an intel briefing document
    that can be directly inserted into `db.intel_briefings` and attached
    to a campaign.

    Example:
        briefing = result_to_campaign_intel(result, campaign_id="camp_abc123")
        await db.intel_briefings.insert_one(briefing)
    """
    now = datetime.now(timezone.utc).isoformat()
    threat = result.get("threat_level", "medium")
    severity_map = {"low": "low", "medium": "medium", "high": "high", "critical": "critical"}
    severity = severity_map.get(threat, "medium")

    # Build rich markdown content
    findings = "\n".join(f"• {f}" for f in result.get("key_findings", []))
    actions = "\n".join(f"• {a}" for a in result.get("recommended_actions", []))
    sources = result.get("sources", [])
    source_lines = "\n".join(f"- [{s.get('title', 'Source')}]({s.get('url', '#')})" for s in sources[:10] if s.get("url"))

    content = f"""{result.get('summary', '')}

**Key Findings**
{findings}

**Recommended Actions**
{actions}

**Regions Affected:** {', '.join(result.get('regions', []))}

**Research Query:** {result.get('query', '')}

**Generated:** {now}
"""
    if source_lines:
        content += f"\n**Sources**\n{source_lines}"

    briefing_id = str(uuid.uuid4())
    coordinates = result.get("coordinates", [])
    first_coord = coordinates[0] if coordinates else {}

    return {
        "id": briefing_id,
        "title": f"Intel Assessment: {result.get('query', 'Research Query')[:80]}",
        "content": content.strip(),
        "category": "intel_update",
        "classification": "priority" if severity in ("high", "critical") else "routine",
        "visibility_scope": "members",
        "tags": ["research-agent", "ai-generated"] + result.get("regions", [])[:3],
        "campaign_id": campaign_id,
        "theater": result.get("regions", [""])[0] if result.get("regions") else "",
        "region_label": ", ".join(result.get("regions", [])[:2]),
        "lat": first_coord.get("lat"),
        "lng": first_coord.get("lng"),
        "severity": severity,
        "author_id": author_id,
        "author_name": author_name,
        "created_at": now,
        "updated_at": None,
        # Research agent metadata
        "research_agent": {
            "query": result.get("query", ""),
            "threat_level": threat,
            "sources_count": len(sources),
            "generated_at": now,
        },
    }


def result_to_map_events(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Convert a research-agent result into a list of map event documents
    suitable for insertion into `db.map_events` (Global Threat Map).

    Each coordinate extracted from the research result becomes an event
    marker with title, description, threat_level, and metadata.

    Example:
        events = result_to_map_events(result)
        for evt in events:
            await db.map_events.update_one(
                {"id": evt["id"]},
                {"$set": evt, "$setOnInsert": {"created_at": evt["updated_at"]}},
                upsert=True,
            )
    """
    now = datetime.now(timezone.utc).isoformat()
    events: List[Dict[str, Any]] = []
    threat_level = result.get("threat_level", "medium")
    summary = result.get("summary", "")[:300]
    query = result.get("query", "")
    regions = result.get("regions", [])

    for i, coord in enumerate(result.get("coordinates", [])[:10]):
        lat = coord.get("lat")
        lng = coord.get("lng")
        if lat is None or lng is None:
            continue

        event_id = f"me_external_ra_{uuid.uuid4().hex[:8]}"
        region_label = regions[i] if i < len(regions) else (regions[0] if regions else "Unknown")

        events.append({
            "id": event_id,
            "type": "external_event",
            "title": f"Intel: {region_label[:50]}",
            "description": summary,
            "latitude": float(lat),
            "longitude": float(lng),
            "threat_level": threat_level,
            "source": "research_agent",
            "related_entity_id": None,
            "updated_at": now,
            "created_at": now,
            "metadata": {
                "entity_type": "research_agent",
                "query": query[:200],
                "regions": regions[:5],
                "threat_level": threat_level,
                "generated_at": now,
            },
        })

    return events


def result_to_intel_briefing(
    result: Dict[str, Any],
    author_id: str = "research_agent",
    author_name: str = "Research Agent",
) -> Dict[str, Any]:
    """
    Convert a research-agent result into a standalone Intel Board briefing
    (no campaign association).

    Example:
        briefing = result_to_intel_briefing(result)
        await db.intel_briefings.insert_one(briefing)
        await upsert_map_event("intel", briefing, briefing["id"])
    """
    return result_to_campaign_intel(
        result,
        campaign_id="",
        author_id=author_id,
        author_name=author_name,
    )


# ---------------------------------------------------------------------------
# Example / smoke test (run directly: python -m backend.services.research_agent)
# ---------------------------------------------------------------------------
async def _example():
    """
    Mandatory example from the spec:
      Query: "Assess current threat environment for 25th ID deployment
               in Fallujah and surrounding regions"
    """
    query = (
        "Assess current threat environment for 25th ID deployment "
        "in Fallujah and surrounding regions"
    )
    print("=" * 72)
    print("25th Infantry Division – Research Agent Example")
    print("=" * 72)
    print(f"Query: {query}\n")

    result = await run_research_query(query)

    print("--- STRUCTURED OUTPUT ---")
    print(json.dumps(
        {k: v for k, v in result.items() if k != "full_report"},
        indent=2,
        default=str,
    ))

    print("\n--- CAMPAIGN INTEL ENTRY ---")
    briefing = result_to_campaign_intel(result, campaign_id="camp_example123")
    print(json.dumps({k: v for k, v in briefing.items() if k not in ("content",)}, indent=2, default=str))
    print("(content omitted for brevity)")

    print("\n--- MAP MARKERS ---")
    markers = result_to_map_events(result)
    for m in markers:
        print(f"  [{m['threat_level'].upper()}] {m['title']}  ({m['latitude']}, {m['longitude']})")

    if not markers:
        print("  (No coordinates extracted – map markers skipped)")

    print("\n--- INTEL BOARD BRIEFING PREVIEW ---")
    board = result_to_intel_briefing(result)
    print(f"  Title:          {board['title']}")
    print(f"  Classification: {board['classification']}")
    print(f"  Severity:       {board['severity']}")
    print(f"  Tags:           {board['tags']}")
    print("=" * 72)


if __name__ == "__main__":
    asyncio.run(_example())
