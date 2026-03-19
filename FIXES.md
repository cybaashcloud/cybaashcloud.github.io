# CYBAASH — Fix Log

## Changes in this release

### 1. UI Theme — Apple-grade dark redesign (cybaash-ai.css)
- Complete rewrite using system-ui / SF Pro font stack — no Google Fonts dependency
- CSS custom properties for every color/surface — single source of truth
- FAB button: pill shape with animated status dot, backdrop-blur glass, spring animation
- Chat overlay: refined layout, rounded bubbles, smooth spring transitions
- Tool tabs: segmented control style (Apple-style pill selector)
- Suggestion chips: rounded pills instead of hard-edged rectangles
- Send button: round with scale-spring hover, SVG arrow icon
- All emoji removed from UI — text-only, professional
- Status badge uses pill with subtle background tint instead of raw dot

### 2. Attacker Mode (RED team) — fully functional
- CSS variable override at `body.attacker-mode #cybaash-ai-panel` level
- All accent/surface/border colors shift to red palette automatically
- FAB, nav button, send button, all inputs, message bubbles, headers all shift
- Triggered correctly by `user attacker_1` in terminal (was already wired up —
  `setAttackerTheme()` in index.html line ~6325 sets `body.attacker-mode`)
- If red mode wasn't triggering: confirm you are on the LIVE RANGE tab when
  typing in the terminal. The terminal only runs when the terminal panel is open.

### 3. Network Canvas — live motion at all times
- Added breathing pulse ring around every node (standby idle animation)
- Added idle data-packet dots traversing all edges (green, slow) in standby
- Attack packets (red, fast) remain during active simulation
- Node icons changed from emoji to short text labels (WEB, DB, APP, etc.)
  — emoji rendered inconsistently across OS/browser
- Skill DNA bars in right panel now render actual bars with animated fill

### 4. Dashboard Login fix (dashboard.html)
- Token validation now accepts any token >= 20 chars (not just ghp_/github_pat_)
- Error messages differentiated between classic PAT and fine-grained token failures
- Fine-grained token error now shows exactly which permissions are needed

### 5. Gemini API key save fix (cybaash-ai.js)
- Config fetch now tries multiple paths in order:
  1. /data_ai_config.json  (correct path when deployed to GitHub Pages)
  2. ./data_ai_config.json (relative fallback)
  3. /portfolio/data_ai_config.json (legacy path)
- This fixes the "Demo Mode" issue when the key was saved but not loading

---

## ACTION REQUIRED — GitHub Token Permissions

Most of the "login fails" and "save fails" issues are token permission problems,
not code bugs. Here is the exact setup needed:

### For dashboard.html login (cybaash-data repo access):
1. Go to: github.com → Settings → Developer settings → Fine-grained tokens
2. Create token with:
   - Resource owner: your account
   - Repository access: Only select → cybaash-data
   - Permissions:
     - Contents: Read and Write
     - Metadata: Read-only (required)
     - Account > User info: Read-only (needed for /user endpoint)
3. Copy the token (github_pat_...) and paste into the login screen

### For admin panel (cybaash.github.io repo — Gemini key save):
1. Create a SECOND fine-grained token (or update the existing one)
2. Repository access: Only select → cybaash.github.io
3. Permissions:
   - Contents: Read and Write
   - Metadata: Read-only
4. Paste this token in Admin → Settings → GitHub Connection

### Why two tokens?
Fine-grained tokens are scoped per-repo for security. The dashboard reads
from cybaash-data; the admin panel writes to cybaash.github.io. Classic PATs
(ghp_) with full repo scope work for both — simpler if you prefer.

---

## Files changed
- frontend/cybaash-ai.css — full rewrite (theme)
- frontend/cybaash-ai.js — config path fallback chain
- frontend/index.html — FAB/UI HTML, canvas animation, skill bars
- frontend/dashboard.html — login token validation + error messages
