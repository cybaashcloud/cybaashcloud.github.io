// ── GitHub Storage Layer v4 — Cyber Intel Engine edition ──────────────────────
//
// WHAT CHANGED FROM v3:
//   • Zero breaking changes — App.jsx still works with no modifications
//   • Added Cyber Intel Engine (cache, classifier, processor, skillEngine, pipeline)
//   • loadAll() now auto-classifies + caches credentials on every load
//   • saveSection('credentials') auto-invalidates cache so consumers get fresh data
//   • New exports for Terminal, Dashboard, and Simulation Engine consumers:
//       loadAndAnalyzeData()   — full pipeline result
//       getCertSummary()       — terminal: certs
//       getCertAnalysis()      — terminal: certs --analyze
//       getTimeline()          — terminal: certs --timeline
//
// FILE LAYOUT (unchanged):
//   portfolio/data_main.json        — about, contact, experience, skills, projects, flags
//   portfolio/data_creds_1.json     — credentials[0..83]
//   portfolio/data_creds_2.json     — credentials[84..167]
//   portfolio/data_creds_3.json     — credentials[168..251]
//   portfolio/data_creds_4.json     — credentials[252..335]
//   portfolio/data_creds_5.json     — credentials[336..419]  (overflow buffer)
//
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 0 — WRITE QUEUE (prevents 409 SHA conflicts on concurrent saves)
// ══════════════════════════════════════════════════════════════════════════════

// A simple promise-chain mutex: all writes are serialised through this queue.
// If two saves fire at the same time, the second waits for the first to finish
// before it fetches SHAs — so it always gets a fresh SHA.
let _writeQueue = Promise.resolve()

