/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  CYBAASH SOC — security-military-additions.js  (v2.1 — MERGED)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠ THIS FILE IS NO LONGER LOADED SEPARATELY.
 *
 *  All military additions (APT Alerts, Terminal, TOTP, Auto-Block, Sounds,
 *  Push Notifications) have been fully merged into security.js v2.1 to
 *  eliminate the following bugs that existed when this was a separate file:
 *
 *  [B1] Duplicate function declarations (loadAPTAlerts, handleTerminalCommand,
 *       termPrint, quickPassiveScan, playAlertSound, requestNotificationPermission,
 *       checkForNewAlerts, refreshAll, switchTab, startTOTPFlow, grantSession)
 *       caused the last definition to silently overwrite the first, breaking
 *       function chaining and IIFE patches.
 *
 *  [B2] `const` declared inside switch/case blocks (case 'purge', case 'export')
 *       without block scope braces caused a SyntaxError in strict mode and
 *       runtime ReferenceErrors in non-strict browsers.
 *
 *  [B3] `let _prevLogCount = 0` was declared twice (once here, once in
 *       security.js), producing a duplicate-declaration error in strict mode.
 *
 *  [B4] `const _originalGrantSession` was declared twice — once in security.js
 *       (capturing the base grantSession) and again here (capturing the already-
 *       wrapped version), meaning the TOTP wrapper captured itself as its own
 *       fallback and caused infinite recursion on login.
 *
 *  [B5] `'use strict'` was declared twice — once at the top of security.js
 *       and once here — redundant and confusing.
 *
 *  [B6] The `intel add/remove` terminal commands sent unauthenticated fetch
 *       requests (missing X-JWT-Token header), causing 401s from the Worker.
 *
 *  [B7] checkForNewAlerts() only played sounds and showed toasts — it never
 *       called blockIPAction(), so threats were never automatically blocked.
 *
 *  HOW TO REMOVE THIS FILE FROM YOUR PROJECT:
 *  ─────────────────────────────────────────────────────────────────────────
 *  1. Delete this file from your repository.
 *  2. Remove any <script src="security-military-additions.js"> tag from
 *     security.html — it is no longer needed.
 *  3. security.js v2.1 contains all functionality.
 *
 *  If you must keep this file for legacy reasons, ensure it is NOT loaded
 *  in security.html — loading it alongside the merged security.js will
 *  re-introduce the duplicate-declaration bugs listed above.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// No code — all logic lives in security.js v2.1
