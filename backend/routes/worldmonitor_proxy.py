"""
World Monitor frontend API proxy routes.

The World Monitor SPA calls /api/rss-proxy, /api/gdelt-doc, /api/finnhub,
etc.  In production, Nginx rewrites some of these to /api/worldmonitor/*
and proxies others directly to external APIs.  When Nginx is absent (or
not yet configured), the backend returns 404 for these paths because the
worldmonitor router lives under the /api/worldmonitor/ prefix.

This module registers the short paths the frontend actually uses so they
work with or without Nginx.
"""

import os
import re
import logging

import httpx
from fastapi import APIRouter, Query, Request, Response, HTTPException

# Re-use the validated RSS proxy and Finnhub handlers from the main
# worldmonitor module — they already implement allowlist checking, key
# injection, and redirect following.
from routes.worldmonitor import rss_proxy as _rss_proxy
from routes.worldmonitor import finnhub_proxy as _finnhub_proxy

logger = logging.getLogger("worldmonitor_proxy")

router = APIRouter(tags=["worldmonitor-proxy"])

_PROXY_TIMEOUT = 15.0

# ---------------------------------------------------------------------------
# Delegated routes (existing backend handlers)
# ---------------------------------------------------------------------------


@router.get("/rss-proxy")
async def rss_proxy(url: str = Query(..., description="RSS feed URL to fetch")):
    """Proxy an RSS feed — delegates to the worldmonitor router handler."""
    return await _rss_proxy(url)


@router.get("/finnhub")
async def finnhub_proxy(
    symbols: str = Query(..., description="Comma-separated stock symbols"),
):
    """Proxy Finnhub quotes — delegates to the worldmonitor router handler."""
    return await _finnhub_proxy(symbols)


# ---------------------------------------------------------------------------
# GDELT DOC 2.0 API proxy
# ---------------------------------------------------------------------------


@router.get("/gdelt-doc")
async def gdelt_doc_proxy(
    query: str = Query(..., min_length=2),
    maxrecords: int = Query(10, ge=1, le=20),
    timespan: str = Query("72h"),
):
    """Proxy GDELT DOC 2.0 article search."""
    params = {
        "query": query,
        "mode": "artlist",
        "maxrecords": str(min(maxrecords, 20)),
        "format": "json",
        "sort": "date",
        "timespan": timespan,
    }
    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://api.gdeltproject.org/api/v2/doc/doc",
                params=params,
            )
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="GDELT request failed")

            data = resp.json()
            articles = [
                {
                    "title": a.get("title"),
                    "url": a.get("url"),
                    "source": a.get("domain") or (a.get("source") or {}).get("domain"),
                    "date": a.get("seendate"),
                    "image": a.get("socialimage"),
                    "language": a.get("language"),
                    "tone": a.get("tone"),
                }
                for a in (data.get("articles") or [])
            ]
            return {"articles": articles, "query": query}
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"GDELT fetch failed: {exc}")


# ---------------------------------------------------------------------------
# Polymarket proxy
# ---------------------------------------------------------------------------


@router.get("/polymarket")
async def polymarket_proxy(request: Request):
    """Proxy Polymarket prediction-market data."""
    params = dict(request.query_params)
    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://gamma-api.polymarket.com/markets",
                params=params,
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Polymarket fetch failed: {exc}")


# ---------------------------------------------------------------------------
# PizzINT proxy
# ---------------------------------------------------------------------------

# Restrict to safe path segments (letters, digits, hyphens, underscores, dots)
_PIZZINT_PATH_RE = re.compile(r"^[A-Za-z0-9/_\-\.]+$")


@router.get("/pizzint/{path:path}")
async def pizzint_proxy(path: str, request: Request):
    """Proxy PizzINT dashboard and GDELT tension data."""
    if not _PIZZINT_PATH_RE.match(path):
        raise HTTPException(status_code=400, detail="Invalid path")

    params = dict(request.query_params)
    target_url = f"https://www.pizzint.watch/api/{path}"
    try:
        async with httpx.AsyncClient(
            timeout=_PROXY_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(target_url, params=params)
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"PizzINT fetch failed: {exc}")


# ---------------------------------------------------------------------------
# FRED economic data proxy (API key injected server-side)
# ---------------------------------------------------------------------------

_FRED_SERIES_RE = re.compile(r"^[A-Z0-9_]{1,30}$")


@router.get("/fred-data")
async def fred_data_proxy(
    series_id: str = Query(...),
    observation_start: str = Query(None),
    observation_end: str = Query(None),
):
    """Proxy FRED API with server-side key injection."""
    api_key = os.environ.get("FRED_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="FRED_API_KEY not configured")

    if not _FRED_SERIES_RE.match(series_id):
        raise HTTPException(status_code=400, detail="Invalid series_id")

    params: dict[str, str] = {
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
        "sort_order": "desc",
        "limit": "10",
    }
    if observation_start:
        params["observation_start"] = observation_start
    if observation_end:
        params["observation_end"] = observation_end

    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://api.stlouisfed.org/fred/series/observations",
                params=params,
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"FRED fetch failed: {exc}")


# ---------------------------------------------------------------------------
# USGS earthquake feed proxy
# ---------------------------------------------------------------------------


@router.get("/earthquakes")
async def earthquakes_proxy():
    """Proxy USGS M4.5+ earthquake feed."""
    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson",
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"USGS fetch failed: {exc}")


# ---------------------------------------------------------------------------
# CoinGecko proxy
# ---------------------------------------------------------------------------


@router.get("/coingecko")
async def coingecko_proxy(request: Request):
    """Proxy CoinGecko crypto price data."""
    params = dict(request.query_params)
    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params=params,
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"CoinGecko fetch failed: {exc}")


# ---------------------------------------------------------------------------
# Yahoo Finance proxy
# ---------------------------------------------------------------------------

_YF_SYMBOL_RE = re.compile(r"^[A-Za-z0-9^=.\-]{1,20}$")


@router.get("/yahoo-finance")
async def yahoo_finance_proxy(symbol: str = Query(...)):
    """Proxy Yahoo Finance chart data."""
    if not _YF_SYMBOL_RE.match(symbol):
        raise HTTPException(status_code=400, detail="Invalid symbol")

    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
                headers={"User-Agent": "Mozilla/5.0 WorldMonitor/1.0"},
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Yahoo Finance fetch failed: {exc}")


# ---------------------------------------------------------------------------
# Cloudflare outages — returns 503 (no backend implementation)
# ---------------------------------------------------------------------------


@router.get("/cloudflare-outages")
async def cloudflare_outages():
    """Cloudflare outage data is not available without a token."""
    raise HTTPException(status_code=503, detail="cloudflare_outages_unavailable")


# ---------------------------------------------------------------------------
# GDELT GEO 2.0 proxy
# ---------------------------------------------------------------------------


@router.get("/gdelt-geo")
async def gdelt_geo_proxy(request: Request):
    """Proxy GDELT GEO 2.0 geolocation data."""
    params = dict(request.query_params)
    try:
        async with httpx.AsyncClient(timeout=_PROXY_TIMEOUT) as client:
            resp = await client.get(
                "https://api.gdeltproject.org/api/v2/geo/geo",
                params=params,
            )
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="application/json",
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"GDELT GEO fetch failed: {exc}")