function enqueue(fn) {
  // Chain onto the existing queue. Each task only starts after the previous one
  // resolves or rejects, guaranteeing serial execution.
  const task = _writeQueue.then(fn, fn)  // second `fn` ensures queue never stalls on error
  _writeQueue = task.catch(() => {})     // swallow so queue keeps running
  return task                            // caller still gets the real promise (with errors)
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CONFIG & AUTH  (unchanged from v3)
// ══════════════════════════════════════════════════════════════════════════════

const CONFIG_KEY = 'portfolio_github_config'

export function getGithubConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
export function saveGithubConfig(owner, repo, token) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ owner, repo, token }))
}
export function clearGithubConfig() {
  localStorage.removeItem(CONFIG_KEY)
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — FILE MAP  (unchanged from v3)
// ══════════════════════════════════════════════════════════════════════════════

const MAIN_SECTIONS = ['about', 'contact', 'experience', 'skills', 'projects', 'flags']
const CRED_FILES    = [
  'frontend/data_creds_1.json',
  'frontend/data_creds_2.json',
  'frontend/data_creds_3.json',
  'frontend/data_creds_4.json',
  'frontend/data_creds_5.json',
]
const MAIN_FILE  = 'frontend/data_main.json'
const CRED_CHUNK = 84


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — LOW-LEVEL GITHUB HELPERS  (unchanged from v3)
// ══════════════════════════════════════════════════════════════════════════════

function contentsUrl(cfg, path) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`
}
function apiHeaders(cfg) {
  return {
    'Authorization':        `Bearer ${cfg.token}`,
    'Accept':               'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type':         'application/json',
  }
}
function rawHeaders(cfg) {
  return {
    'Authorization':        `Bearer ${cfg.token}`,
    'Accept':               'application/vnd.github.raw+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function fetchFileStreaming(cfg, path) {
  const r = await fetch(contentsUrl(cfg, path), {
    headers: rawHeaders(cfg),
    cache:   'no-store',
  })
  if (r.status === 404) return null
  if (!r.ok) {
    const msg = await r.text().catch(() => r.status)
    throw new Error(`GitHub read failed (${path}): ${msg}`)
  }
  const decoder = new TextDecoder('utf-8')
  const reader  = r.body.getReader()
  const parts   = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(decoder.decode(value, { stream: true }))
  }
  parts.push(decoder.decode())
  return JSON.parse(parts.join(''))
}

async function fetchSha(cfg, path) {
  const r = await fetch(contentsUrl(cfg, path), { headers: apiHeaders(cfg) })
  if (r.status === 404) return null
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(`GitHub SHA fetch failed (${path}): ${err.message || r.status}`)
  }
  const meta = await r.json()
  return meta.sha
}

function safeBase64Encode(str) {
  const bytes = new TextEncoder().encode(str)
  let binary  = ''
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function writeFile(cfg, path, data, sha, _retries = 2) {
  const encoded = safeBase64Encode(JSON.stringify(data, null, 2))
  const body = {
    message: `chore: update ${path.split('/').pop().replace('.json', '')} — ${new Date().toISOString()}`,
    content: encoded,
    ...(sha ? { sha } : {}),
  }
  const r = await fetch(contentsUrl(cfg, path), {
    method:  'PUT',
    headers: apiHeaders(cfg),
    body:    JSON.stringify(body),
  })
  if (r.status === 409 && _retries > 0) {
    console.warn(`[GitHub] 409 conflict on ${path} — re-fetching SHA and retrying (${_retries} left)`)
    const freshSha = await fetchSha(cfg, path)
    return writeFile(cfg, path, data, freshSha, _retries - 1)
  }
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    if (r.status === 401) throw new Error(
      `Token invalid or expired. Go to GitHub → Settings → Developer settings → Fine-grained tokens and generate a new token, then reconnect in Admin → Settings.`
    )
    if (r.status === 403) throw new Error(
      `Token lacks write permission on this repo. Edit your fine-grained token and add: Repository "${cfg.repo}" → Contents: Read & Write + Metadata: Read-only.`
    )
    throw new Error(`GitHub write failed (${path}): ${err.message || r.status}`)
  }
  const res = await r.json()
  return res.content.sha
}

function splitCredentials(allCreds) {
  const maxCapacity = CRED_FILES.length * CRED_CHUNK
  if (allCreds.length > maxCapacity) {
    throw new Error(
      `Credential count (${allCreds.length}) exceeds storage capacity (${maxCapacity}). ` +
      `Add frontend/data_creds_6.json and update CRED_FILES to expand capacity.`
    )
  }
  const chunks = []
  for (let i = 0; i < CRED_FILES.length; i++) {
    chunks.push(allCreds.slice(i * CRED_CHUNK, (i + 1) * CRED_CHUNK))
  }
  return chunks
}


// ── Image asset helpers ───────────────────────────────────────────────────────
// Images are stored as separate files (portfolio/avatar.png etc.) instead of
// inline base64. This keeps data_main.json lean and prevents GitHub API timeouts.

const MAX_INLINE_B64_CHARS = 50_000  // ~37KB — anything larger must be a file

// Credential logo thresholds:
// - logoUpload is ALWAYS removed (transient admin-UI staging field — never needed in repo)
// - Credly creds: logo/image base64 always stripped — credlyImageUrl is the correct field
// - Certificate creds: logos up to 50KB are kept inline; larger ones are uploaded as files
// - LinkedIn creds: logos above 5KB stripped — they don't display logos in the portfolio
// - Any base64 logo above 50KB is uploaded as a file; URL stored in the field instead
const _CREDLY_STRIP_FIELDS  = ['logo', 'image']        // always strip base64 for credly
const _GENERAL_MAX_B64      = 50_000                   // ~37KB — max inline logo size

/**
 * Strip large base64 blobs from a data object before writing to GitHub.
 * Returns a cleaned copy; the original is untouched.
 */
export function stripLargeBase64(obj) {
  if (typeof obj !== 'object' || obj === null) return obj
  if (Array.isArray(obj)) return obj.map(stripLargeBase64)
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v.startsWith('data:image/') && v.length > MAX_INLINE_B64_CHARS) {
      out[k] = ''
      console.warn(`[GitHub] stripLargeBase64: dropped inline image for key "${k}" (${(v.length/1024).toFixed(0)}KB). Use uploadImage() instead.`)
    } else {
      out[k] = stripLargeBase64(v)
    }
  }
  return out
}

/**
 * Upload a base64 data URL as a file to the repo.
 * Returns the raw GitHub URL for the file.
 */
async function _uploadCredImage(cfg, certId, field, dataUrl) {
  // Extract mime type and raw base64
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!match) return ''
  const ext    = match[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')
  const b64    = match[2]
  const fname  = `cert_logos/${certId}_${field}.${ext}`
  const path   = `frontend/${fname}`

  // Re-use uploadImage which already handles 422/409 retries and in-flight dedup
  try {
    const resultPath = await uploadImage(fname, b64)
    const rawUrl = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/main/${resultPath}`
    console.info(`[GitHub] _uploadCredImage: saved ${fname} → ${rawUrl}`)
    return rawUrl
  } catch (err) {
    console.warn(`[GitHub] _uploadCredImage: upload failed for ${certId} (${err.message}) — keeping inline`)
    return dataUrl   // fallback: keep inline if upload fails
  }
}

