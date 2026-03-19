"""routes/health.py — health check endpoint"""
from fastapi import APIRouter
from datetime import datetime, timezone

router = APIRouter()

@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "CYBAASH AI API",
        "version": "2.0.0",
        "author": "Mohamed Aasiq · github.com/cybaash",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
