"""
utils/database.py
SQLite persistence:
  - query_logs : anonymized query history
  - analytics  : topic/usage counts  
  - sessions   : session tracking
  - settings   : runtime config (Gemini key, model, prompt, etc.)
"""

import aiosqlite
import json
import time
import os
from utils.logger import setup_logger

logger = setup_logger(__name__)

DB_PATH = os.getenv("DB_PATH", "ai.db")

_settings_cache: dict = {}
_cache_ts: float = 0
CACHE_TTL = 30  # seconds


def _default_system_prompt() -> str:
    return (
        "You are CyberBot — an expert cybersecurity assistant built for educational and ethical purposes.\n\n"
        "Your capabilities:\n"
        "- Explain vulnerabilities: SQLi, XSS, CSRF, buffer overflows, RCE, LFI/RFI, SSRF, XXE\n"
        "- Teach secure coding in Python, JavaScript, PHP\n"
        "- Guide penetration testing concepts (CTF/lab context only)\n"
        "- Advise on system hardening and CVE analysis\n"
        "- Assist with cryptography, authentication best practices\n\n"
        "Rules:\n"
        "1. NEVER provide step-by-step instructions to attack real systems\n"
        "2. NEVER write working malware or data-exfiltration tools\n"
        "3. Always frame offensive techniques in educational context\n"
        "4. Use markdown: headers, bullets, code blocks\n"
        "5. For each vulnerability: What it is → How it works → How to defend\n\n"
        "Tone: Professional, direct — like a senior security engineer mentoring a junior."
    )


async def init_db() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS query_logs (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT    NOT NULL,
                session_id  TEXT    NOT NULL,
                message_len INTEGER,
                flags       TEXT,
                tokens      INTEGER,
                timestamp   REAL    NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS analytics (
                id    INTEGER PRIMARY KEY AUTOINCREMENT,
                date  TEXT    NOT NULL,
                topic TEXT    NOT NULL,
                count INTEGER DEFAULT 1,
                UNIQUE(date, topic)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                session_id    TEXT PRIMARY KEY,
                user_id       TEXT NOT NULL,
                created_at    REAL NOT NULL,
                last_active   REAL NOT NULL,
                message_count INTEGER DEFAULT 0
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key        TEXT PRIMARY KEY,
                value      TEXT NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        # Index for analytics queries
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp
            ON query_logs (timestamp)
        """)
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_query_logs_user
            ON query_logs (user_id, timestamp)
        """)
        # Seed defaults — only if not already present
        defaults = {
            "gemini_api_key":       os.getenv("GEMINI_API_KEY", ""),
            "gemini_model":         "gemini-2.5-flash-lite",
            "gemini_model_premium": "gemini-2.5-flash-lite",
            "max_tokens":           "1024",
            "max_tokens_premium":   "2048",
            "temperature":          "0.4",
            "system_prompt":        _default_system_prompt(),
            "bot_name":             "CyberBot",
            "rate_limit_rpm":       "20",
        }
        for key, value in defaults.items():
            await db.execute(
                "INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                (key, value, time.time()),
            )
        await db.commit()
    logger.info(f"Database initialized at: {DB_PATH}")


# ── Settings read/write ───────────────────────────────────────────────

async def get_setting(key: str, default: str = "") -> str:
    if time.time() - _cache_ts < CACHE_TTL and key in _settings_cache:
        return _settings_cache[key]
    await _refresh_cache()
    return _settings_cache.get(key, default)


async def get_all_settings() -> dict:
    await _refresh_cache()
    return dict(_settings_cache)


async def set_setting(key: str, value: str) -> None:
    global _settings_cache, _cache_ts
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
            (key, value, time.time()),
        )
        await db.commit()
    _settings_cache = {}
    _cache_ts = 0


async def set_settings_bulk(updates: dict) -> None:
    global _settings_cache, _cache_ts
    async with aiosqlite.connect(DB_PATH) as db:
        for key, value in updates.items():
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
                (key, str(value), time.time()),
            )
        await db.commit()
    _settings_cache = {}
    _cache_ts = 0
    logger.info(f"Bulk settings updated: {list(updates.keys())}")


async def _refresh_cache() -> None:
    global _settings_cache, _cache_ts
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT key, value FROM settings") as cur:
                rows = await cur.fetchall()
        _settings_cache = {r["key"]: r["value"] for r in rows}
        _cache_ts = time.time()
    except Exception as e:
        logger.error(f"Settings cache refresh failed: {e}")


# ── Query logging & analytics ─────────────────────────────────────────

async def log_query(
    user_id: str,
    session_id: str,
    message_len: int,
    flags: list[str],
    tokens: int | None,
) -> None:
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "INSERT INTO query_logs (user_id, session_id, message_len, flags, tokens, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, session_id, message_len, json.dumps(flags), tokens, time.time()),
            )
            await db.commit()
    except Exception as e:
        logger.error(f"Failed to log query: {e}")


async def get_analytics() -> dict:
    try:
        async with aiosqlite.connect(DB_PATH) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT COUNT(*) as total FROM query_logs") as cur:
                total = (await cur.fetchone())["total"]
            since = time.time() - 86400
            async with db.execute("SELECT COUNT(*) as cnt FROM query_logs WHERE timestamp > ?", (since,)) as cur:
                last24h = (await cur.fetchone())["cnt"]
            async with db.execute("SELECT COUNT(DISTINCT session_id) as n FROM query_logs") as cur:
                sessions = (await cur.fetchone())["n"]
            async with db.execute("SELECT SUM(tokens) as t FROM query_logs") as cur:
                total_tokens = (await cur.fetchone())["t"] or 0
            async with db.execute(
                "SELECT flags, COUNT(*) as n FROM query_logs WHERE flags != '[]' GROUP BY flags ORDER BY n DESC LIMIT 10"
            ) as cur:
                flagged = [dict(r) for r in await cur.fetchall()]
            # Queries per day last 7 days
            async with db.execute("""
                SELECT date(timestamp, 'unixepoch') as day, COUNT(*) as cnt
                FROM query_logs
                WHERE timestamp > ?
                GROUP BY day ORDER BY day
            """, (time.time() - 7 * 86400,)) as cur:
                daily = [dict(r) for r in await cur.fetchall()]
        return {
            "total_queries":    total,
            "queries_last_24h": last24h,
            "unique_sessions":  sessions,
            "total_tokens":     total_tokens,
            "top_flags":        flagged,
            "daily_usage":      daily,
        }
    except Exception as e:
        logger.error(f"Analytics query failed: {e}")
        return {}