/**
 * Strip base64 blobs from credential logo/image fields before writing to GitHub.
 * Rules:
 *   - logoUpload: always deleted (transient staging field)
 *   - credly type: logo/image base64 cleared (credlyImageUrl is the correct display field)
 *   - certificate/other ≤50KB: kept inline — small logos render fine in portfolio
 *   - certificate/other >50KB: cleared (commit() in App.jsx already uploaded these as files)
 */
function _stripCredentialBlobs(cred) {
  const out = { ...cred }
  delete out.logoUpload

  const type = out.type || ''
  const MAX  = 50_000

  for (const field of ['logo', 'image']) {
    const v = out[field]
    if (typeof v !== 'string' || !v.startsWith('data:')) continue

    const isCredly = type === 'credly'
    const tooBig   = v.length > MAX

    if (isCredly || tooBig) {
      out[field] = ''
      if (tooBig) console.warn(`[GitHub] _stripCredentialBlobs: cleared ${field} on cred[${cred.id}] (${(v.length/1024).toFixed(0)}KB — should have been uploaded by commit())`)
    }
    // ≤50KB non-credly: keep inline — no action needed
  }

  return out
}

/**
 * Upload an image file to the repo as portfolio/<filename>.
 * Returns the relative path string to store in JSON (e.g. "portfolio/avatar.png").
 * @param {string} filename  e.g. "avatar.png"
 * @param {string} base64    raw base64 string (no data: prefix)
 */
// In-flight upload registry — prevents two simultaneous uploads to the same path
// from both racing ahead with a null SHA and colliding on the second PUT.
const _uploadInFlight = new Map()

export async function uploadImage(filename, base64, _retries = 2) {
  const cfg = getGithubConfig()
  if (!cfg?.token) throw new Error('GitHub not configured')
  const path = `frontend/${filename}`

  // If an upload to this exact path is already in progress, wait for it and
  // return its result rather than launching a duplicate request.
  if (_uploadInFlight.has(path)) {
    console.info(`[GitHub] uploadImage: waiting for in-flight upload of ${path}`)
    return _uploadInFlight.get(path)
  }

  const promise = (async () => {
    try {
      const sha = await fetchSha(cfg, path)
      const body = {
        message: `chore: upload image ${filename} — ${new Date().toISOString()}`,
        content: base64,
        ...(sha ? { sha } : {}),
      }
      const r = await fetch(contentsUrl(cfg, path), {
        method:  'PUT',
        headers: apiHeaders(cfg),
        body:    JSON.stringify(body),
      })

      // 422 "sha wasn't supplied" — file was just created by a concurrent call;
      // fetch the real SHA and retry once.
      if (r.status === 422 && _retries > 0) {
        console.warn(`[GitHub] uploadImage: 422 on ${path} — re-fetching SHA and retrying (${_retries} left)`)
        const freshSha = await fetchSha(cfg, path)
        if (!freshSha) throw new Error(`Image upload failed (${filename}): 422 but SHA still null`)
        const r2 = await fetch(contentsUrl(cfg, path), {
          method:  'PUT',
          headers: apiHeaders(cfg),
          body:    JSON.stringify({ ...body, sha: freshSha }),
        })
        if (!r2.ok) {
          const err2 = await r2.json().catch(() => ({}))
          throw new Error(`Image upload failed (${filename}): ${err2.message || r2.status}`)
        }
        console.info(`[GitHub] Uploaded image (after 422 retry): ${path}`)
        return path
      }

      // 409 conflict — also re-fetch SHA and retry
      if (r.status === 409 && _retries > 0) {
        console.warn(`[GitHub] uploadImage: 409 on ${path} — re-fetching SHA and retrying (${_retries} left)`)
        const freshSha = await fetchSha(cfg, path)
        const r2 = await fetch(contentsUrl(cfg, path), {
          method:  'PUT',
          headers: apiHeaders(cfg),
          body:    JSON.stringify({ ...body, sha: freshSha }),
        })
        if (!r2.ok) {
          const err2 = await r2.json().catch(() => ({}))
          throw new Error(`Image upload failed (${filename}): ${err2.message || r2.status}`)
        }
        console.info(`[GitHub] Uploaded image (after 409 retry): ${path}`)
        return path
      }

      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(`Image upload failed (${filename}): ${err.message || r.status}`)
      }

      console.info(`[GitHub] Uploaded image: ${path}`)
      return path
    } finally {
      _uploadInFlight.delete(path)
    }
  })()

  _uploadInFlight.set(path, promise)
  return promise
}


