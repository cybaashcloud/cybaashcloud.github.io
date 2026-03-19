# Cyber Intel Engine — Architecture

## Overview

A modular, cache-aware data pipeline that transforms your GitHub-hosted split
credential files into actionable intelligence for three consumers:

```
GitHub Repo (data_creds_1…5.json)
         │
         ▼
   ┌─────────────┐
   │  fetcher.js │  Parallel stream-fetch, retry logic, graceful degradation
   └──────┬──────┘
          │ raw credentials[]
          ▼
   ┌─────────────┐
   │   cache.js  │  In-memory TTL cache (5-min default), shared keys
   └──────┬──────┘
          │
          ▼
   ┌──────────────────┐
   │  classifier.js   │  Assigns cyber domain categories to each cert
   └──────┬───────────┘
          │ classified credentials[]
          ▼
   ┌──────────────────┐
   │  processor.js    │  Analytics: counts, distribution, timeline, tags
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │  skillEngine.js  │  Skill profile (0-100 per domain) + sim modifiers
   └──────┬───────────┘
          │
          ▼
   ┌──────────────────┐
   │   pipeline.js    │  loadAndAnalyzeData() — single entry point
   └──────────────────┘
          │
    ┌─────┼────────────┐
    ▼     ▼            ▼
Terminal  Dashboard  Simulation Engine
```

---

## File Reference

| File | Responsibility |
|------|----------------|
| `data/fetcher.js`     | Parallel GitHub stream-fetch for all 5 credential files |
| `data/cache.js`       | In-memory TTL cache, `CACHE_KEYS` constants |
| `data/classifier.js`  | Keyword-based category assignment (extensible) |
| `data/processor.js`   | Analytics: distribution, timeline, issuers, tags |
| `data/skillEngine.js` | Skill profile builder + simulation modifier generators |
| `data/pipeline.js`    | Unified `loadAndAnalyzeData()` + terminal helpers |
| `useCyberIntel.jsx`   | React hook + example components for all 3 consumers |

---

## Data Flow

### 1. Fetcher (`fetcher.js`)

Uses the **same streaming technique** as your existing `github.js`:
- `Promise.allSettled` fires all 5 credential files in parallel
- Each file is stream-decoded to avoid memory spikes on large base64 payloads
- Retry logic: 3 attempts with exponential back-off (800ms, 1600ms, 2400ms)
- 404s are graceful (returns `null`) — useful during initial setup
- `fetchCredentials()` merges all `credentials[]` arrays into one flat list

### 2. Cache (`cache.js`)

Prevents repeat GitHub API hits when multiple components mount:

```js
getCachedData('intel:credentials')   // returns null if expired/missing
setCachedData('intel:credentials', data, 5 * 60 * 1000)  // 5-min TTL
invalidateAll()                       // call after admin saves
```

Well-known keys in `CACHE_KEYS` ensure all modules share the same entries.

### 3. Classifier (`classifier.js`)

Maps each credential to a cyber domain by scanning:
- `cert.tags[]`
- `cert.title`
- `cert.issuer`

against keyword lists defined in `CATEGORY_MAP`. The map covers:

| Key | Label | Example Keywords |
|-----|-------|-----------------|
| `offensive`    | Offensive Security    | ethical hacking, pentest, red team |
| `defensive`    | Defensive Security    | blue team, soc, siem, incident response |
| `cloud`        | Cloud & DevSecOps     | aws, docker, devops, cloud |
| `networking`   | Networking            | cisco, ccna, network, routing |
| `systems`      | Linux & Systems       | linux, bash, canonical, ubuntu |
| `programming`  | Programming & Dev     | python, javascript, github |
| `data`         | Data & AI/ML          | data, ai/ml, analytics, knime |
| `professional` | Professional Skills   | leadership, marketing, linkedin |

**To add a new category:** add an entry to `CATEGORY_MAP` in `classifier.js`.
No other files need to change.

### 4. Processor (`processor.js`)

Produces a structured analytics object:

```js
{
  total: 334,
  featuredCount: 15,
  categoryDistribution: [
    { key: 'cloud', label: 'Cloud & DevSecOps', count: 89, percentage: 27 },
    ...
  ],
  topIssuers: [
    { issuer: 'Amazon Web Services (AWS)', count: 42 },
    ...
  ],
  timeline: [
    { date: '2025-06', count: 12, cumulative: 120, certs: [...] },
    ...
  ],
  topTags: [{ tag: 'aws', count: 42 }, ...],
  peakMonth: { date: '2026-03', count: 44, cumulative: 334 },
}
```

