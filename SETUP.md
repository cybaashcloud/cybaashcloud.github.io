# CYBAASH — SaaS Setup Guide

## What was added to your existing project

```
cybaash.github.io/
├── portfolio/
│   ├── index.html              ← YOUR ORIGINAL (13 lines added at bottom)
│   ├── saas-integration.js     ← NEW: auth + save/load + missions panel
│   ├── data_creds_*.json       ← unchanged
│   ├── data_main.json          ← unchanged
│   └── recruiter.html          ← unchanged
├── dashboard.html              ← NEW: full operator dashboard
├── admin/                      ← unchanged (your existing admin panel)
└── .github/workflows/sync.yml  ← updated (now deploys dashboard + saas-integration.js)
```

---

## One-Time Setup (10 minutes, zero cost)

### Step 1 — Create a GitHub OAuth App

1. Go to → https://github.com/settings/developers
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `CYBAASH`
   - **Homepage URL**: `https://cybaash.github.io`
   - **Authorization callback URL**: `https://cybaash.github.io`
4. Click **Register application**
5. Copy the **Client ID** (looks like `Iv1.abc123def456`)
6. Do NOT create a client secret — Device Flow doesn't need one

### Step 2 — Set your Client ID in two files

**File 1: `portfolio/index.html`** — near the bottom, find:
```javascript
window.__CYBAASH_CLIENT_ID__ = '';   // ← paste your Client ID here
```
Change to:
```javascript
window.__CYBAASH_CLIENT_ID__ = 'Iv1.YOUR_CLIENT_ID_HERE';
```

**File 2: `dashboard.html`** — near the top of the `<script>`, find:
```javascript
const CLIENT_ID  = '';   // ← paste GitHub OAuth App Client ID
```
Change to:
```javascript
const CLIENT_ID  = 'Iv1.YOUR_CLIENT_ID_HERE';
```
Also update the username line:
```javascript
const GITHUB_USERNAME = 'cybaash'; // ← your GitHub username (already correct)
```

### Step 3 — Push and deploy

```bash
git add .
git commit -m "feat: add SaaS layer — GitHub auth + persistent missions + dashboard"
git push origin main
```

GitHub Actions deploys automatically. Your URLs will be:
- `https://cybaash.github.io` → Cyber Range (unchanged)
- `https://cybaash.github.io/dashboard.html` → Operator Dashboard

---

## How it works

### Login flow
1. User clicks "⊕ SIGN IN" badge in the Cyber Range header OR opens `dashboard.html`
2. A 6-character code is shown (`ABCD-12`)
3. GitHub tab opens automatically at `github.com/login/device`
4. User enters the code and approves
5. They're logged in — token stored in `localStorage`

### Data storage
Each user who logs in gets a private `cybaash-data` repo created in **their own** GitHub account. You never see their data. They own it.

```
their-github/cybaash-data/
  operators/{username}/
    profile.json        ← role, xp, rank, bio
    stats.json          ← cumulative stats
    simulations/
      index.json        ← list of all missions
      sim_abc123.json   ← full simulation state
```

### New terminal commands (in the Cyber Range terminal)
```
account              → show current operator info
account login        → start GitHub login flow
account logout       → sign out
account role [attacker|defender]  → switch role

save [label]         → save current simulation state
load <sim-id>        → restore a saved simulation
missions             → list all saved missions
checkpoint [name]    → named quick-save
```

### New UI elements injected into index.html
- User badge (top-right of header): shows avatar, username, role, logout button
- "⬡ MISSIONS" tab in the center panel tab bar: browse and load saved missions

---

## What stays exactly the same
- Your existing terminal and all terminal commands
- The simulation engine (attack/defense/replay)
- The network canvas
- The recruiter view
- The admin panel
- The Cyber Intel Engine (classifier, processor, skill engine)
- All cert data files and data_main.json

The SaaS layer is purely **additive** — 13 lines added to the bottom of index.html and one new script file.

---

## Cost

| Thing          | Service        | Cost   |
|----------------|---------------|--------|
| Frontend host  | GitHub Pages  | **$0** |
| Auth           | GitHub OAuth  | **$0** |
| Database       | GitHub API    | **$0** |
| CI/CD          | GitHub Actions| **$0** |
| User data repos| GitHub private| **$0** |
| **Total**      |               | **$0** |

Rate limit: 5,000 API calls/hour per user. Each simulation save uses ~3 calls.
That's ~1,600 saves per hour — far more than any real usage.

---

## Limitations

- **No real-time multiplayer** — that needs a server with persistent WebSocket connections
- **GitHub login only** — no email/password (that needs a server)
- **You can't see other users' data** — each user's data lives in their own private repo

All three are solvable later with a backend, but everything else works at $0.