// ══════════════════════════════════════════════════════════════════════════════

// ─── 4a. Cache ────────────────────────────────────────────────────────────────

const DEFAULT_TTL_MS = 5 * 60 * 1000  // 5 minutes
const _cache = {}

function getCachedData(key) {
  const entry = _cache[key]
  if (!entry) return null
  if (Date.now() - entry.timestamp > entry.ttl) {
    delete _cache[key]
    return null
  }
  return entry.data
}

function setCachedData(key, data, ttlMs = DEFAULT_TTL_MS) {
  _cache[key] = { data, timestamp: Date.now(), ttl: ttlMs }
}

export function invalidateCache() {
  Object.keys(_cache).forEach(k => delete _cache[k])
}

// External hook: set this to data/cache.js invalidateAll so saveSection
// keeps both caches in sync. App.jsx wires this up on mount.
let _externalCacheInvalidator = null;
export function registerCacheInvalidator(fn) {
  _externalCacheInvalidator = fn;
}
function _invalidateAll() {
  invalidateCache();
  if (typeof _externalCacheInvalidator === 'function') _externalCacheInvalidator();
}

const CACHE_KEYS = {
  CREDENTIALS:   'intel:credentials',
  ANALYTICS:     'intel:analytics',
  SKILL_PROFILE: 'intel:skillProfile',
  PIPELINE:      'intel:pipeline',
}

// ─── 4b. Classifier ───────────────────────────────────────────────────────────
// Keywords built from your actual cert tags and issuers.

const CATEGORY_MAP = {
  offensive: {
    label:    'Offensive Security',
    keywords: [
      'ethical hacking', 'penetration testing', 'pentest', 'red team',
      'exploit', 'kali', 'metasploit', 'burp', 'web hacking',
      'ctf', 'capture the flag', 'offensive', 'vulnerability',
    ],
  },
  defensive: {
    label:    'Defensive Security',
    keywords: [
      'blue team', 'soc', 'siem', 'incident response', 'threat hunting',
      'threat intelligence', 'malware analysis', 'forensics', 'dfir',
      'endpoint', 'ids', 'ips', 'firewall', 'security operations',
      'defensive', 'monitoring', 'detection',
    ],
  },
  cloud: {
    label:    'Cloud & DevSecOps',
    keywords: [
      'aws', 'azure', 'gcp', 'cloud', 'cloud practitioner', 'devops',
      'docker', 'kubernetes', 'containers', 'devsecops', 'ci/cd',
      'infrastructure', 'amazon', 'serverless',
    ],
  },
  networking: {
    label:    'Networking',
    keywords: [
      'network', 'networking', 'cisco', 'ccna', 'tcp', 'ip', 'protocol',
      'routing', 'switching', 'vpn', 'packet', 'wireshark',
      'cisco networking academy', 'cisco netacad',
    ],
  },
  systems: {
    label:    'Linux & Systems',
    keywords: [
      'linux', 'bash', 'shell', 'unix', 'operating system', 'canonical',
      'ubuntu', 'kernel', 'sysadmin', 'systems',
    ],
  },
  programming: {
    label:    'Programming & Dev',
    keywords: [
      'python', 'javascript', 'java', 'c++', 'c#', 'rust', 'go',
      'coding', 'development', 'software', 'github', 'jetbrains',
      'programming', 'scripting',
    ],
  },
  data: {
    label:    'Data & AI/ML',
    keywords: [
      'data', 'machine learning', 'ai', 'ai/ml', 'analytics', 'sql',
      'tableau', 'power bi', 'knime', 'anaconda', 'statistics',
      'deep learning', 'neural network', 'data science',
    ],
  },
  professional: {
    label:    'Professional Skills',
    keywords: [
      'leadership', 'management', 'communication', 'marketing',
      'project management', 'agile', 'scrum', 'business', 'strategy',
      'linkedin learning', 'coursera', 'udemy', 'soft skills',
      'hootsuite', 'grammarly', 'content marketing',
    ],
  },
}

function classifyCredential(cert) {
  const haystack = [
    ...(cert.tags || []),
    cert.title  || '',
    cert.issuer || '',
  ].map(s => String(s).toLowerCase()).join(' ')

  let bestKey = 'other', bestScore = 0
  for (const [key, def] of Object.entries(CATEGORY_MAP)) {
    let score = 0
    for (const kw of def.keywords) {
      if (haystack.includes(kw.toLowerCase())) score++
    }
    if (score > bestScore) { bestScore = score; bestKey = key }
  }
  return bestKey
}

