"""
services/memory_service.py
In-memory conversation history with a 5-message rolling window per session.
For production: swap _store for Redis or SQLite persistence.
"""

from collections import deque
from typing import Any
import time
from utils.logger import setup_logger

logger = setup_logger(__name__)

MAX_HISTORY = 5        # pairs (user + assistant = 1 pair = 2 messages)
SESSION_TTL  = 3600    # seconds — sessions expire after 1 hour of inactivity


class ConversationMemory:
    """
    Thread-safe in-process conversation memory.
    Each session keeps up to MAX_HISTORY * 2 messages (user + assistant alternating).
    """

    def __init__(self):
        # { session_id: { "messages": deque, "last_active": float } }
        self._store: dict[str, dict[str, Any]] = {}

    # ── Public API ────────────────────────────────────────────────────

    def get_history(self, session_id: str) -> list[dict]:
        """Return formatted OpenAI-style message list for this session."""
        self._evict_expired()
        session = self._store.get(session_id)
        if not session:
            return []
        return list(session["messages"])

    def add_exchange(self, session_id: str, user_msg: str, assistant_msg: str) -> None:
        """Add a user+assistant exchange to the session history."""
        self._evict_expired()

        if session_id not in self._store:
            self._store[session_id] = {
                "messages": deque(maxlen=MAX_HISTORY * 2),
                "last_active": time.time(),
            }

        session = self._store[session_id]
        session["messages"].append({"role": "user",      "content": user_msg})
        session["messages"].append({"role": "assistant", "content": assistant_msg})
        session["last_active"] = time.time()

        logger.debug(f"Memory [{session_id}]: {len(session['messages'])} messages stored")

    def clear_session(self, session_id: str) -> None:
        """Delete a session entirely."""
        self._store.pop(session_id, None)
        logger.info(f"Session {session_id} cleared from memory.")

    def session_count(self) -> int:
        return len(self._store)

    # ── Internal ──────────────────────────────────────────────────────

    def _evict_expired(self) -> None:
        """Remove sessions older than SESSION_TTL."""
        cutoff = time.time() - SESSION_TTL
        expired = [sid for sid, s in self._store.items() if s["last_active"] < cutoff]
        for sid in expired:
            del self._store[sid]
        if expired:
            logger.debug(f"Evicted {len(expired)} expired sessions.")
