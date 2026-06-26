"""
routes/analyze.py
Cybersecurity analysis endpoints:
  POST /api/analyze/file    — upload .txt/.log/.py for security scan
  POST /api/analyze/url     — basic URL safety check
  POST /api/analyze/password — password strength assessment
  POST /api/analyze/code    — insecure code pattern detection
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, AnyUrl
from typing import Optional
import io

from services.security_scanner import (
    scan_code,
    check_url_safety,
    check_password_strength,
    scan_file_content,
)
from utils.rate_limiter import RateLimiter
from utils.logger import setup_logger

logger = setup_logger(__name__)
router = APIRouter()
rate_limiter = RateLimiter(max_requests=30, window_seconds=60)

ALLOWED_EXTENSIONS = {".txt", ".log", ".py", ".js", ".php", ".html", ".sh", ".yaml", ".json"}
MAX_FILE_SIZE = 500_000  # 500 KB


# ── Models ────────────────────────────────────────────────────────────
class URLCheckRequest(BaseModel):
    url: str = Field(..., min_length=4, max_length=2048)


class PasswordCheckRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=256)


class CodeCheckRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20000)
    language: Optional[str] = Field("auto", description="python, js, php, html, auto")


# ── File analysis ─────────────────────────────────────────────────────
@router.post("/analyze/file")
async def analyze_file(request: Request, file: UploadFile = File(...)):
    import hashlib, os

    ip = request.client.host if request.client else "unknown"
    uid = hashlib.sha256(ip.encode()).hexdigest()[:16]
    if not rate_limiter.allow(f"file_{uid}"):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please wait 60s."}, headers={"Retry-After": "60"})

    # Extension check
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '{ext}' not allowed. Supported: {sorted(ALLOWED_EXTENSIONS)}")

    # Size check
    content_bytes = await file.read()
    if len(content_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large. Max {MAX_FILE_SIZE // 1024} KB.")

    try:
        content = content_bytes.decode("utf-8", errors="replace")
    except Exception:
        raise HTTPException(400, "Could not decode file as UTF-8.")

    results = scan_file_content(content, ext)
    logger.info(f"File scan: {file.filename} | issues={len(results['issues'])}")

    return {
        "filename": file.filename,
        "size_bytes": len(content_bytes),
        "extension": ext,
        **results,
    }


# ── URL safety ────────────────────────────────────────────────────────
@router.post("/analyze/url")
async def analyze_url(body: URLCheckRequest, request: Request):
    import hashlib
    ip = request.client.host if request.client else "unknown"
    uid = hashlib.sha256(ip.encode()).hexdigest()[:16]
    if not rate_limiter.allow(f"url_{uid}"):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please wait 60s."}, headers={"Retry-After": "60"})

    result = check_url_safety(body.url)
    logger.info(f"URL scan: {body.url[:60]} | risk={result['risk_level']}")
    return result


# ── Password strength ─────────────────────────────────────────────────
@router.post("/analyze/password")
async def analyze_password(body: PasswordCheckRequest, request: Request):
    # Never log passwords — only lengths/scores
    result = check_password_strength(body.password)
    logger.info(f"Password check: len={len(body.password)} score={result['score']}")
    return result


# ── Code scan ─────────────────────────────────────────────────────────
@router.post("/analyze/code")
async def analyze_code(body: CodeCheckRequest, request: Request):
    import hashlib
    ip = request.client.host if request.client else "unknown"
    uid = hashlib.sha256(ip.encode()).hexdigest()[:16]
    if not rate_limiter.allow(f"code_{uid}"):
        return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please wait 60s."}, headers={"Retry-After": "60"})

    result = scan_code(body.code, body.language or "auto")
    logger.info(f"Code scan: lang={body.language} | issues={len(result['issues'])}")
    return result
