"""
routes/chat.py
POST /api/chat — main AI chat endpoint
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel, Field, validator
from typing import Optional
import hashlib
import time

from services.ai_service import get_ai_response
from services.memory_service import ConversationMemory
from services.security_scanner import quick_scan
from utils.rate_limiter import RateLimiter
from utils.logger import setup_logger
from utils.database import log_query

logger = setup_logger(__name__)
router = APIRouter()
rate_limiter = RateLimiter(max_requests=20, window_seconds=60)
memory = ConversationMemory()


# ── Request / Response models ─────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000,
                         description="User message to the cybersecurity assistant")
    session_id: Optional[str] = Field(None, description="Optional session ID for memory")
    api_key: Optional[str] = Field(None, description="Optional API key for premium access")

    @validator("message")
    def sanitize_message(cls, v):
        # Strip null bytes and excessive whitespace
        v = v.replace("\x00", "").strip()
        if not v:
            raise ValueError("Message cannot be empty")
        return v


class ChatResponse(BaseModel):
    reply: str
    session_id: str
    timestamp: float
    security_flags: list[str] = []
    tokens_used: Optional[int] = None


# ── Helpers ───────────────────────────────────────────────────────────
def get_user_id(request: Request) -> str:
    """Generate anonymized user ID from IP."""
    ip = request.client.host if request.client else "unknown"
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def get_session_id(request: Request, provided: Optional[str]) -> str:
    if provided:
        return provided
    user_id = get_user_id(request)
    return f"sess_{user_id}"


# ── Endpoint ──────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    request: Request,
    x_api_key: Optional[str] = Header(None),
):
    user_id   = get_user_id(request)
    session_id = get_session_id(request, body.session_id)

    # ── Rate limiting ──────────────────────────────────────────────────
    if not rate_limiter.allow(user_id):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Max 20 requests per minute.",
        )

    # ── Optional API key check ─────────────────────────────────────────
    api_key = x_api_key or body.api_key
    premium = _validate_api_key(api_key)

    # ── Quick security scan on the input ──────────────────────────────
    flags = quick_scan(body.message)

    # ── Build conversation history ────────────────────────────────────
    history = memory.get_history(session_id)

    # ── Call AI service ───────────────────────────────────────────────
    try:
        reply, tokens = await get_ai_response(
            message=body.message,
            history=history,
            premium=premium,
        )
    except Exception as e:
        logger.error(f"AI service error for session {session_id}: {e}")
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable.")

    # ── Store in memory ───────────────────────────────────────────────
    memory.add_exchange(session_id, body.message, reply)

    # ── Log to DB (anonymized) ────────────────────────────────────────
    await log_query(
        user_id=user_id,
        session_id=session_id,
        message_len=len(body.message),
        flags=flags,
        tokens=tokens,
    )

    logger.info(f"[{session_id}] Query processed. Flags={flags} Tokens={tokens}")

    return ChatResponse(
        reply=reply,
        session_id=session_id,
        timestamp=time.time(),
        security_flags=flags,
        tokens_used=tokens,
    )


# ── Session management ────────────────────────────────────────────────
@router.delete("/chat/{session_id}")
async def clear_session(session_id: str, request: Request):
    memory.clear_session(session_id)
    return {"message": f"Session {session_id} cleared."}


@router.get("/chat/{session_id}/history")
async def get_history(session_id: str, request: Request):
    return {"history": memory.get_history(session_id)}


# ── Private helpers ───────────────────────────────────────────────────
def _validate_api_key(key: Optional[str]) -> bool:
    """Returns True if a valid premium API key is provided."""
    import os
    valid = os.getenv("CYBERBOT_API_KEY", "")
    if not valid:
        return False
    return key == valid
