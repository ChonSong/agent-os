"""
Nanobot proxy routes for hermes gateway.

These routes proxy /v1/chat/completions, /v1/models, and /health
requests to the nanobot sidecar running at http://localhost:8900.

Usage:
    # In hermes_cli/web_server.py, add near the top:
    # from agent_core.nanobot_proxy import router as nanobot_router
    # app.include_router(nanobot_router, prefix="/nanobot")
"""
from __future__ import annotations
import httpx
import logging
from fastapi import APIRouter, Request, Response, HTTPException
from typing import Any, Dict

logger = logging.getLogger(__name__)

router = APIRouter()

NANOBOT_BASE = "http://localhost:8900"


@router.get("/health")
async def nanobot_health():
    """Proxy /health to nanobot."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{NANOBOT_BASE}/health")
            return Response(content=resp.content, media_type="application/json")
    except Exception as exc:
        logger.warning("nanobot health check failed: %s", exc)
        raise HTTPException(status_code=503, detail="nanobot unreachable")


@router.get("/v1/models")
async def nanobot_models():
    """Proxy /v1/models to nanobot."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{NANOBOT_BASE}/v1/models")
            return Response(content=resp.content, media_type="application/json")
    except Exception as exc:
        logger.warning("nanobot /v1/models failed: %s", exc)
        raise HTTPException(status_code=502, detail="nanobot /v1/models failed")


@router.post("/v1/chat/completions")
async def nanobot_chat(request: Request) -> Response:
    """Proxy /v1/chat/completions to nanobot."""
    body = await request.body()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{NANOBOT_BASE}/v1/chat/completions",
                content=body,
                headers={"Content-Type": "application/json"},
            )
            return Response(
                content=resp.content,
                media_type="application/json",
                status_code=resp.status_code,
            )
    except Exception as exc:
        logger.warning("nanobot /v1/chat/completions failed: %s", exc)
        raise HTTPException(status_code=502, detail="nanobot /v1/chat/completions failed")