function classifyAll(credentials) {
  return credentials.map(cert => ({
    ...cert,
    category: cert.category || classifyCredential(cert),
  }))
}

export function getCategoryLabel(key) {
  return CATEGORY_MAP[key]?.label ?? 'Other'
}

// ─── 4c. Processor ────────────────────────────────────────────────────────────

function processCredentials(credentials) {
  if (!credentials?.length) return _emptyAnalytics()

  const total    = credentials.length
  const featured = credentials.filter(c => c.featured)

  // Category distribution
  const categoryCount = {}
  for (const cert of credentials) {
    const cat = cert.category || 'other'
    categoryCount[cat] = (categoryCount[cat] || 0) + 1
  }
  const categoryDistribution = Object.entries(categoryCount)
    .map(([key, count]) => ({
      key, label: getCategoryLabel(key), count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count)

  // Top issuers
  const issuerCount = {}
  for (const cert of credentials) {
    const issuer = cert.issuer || 'Unknown'
    issuerCount[issuer] = (issuerCount[issuer] || 0) + 1
  }
  const topIssuers = Object.entries(issuerCount)
    .map(([issuer, count]) => ({ issuer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Timeline — your dates are YYYY-MM format
  const timelineMap = {}
  const VALID_DATE  = /^\d{4}-\d{2}$/
  for (const cert of credentials) {
    const raw = String(cert.date || '').trim()
    if (!VALID_DATE.test(raw)) continue
    if (!timelineMap[raw]) timelineMap[raw] = { date: raw, count: 0, certs: [] }
    timelineMap[raw].count++
    timelineMap[raw].certs.push({ id: cert.id, title: cert.title, category: cert.category })
  }
  const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date))
  let cumulative = 0
  for (const entry of timeline) { cumulative += entry.count; entry.cumulative = cumulative }

  // Top tags
  const tagCount = {}
  for (const cert of credentials) {
    for (const tag of cert.tags || []) {
      const t = tag.toLowerCase().trim()
      tagCount[t] = (tagCount[t] || 0) + 1
    }
  }
  const topTags = Object.entries(tagCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return {
    total,
    featuredCount: featured.length,
    categoryDistribution,
    topIssuers,
    timeline,
    topTags,
    peakMonth: timeline.reduce((best, e) => (e.count > (best?.count ?? 0) ? e : best), null),
    generatedAt: new Date().toISOString(),
  }
}

function _emptyAnalytics() {
  return {
    total: 0, featuredCount: 0, categoryDistribution: [],
    topIssuers: [], timeline: [], topTags: [], peakMonth: null,
    generatedAt: new Date().toISOString(),
  }
}

// ─── 4d. Skill Engine ─────────────────────────────────────────────────────────

const DOMAIN_MAP = {
  offensive:    { domains: ['offensive', 'recon'],        weight: 1.0 },
  defensive:    { domains: ['defensive', 'detection'],    weight: 1.0 },
  cloud:        { domains: ['cloud', 'devops'],           weight: 0.8 },
  networking:   { domains: ['networking'],                weight: 1.0 },
  systems:      { domains: ['systems', 'linux'],          weight: 0.9 },
  programming:  { domains: ['scripting', 'automation'],   weight: 0.7 },
  data:         { domains: ['intelligence', 'analytics'], weight: 0.6 },
  professional: { domains: ['opsec', 'leadership'],       weight: 0.4 },
  other:        { domains: ['general'],                   weight: 0.3 },
}

function buildSkillProfile(classifiedCredentials) {
  if (!classifiedCredentials?.length) return _emptyProfile()

  const rawScores = {}
  for (const cert of classifiedCredentials) {
    const mapping = DOMAIN_MAP[cert.category] ?? DOMAIN_MAP.other
    for (const domain of mapping.domains) {
      rawScores[domain] = (rawScores[domain] ?? 0) + mapping.weight
    }
  }

  const maxRaw = Math.max(...Object.values(rawScores), 1)
  const norm   = domain => Math.min(100, Math.round(((rawScores[domain] ?? 0) / maxRaw) * 100))

  const profile = {
    offensive:    norm('offensive'),
    defensive:    norm('defensive'),
    networking:   norm('networking'),
    systems:      norm('systems'),
    cloud:        norm('cloud'),
    scripting:    norm('scripting'),
    intelligence: norm('intelligence'),
    opsec:        norm('opsec'),
  }

  const WEIGHTS = {
    offensive: 0.20, defensive: 0.20, networking: 0.15, systems: 0.15,
    cloud: 0.10, scripting: 0.10, intelligence: 0.05, opsec: 0.05,
  }
  const overall = Math.round(
    Object.entries(profile).reduce((sum, [k, v]) => sum + v * (WEIGHTS[k] ?? 0), 0)
  )
  return { ...profile, overall }
}

function _emptyProfile() {
  return {
    offensive: 0, defensive: 0, networking: 0, systems: 0,
    cloud: 0, scripting: 0, intelligence: 0, opsec: 0, overall: 0,
  }
}

function _lerp(a, b, t) {
  const c = Math.max(0, Math.min(1, t))
  return a + (b - a) * c
}
function _wavg(pairs) {
  const tw = pairs.reduce((s, [, w]) => s + w, 0)
  return pairs.reduce((s, [v, w]) => s + v * w, 0) / tw
}

export function getAttackModifiers(skillProfile) {
  const sp = skillProfile ?? _emptyProfile()
  return {
    attackSpeedMultiplier: _lerp(0.5, 2.0, sp.offensive / 100),
    successRate:           _lerp(0.10, 0.90, _wavg([[sp.offensive, 0.50], [sp.scripting, 0.30], [sp.networking, 0.20]]) / 100),
    automationLevel:       _lerp(0, 10, sp.scripting / 100),
    lateralMovement:       _lerp(0, 5, _wavg([[sp.networking, 0.60], [sp.systems, 0.40]]) / 100),
  }
}

export function getDefenceModifiers(skillProfile) {
  const sp = skillProfile ?? _emptyProfile()
  return {
    detectionTimeSeconds: _lerp(600, 10, sp.defensive / 100),
    detectionRate:        _lerp(0.05, 0.95, _wavg([[sp.defensive, 0.50], [sp.intelligence, 0.30], [sp.cloud, 0.20]]) / 100),
    containmentScore:     _lerp(0.1, 1.0, _wavg([[sp.defensive, 0.40], [sp.systems, 0.30], [sp.networking, 0.30]]) / 100),
    attributionCapability: sp.intelligence / 100,
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — UNIFIED PIPELINE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * loadAndAnalyzeData(opts?)
 *
 * Full pipeline: fetch → cache → classify → analytics → skill profile → sim modifiers.
 * All consumers (Dashboard, Terminal, Simulation Engine) call this one function.
 *
 * @param {{ forceRefresh?: boolean }} opts
 * @returns {Promise<{ certs, analytics, skillProfile, simulation, meta }>}
 */
export async function loadAndAnalyzeData({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = getCachedData(CACHE_KEYS.PIPELINE)
    if (cached) {
      console.info('[Pipeline] Serving from cache.')
      return cached
    }
  }

  console.info('[Pipeline] Starting full analysis run…')
  const t0 = performance.now()

  // Fetch raw credentials (reuse cached raw data if available)
  let rawCreds = getCachedData(CACHE_KEYS.CREDENTIALS)
  if (forceRefresh || !rawCreds) {
    const cfg = getGithubConfig()
    if (!cfg?.token) return _emptyPipelineResult()

    const results = await Promise.allSettled(
      CRED_FILES.map(f => fetchFileStreaming(cfg, f).catch(() => null))
    )
    rawCreds = []
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value?.credentials?.length) {
        rawCreds.push(...r.value.credentials)
      }
    })
    setCachedData(CACHE_KEYS.CREDENTIALS, rawCreds)
  }

  // Classify → process → skill profile
  const classified   = classifyAll(rawCreds)
  const analytics    = processCredentials(classified)
  const skillProfile = buildSkillProfile(classified)

  setCachedData(CACHE_KEYS.ANALYTICS,     analytics)
  setCachedData(CACHE_KEYS.SKILL_PROFILE, skillProfile)

  const result = {
    certs: classified,
    analytics,
    skillProfile,
    simulation: {
      attack:  getAttackModifiers(skillProfile),
      defence: getDefenceModifiers(skillProfile),
    },
    meta: {
      totalCerts:  rawCreds.length,
      elapsedMs:   Math.round(performance.now() - t0),
      generatedAt: new Date().toISOString(),
    },
  }

  setCachedData(CACHE_KEYS.PIPELINE, result)
  console.info(`[Pipeline] Done in ${result.meta.elapsedMs}ms — ${rawCreds.length} certs analysed.`)
  return result
}

function _emptyPipelineResult() {
  return {
    certs: [], analytics: _emptyAnalytics(), skillProfile: _emptyProfile(),
    simulation: { attack: getAttackModifiers(null), defence: getDefenceModifiers(null) },
    meta: { totalCerts: 0, elapsedMs: 0, generatedAt: new Date().toISOString() },
  }
}

// ─── Terminal helpers ─────────────────────────────────────────────────────────

export async function getCertSummary() {
  const { analytics, skillProfile } = await loadAndAnalyzeData()
  const { total, featuredCount, categoryDistribution, peakMonth } = analytics
  const topCats = categoryDistribution.slice(0, 3).map(c => `${c.label} (${c.count})`).join(', ')
  return [
    `┌─ CREDENTIAL SUMMARY ─────────────────────────────────`,
    `│  Total certifications : ${total}`,
    `│  Featured             : ${featuredCount}`,
    `│  Top categories       : ${topCats}`,
    `│  Peak month           : ${peakMonth?.date ?? 'N/A'} (${peakMonth?.count ?? 0} certs)`,
    `│  Cyber skill index    : ${skillProfile.overall}/100`,
    `└───────────────────────────────────────────────────────`,
  ].join('\n')
}

export async function getCertAnalysis() {
  const { analytics, skillProfile, simulation } = await loadAndAnalyzeData()
  const catLines = analytics.categoryDistribution
    .map(c => `│  ${c.label.padEnd(26)} ${String(c.count).padStart(3)}  (${String(c.percentage).padStart(3)}%)`)
    .join('\n')
  const skillLines = Object.entries(skillProfile)
    .filter(([k]) => k !== 'overall')
    .map(([k, v]) => {
      const bar = '█'.repeat(Math.round(v / 5)).padEnd(20, '░')
      return `│  ${k.padEnd(14)} ${bar} ${String(v).padStart(3)}/100`
    })
    .join('\n')
  return [
    `┌─ CERT ANALYSIS ──────────────────────────────────────`,
    `│  Total: ${analytics.total}  │  Generated: ${analytics.generatedAt}`,
    `├─ CATEGORY DISTRIBUTION ──────────────────────────────`,
    catLines,
    `├─ SKILL DOMAINS ──────────────────────────────────────`,
    skillLines,
    `├─ SIMULATION ENGINE ──────────────────────────────────`,
    `│  Attack speed      x${simulation.attack.attackSpeedMultiplier.toFixed(2)}`,
    `│  Success rate       ${(simulation.attack.successRate * 100).toFixed(0)}%`,
    `│  Detection time    ${simulation.defence.detectionTimeSeconds.toFixed(0)}s`,
    `│  Detection rate     ${(simulation.defence.detectionRate * 100).toFixed(0)}%`,
    `└───────────────────────────────────────────────────────`,
  ].join('\n')
}

export async function getTimeline() {
  const { analytics } = await loadAndAnalyzeData()
  const { timeline }  = analytics
  if (!timeline.length) return 'No timeline data available.'
  const lines = timeline.map(e => {
    const bar = '▪'.repeat(Math.min(e.count, 30))
    return `│  ${e.date}  ${bar.padEnd(30)} +${e.count}  (total: ${e.cumulative})`
  })
  return [
    `┌─ CERTIFICATION TIMELINE ─────────────────────────────`,
    ...lines,
    `└───────────────────────────────────────────────────────`,
  ].join('\n')
}


// ══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — ORIGINAL PUBLIC API  (unchanged from v3 — App.jsx needs no edits)
// ══════════════════════════════════════════════════════════════════════════════

export async function loadAll(defaults) {
  const cfg = getGithubConfig()
  if (!cfg?.token) return defaults

  try {
    const [mainData, ...credDatas] = await Promise.all([
      fetchFileStreaming(cfg, MAIN_FILE),
      ...CRED_FILES.map(f => fetchFileStreaming(cfg, f).catch(() => null)),
    ])

    const allCreds = []
    credDatas.forEach(cd => {
      if (cd && Array.isArray(cd.credentials)) allCreds.push(...cd.credentials)
    })

    // Auto-populate the intel cache so consumers don't need a separate fetch
    if (allCreds.length) {
      setCachedData(CACHE_KEYS.CREDENTIALS, allCreds)
    }

    return {
      ...defaults,
      ...(mainData || {}),
      credentials: allCreds.length ? allCreds : (defaults.credentials || []),
    }
  } catch (e) {
    console.error('[GitHub] loadAll failed:', e.message)
    return defaults
  }
}

export async function saveSection(section, value) {
  // All saves go through the serial write queue — no two saves ever run in
  // parallel, eliminating 409 SHA conflicts entirely.
  return enqueue(() => _saveSection(section, value))
}

async function _saveSection(section, value) {
  const cfg = getGithubConfig()
  if (!cfg?.token) throw new Error('GitHub not configured')

  try {
    if (MAIN_SECTIONS.includes(section)) {
      const [mainData, sha] = await Promise.all([
        fetchFileStreaming(cfg, MAIN_FILE),
        fetchSha(cfg, MAIN_FILE),
      ])
      // Strip any large base64 blobs — they must be uploaded via uploadImage() separately
      const cleanValue = stripLargeBase64(value)
      const updated = { ...(mainData || {}), [section]: cleanValue }
      await writeFile(cfg, MAIN_FILE, updated, sha)

    } else if (section === 'credentials') {
      // Images have already been uploaded to files by App.jsx commit().
      // _stripCredentialBlobs just clears any remaining base64 as a safety net.
      const cleanCreds = value.map(_stripCredentialBlobs)
      const chunks = splitCredentials(cleanCreds)

      // Write files SEQUENTIALLY — not in parallel — so each write fetches
      // a fresh SHA after the previous write completes. This prevents 409
      // conflicts when multiple cred files need updating in the same save.
      for (let i = 0; i < CRED_FILES.length; i++) {
        const f = CRED_FILES[i]
        const sha = await fetchSha(cfg, f)
        await writeFile(cfg, f, { credentials: chunks[i] || [] }, sha)
      }

      // Invalidate both caches — intel pipeline gets fresh data on next call
      _invalidateAll()

    } else if (section === '_ai_config') {
      const AI_FILE = 'frontend/data_ai_config.json'
      const sha = await fetchSha(cfg, AI_FILE)
      await writeFile(cfg, AI_FILE, value, sha)

    }
  } catch (e) {
    console.error('[GitHub] saveSection error:', e.message)
    throw new Error(`Save failed for "${section}": ${e.message}`)
  }
}

export async function loadSection(section, fallback) {
  const cfg = getGithubConfig()
  if (!cfg?.token) return fallback
  try {
    if (MAIN_SECTIONS.includes(section)) {
      const data = await fetchFileStreaming(cfg, MAIN_FILE)
      return data?.[section] ?? fallback
    } else if (section === 'credentials') {
      const datas = await Promise.all(CRED_FILES.map(f => fetchFileStreaming(cfg, f).catch(() => null)))
      const all   = []
      datas.forEach(d => { if (d && Array.isArray(d.credentials)) all.push(...d.credentials) })
      return all.length ? all : fallback
    } else if (section === '_ai_config') {
      const AI_FILE = 'frontend/data_ai_config.json'
      const data = await fetchFileStreaming(cfg, AI_FILE)
      return data ?? fallback
    }
    return fallback
  } catch (e) {
    console.error('[GitHub] loadSection error:', e.message)
    return fallback
  }
}

export async function testConnection(owner, repo, token) {
  if (!owner || !repo || !token) {
    return { ok: false, msg: 'Owner, repository name, and token are all required.' }
  }
  try {
    const repoR = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        'Authorization':        `Bearer ${token}`,
        'Accept':               'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      }
    })
    if (repoR.status === 401) return { ok: false, msg: 'Token invalid or expired.' }
    if (repoR.status === 403) return { ok: false, msg: 'Token lacks repo access — enable "Contents" read+write permission.' }
    if (repoR.status === 404) return { ok: false, msg: `Repository "${owner}/${repo}" not found. Check the owner and repo name.` }
    if (!repoR.ok)            return { ok: false, msg: `GitHub returned ${repoR.status}.` }

    const meta = await repoR.json()
    if (!meta.permissions?.push) {
      return { ok: false, msg: 'Token has read access but no write permission to this repo.' }
    }

    const fileR = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${MAIN_FILE}`,
      {
        method: 'HEAD',
        headers: {
          'Authorization':        `Bearer ${token}`,
          'Accept':               'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        }
      }
    )
    if (fileR.status === 404) {
      return { ok: false, msg: `Repo accessible but ${MAIN_FILE} not found. Did you upload the split data files?` }
    }
    if (!fileR.ok) {
      return { ok: false, msg: `Could not access ${MAIN_FILE}: HTTP ${fileR.status}` }
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, msg: `Network error: ${e.message}. Check your token and repo name.` }
  }
}

// No-op stubs — keep App.jsx import surface identical
export function resetClient() {}
export function subscribeToChanges() { return () => {} }
