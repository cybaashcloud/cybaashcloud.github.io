"""
CYBAASH AI — AI-Powered Cybersecurity Assistant
Main FastAPI application entry point
Author: Mohamed Aasiq · github.com/cybaash
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import time

from routes.chat    import router as chat_router
from routes.analyze import router as analyze_router
from routes.health  import router as health_router
from routes.admin   import router as admin_router
from utils.database import init_db
from utils.logger   import setup_logger

logger = setup_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting CYBAASH AI API...")
    await init_db()
    logger.info("Database initialized.")
    yield
    logger.info("Shutting down CYBAASH AI API.")


app = FastAPI(
    title="CYBAASH AI API",
    description="AI-Powered Cybersecurity Assistant. Built by Mohamed Aasiq.",
    version="2.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",   # Vite dev server
        "http://localhost:8080",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "https://cybaash.github.io",
        # FIX (critical): wildcard "*" is browser-rejected when allow_credentials=True.
        # The browser enforces: if credentials are on, the ACAO header must be an
        # explicit origin — not "*". Removed wildcard; add origins explicitly above.
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    response.headers["X-Process-Time"] = f"{(time.time() - start):.4f}s"
    response.headers["X-Powered-By"] = "CYBAASH-AI"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error", "detail": str(exc)})


app.include_router(health_router,  prefix="/api", tags=["Health"])
app.include_router(chat_router,    prefix="/api", tags=["Chat"])
app.include_router(analyze_router, prefix="/api", tags=["Analysis"])
app.include_router(admin_router,   prefix="/api", tags=["Admin"])


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": "CYBAASH AI API",
        "version": "2.1.0",
        "author": "Mohamed Aasiq · github.com/cybaash",
        "status": "operational",
        "docs": "/docs",
        "endpoints": {
            "chat":             "POST /api/chat",
            "url_check":        "POST /api/analyze/url",
            "password_check":   "POST /api/analyze/password",
            "code_scan":        "POST /api/analyze/code",
            "file_scan":        "POST /api/analyze/file",
            "health":           "GET  /api/health",
            "admin_settings":   "GET|POST /api/admin/settings  [X-Admin-Key required]",
            "admin_analytics":  "GET  /api/admin/analytics     [X-Admin-Key required]",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