### 5. Skill Engine (`skillEngine.js`)

Converts category counts → normalised 0-100 domain scores:

```js
skillProfile = {
  offensive:    85,
  defensive:    72,
  networking:   68,
  systems:      55,
  cloud:        91,
  scripting:    40,
  intelligence: 30,
  opsec:        20,
  overall:      67,
}
```

Then derives simulation multipliers:

```js
// Attack engine receives:
attackModifiers = {
  attackSpeedMultiplier: 1.7,   // 1.0 = normal speed
  successRate: 0.78,             // 78% chance per attempt
  automationLevel: 4,            // 0-10 scripting automation
  lateralMovement: 3,            // 0-5 pivot capability
}

// Defence engine receives:
defenceModifiers = {
  detectionTimeSeconds: 45,      // how fast alerts fire
  detectionRate: 0.82,           // 82% chance to catch attack
  containmentScore: 0.74,        // incident containment ability
  attributionCapability: 0.30,   // threat attribution
}
```

### 6. Pipeline (`pipeline.js`)

```js
// All consumers call one function:
const { certs, analytics, skillProfile, simulation, meta } =
  await loadAndAnalyzeData();

// Force a fresh fetch (e.g. after admin saves):
await loadAndAnalyzeData({ forceRefresh: true });
```

Terminal helpers:
```js
getCertSummary()   // for `certs` command
getCertAnalysis()  // for `certs --analyze`
getTimeline()      // for `certs --timeline`
```

---

## React Integration

```jsx
// 1. General purpose hook (Dashboard, any component):
const { data, loading, error, refresh } = useCyberIntel();

// 2. Terminal command handler:
const { handleCertCommand } = useTerminalCertCommands();
const output = await handleCertCommand('certs --analyze');

// 3. Simulation engine:
const { attack, defence, ready } = useSimulationModifiers();
if (ready) runSimulation({ attackMods: attack, defenceMods: defence });
```

---

## Keeping Your Admin System Working

This engine **reads** the same files your admin writes.  After a successful
`saveSection('credentials', ...)` call in your existing `github.js`, you should
invalidate the cache so all consumers get fresh data immediately:

```js
import { invalidateAll } from './data/cache.js';

// In your admin save callback:
await saveSection('credentials', updatedCreds);
invalidateAll();   // pipeline will re-fetch on next consumer mount
```

---

## Extending

| Task | Where to change |
|------|-----------------|
| Add a new cert category     | `CATEGORY_MAP` in `classifier.js` |
| Add a new sim modifier      | `getAttackModifiers` / `getDefenceModifiers` in `skillEngine.js` |
| Add a new analytics metric  | `processCredentials` in `processor.js` |
| Add a new terminal command  | `handleCertCommand` switch in `pipeline.js` / `useCyberIntel.jsx` |
| Change cache TTL            | `DEFAULT_TTL_MS` in `cache.js` |
| Add a 6th credential file   | Add path to `CRED_FILES` in `fetcher.js` |

---

## ⚠ Cache Invalidation Rules (CRITICAL)

There are **two independent caches** in this system. Both must be cleared after admin saves:

| Cache | Location | Invalidation function |
|---|---|---|
| `github.js` internal `_cache{}` | `admin/src/github.js` | `invalidateCache()` |
| Pipeline cache `_store{}` | `admin/src/data/cache.js` | `invalidateAll()` |

`saveSection()` in `github.js` now calls `_invalidateAll()` which clears both — **but only if**
`registerCacheInvalidator(invalidateAll)` was called from `App.jsx` on startup.

**Rule:** Any new module that saves data must call `_invalidateAll()` and must ensure
`registerCacheInvalidator` was called before the first save.

## Token Security Note

The GitHub PAT is stored in `sessionStorage` (clears on tab close). The portfolio and admin
share the same origin (`/` and `/admin/`) — any JS in the portfolio page can theoretically
read the token. Mitigate by using a **Fine-Grained PAT** scoped to `contents:write` on
this single repo only, limiting blast radius if the token is ever exposed.
