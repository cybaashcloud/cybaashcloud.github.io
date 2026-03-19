"""
routes/admin.py
Admin-only endpoints — protected by CYBERBOT_API_KEY.

  GET  /api/admin/settings          — get all AI/bot settings
  POST /api/admin/settings          — update settings (bulk)
  GET  /api/admin/analytics         — usage stats
  POST /api/admin/settings/test-key — test a Gemini API key before saving
"""

import os
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional
from utils.database import get_all_settings, set_settings_bulk, get_analytics
from utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()

EDITABLE_KEYS = {
    "gemini_api_key",
    "gemini_model",
    "gemini_model_premium",
    "max_tokens",
    "max_tokens_premium",
    "temperature",
    "system_prompt",
    "bot_name",
    "rate_limit_rpm",
}

SAFE_KEYS = EDITABLE_KEYS - {"gemini_api_key"}   # keys safe to show unredacted


# ── Auth helper ───────────────────────────────────────────────────────
def _require_admin(x_admin_key: Optional[str]):
    valid = os.getenv("CYBERBOT_API_KEY", "")
    if not valid:
        raise HTTPException(503, "Admin key not configured on server. Set CYBERBOT_API_KEY in .env")
    if x_admin_key != valid:
        raise HTTPException(403, "Invalid admin key")


# ── Models ────────────────────────────────────────────────────────────
class SettingsUpdate(BaseModel):
    gemini_api_key:       Optional[str] = Field(None, description="Google Gemini API key")
    gemini_model:         Optional[str] = Field(None, description="Default model (gemini-1.5-flash)")
    gemini_model_premium: Optional[str] = Field(None, description="Premium model (gemini-1.5-pro)")
    max_tokens:           Optional[str] = Field(None, description="Max tokens for default model")
    max_tokens_premium:   Optional[str] = Field(None, description="Max tokens for premium model")
    temperature:          Optional[str] = Field(None, description="Temperature 0.0–1.0")
    system_prompt:        Optional[str] = Field(None, description="System prompt for CyberBot")
    bot_name:             Optional[str] = Field(None, description="Bot display name")
    rate_limit_rpm:       Optional[str] = Field(None, description="Rate limit (requests per minute)")


class TestKeyRequest(BaseModel):
    api_key: str


# ── Endpoints ─────────────────────────────────────────────────────────

@router.get("/admin/settings")
async def get_settings(x_admin_key: Optional[str] = Header(None)):
    _require_admin(x_admin_key)
    all_settings = await get_all_settings()
    # Redact the key — show only first/last 4 chars
    result = {}
    for k, v in all_settings.items():
        if k == "gemini_api_key" and v:
            result[k] = v[:8] + "…" + v[-4:] if len(v) > 12 else "***"
        else:
            result[k] = v
    result["gemini_api_key_set"] = bool(all_settings.get("gemini_api_key", "").strip())
    return result


@router.post("/admin/settings")
async def update_settings(
    body: SettingsUpdate,
    x_admin_key: Optional[str] = Header(None),
):
    _require_admin(x_admin_key)
    updates = {k: v for k, v in body.dict().items() if v is not None and k in EDITABLE_KEYS}
    if not updates:
        raise HTTPException(400, "No valid settings provided")
    await set_settings_bulk(updates)
    logger.info(f"Admin updated settings: {[k for k in updates if k != 'gemini_api_key']}")
    return {"ok": True, "updated": list(updates.keys())}


@router.post("/admin/settings/test-key")
async def test_gemini_key(
    body: TestKeyRequest,
    x_admin_key: Optional[str] = Header(None),
):
    """Send a minimal request to Gemini to verify the key works."""
    _require_admin(x_admin_key)
    try:
        import httpx
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={body.api_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text": "Reply with only: OK"}]}],
            "generationConfig": {"maxOutputTokens": 5},
        }
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(url, json=payload)
        if r.status_code == 200:
            return {"ok": True, "message": "✓ API key is valid and working"}
        elif r.status_code == 400:
            return {"ok": False, "message": "⚠ Bad request — check key format"}
        elif r.status_code == 403:
            return {"ok": False, "message": "✗ Key rejected — invalid or expired"}
        else:
            return {"ok": False, "message": f"✗ Gemini returned HTTP {r.status_code}"}
    except Exception as e:
        return {"ok": False, "message": f"✗ Connection error: {str(e)[:100]}"}


@router.get("/admin/analytics")
async def admin_analytics(x_admin_key: Optional[str] = Header(None)):
    _require_admin(x_admin_key)
    return await get_analytics()
