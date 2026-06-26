// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — cache.js                              ║
// ║  In-memory cache with TTL.  Prevents redundant GitHub API   ║
// ║  calls across Terminal / Dashboard / Simulation consumers.  ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── Config ───────────────────────────────────────────────────────────────────
const DEFAULT_TTL_MS = 5 * 60 * 1000;  // 5 minutes

// ─── Store ────────────────────────────────────────────────────────────────────
// Shape: { [key]: { data: any, timestamp: number, ttl: number } }
const _store = {};

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * getCachedData(key)
 * Returns the cached value if it exists and hasn't expired, otherwise null.
 */
export function getCachedData(key) {
  const entry = _store[key];
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > entry.ttl) {
    delete _store[key];          // prune expired entry
    return null;
  }
  return entry.data;
}

/**
 * setCachedData(key, data, ttlMs?)
 * Store data under key with an optional TTL (defaults to 5 min).
 */
export function setCachedData(key, data, ttlMs = DEFAULT_TTL_MS) {
  _store[key] = {
    data,
    timestamp: Date.now(),
    ttl: ttlMs,
  };
}

/**
 * invalidate(key)
 * Force-expire a specific cache entry so the next read re-fetches.
 */
export function invalidate(key) {
  delete _store[key];
}

/**
 * invalidateAll()
 * Wipe the entire cache (e.g. after an admin save).
 */
export function invalidateAll() {
  Object.keys(_store).forEach(k => delete _store[k]);
}

/**
 * getCacheAge(key)
 * Returns how old (in ms) a cache entry is.  Returns Infinity if missing.
 */
export function getCacheAge(key) {
  const entry = _store[key];
  if (!entry) return Infinity;
  return Date.now() - entry.timestamp;
}

/**
 * isCacheStale(key, maxAgeMs?)
 * Convenience: true if the entry is missing or older than maxAgeMs.
 */
export function isCacheStale(key, maxAgeMs = DEFAULT_TTL_MS) {
  return getCacheAge(key) > maxAgeMs;
}

// ─── Well-known cache keys (shared across all modules) ────────────────────────
export const CACHE_KEYS = {
  CREDENTIALS:   'intel:credentials',
  MAIN_DATA:     'intel:mainData',
  ANALYTICS:     'intel:analytics',
  SKILL_PROFILE: 'intel:skillProfile',
  PIPELINE:      'intel:pipeline',
};
