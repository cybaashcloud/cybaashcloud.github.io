"""
utils/rate_limiter.py
In-memory sliding-window rate limiter.
For distributed deployments, swap _store for Redis (redis-py + INCR/EXPIRE).
"""

import time
from collections import defaultdict, deque
from threading import Lock
from utils.logger import setup_logger

logger = setup_logger(__name__)


class RateLimiter:
    """
    Sliding-window rate limiter.
    Allows max_requests per window_seconds per key (usually user_id or IP hash).
    """

    def __init__(self, max_requests: int = 20, window_seconds: int = 60):
        self.max_requests   = max_requests
        self.window_seconds = window_seconds
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        """Returns True if request is allowed, False if rate limit exceeded."""
        now = time.time()
        cutoff = now - self.window_seconds

        with self._lock:
            dq = self._store[key]

            # Remove timestamps outside the window
            while dq and dq[0] < cutoff:
                dq.popleft()

            if len(dq) >= self.max_requests:
                logger.warning(f"Rate limit hit for key={key[:8]}... ({len(dq)}/{self.max_requests})")
                return False

            dq.append(now)
            return True

    def remaining(self, key: str) -> int:
        """Returns how many requests are remaining in the current window."""
        now = time.time()
        cutoff = now - self.window_seconds
        with self._lock:
            dq = self._store[key]
            valid = sum(1 for t in dq if t > cutoff)
            return max(0, self.max_requests - valid)

    def reset(self, key: str) -> None:
        """Manually reset rate limit for a key (admin use)."""
        with self._lock:
            self._store.pop(key, None)
