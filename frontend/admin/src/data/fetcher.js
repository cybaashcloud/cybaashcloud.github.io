// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — fetcher.js                            ║
// ║  Parallel GitHub fetcher using YOUR existing split-file     ║
// ║  schema: data_creds_1..5.json + data_main.json              ║
// ║  Uses the same streaming read technique as your github.js   ║
// ╚══════════════════════════════════════════════════════════════╝

import { getGithubConfig } from '../github.js';

// ─── File map (mirrors your github.js exactly) ────────────────────────────────
const CRED_FILES = [
  'portfolio/data_creds_1.json',
  'portfolio/data_creds_2.json',
  'portfolio/data_creds_3.json',
  'portfolio/data_creds_4.json',
  'portfolio/data_creds_5.json',
];
const MAIN_FILE = 'portfolio/data_main.json';

// ─── Config ───────────────────────────────────────────────────────────────────
const RETRY_LIMIT   = 3;
const RETRY_DELAY   = 800;   // ms, doubles each attempt
const TIMEOUT_MS    = 12000;

// ─── Internal helpers ─────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function contentsUrl(cfg, path) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`;
}

function rawHeaders(cfg) {
  return {
    Authorization:        `Bearer ${cfg.token}`,
    Accept:               'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Stream-read a single JSON file from GitHub (same technique as your github.js).
 * Returns null if 404.  Throws on other errors after all retries.
 */
async function streamFile(cfg, path, attempt = 1) {
  const url = contentsUrl(cfg, path);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers: rawHeaders(cfg), cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);

    if (res.status === 404) return null;

    if (!res.ok) {
      const msg = await res.text().catch(() => res.status);
      throw new Error(`HTTP ${res.status} — ${path}: ${msg}`);
    }

    const decoder = new TextDecoder('utf-8');
    const reader  = res.body.getReader();
    const chunks  = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(''));

  } catch (err) {
    clearTimeout(timer);
    if (attempt < RETRY_LIMIT) {
      console.warn(`[Fetcher] Retry ${attempt}/${RETRY_LIMIT} for "${path}": ${err.message}`);
      await sleep(RETRY_DELAY * attempt);
      return streamFile(cfg, path, attempt + 1);
    }
    console.error(`[Fetcher] FAILED "${path}" after ${RETRY_LIMIT} attempts:`, err.message);
    return null;   // graceful degradation — don't crash the pipeline
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * fetchCredentials()
 * Fetch all 5 credential files in parallel and merge into one flat array.
 * Skips empty / missing files silently.
 * 
 * @returns {Promise<Array>} Flat array of all credential objects
 */
export async function fetchCredentials() {
  const cfg = getGithubConfig();
  if (!cfg?.token) {
    console.warn('[Fetcher] No GitHub config — returning empty credentials.');
    return [];
  }

  console.info(`[Fetcher] Fetching ${CRED_FILES.length} credential files in parallel…`);
  const t0 = performance.now();

  const results = await Promise.allSettled(
    CRED_FILES.map(f => streamFile(cfg, f))
  );

  const merged = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.credentials?.length) {
      merged.push(...r.value.credentials);
    } else if (r.status === 'rejected') {
      console.error(`[Fetcher] File ${CRED_FILES[i]} rejected:`, r.reason);
    }
  });

  console.info(`[Fetcher] Merged ${merged.length} credentials in ${(performance.now() - t0).toFixed(1)}ms`);
  return merged;
}

/**
 * fetchMainData()
 * Fetch data_main.json (about / contact / experience / skills / projects / flags).
 * 
 * @returns {Promise<Object|null>}
 */
export async function fetchMainData() {
  const cfg = getGithubConfig();
  if (!cfg?.token) return null;
  return streamFile(cfg, MAIN_FILE);
}

/**
 * fetchAll()
 * Fetch everything in parallel — credentials + main data.
 * 
 * @returns {Promise<{ credentials: Array, mainData: Object|null }>}
 */
export async function fetchAll() {
  const [credentials, mainData] = await Promise.all([
    fetchCredentials(),
    fetchMainData(),
  ]);
  return { credentials, mainData };
}
