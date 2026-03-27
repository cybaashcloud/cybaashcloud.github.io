import { useState, useEffect, useRef, useCallback } from 'react'
import { invalidateAll as invalidatePipelineCache } from './data/cache.js'
import {
  getGithubConfig, saveGithubConfig, clearGithubConfig, resetClient,
  loadAll, saveSection, testConnection, registerCacheInvalidator, uploadImage,
  uploadPdf,
} from './github.js'

// Wire pipeline cache invalidation so saveSection clears both caches
registerCacheInvalidator(invalidatePipelineCache)

// ── Fonts ──────────────────────────────────────────────────────────────────
const FontLink = () => (
  <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap');`}</style>
)

// ── Constants ──────────────────────────────────────────────────────────────
const ADMIN_CREDS_KEY = 'aasiq_os_admin_pw'
// SECURITY FIX: No hardcoded default password. On first run the user is
// prompted to create one during setup. This prevents "default password" attacks
// where anyone who reads the source code can access the admin panel.
const DEFAULT_PW      = ''

const NAV = [
  { id:'dashboard',   label:'Dashboard',   icon:'◈' },
  { id:'about',       label:'About',        icon:'◈' },
  { id:'skills',      label:'Skills',       icon:'◎' },
  { id:'credentials', label:'Credentials',  icon:'◆' },
  { id:'projects',    label:'Projects',     icon:'◉' },
  { id:'flags',       label:'CTF Flags',    icon:'🚩' },
  { id:'experience',  label:'Experience',   icon:'◍' },
  { id:'contact',     label:'Contact',      icon:'◌' },
  { id:'settings',    label:'Settings',     icon:'⚙' },
]
const SKILL_LEVELS = ['Beginner','Intermediate','Advanced','Expert']
const FLAG_EMOJIS  = ['🇮🇳','🇺🇸','🇬🇧','🇦🇺','🇨🇦','🇩🇪','🇫🇷','🇸🇬','🇦🇪','🇯🇵','🇰🇷','🇧🇷','🇲🇾','🇳🇱','🇸🇪']

const uid  = () => Math.random().toString(36).slice(2,10)
const now  = () => new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})

function fileToB64(file) {
  return new Promise((res, rej) => {
    if (file.size > 5 * 1024 * 1024) { rej(new Error('File too large (max 5 MB)')); return }
    const r = new FileReader()
    r.onload = e => res(e.target.result)
    r.onerror = () => rej(new Error('File read failed'))
    r.readAsDataURL(file)
  })
}
// ── Password helpers (SHA-256 hashed, never stored in plaintext) ───────────
async function hashPw(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('')
}
// NOTE: password hash persists in localStorage across sessions (by design — avoids re-entering on every visit).
// On shared/public computers, clear manually via Settings → 'Reset Password'.
function getAdminPwHash() { return localStorage.getItem(ADMIN_CREDS_KEY) || '' }
async function setAdminPw(pw) {
  const h = await hashPw(pw)
  localStorage.setItem(ADMIN_CREDS_KEY, h)
}
async function checkAdminPw(pw) {
  const stored = getAdminPwHash()
  if (!stored) return pw === DEFAULT_PW   // first-run: no hash stored yet
  return (await hashPw(pw)) === stored
}

// ── Brute-force lockout ────────────────────────────────────────────────────
const LOCKOUT_KEY  = 'aasiq_os_login_attempts'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS   = 15 * 60 * 1000   // 15 minutes
function getLockout() {
  try { return JSON.parse(sessionStorage.getItem(LOCKOUT_KEY)) || { count:0, until:0 } }
  catch { return { count:0, until:0 } }
}
function setLockout(s) { sessionStorage.setItem(LOCKOUT_KEY, JSON.stringify(s)) }
function recordFailedAttempt() {
  const s = getLockout()
  const count = s.count + 1
  const until = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : s.until
  setLockout({ count, until }); return { count, until }
}
function clearLockout() { sessionStorage.removeItem(LOCKOUT_KEY) }

// ── CSS ────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{
    --bg:#030a0f;--bg2:#060f18;--panel:#0a1520;
    --border:#1a3a5c;--red:#ff2244;--blue:#00d4ff;--green:#00ff88;
    --yellow:#ffd700;--purple:#aa44ff;
    --text:#c8e0f4;--dim:#5a7a9a;
    --g:#00ff88;--g2:#00cc34;--g3:#008822;
    --bd:#1a3a5c;--tx:#c8e0f4;--tx2:#8aaac4;--tx3:#5a7a9a;--amber:#ffd700;
    --glow-blue:0 0 20px rgba(0,212,255,0.5);
    --glow-green:0 0 20px rgba(0,255,136,0.5);
    --glow-red:0 0 20px rgba(255,34,68,0.5);
  }
  html,body{height:100%;overflow:hidden;-webkit-overflow-scrolling:touch}
  body{background:var(--bg);color:var(--text);font-family:'Share Tech Mono',monospace;font-size:11px}
  body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:0;
    background:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.025) 2px,rgba(0,0,0,0.025) 4px)}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-track{background:var(--bg2)}
  ::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
  ::-webkit-scrollbar-thumb:hover{background:var(--dim)}
  .shell{display:flex;height:100dvh;overflow:hidden;position:relative;z-index:1;overflow-x:hidden}
  /* SIDEBAR */
  .sidebar{width:min(220px,25vw);flex-shrink:0;background:linear-gradient(180deg,#020a12,#061020);
    border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden}
  .logo{padding:20px 16px 14px;border-bottom:1px solid var(--border)}
  .logo-title{font-family:'Orbitron',monospace;font-size:17px;font-weight:900;letter-spacing:4px;
    color:var(--blue);text-shadow:var(--glow-blue)}
  .logo-title span{color:var(--red);text-shadow:var(--glow-red)}
  .logo-sub{font-size:9px;letter-spacing:3px;color:var(--dim);margin-top:4px}
  .sb-status{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:9px;
    letter-spacing:2px;border-bottom:1px solid var(--border)}
  .nav{flex:1;overflow-y:auto;padding:8px 0}
  .nav-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 16px;
    background:none;border:none;border-left:2px solid transparent;cursor:pointer;
    font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1.5px;
    color:var(--dim);transition:all .15s;text-align:left;text-transform:uppercase}
  .nav-item:hover{color:var(--text);background:rgba(0,212,255,.04);border-left-color:var(--border)}
  .nav-item.active{color:var(--blue);background:rgba(0,212,255,.07);border-left-color:var(--blue);
    text-shadow:0 0 8px rgba(0,212,255,.4)}
  .nav-icon{font-size:13px;width:16px;text-align:center;flex-shrink:0}
  .nav-badge{margin-left:auto;background:rgba(0,212,255,.15);color:var(--blue);
    border:1px solid rgba(0,212,255,.3);font-size:9px;padding:1px 6px;border-radius:10px}
  .sidebar-footer{padding:14px 16px;border-top:1px solid var(--border);font-size:9px;
    letter-spacing:1.5px;color:var(--dim)}
  .logout-btn{margin-top:8px;background:none;border:1px solid var(--border);color:var(--dim);
    padding:5px 12px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:9px;
    letter-spacing:2px;width:100%;transition:all .15s}
  .logout-btn:hover{border-color:var(--red);color:var(--red)}
  /* TOPBAR */
  .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
  .topbar{display:flex;align-items:center;justify-content:space-between;padding:0 20px;
    min-height:44px;height:44px;background:linear-gradient(90deg,#020a12,#0a1a2e,#020a12);
    border-bottom:1px solid var(--border);flex-shrink:0}
  .topbar-left{display:flex;align-items:center;gap:10px}
  .topbar-right{display:flex;align-items:center;gap:12px;font-size:10px}
  .status-dot{width:6px;height:6px;border-radius:50%;background:var(--green);
    box-shadow:var(--glow-green);animation:pulse 1.4s infinite}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
  .topbar-title{font-family:'Orbitron',monospace;font-size:11px;font-weight:700;
    letter-spacing:3px;color:var(--blue)}
  .topbar-breadcrumb{color:var(--dim);font-size:10px;letter-spacing:1px}
  .topbar-time{font-family:'Orbitron',monospace;font-size:11px;color:var(--dim)}
  .content{flex:1;overflow-y:auto;overflow-x:hidden;padding:20px 24px}
  /* SAVING BAR */
  .saving-bar{position:fixed;top:0;left:0;right:0;height:2px;z-index:9998;
    background:linear-gradient(90deg,var(--blue),var(--green),var(--blue));
    background-size:200%;animation:sweep 1.2s linear infinite}
  @keyframes sweep{0%{background-position:200%}100%{background-position:0%}}
  /* CARDS */
  .card{position:relative;background:var(--panel);border:1px solid var(--border);padding:18px;margin-bottom:16px}
  .card:hover{border-color:rgba(0,212,255,.25)}
  .card-corner{position:absolute;width:8px;height:8px;border-color:var(--blue)}
  .card-corner.tl{top:-1px;left:-1px;border-top:2px solid;border-left:2px solid}
  .card-corner.tr{top:-1px;right:-1px;border-top:2px solid;border-right:2px solid}
  .card-corner.bl{bottom:-1px;left:-1px;border-bottom:2px solid;border-left:2px solid}
  .card-corner.br{bottom:-1px;right:-1px;border-bottom:2px solid;border-right:2px solid}
  /* SECTION */
  .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px}
  .section-title{font-family:'Orbitron',monospace;font-size:14px;font-weight:700;
    letter-spacing:3px;color:var(--text);text-transform:uppercase}
  .section-count{margin-left:10px;font-size:10px;color:var(--dim);letter-spacing:1px}
  /* FORMS */
  .form-group{margin-bottom:14px}
  .form-label{display:block;font-size:9px;letter-spacing:2px;color:var(--dim);text-transform:uppercase;margin-bottom:6px}
  .form-input,.form-textarea,.form-select{width:100%;background:var(--bg2);border:1px solid var(--border);
    color:var(--text);padding:9px 12px;font-family:'Share Tech Mono',monospace;font-size:11px;outline:none;transition:border .15s}
  .form-input:focus,.form-textarea:focus,.form-select:focus{border-color:var(--blue);box-shadow:0 0 0 1px rgba(0,212,255,.15)}
  .form-textarea{resize:vertical;min-height:80px;line-height:1.6}
  .form-select option{background:var(--panel)}
  .form-row{display:grid;gap:14px}
  .form-row-2{grid-template-columns:1fr 1fr}
  .form-row-3{grid-template-columns:1fr 1fr 1fr}
  .divider{border:none;border-top:1px solid var(--border);margin:16px 0}
  /* BUTTONS */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border:1px solid;cursor:pointer;
    font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:1.5px;
    text-transform:uppercase;transition:all .15s;background:none}
  .btn:disabled{opacity:.4;cursor:not-allowed}
  .btn-blue{border-color:var(--blue);color:var(--blue)}
  .btn-blue:hover:not(:disabled){background:rgba(0,212,255,.1);box-shadow:var(--glow-blue)}
  .btn-green{border-color:var(--green);color:var(--green)}
  .btn-green:hover:not(:disabled){background:rgba(0,255,136,.1);box-shadow:var(--glow-green)}
  .btn-red{border-color:var(--red);color:var(--red)}
  .btn-red:hover:not(:disabled){background:rgba(255,34,68,.1);box-shadow:var(--glow-red)}
  .btn-amber{border-color:var(--yellow);color:var(--yellow)}
  .btn-amber:hover:not(:disabled){background:rgba(255,215,0,.1)}
  .btn-ghost{border-color:var(--border);color:var(--dim)}
  .btn-ghost:hover:not(:disabled){border-color:var(--dim);color:var(--text)}
  .btn-sm{padding:4px 10px;font-size:9px}
  .btn-icon{padding:5px 8px;min-width:28px;justify-content:center}
  /* BADGES */
  .badge{display:inline-block;padding:2px 8px;font-size:9px;letter-spacing:1.5px;
    font-family:'Share Tech Mono',monospace;text-transform:uppercase;border:1px solid}
  .badge-blue{color:var(--blue);border-color:rgba(0,212,255,.3);background:rgba(0,212,255,.07)}
  .badge-green{color:var(--green);border-color:rgba(0,255,136,.3);background:rgba(0,255,136,.06)}
  .badge-red{color:var(--red);border-color:rgba(255,34,68,.3);background:rgba(255,34,68,.06)}
  .badge-amber{color:var(--yellow);border-color:rgba(255,215,0,.3);background:rgba(255,215,0,.06)}
  /* GRIDS */
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
  /* EMPTY */
  .empty-state{text-align:center;padding:50px 20px;border:1px dashed var(--border)}
  .empty-state-icon{font-size:32px;margin-bottom:12px;opacity:.4}
  .empty-state-text{font-size:11px;color:var(--dim);letter-spacing:2px}
  /* TOGGLE */
  .toggle{position:relative;display:inline-block;width:36px;height:18px;flex-shrink:0}
  .toggle input{opacity:0;width:0;height:0}
  .toggle-slider{position:absolute;inset:0;background:var(--border);cursor:pointer;transition:.2s;border:1px solid var(--dim)}
  .toggle-slider:before{content:'';position:absolute;width:12px;height:12px;bottom:2px;left:2px;background:var(--dim);transition:.2s}
  .toggle input:checked+.toggle-slider{background:rgba(0,212,255,.2);border-color:var(--blue)}
  .toggle input:checked+.toggle-slider:before{transform:translateX(18px);background:var(--blue)}
  /* SKILL BAR */
  .skill-bar-wrap{flex:1;height:3px;background:var(--border)}
  .skill-bar{height:100%;background:linear-gradient(90deg,var(--blue),var(--green));transition:width .3s}
  /* MODAL */
  .modal-overlay{position:fixed;inset:0;background:rgba(3,10,15,.88);z-index:1000;
    display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
  .modal{background:var(--panel);border:1px solid var(--border);width:min(680px,96vw);
    max-height:88vh;display:flex;flex-direction:column;position:relative}
  .modal::before{content:'';position:absolute;top:-1px;left:-1px;right:-1px;height:2px;
    background:linear-gradient(90deg,var(--blue),var(--green),var(--blue))}
  .modal-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)}
  .modal-title{font-family:'Orbitron',monospace;font-size:11px;font-weight:700;letter-spacing:3px;color:var(--blue)}
  .modal-close{background:none;border:none;color:var(--dim);font-size:18px;cursor:pointer;padding:0 4px}
  .modal-close:hover{color:var(--red)}
  .modal-body{padding:18px;overflow-y:auto;flex:1}
  .modal-footer{padding:14px 18px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px}
  /* CONFIRM */
  .confirm-box{background:var(--panel);border:1px solid var(--red);padding:30px;text-align:center;max-width:360px;position:relative}
  .confirm-box::before{content:'';position:absolute;top:-1px;left:-1px;right:-1px;height:2px;background:var(--red)}
  .confirm-icon{font-size:28px;margin-bottom:12px}
  .confirm-msg{font-size:12px;color:var(--text);line-height:1.6;margin-bottom:20px;letter-spacing:1px}
  .confirm-btns{display:flex;gap:10px;justify-content:center}
  /* FILE UPLOAD */
  .file-drop{border:1px dashed var(--border);padding:20px;text-align:center;cursor:pointer;
    transition:all .15s;color:var(--dim);font-size:11px;letter-spacing:1px}
  .file-drop:hover{border-color:var(--blue);color:var(--blue)}
  .file-preview{display:flex;align-items:center;gap:12px;padding:10px;background:var(--bg2);border:1px solid var(--border);margin-top:8px}
  .file-preview img{width:48px;height:48px;object-fit:contain}
  /* TAG INPUT */
  .tag-wrap{display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--bg2);
    border:1px solid var(--border);min-height:40px;cursor:text}
  .tag-wrap:focus-within{border-color:var(--blue)}
  .tag-item{display:flex;align-items:center;gap:4px;background:rgba(0,212,255,.1);
    color:var(--blue);border:1px solid rgba(0,212,255,.25);padding:2px 8px;font-size:10px}
  .tag-item button{background:none;border:none;color:var(--dim);cursor:pointer;padding:0;font-size:11px}
  .tag-item button:hover{color:var(--red)}
  .tag-input{background:none;border:none;outline:none;font-family:'Share Tech Mono',monospace;
    font-size:11px;color:var(--text);min-width:80px;flex:1}
  /* CREDENTIALS TABS */
  .cred-tab:hover{color:var(--text)}
  .cred-section-banner{padding:10px 14px;margin-bottom:14px;border-left:2px solid;
    font-size:10px;letter-spacing:1.5px;background:var(--bg2)}
  .cred-section-banner-credly{border-color:var(--yellow);color:var(--yellow)}
  .cred-section-banner-professional{border-color:var(--green);color:var(--green)}
  .cred-section-banner-linkedin{border-color:var(--blue);color:var(--blue)}
  /* DASHBOARD */
  .stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px}
  .stat-card{background:var(--panel);border:1px solid var(--border);padding:16px;position:relative;overflow:hidden}
  .stat-card::after{content:'';position:absolute;bottom:0;left:0;right:0;height:2px}
  .stat-card.blue::after{background:linear-gradient(90deg,transparent,var(--blue),transparent)}
  .stat-card.green::after{background:linear-gradient(90deg,transparent,var(--green),transparent)}
  .stat-card.red::after{background:linear-gradient(90deg,transparent,var(--red),transparent)}
  .stat-card.yellow::after{background:linear-gradient(90deg,transparent,var(--yellow),transparent)}
  .stat-card.purple::after{background:linear-gradient(90deg,transparent,var(--purple),transparent)}
  .stat-val{font-family:'Orbitron',monospace;font-size:26px;font-weight:900;margin-bottom:4px}
  .stat-lbl{font-size:9px;letter-spacing:2px;color:var(--dim);text-transform:uppercase}
  /* SYNC */
  .sync-toast{position:fixed;bottom:20px;right:20px;z-index:9999;border:1px solid;
    padding:10px 18px;font-family:'Share Tech Mono',monospace;font-size:11px;letter-spacing:1px;
    display:flex;align-items:center;gap:8px;max-width:440px}
  .sync-toast.saving{background:#020d1a;border-color:var(--blue);color:var(--blue)}
  .sync-toast.saved{background:#021208;border-color:var(--green);color:var(--green)}
  .sync-toast.error{background:#1a0308;border-color:var(--red);color:var(--red)}
  .sync-spinner{width:10px;height:10px;border:2px solid rgba(0,212,255,.3);
    border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  /* AUTH */
  .auth-shell{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)}
  .auth-box{background:var(--panel);border:1px solid var(--border);padding:36px;width:min(440px,92vw);position:relative}
  .auth-box::before{content:'';position:absolute;top:-1px;left:-1px;right:-1px;height:2px;
    background:linear-gradient(90deg,var(--blue),var(--green),var(--blue))}
  .auth-logo{text-align:center;margin-bottom:28px}
  .auth-logo-icon{font-size:30px;margin-bottom:8px;color:var(--blue)}
  .auth-logo-title{font-family:'Orbitron',monospace;font-size:20px;font-weight:900;
    letter-spacing:6px;color:var(--blue);text-shadow:var(--glow-blue)}
  .auth-logo-title span{color:var(--red);text-shadow:var(--glow-red)}
  .auth-logo-sub{font-size:9px;letter-spacing:3px;color:var(--dim);margin-top:4px}
  .auth-error{padding:10px 14px;border:1px solid var(--red);color:var(--red);
    font-size:11px;margin-bottom:14px;background:rgba(255,34,68,.05)}
  .step-indicator{display:flex;justify-content:center;gap:8px;margin-bottom:24px}
  .step-dot{width:8px;height:8px;border-radius:50%;background:var(--border);border:1px solid var(--dim)}
  .step-dot.active{background:var(--blue);border-color:var(--blue);box-shadow:var(--glow-blue)}
  .step-dot.done{background:var(--green);border-color:var(--green)}
  
  /* ═══════════════════════════════════════════════════════
     RESPONSIVE — Full mobile-first breakpoints
     ═══════════════════════════════════════════════════════ */

  /* ── LAPTOP  (≤ 1100px) ─────────────────────────────── */
  @media(max-width:1100px){
    .stat-grid{grid-template-columns:repeat(3,1fr)}
    .sidebar{width:180px}
    .content{padding:16px 18px}
  }

  /* ── TABLET  (≤ 900px) ──────────────────────────────── */
  @media(max-width:900px){
    .shell{flex-direction:column;height:100dvh}
    /* Sidebar becomes top nav strip */
    .sidebar{
      width:100%;height:auto;flex-direction:row;
      border-right:none;border-bottom:1px solid var(--border);
      padding:0;overflow-x:auto;overflow-y:visible;
      flex-shrink:0;order:2
    }
    .logo{display:none}
    .sb-status{display:none}
    .nav{display:flex;flex-direction:row;padding:0;overflow-x:auto;flex:1;scrollbar-width:none}
    .nav::-webkit-scrollbar{display:none}
    .nav-item{
      flex-direction:column;gap:3px;padding:8px 12px;
      border-left:none;border-bottom:2px solid transparent;
      white-space:nowrap;font-size:8px;letter-spacing:.5px;
      min-height:52px;flex-shrink:0
    }
    .nav-item.active{border-left:none;border-bottom-color:var(--blue)}
    .nav-icon{font-size:16px;width:auto}
    .nav-badge{margin-left:0;margin-top:2px}
    .sidebar-footer{display:none}
    /* Main fills remaining height */
    .main{flex:1;overflow:hidden;order:1;display:flex;flex-direction:column}
    .topbar{flex-shrink:0}
    .content{flex:1;overflow-y:auto;padding:14px 16px}
    /* Stat grid */
    .stat-grid{grid-template-columns:repeat(3,1fr);gap:10px}
    /* Section header wrap */
    .section-header{flex-wrap:wrap;gap:10px}
    .section-header>div:last-child{width:100%;justify-content:flex-end}
  }

  /* ── MOBILE  (≤ 768px) ──────────────────────────────── */
  @media(max-width:768px){
    /* Topbar */
    .topbar{padding:0 14px;height:48px}
    .topbar-title{font-size:13px;letter-spacing:2px}
    .topbar-breadcrumb{display:none}
    .topbar-time{font-size:10px}
    .topbar-right{gap:8px}
    /* Content */
    .content{padding:12px 14px}
    /* Cards */
    .card{padding:14px}
    /* Section header — stack vertically */
    .section-header{flex-direction:column;align-items:flex-start;gap:10px;margin-bottom:14px}
    .section-header>div:last-child{width:100%;display:flex;flex-wrap:wrap;gap:8px}
    .section-title{font-size:13px}
    /* All grids → single column */
    .form-row-2,.form-row-3{grid-template-columns:1fr}
    .grid-2,.grid-3{grid-template-columns:1fr}
    /* Stat grid → 2 col */
    .stat-grid{grid-template-columns:repeat(2,1fr);gap:8px}
    .stat-val{font-size:22px}
    /* Buttons — touch friendly */
    .btn{min-height:44px;padding:10px 14px;font-size:9px}
    .btn-sm{min-height:36px;padding:6px 10px}
    .btn-icon{min-height:36px;min-width:36px}
    /* Forms */
    .form-input,.form-textarea,.form-select{font-size:13px;min-height:44px;padding:10px 12px}
    .form-textarea{min-height:100px}
    /* Modal */
    .modal{width:95vw;max-height:92vh;border-radius:0}
    .modal-header{padding:12px 14px}
    .modal-body{padding:14px}
    .modal-footer{padding:12px 14px;flex-wrap:wrap;gap:8px}
    .modal-footer .btn{flex:1;justify-content:center}
    /* Credentials tab strip */
    .sub-grid{grid-template-columns:repeat(auto-fill,minmax(90px,1fr))}
    /* Credential list rows */
    .cred-row{flex-wrap:wrap;gap:6px;padding:10px 0}
    /* Skills — skill name min-width flex */
    .skill-name-cell{width:auto;min-width:0;flex:1}
    .skill-level-badge{width:auto;min-width:70px}
    /* Auth box */
    .auth-box{padding:24px 18px}
    .auth-logo-title{font-size:18px;letter-spacing:4px}
    /* Confirm box */
    .confirm-box{padding:20px;width:92vw;max-width:360px}
    /* File upload */
    .file-drop{padding:16px}
    /* Dashboard stat cards */
    .stat-card{padding:12px}
    /* Tag input */
    .tag-wrap{min-height:44px}
    /* Sync toast */
    .sync-toast{right:10px;left:10px;max-width:none}
    /* Nav item font */
    .nav-item{font-size:7px;letter-spacing:.3px;padding:6px 10px;min-height:48px}
  }

  /* ── SMALL MOBILE  (≤ 480px) ────────────────────────── */
  @media(max-width:480px){
    .content{padding:10px 12px}
    .card{padding:12px}
    .stat-grid{grid-template-columns:1fr 1fr;gap:6px}
    .stat-val{font-size:18px}
    .stat-lbl{font-size:8px}
    .section-title{font-size:12px}
    .btn{font-size:8px;padding:10px 12px}
    /* Nav items — tighter */
    .nav-item{padding:6px 8px;min-height:48px;font-size:6px}
    .nav-icon{font-size:14px}
    /* Auth */
    .auth-box{padding:20px 14px}
    .auth-logo-title{font-size:16px;letter-spacing:3px}
    /* Full-width modals */
    .modal{width:100vw;max-height:100dvh;position:fixed;inset:0;border-radius:0}
    .modal-body{padding:12px}
    /* Form */
    .form-input,.form-textarea,.form-select{font-size:14px}
    /* Projects grid image */
    .project-img{height:80px}
    /* Cred banner */
    .cred-section-banner{font-size:9px;padding:8px 10px}
    .sub-grid{grid-template-columns:repeat(auto-fill,minmax(80px,1fr))}
  }

  /* ═══════════════════════════════════════════════════════════════
     MOBILE FEATURE PARITY — Full touch + iOS/Android support
     ═══════════════════════════════════════════════════════════════ */

  /* Safe area support */
  :root {
    --sai-top:    env(safe-area-inset-top, 0px);
    --sai-bottom: env(safe-area-inset-bottom, 0px);
    --sai-left:   env(safe-area-inset-left, 0px);
    --sai-right:  env(safe-area-inset-right, 0px);
  }

  /* Prevent iOS text size inflation */
  html { -webkit-text-size-adjust:100%; text-size-adjust:100%; }

  /* Tap highlight removal */
  *,*::before,*::after { -webkit-tap-highlight-color:transparent; }

  /* Accessible focus ring */
  :focus-visible { outline:2px solid var(--blue); outline-offset:3px; border-radius:2px; }

  /* ── iOS input zoom fix: font-size must be ≥ 16px ── */
  .form-input,
  .form-textarea,
  .form-select,
  input[type="text"],
  input[type="password"],
  input[type="email"],
  input[type="url"],
  input[type="number"],
  input[type="search"],
  textarea,
  select {
    font-size: max(16px, .85rem) !important;
  }

  /* ── TOPBAR — safe area + logout button on mobile ── */
  .topbar {
    padding-left:  max(14px, var(--sai-left));
    padding-right: max(14px, var(--sai-right));
    padding-top:   max(0px,  var(--sai-top));
  }
  /* Logout button visible in topbar on mobile (sidebar-footer is hidden) */
  .topbar-logout-mobile {
    display: none;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    background: none;
    border: 1px solid var(--border);
    color: var(--dim);
    cursor: pointer;
    font-family: 'Share Tech Mono', monospace;
    font-size: 10px;
    letter-spacing: 1px;
    padding: 0 10px;
    transition: border-color .15s, color .15s;
    touch-action: manipulation;
    border-radius: 2px;
  }
  .topbar-logout-mobile:hover,
  .topbar-logout-mobile:active { border-color: var(--red); color: var(--red); }

  /* ── BOTTOM NAV — safe area for iOS home bar ── */
  @media(max-width:900px) {
    .sidebar {
      order: 3;
      /* move to bottom like a native app */
      padding-bottom: max(0px, var(--sai-bottom)) !important;
      min-height: calc(52px + var(--sai-bottom));
    }
    .main { order: 1; }
    /* Show logout in topbar since sidebar-footer hidden */
    .topbar-logout-mobile { display: flex; }
    .topbar-right { gap: 8px; }
    /* Scroll active nav item into center */
    .nav { scroll-behavior: smooth; }
    .nav-item {
      touch-action: manipulation;
      min-height: max(48px, calc(44px + 0px));
    }
    /* Content area: leave room for bottom nav */
    .content {
      padding-bottom: max(14px, calc(var(--sai-bottom) + 8px));
    }
  }

  /* ── MOBILE: show logout in topbar ── */
  @media(max-width:768px) {
    .topbar-logout-mobile { display: flex; }
    .topbar { min-height: 48px; height: 48px; }
  }

  /* ── FILE UPLOAD — tap-friendly on mobile ── */
  .file-drop {
    /* Larger tap target */
    min-height: 80px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .file-drop input[type="file"] {
    /* Accessible hidden input — still tappable */
    position: absolute;
    opacity: 0;
    width: 100%;
    height: 100%;
    left: 0; top: 0;
    cursor: pointer;
    z-index: 1;
  }
  /* Relative positioning so hidden input covers drop zone */
  .file-drop { position: relative; }

  /* ── MODALS — swipe-down indicator + iOS scroll ── */
  @media(max-width:768px) {
    .modal {
      position: fixed;
      bottom: 0;
      top: auto;
      left: 0;
      right: 0;
      width: 100vw !important;
      max-width: 100vw !important;
      max-height: 92dvh !important;
      border-radius: 16px 16px 0 0 !important;
      padding-bottom: max(0px, var(--sai-bottom));
    }
    .modal::after {
      content: '';
      position: absolute;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      width: 36px; height: 3px;
      background: rgba(0,212,255,.25);
      border-radius: 2px;
      pointer-events: none;
    }
    .modal-body {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }
    .modal-overlay {
      align-items: flex-end;
      padding: 0;
    }
  }

  /* ── CONTENT SCROLL — safe area at bottom ── */
  .content {
    padding-left:  max(clamp(10px,3vw,24px), var(--sai-left));
    padding-right: max(clamp(10px,3vw,24px), var(--sai-right));
  }

  /* ── CREDENTIAL TABS — fade edge scroll affordance ── */

  /* ── BUTTONS — touch feedback ── */
  @media(hover:none) and (pointer:coarse) {
    .btn:hover { transform: none !important; box-shadow: none !important; }
    .btn:active { opacity: .85; transform: scale(.97); }
    .nav-item:hover { background: none; color: var(--dim); border-left-color: transparent; }
    .nav-item:active { background: rgba(0,212,255,.08); }
  }

  /* ── TAG INPUT — larger remove buttons ── */
  .tag-remove {
    min-width: 24px;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  @media(max-width:768px) {
    .tag-wrap { min-height: 48px; }
    .tag-input { font-size: 16px !important; }
  }

  /* ── AUTH SCREENS — safe area ── */
  .auth-shell {
    padding-top:    max(24px, var(--sai-top));
    padding-bottom: max(24px, var(--sai-bottom));
  }
  @media(max-width:480px) {
    .auth-box {
      width: min(440px, 96vw) !important;
      padding: 24px 16px !important;
    }
  }

  /* ── SECTION HEADERS — action buttons wrap properly ── */
  @media(max-width:768px) {
    .section-header {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 10px;
    }
    .section-header > div:last-child {
      width: 100%;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .section-header .btn { flex: 1; justify-content: center; min-height: 44px; }
  }

  /* ── SKILL ROWS — readable on mobile ── */
  @media(max-width:480px) {
    .skill-row {
      flex-wrap: wrap;
      gap: 6px;
    }
    .skill-row .btn-icon {
      min-width: 44px;
      min-height: 44px;
    }
  }

  /* ── DASHBOARD STAT CARDS ── */
  @media(max-width:480px) {
    .stat-card { padding: 10px 12px; }
    .stat-val  { font-size: clamp(18px, 6vw, 24px); }
    .stat-lbl  { font-size: 8px; letter-spacing: 1px; }
    .stat-grid { gap: 6px; }
  }

  /* ── SAVING BAR — safe area ── */
  .saving-bar {
    top: max(0px, var(--sai-top));
  }

  /* ── SYNC TOAST — safe area ── */
  @media(max-width:768px) {
    .sync-toast {
      bottom: max(16px, calc(var(--sai-bottom) + 60px));
    }
  }

  /* ── OVERFLOW GUARD ── */
  @media(max-width:768px) {
    .content { overflow-x: hidden; }
    table { display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; max-width: 100%; }
  }

  /* ── REDUCED MOTION ── */
  @media(prefers-reduced-motion:reduce) {
    *,*::before,*::after {
      animation-duration: .01ms !important;
      transition-duration: .01ms !important;
      animation-iteration-count: 1 !important;
    }
  }


  /* ╔══════════════════════════════════════════════════════════╗
     ║  ADMIN — APPLE-LEVEL MOBILE COMPLETE FIX                ║
     ╚══════════════════════════════════════════════════════════╝ */

  /* ── iOS zoom prevention ── ALL inputs must be ≥ 16px ── */
  input,textarea,select,
  .form-input,.form-textarea,.form-select,.tag-input,.tool-input {
    font-size: 16px !important;
    -webkit-appearance: none;
    appearance: none;
  }

  /* ── Safe area support ── */
  .topbar {
    padding-left:  max(20px, env(safe-area-inset-left)) !important;
    padding-right: max(20px, env(safe-area-inset-right)) !important;
    padding-top:   max(0px,  env(safe-area-inset-top))  !important;
  }
  .content {
    padding-left:  max(clamp(10px,3vw,24px), env(safe-area-inset-left))  !important;
    padding-right: max(clamp(10px,3vw,24px), env(safe-area-inset-right)) !important;
  }

  /* ── dvh fix ── */
  .shell { height: 100dvh !important; }

  /* ── TABLET (≤900px) ── */
  @media(max-width:900px){
    /* Sidebar → bottom tab bar */
    .shell { flex-direction:column; height:100dvh; }
    .sidebar {
      order: 3;
      width: 100% !important;
      height: auto !important;
      min-height: calc(52px + env(safe-area-inset-bottom)) !important;
      flex-direction: row !important;
      border-right: none !important;
      border-top: 1px solid var(--border);
      padding: 0 !important;
      padding-bottom: env(safe-area-inset-bottom) !important;
      overflow-x: auto;
      flex-shrink: 0;
      position: sticky;
      bottom: 0;
      z-index: 50;
    }
    .logo,.sb-status,.sb-label,.sb-spacer,.sb-footer { display:none !important; }
    .nav {
      display: flex !important;
      flex-direction: row !important;
      flex: 1;
      padding: 0 !important;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .nav::-webkit-scrollbar { display: none; }
    .nav-item {
      flex: 1;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 2px !important;
      padding: 4px 6px !important;
      min-height: 52px !important;
      min-width: 44px;
      font-size: 7px !important;
      letter-spacing: 0 !important;
      border-left: none !important;
      border-bottom: 2px solid transparent !important;
      white-space: nowrap;
      text-align: center;
      touch-action: manipulation;
      width: auto !important;
      text-align: center !important;
      background: none !important;
      border: none !important;
      border-bottom: 2px solid transparent !important;
    }
    .nav-item.active {
      border-left: none !important;
      border-bottom-color: var(--blue) !important;
      background: rgba(0,212,255,.06) !important;
    }
    .nav-icon { font-size: 17px !important; width: auto !important; }
    .nav-badge { margin-left:0 !important; font-size:7px !important; }
    .topbar-logout-mobile { display: flex !important; }

    /* Content area — leave room for topbar and bottom nav */
    .main { order: 2; flex: 1; overflow: hidden; display: flex; flex-direction: column; }
    .content {
      order: 1; flex: 1;
      overflow-y: auto !important;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
      padding: clamp(12px,3vw,16px) clamp(12px,3vw,16px) clamp(12px,3vw,16px) !important;
    }
  }

  /* ── MOBILE (≤768px) ── */
  @media(max-width:768px){
    .topbar { padding:0 max(12px, env(safe-area-inset-right)) !important; padding-left: max(12px, env(safe-area-inset-left)) !important; padding-top: max(0px, env(safe-area-inset-top)) !important; min-height:48px; height:48px; }
    .topbar-title { font-size:clamp(11px,3.5vw,13px); letter-spacing:2px; }
    .topbar-breadcrumb { display:none; }
    .topbar-time { font-size:10px; }

    /* Cards */
    .card { padding:clamp(12px,3vw,16px) !important; }

    /* Forms — touch keyboard friendly */
    .form-input,.form-textarea,.form-select {
      font-size: 16px !important;
      min-height: 48px !important;
      padding: 11px 14px !important;
    }
    .form-textarea { min-height: 100px !important; }

    /* Grids → single column */
    .form-row-2,.form-row-3,.grid-2,.grid-3 { grid-template-columns:1fr !important; }

    /* Stat grid */
    .stat-grid { grid-template-columns:repeat(2,1fr) !important; gap:8px; }
    .stat-val  { font-size:clamp(20px,6vw,26px) !important; }
    .stat-card { padding:12px !important; }

    /* Buttons */
    .btn { min-height:44px !important; padding:10px 14px !important; font-size:10px !important; }
    .btn-sm { min-height:38px; }
    .btn-icon { min-height:44px !important; min-width:44px !important; }

    /* Section header */
    .section-header { flex-direction:column; align-items:flex-start; gap:10px; margin-bottom:14px; }
    .section-header>div:last-child { width:100%; display:flex; flex-wrap:wrap; gap:8px; }
    .section-header .btn { flex:1; justify-content:center; }
    .section-title { font-size:clamp(11px,3.5vw,13px) !important; }

    /* Modal — bottom sheet */
    .modal-overlay { align-items:flex-end !important; padding:0 !important; }
    .modal {
      width:100% !important;
      max-width:100% !important;
      max-height:92dvh !important;
      border-radius:16px 16px 0 0 !important;
      padding-bottom:env(safe-area-inset-bottom) !important;
    }
    .modal-header { padding:14px 16px !important; }
    .modal-body { padding:14px 16px !important; -webkit-overflow-scrolling:touch; overscroll-behavior:contain; }
    .modal-footer { padding:12px 16px !important; flex-wrap:wrap; gap:8px; }
    .modal-footer .btn { flex:1; justify-content:center; }

    /* Cred tabs */


    /* Auth screen */
    .auth-shell { padding-top:max(24px,env(safe-area-inset-top)) !important; padding-bottom:max(24px,env(safe-area-inset-bottom)) !important; }
    .auth-box { padding:clamp(22px,5vw,32px) clamp(16px,5vw,28px) !important; width:min(440px,95vw) !important; border-radius:12px; }
    .auth-logo-title { font-size:clamp(16px,5.5vw,20px) !important; letter-spacing:3px !important; }
    .auth-logo-sub { font-size:8px !important; }

    /* Tag input */
    .tag-wrap { min-height:48px; }
    .tag-input { font-size:16px !important; }

    /* File drop */
    .file-drop { min-height:80px; }
    .file-drop input[type="file"] { position:absolute; opacity:0; width:100%; height:100%; left:0; top:0; cursor:pointer; z-index:1; }
    .file-drop { position:relative; }

    /* Confirm box */
    .confirm-box { padding:20px !important; width:min(360px,94vw) !important; border-radius:12px; }

    /* Sync toast */
    .sync-toast { right:10px !important; left:10px !important; max-width:none !important; bottom:max(16px,calc(env(safe-area-inset-bottom) + 60px)) !important; }

    /* Skill rows */
    .skill-name-cell { flex:1 !important; min-width:0 !important; }

    /* Credential row */
    .cred-row { flex-wrap:wrap; gap:6px; padding:10px 0; }

    /* Mission card */
    .mission-card { flex-direction:column; gap:10px; }
    .mission-actions { width:100%; display:flex; flex-wrap:wrap; gap:6px; }
    .mission-actions .btn { flex:1; justify-content:center; }

    /* Prevent overflow */
    body { overflow-x:hidden !important; }
    * { box-sizing:border-box; }
    table { display:block; overflow-x:auto; -webkit-overflow-scrolling:touch; }
  }

  /* ── SMALL MOBILE (≤480px) ── */
  @media(max-width:480px){
    .content { padding:10px max(10px, env(safe-area-inset-right)) 10px max(10px, env(safe-area-inset-left)) !important; }
    .card { padding:12px !important; }
    .stat-grid { grid-template-columns:1fr 1fr !important; gap:6px; }
    .stat-val { font-size:clamp(18px,5.5vw,22px) !important; }
    .btn { font-size:9px !important; padding:10px 12px !important; }
    .nav-item { padding:4px !important; font-size:6px !important; min-width:44px; }
    .nav-icon { font-size:15px !important; }
    .auth-box { padding:20px 14px !important; }
    .auth-logo-title { font-size:clamp(14px,5vw,18px) !important; letter-spacing:2px !important; }
    .modal { border-radius:12px 12px 0 0 !important; }
    .form-input,.form-textarea,.form-select { font-size:16px !important; }
    .project-img { height:80px; }
    .cred-section-banner { font-size:9px !important; padding:8px 10px !important; }
    input,textarea,select { font-size:16px !important; }
  }

  /* ── Touch states ── */
  @media(hover:none) and (pointer:coarse){
    .btn:hover { transform:none !important; box-shadow:none !important; }
    .btn:active { opacity:.85; transform:scale(.97); }
    .nav-item:active { background:rgba(0,212,255,.08) !important; }
    .card:hover { transform:none; }
  }

  /* ── Reduced motion ── */
  @media(prefers-reduced-motion:reduce){
    *,*::before,*::after {
      animation-duration:.01ms !important;
      transition-duration:.01ms !important;
      animation-iteration-count:1 !important;
    }
  }
  /* ─────────────────────────────────────────────────── */

`

// ── Shared components ──────────────────────────────────────────────────────
function TagInput({ value=[], onChange, placeholder='Add tag, press Enter' }) {
  const [input, setInput] = useState('')
  const add = e => {
    if ((e.key==='Enter'||e.key===',') && input.trim()) {
      e.preventDefault()
      const trimmed = input.trim()
      if (trimmed && !value.some(v=>v.toLowerCase()===trimmed.toLowerCase())) onChange([...value, trimmed])
      setInput('')
    }
  }
  return (
    <div className="tag-wrap" onClick={e=>e.currentTarget.querySelector('input').focus()}>
      {value.map(t=>(
        <span className="tag" key={t}>{t}
          <button className="tag-remove" onClick={()=>onChange(value.filter(x=>x!==t))}>×</button>
        </span>
      ))}
      <input className="tag-input" value={input} onChange={e=>setInput(e.target.value)}
        onKeyDown={add} placeholder={value.length?'':' '+placeholder}/>
    </div>
  )
}

function FileUpload({ value, onChange, accept='image/*', label='Upload File' }) {
  const [dragging, setDragging] = useState(false)
  const isTouch = () => window.matchMedia('(hover:none) and (pointer:coarse)').matches || navigator.maxTouchPoints > 0
  const handleFile = async f => { if(!f) return; try { const b=await fileToB64(f); onChange(b) } catch(e) { alert(e.message) } }
  const isImg = value && value.startsWith('data:image')
  const isPDF = value && value.includes('pdf')
  return (
    <div>
      <div className={`file-drop${dragging?' dragging':''}`}
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0])}}
        onTouchStart={()=>setDragging(true)}
        onTouchEnd={()=>setDragging(false)}>
        <input type="file" accept={accept} onChange={e=>handleFile(e.target.files[0])}/>
        <div className="file-drop-icon">📁</div>
        <div className="file-drop-text">{label}</div>
        <div className="file-drop-sub">{isTouch() ? 'Tap to upload · Max 5MB' : 'Drag & drop or click · Max 5MB'}</div>
      </div>
      {value && (
        <div className="file-preview">
          {isImg && <img src={value} alt="" className="img-thumb"/>}
          {isPDF && <span style={{fontSize:24}}>📄</span>}
          <span className="file-preview-name">File attached ✓</span>
          <button className="btn btn-red btn-sm" onClick={()=>onChange(null)}>Remove</button>
        </div>
      )}
    </div>
  )
}

function Confirm({ msg, onConfirm, onCancel }) {
  const touchStartY = useRef(null)
  const handleTouchStart = e => { touchStartY.current = e.touches[0].clientY }
  const handleTouchEnd = e => {
    if (touchStartY.current === null) return
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onCancel()
    touchStartY.current = null
  }
  useEffect(()=>{
    const handler = e => { if(e.key==='Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])
  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onCancel()}} role="dialog" aria-modal="true" aria-label="Confirm action">
      <div className="confirm-box" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="confirm-icon" aria-hidden="true">⚠</div>
        <div className="confirm-msg">{msg}</div>
        <div className="confirm-btns">
          <button className="btn btn-ghost" onClick={onCancel} autoFocus>Cancel</button>
          <button className="btn btn-red" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}

function Modal({ onClose, title, titleColor, children, footerChildren }) {
  const touchStartY = useRef(null)
  useEffect(()=>{
    const handler = e => { if(e.key==='Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  const handleTouchStart = e => { touchStartY.current = e.touches[0].clientY }
  const handleTouchEnd = e => {
    if (touchStartY.current === null) return
    if (e.changedTouches[0].clientY - touchStartY.current > 80) onClose()
    touchStartY.current = null
  }
  return (
    <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose()}} role="dialog" aria-modal="true">
      <div className="modal" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className="modal-header">
          <span className="modal-title" style={titleColor?{color:titleColor}:{}}>{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footerChildren && <div className="modal-footer">{footerChildren}</div>}
      </div>
    </div>
  )
}

function Clock() {
  const [t, setT] = useState(new Date())
  useEffect(()=>{ const i=setInterval(()=>setT(new Date()),1000); return()=>clearInterval(i) },[])
  return <span className="topbar-time">{t.toLocaleTimeString('en-GB',{hour12:false})}</span>
}

function SyncToast({ state, syncError, onRetry }) {
  if (state==='idle') return null
  return (
    <div className={`sync-toast ${state}`}>
      {state==='saving' && <><div className="sync-spinner"/> SAVING TO GITHUB...</>}
      {state==='saved'  && <>✓ SYNCED TO GITHUB</>}
      {state==='error'  && <>
        <span>⚠ SAVE FAILED{syncError ? ` — ${syncError}` : ' — check console (token / permissions?)'}</span>
        {onRetry && <button onClick={onRetry} style={{marginLeft:10,background:'transparent',border:'1px solid var(--red)',color:'var(--red)',fontFamily:"'Share Tech Mono',monospace",fontSize:10,padding:'3px 10px',cursor:'pointer',letterSpacing:1}}>↺ RETRY</button>}
      </>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// SETUP WIZARD (first run — no GitHub config yet)
// ══════════════════════════════════════════════════════════════════════════
function SetupWizard({ onComplete }) {
  const [step, setStep]       = useState(0) // 0=intro, 1=token, 2=done
  const [owner, setOwner]     = useState('')
  const [repo, setRepo]       = useState('')
  const [token, setToken]     = useState('')
  const [testing, setTesting] = useState(false)
  const [err, setErr]         = useState('')
  const [ok, setOk]           = useState(false)

  const testAndSave = async () => {
    setTesting(true); setErr(''); setOk(false)
    const result = await testConnection(owner.trim(), repo.trim(), token.trim())
    setTesting(false)
    if (!result.ok) { setErr('Connection failed: ' + result.msg); return }
    saveGithubConfig(owner.trim(), repo.trim(), token.trim())
    setOk(true)
    setTimeout(() => setStep(2), 1200)
  }

  return (
    <>
      <FontLink/>
      <style>{CSS}</style>
      <div className="auth-shell">
        <div className="auth-box" style={{maxWidth:500}}>
          <div style={{position:'absolute',top:-1,left:-1,right:-1,height:2,background:'var(--g)',boxShadow:'0 0 12px var(--g)'}}/>
          <div className="auth-logo">
            <div className="auth-logo-icon">◈</div>
            <div className="auth-logo-title">CYB<span>AASH</span></div>
            <div className="auth-logo-sub">// ADMIN SETUP · FIRST RUN</div>
          </div>

          <div className="step-indicator">
            {[0,1,2].map(i=>(
              <div key={i} className={`step-dot${step===i?' active':step>i?' done':''}`}/>
            ))}
          </div>

          {step===0 && (
            <div>
              <button className="btn btn-green" style={{width:'100%',justifyContent:'center'}} onClick={()=>setStep(1)}>
                ▶ START
              </button>
            </div>
          )}

          {step===1 && (
            <div>
              {err && <div className="auth-error">⚠ {err}</div>}
              {ok  && <div className="auth-success">✓ Connected!</div>}
              <div className="form-group">
                <label className="form-label">Username</label>
                <input className="form-input" value={owner} onChange={e=>setOwner(e.target.value)} placeholder=""/>
              </div>
              <div className="form-group">
                <label className="form-label">Repository</label>
                <input className="form-input" value={repo} onChange={e=>setRepo(e.target.value)} placeholder=""/>
              </div>
              <div className="form-group">
                <label className="form-label">Personal Access Token</label>
                <input className="form-input" type="password" value={token} onChange={e=>setToken(e.target.value)} placeholder=""/>
              </div>
              <button className="btn btn-green" style={{width:'100%',justifyContent:'center'}}
                onClick={testAndSave} disabled={testing||!owner||!repo||!token}>
                {testing ? '⟳ TESTING...' : '▶ SAVE'}
              </button>
            </div>
          )}

          {step===2 && (
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:48,marginBottom:16}}>✓</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:14,color:'var(--g)',letterSpacing:2,marginBottom:12}}>SETUP COMPLETE</div>
              <p style={{fontSize:13,color:'var(--tx2)',lineHeight:1.7,marginBottom:24}}>Connected. Click below to enter.</p>
              <button className="btn btn-green" style={{width:'100%',justifyContent:'center'}} onClick={onComplete}>
                ▶ GO TO LOGIN
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// LOGIN — Worker JWT auth
// ══════════════════════════════════════════════════════════════════════════
const WORKER_URL = 'https://cybaash.mohamedaasiq07.workers.dev'

function getAdminJWT() {
  try {
    const s = JSON.parse(sessionStorage.getItem('admin_jwt') || '{}')
    if (s.jwt && s.exp && Date.now() < s.exp) return s.jwt
  } catch(_) {}
  return ''
}

function storeAdminJWT(token, expiresIn) {
  try { sessionStorage.setItem('admin_jwt', JSON.stringify({ jwt: token, exp: Date.now() + expiresIn })) } catch(_) {}
}

function Login({ onAuth }) {
  const [token, setToken]   = useState('')
  const [err, setErr]       = useState('')
  const [loading, setLoading] = useState(false)

  const attempt = async () => {
    if (!token.trim()) { setErr('Enter your access token'); return }
    setLoading(true); setErr('')
    try {
      const resp = await fetch(WORKER_URL + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passphrase: token.trim() }),
        signal: AbortSignal.timeout(10000),
      })
      const data = await resp.json()
      if (resp.status === 429) throw new Error(data.error || 'Too many attempts. Please wait.')
      if (resp.ok && data.ok) {
        storeAdminJWT(data.token, data.expiresIn)
        onAuth()
        return
      }
      // Fallback: verify as GitHub PAT via testConnection
      const cfg = getGithubConfig()
      if (cfg) {
        const r = await testConnection(cfg.owner, cfg.repo, token.trim())
        if (r.ok) { saveGithubConfig(cfg.owner, cfg.repo, token.trim()); onAuth(); return }
      }
      throw new Error('Invalid token. Access denied.')
    } catch(e) {
      setErr(e.message || 'Connection failed')
    } finally { setLoading(false) }
  }

  return (
    <>
      <FontLink/>
      <style>{CSS}</style>
      <div className="auth-shell">
        <div className="auth-box">
          <div style={{position:'absolute',top:-1,left:-1,right:-1,height:2,background:'var(--g)',boxShadow:'0 0 12px var(--g)'}}/>
          <div className="auth-logo">
            <div className="auth-logo-icon">◈</div>
            <div className="auth-logo-title">CYB<span>AASH</span></div>
            <div className="auth-logo-sub">ADMIN CONTROL PANEL · v4.1</div>
          </div>
          {err && <div className="auth-error">⚠ {err}</div>}
          <div className="form-group">
            <input className="form-input" type="password" value={token}
              onChange={e=>setToken(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&!loading&&attempt()}
              placeholder="" autoFocus disabled={loading}/>
          </div>
          <button className="btn btn-green" style={{width:'100%',justifyContent:'center',padding:'12px',marginTop:8,opacity:loading?0.6:1}} onClick={attempt} disabled={loading}>
            {loading ? '⟳ VERIFYING...' : '▶ ENTER'}
          </button>
        </div>
      </div>
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════
function Dashboard({ data, lastSync, ghCfg }) {
  const counts = {
    skills:       data.skills?.reduce((a,c)=>a+(c.items?.length||0),0)||0,
    projects:     data.projects?.length||0,
    experience:   data.experience?.length||0,
  }
  return (
    <div>
      <div className="stat-grid">
        {[
          {label:'Skills',    value:counts.skills,    sub:'tracked'},
          {label:'Projects',  value:counts.projects,  sub:'portfolio'},
          {label:'Experience',value:counts.experience,sub:'positions'},
        ].map(s=>(
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{String(s.value).padStart(2,'0')}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <div className="card">
          <div className="card-corner tl"/><div className="card-corner tr"/>
          <div className="card-corner bl"/><div className="card-corner br"/>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--g)',letterSpacing:2,marginBottom:16}}>RECENT ACTIVITY</div>
          {[
            {color:'var(--g)',    text:'Admin panel connected',     time:now()},
            {color:'var(--blue)',text:'Storage active',       time:now()},
            {color:'var(--g)',   text:`Skills tracked: ${counts.skills}`, time:now()},
            {color:'var(--g)',   text:`Last sync: ${lastSync||'—'}`, time:''},
          ].map((a,i)=>(
            <div className="activity-item" key={i}>
              <div className="activity-dot" style={{background:a.color,boxShadow:`0 0 6px ${a.color}`}}/>
              <div>
                <div className="activity-text">{a.text}</div>
                {a.time&&<div className="activity-time">{a.time}</div>}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-corner tl"/><div className="card-corner tr"/>
          <div className="card-corner bl"/><div className="card-corner br"/>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--g)',letterSpacing:2,marginBottom:16}}>SYSTEM STATUS</div>
          {[
            {label:'Storage',   val:'Split JSON files',       ok:true},
            {label:'Access',    val:'Token (local only)',               ok:true},
            {label:'Repo',      val:ghCfg ? `${ghCfg.owner}/${ghCfg.repo}` : '—', ok:!!ghCfg},
            {label:'Last Save', val:lastSync||'—',                     ok:!!lastSync},
          ].map(s=>(
            <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid rgba(26,46,28,.4)'}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--tx3)',letterSpacing:1}}>{s.label}</span>
              <span className={`badge badge-${s.ok?'green':'amber'}`}>{s.val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ABOUT
// ══════════════════════════════════════════════════════════════════════════
function AboutSection({ data, onSave }) {
  const [d, setD] = useState(data||{})
  const [saving, setSaving] = useState(false)
  useEffect(()=>{ setD(data||{}) }, [data])
  const [saved, setSaved] = useState(false)
  const u = k => e => setD(p=>({...p,[k]:e.target.value}))
  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(d)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('[AboutSection] save failed:', e.message)
      throw e              // bubble up so App.handleSave → SyncToast shows the error
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      <div className="section-header">
        <div><span className="section-title">About</span></div>
        <button className="btn btn-green" onClick={handleSave} disabled={saving}>
          {saving?'⟳ Saving…':saved?'✓ Saved':'Save Changes'}
        </button>
      </div>
      <div className="card" style={{marginBottom:20}}>
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" value={d.name||''} onChange={u('name')} placeholder="Mohamed Aasiq"/></div>
          <div className="form-group"><label className="form-label">Title / Role</label><input className="form-input" value={d.title||''} onChange={u('title')} placeholder="Cybersecurity Analyst"/></div>
        </div>
        <div className="form-group"><label className="form-label">Tagline</label><input className="form-input" value={d.tagline||''} onChange={u('tagline')} placeholder="Short punchy headline"/></div>
        <div className="form-group"><label className="form-label">Bio</label><textarea className="form-textarea" rows={5} value={d.bio||''} onChange={u('bio')} placeholder="Write about yourself..."/></div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={d.location||''} onChange={u('location')} placeholder="Madurai, India"/></div>
          <div className="form-group">
            <label className="form-label">Availability</label>
            <select className="form-select" value={d.availability||'open'} onChange={u('availability')}>
              <option value="open">Open to Work</option>
              <option value="employed">Employed</option>
              <option value="freelance">Freelance Only</option>
              <option value="unavailable">Not Available</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Years Exp</label><input className="form-input" type="number" value={d.yearsExp||''} onChange={u('yearsExp')} placeholder="3"/></div>
        </div>
        <hr className="divider"/>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>PROFILE PHOTO</div>
        <FileUpload value={d.avatar} accept="image/*" label="Upload Profile Photo" onChange={b=>setD(p=>({...p,avatar:b}))}/>
      </div>
      <div className="card">
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>SOCIAL LINKS</div>
        <div className="form-row form-row-2">
          {['linkedin','github','twitter','email','portfolio','tryhackme'].map(k=>(
            <div className="form-group" key={k}>
              <label className="form-label">{k.toUpperCase()}</label>
              <input className="form-input" value={d[k]||''} onChange={u(k)} placeholder={`https://${k}.com/...`}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// SKILLS
// ══════════════════════════════════════════════════════════════════════════
const BLANK_CAT   = ()=>({id:uid(),name:'',items:[]})
const BLANK_SKILL = ()=>({id:uid(),name:'',level:'Intermediate',badge:''})

function SkillsSection({ data, onSave }) {
  const [cats, setCats]       = useState(data||[])
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({})
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving]   = useState(false)
  useEffect(()=>{ setCats(data||[]) }, [data])
  const commit = async (updated, prev) => {
    setCats(updated)       // optimistic update
    setSaving(true)
    try {
      await onSave(updated)
    } catch (e) {
      setCats(prev)        // rollback on failure so UI matches GitHub
      console.error('[SkillsSection] save failed:', e.message)
      throw e              // bubble up so SyncToast shows the error
    } finally { setSaving(false) }
  }
  const levelPct = {Beginner:25,Intermediate:55,Advanced:80,Expert:100}

  const openCatModal   = (ci=null) => { setForm(ci===null?BLANK_CAT():{...cats[ci]}); setModal({mode:'cat',ci}) }
  const saveCat        = async () => { const prev=cats; const u=modal.ci===null?[...cats,{...form,items:form.items||[]}]:cats.map((c,i)=>i===modal.ci?{...c,...form}:c); await commit(u, prev); setModal(null) }
  const delCat         = async ci  => { const prev=cats; await commit(cats.filter((_,i)=>i!==ci), prev); setConfirm(null) }
  const openSkillModal = (ci,si=null) => { setForm(si===null?BLANK_SKILL():{...cats[ci].items[si]}); setModal({mode:'skill',ci,si}) }
  const saveSkill      = async () => { const prev=cats; const u=cats.map((c,ci)=>{ if(ci!==modal.ci)return c; const items=modal.si===null?[...c.items,form]:c.items.map((s,si)=>si===modal.si?form:s); return{...c,items} }); await commit(u, prev); setModal(null) }
  const delSkill       = async (ci,si) => { const prev=cats; await commit(cats.map((c,i)=>i!==ci?c:{...c,items:c.items.filter((_,j)=>j!==si)}), prev); setConfirm(null) }

  return (
    <div>
      <div className="section-header">
        <div><span className="section-title">Skills</span><span className="section-count">({cats.length} categories)</span></div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saving&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--amber)'}}>⟳ Syncing…</span>}
          <button className="btn btn-green" onClick={()=>openCatModal()}>+ Category</button>
        </div>
      </div>
      {cats.length===0&&<div className="empty-state"><div className="empty-state-icon">◎</div><div className="empty-state-text">No skill categories yet</div></div>}
      {cats.map((cat,ci)=>(
        <div className="card" key={cat.id} style={{marginBottom:16}}>
          <div className="card-corner tl"/><div className="card-corner tr"/>
          <div className="card-corner bl"/><div className="card-corner br"/>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:'var(--g)',letterSpacing:2}}>{cat.name||'Unnamed Category'}</span>
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-ghost btn-sm" onClick={()=>openSkillModal(ci)}>+ Skill</button>
              <button className="btn btn-amber btn-sm btn-icon" onClick={()=>openCatModal(ci)}>✎</button>
              <button className="btn btn-red btn-sm btn-icon" onClick={()=>setConfirm({type:'cat',ci})}>✕</button>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {cat.items?.map((sk,si)=>(
              <div key={sk.id} style={{display:'flex',alignItems:'center',gap:12}}>
                <span style={{minWidth:0,flex:'1 1 120px',fontSize:'clamp(11px,2vw,13px)',fontWeight:600,color:'var(--tx)'}}>{sk.name}</span>
                <div className="skill-bar-wrap"><div className="skill-bar" style={{width:`${levelPct[sk.level]||50}%`}}/></div>
                <span className="badge badge-blue" style={{minWidth:70,width:'auto',textAlign:'center',flexShrink:0,fontSize:9}}>{sk.level}</span>
                <button className="btn btn-amber btn-sm btn-icon" onClick={()=>openSkillModal(ci,si)}>✎</button>
                <button className="btn btn-red btn-sm btn-icon" onClick={()=>setConfirm({type:'skill',ci,si})}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {modal&&(
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <span className="modal-title">{modal.mode==='cat'?(modal.ci===null?'NEW CATEGORY':'EDIT CATEGORY'):(modal.si===null?'NEW SKILL':'EDIT SKILL')}</span>
              <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              {modal.mode==='cat'?(
                <div className="form-group"><label className="form-label">Category Name</label><input className="form-input" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Cybersecurity, Cloud..."/></div>
              ):(
                <>
                  <div className="form-row form-row-2">
                    <div className="form-group"><label className="form-label">Skill Name</label><input className="form-input" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Python, Nmap..."/></div>
                    <div className="form-group"><label className="form-label">Level</label>
                      <select className="form-select" value={form.level||'Intermediate'} onChange={e=>setForm(p=>({...p,level:e.target.value}))}>
                        {SKILL_LEVELS.map(l=><option key={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group"><label className="form-label">Badge URL (optional)</label><input className="form-input" value={form.badge||''} onChange={e=>setForm(p=>({...p,badge:e.target.value}))} placeholder="https://..."/></div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
              <button className="btn btn-green" onClick={modal.mode==='cat'?saveCat:saveSkill}>Save</button>
            </div>
          </div>
        </div>
      )}
      {confirm&&<Confirm msg={confirm.type==='cat'?'Delete category and all skills?':'Remove this skill?'} onConfirm={()=>confirm.type==='cat'?delCat(confirm.ci):delSkill(confirm.ci,confirm.si)} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// CREDENTIALS  (3-section tabbed: Credly · Professional · LinkedIn/Other)
// ══════════════════════════════════════════════════════════════════════════

// Blank templates per category
const BLANK_CREDLY = () => ({
  id: uid(), type: 'credly',
  title: '', issuer: '', date: '', url: '', image: null, pdf: null,
  tags: [], featured: false, logo: '', logoUpload: null,
  credlyBadgeId: '', credlyEarnerUrl: '', credlyImageUrl: '',
})
const BLANK_PROFESSIONAL = () => ({
  id: uid(), type: 'certificate',
  title: '', issuer: '', date: '', url: '', image: null, pdf: null,
  tags: [], featured: false, logo: '', logoUpload: null,
  certNumber: '', duration: '', examCode: '',
})
const BLANK_LINKEDIN = () => ({
  id: uid(), type: 'linkedin',
  title: '', issuer: 'LinkedIn Learning', date: '', url: '', image: null, pdf: null,
  tags: [], featured: false, logo: '', logoUpload: null,
  courseId: '', learningPathName: '',
})

// ── Subsections matching recruiter.html exactly ──────────────────────────────
const CRED_SUBS = [
  { id: 'credly',    label: 'Credly Badges',            col: 'var(--amber)' },
  { id: 'aws',       label: 'AWS / Amazon',             col: '#ff9900' },
  { id: 'cert',      label: 'Professional Certs',       col: 'var(--g)' },
  { id: 'cybersec',  label: 'Cybersecurity',            col: 'var(--r)' },
  { id: 'aiml',      label: 'AI & ML',                  col: 'var(--purple)' },
  { id: 'cloud',     label: 'Cloud & DevOps',           col: 'var(--blue)' },
  { id: 'prog',      label: 'Programming',              col: '#00ff88' },
  { id: 'business',  label: 'Business & Mgmt',         col: 'var(--y)' },
  { id: 'marketing', label: 'Marketing & SEO',          col: '#f7931e' },
  { id: 'data',      label: 'Data & Analytics',         col: '#44bbff' },
  { id: 'other',     label: 'Other',                    col: 'var(--tx3)' },
]

// Same classification logic as recruiter.html getSubsection()
function getSubsection(c) {
  if (c.type === 'credly' || c.type === 'badge') return 'credly'
  if (c.type === 'certificate' || c.type === 'exam') {
    const iss = (c.issuer || '').toLowerCase()
    if (iss.includes('amazon') || iss.includes('aws')) return 'aws'
    return 'cert'
  }
  const title = (c.title || '').toLowerCase()
  const tags  = (c.tags  || []).map(t => t.toLowerCase()).join(' ')
  const th = (...kws) => kws.some(k => title.includes(k))
  const tg = (...kws) => kws.some(k => tags.includes(k))

  if (th('cybersecurity','ethical hack','penetration','pentest','red team','blue team',
         'soc ','siem','firewall','malware','incident response','threat','vulnerability',
         'exploit','forensic','owasp','ransomware','phishing','security','kali',
         'network security','hacking','nmap','wireshark','cisco','packet tracer',
         'information security','privacy','authentication','encryption','zero trust')
    || tg('security','cybersecurity','hacking','pentest','soc','siem','firewall','malware',
          'phishing','ransomware','vulnerability','exploit','forensic','ethical hack',
          'red team','blue team','networking','linux','cisco','owasp','threat','incident'))
    return 'cybersec'

  if (th('artificial intelligence','machine learning','generative ai','gen ai',
         'llm','large language','agentic ai','copilot','responsible ai','deep learning',
         'neural network','mlops','ai security','ai product','ai for','ai in','ai pair',
         'ai tools','ai writing','ai software','ai imaging','ai native','ai governance',
         'red teaming for generative')
    || tg('ai/ml','artificial intelligence','machine learning','generative','llm','mlops'))
    return 'aiml'

  if (th('aws','azure','cloud','devops','docker','kubernetes','snowflake',
         'finops','devsecops','ci/cd','infrastructure as code','serverless','multicloud',
         'cloud strategy','cloud architecture','cloud security','cloud practitioner',
         'cloud quest','amazon','security hub')
    || tg('cloud','devops','docker','aws','azure','snowflake','kubernetes','ci/cd'))
    return 'cloud'

  if (th('python','javascript','java ','c++','c# ','html','css ','react','node',
         'swift','kotlin','android','github','git ','rest api','sql ','nosql',
         'programming','software development','coding','web developer',
         'full-stack','backend','frontend','blockchain','bitcoin',
         '.net','asp.net','red hat','linux','ubuntu','bash','shell','unix','kali purple',
         'learning linux','linux command','refactoring')
    || tg('python','javascript','java','programming','github','coding','sql','react',
          'android','swift','kotlin','c++','c#','html','linux','bash'))
    return 'prog'

  if (th('leadership','management','product management','agile','scrum',
         'project management','operations management','ciso','executive','strategy',
         'negotiat','emotional intelligence','interpersonal','human skills','manager',
         'first-time manager','diversity','equity','inclusion','lean','operational',
         'supply chain','quality management','program management','it leadership',
         'business analysis','business writing','change','innovation','organizational',
         'public speaking','speech','impromptu','storytelling','presenting',
         'body language','conflict resolution','assertive','workplace',
         'communication','customer service','customer','rapport','listening',
         'feedback','credibility','confidence','trust','cultural',
         'benefits realization','process improvement','it architecture','it strategy',
         'creating positive','facilitating','responsible','reputation',
         'quick scripts','difficult conversations','non-technical','mental health',
         'motivat','personality','stability','disruption',
         'solution sales','selling','c-suite','succeeding as','influencing')
    || tg('management','leadership','product management','negotiat','agile',
          'emotional intelligence','communication','scrum','customer'))
    return 'business'

  if (th('marketing','seo','social media','email marketing','content marketing',
         'copywriting','digital marketing','adobe','illustrator','indesign','premiere',
         'photoshop','creative','canva','youtube seo','conversion rate','ecommerce',
         'newsletter','grammarly','writing','grammar','persuasive',
         'storytelling for business')
    || tg('marketing','seo','social media','adobe','email marketing','content','copywriting'))
    return 'marketing'

  if (th('data science','data engineering','data analysis','analytics',
         'tableau','power bi','statistics','knime','data visualization','data literacy',
         'machine learning statistical','wolfram','data set','data structures')
    || tg('data','analytics','statistics','tableau','power bi','knime','wolfram'))
    return 'data'

  return 'other'
}

// Legacy CRED_TABS kept for blank form templates only
const CRED_TABS = [
  { id: 'credly',       label: 'Credly Badges',             color: 'var(--amber)', blank: BLANK_CREDLY },
  { id: 'professional', label: 'Professional Certificates', color: 'var(--g)',     blank: BLANK_PROFESSIONAL },
  { id: 'linkedin',     label: 'LinkedIn & Others',         color: 'var(--blue)',  blank: BLANK_LINKEDIN },
]

// Sub-section CSS additions (tab strip + section divider)
const CRED_CSS = `
  /* ── Subsection stat-card grid (matches recruiter.html) ── */
  .sub-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px;margin-bottom:20px}
  .sub-card{background:var(--panel);border:1px solid var(--bd);padding:10px 8px 8px;text-align:center;
    cursor:pointer;transition:border-color .18s,background .18s;display:flex;flex-direction:column;
    align-items:center;gap:4px;position:relative;overflow:hidden}
  .sub-card:hover{border-color:var(--tx3)}
  .sub-card.active{background:rgba(0,212,255,.03)}
  .sub-n{font-family:'Orbitron',monospace;font-size:18px;font-weight:900;line-height:1;transition:color .18s}
  .sub-l{font-size:7px;letter-spacing:1.2px;color:var(--tx3);text-transform:uppercase;line-height:1.3;transition:color .18s}
  .sub-card.active .sub-l{color:inherit}
  .sub-bar{position:absolute;bottom:0;left:0;right:0;height:2px;background:currentColor;opacity:0;transition:opacity .18s}
  .sub-card.active .sub-bar{opacity:1}
  /* ── Retained for banner ── */
  .cred-section-banner{padding:10px 14px;margin-bottom:14px;border-left:3px solid;
    font-family:'Share Tech Mono',monospace;font-size:10px;letter-spacing:1.5px;background:var(--bg2)}
  /* ── CERT CARD GRID (matches recruiter.html) ── */
  .cred-card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:4px}
  .cred-card{background:var(--panel);border:1px solid var(--border);display:flex;flex-direction:column;
    transition:border-color .2s;overflow:hidden;position:relative}
  .cred-card:hover{border-color:rgba(0,212,255,.28)}
  .cc-top{width:100%;height:110px;display:flex;align-items:center;justify-content:center;
    background:var(--bg2);border-bottom:1px solid var(--border);overflow:hidden;flex-shrink:0}
  .cc-top-noimg{background:var(--bg2)}
  .cc-top-badge{background:radial-gradient(ellipse at 50% 60%,rgba(247,147,30,.07) 0%,transparent 70%),var(--bg2)}
  .cc-banner{width:100%;height:100%;object-fit:cover}
  .cc-badge-img{width:80px;height:80px;object-fit:contain;border-radius:6px;filter:drop-shadow(0 2px 8px rgba(0,0,0,.5))}
  .cc-body{padding:10px;display:flex;flex-direction:column;gap:6px;flex:1}
  .cc-hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
  .cc-meta-row{display:flex;align-items:center;gap:5px;min-width:0;flex:1}
  .cc-logo{width:18px;height:18px;object-fit:contain;border-radius:2px;flex-shrink:0}
  .cc-meta{display:flex;align-items:center;gap:4px;min-width:0;flex:1;overflow:hidden}
  .cc-issuer{font-size:9px;color:var(--tx3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:.3px}
  .cc-dot{font-size:9px;color:var(--tx3);flex-shrink:0}
  .cc-date{font-family:'Share Tech Mono',monospace;font-size:8px;color:var(--tx3);flex-shrink:0}
  .cc-title{font-family:'Rajdhani',sans-serif;font-size:12px;font-weight:600;color:var(--tx);
    line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .cc-tags{display:flex;flex-wrap:wrap;gap:3px}
  .cc-tag{font-size:8px;letter-spacing:.3px;padding:1px 5px;border:1px solid rgba(0,212,255,.15);
    color:rgba(0,212,255,.6);font-family:'Share Tech Mono',monospace}
  .cc-footer{display:flex;gap:5px;flex-wrap:wrap;margin-top:auto;padding-top:6px;
    border-top:1px solid rgba(26,58,92,.3)}
  .cc-btn{font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:600;letter-spacing:.8px;
    padding:3px 8px;border:1px solid var(--border);color:var(--tx3);text-decoration:none;
    transition:all .15s;display:inline-flex;align-items:center;gap:3px;text-transform:uppercase}
  .cc-btn:hover{border-color:var(--blue);color:var(--blue)}
`

function CredentialsSection({ data, onSave }) {
  const [creds, setCreds]     = useState(data || [])
  const [credTab, setCredTab] = useState('credly')
  const [subSec, setSubSec]   = useState('credly')
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({})
  const [confirm, setConfirm] = useState(null)
  const [search, setSearch]   = useState('')
  const [saving, setSaving]   = useState(false)
  useEffect(()=>{ setCreds(data||[]) }, [data])

  const commit = async (u, prev) => {
    setSaving(true)
    try {
      // Pre-upload any base64 images so they become raw GitHub URLs before saving.
      const cfg = getGithubConfig()
      const MAX = 50_000
      const toRaw = (url) => url.startsWith('http') ? url : `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/main/${url}`
      const cleaned = await Promise.all(u.map(async c => {
        if (!cfg?.token) return c
        const out = { ...c }

        // Upload c.image (CERTIFICATE IMAGE field) and c.logo if large base64
        for (const field of ['logo', 'image']) {
          const v = out[field]
          if (typeof v === 'string' && v.startsWith('data:') && v.length > MAX && c.type !== 'credly') {
            try {
              const match = v.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
              if (match) {
                const ext = match[1].split('/')[1].replace('jpeg','jpg').replace('svg+xml','svg')
                const fname = `cert_logos/${c.id}_${field}.${ext}`
                out[field] = toRaw(await uploadImage(fname, match[2]))
              }
            } catch(e) {
              console.warn(`[CredentialsSection] pre-upload failed for ${c.id}.${field}:`, e.message)
            }
          }
        }

        // Also upload c.pdf if it's a base64 IMAGE (user used "Upload PDF" with a JPEG cert)
        const pdfVal = out['pdf']
        if (typeof pdfVal === 'string' && pdfVal.startsWith('data:image/') && pdfVal.length > MAX) {
          try {
            const match = pdfVal.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
            if (match) {
              const ext = match[1].split('/')[1].replace('jpeg','jpg').replace('svg+xml','svg')
              out['pdf'] = toRaw(await uploadImage(`cert_logos/${c.id}_pdf.${ext}`, match[2]))
            }
          } catch(e) {
            console.warn(`[CredentialsSection] pre-upload failed for ${c.id}.pdf:`, e.message)
          }
        }

        delete out.logoUpload
        return out
      }))
      setCreds(cleaned)      // update state with URLs — base64 gone from memory
      await onSave(cleaned)
    } catch (e) {
      setCreds(prev)         // rollback on failure
      console.error('[CredentialsSection] save failed:', e.message)
      throw e
    } finally { setSaving(false) }
  }

  const open = (id = null) => {
    if (id) {
      const existing = creds.find(c => c.id === id)
      // If the stored logo is a base64 data URL, pre-populate logoUpload for preview
      const logoUpload = existing?.logo?.startsWith('data:image') ? existing.logo : null
      setForm({ ...existing, logoUpload })
    } else {
      const tabCfg = CRED_TABS.find(t => t.id === credTab)
      setForm(tabCfg.blank())
    }
    setModal(id || 'new')
  }

  const save = async () => {
    // If a logo was uploaded (base64), use it as the final logo value
    const finalForm = { ...form, logo: form.logoUpload || form.logo }
    const prev = creds
    await commit(modal === 'new' ? [...creds, finalForm] : creds.map(c => c.id === modal ? finalForm : c), prev)
    setModal(null)
  }
  const del = async id => { const prev = creds; await commit(creds.filter(c => c.id !== id), prev); setConfirm(null) }
  const u   = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  // Items for the active subsection (using recruiter-matching getSubsection)
  const subCfg   = CRED_SUBS.find(s => s.id === subSec) || CRED_SUBS[0]
  const subItems = creds.filter(c => getSubsection(c) === subSec)
  const filtered = subItems.filter(c =>
    c.title?.toLowerCase().includes(search.toLowerCase()) ||
    c.issuer?.toLowerCase().includes(search.toLowerCase())
  )

  // For "Add" button — pick blank template by type
  const tabCfg = CRED_TABS.find(t => t.id === credTab) || CRED_TABS[0]

  // Count per subsection
  const countFor = id => creds.filter(c => getSubsection(c) === id).length

  return (
    <div>
      <style>{CRED_CSS}</style>

      {/* Section Header */}
      <div className="section-header">
        <div>
          <span className="section-title">Credentials</span>
          <span className="section-count">({creds.length} total)</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saving && <span style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--amber)' }}>⟳ Syncing…</span>}
          <input
            className="form-input"
            style={{ width: 'min(200px, 100%)' }}
            placeholder="🔍  Search..."
            aria-label="Search credentials"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button
            className="btn"
            style={{ borderColor: subCfg.col, color: subCfg.col }}
            onClick={() => open()}
          >
            + Add Credential
          </button>
        </div>
      </div>

      {/* Subsection stat-card grid — matches recruiter.html */}
      <div className="sub-grid" role="tablist" aria-label="Credential subsections">
        {CRED_SUBS.filter(s => countFor(s.id) > 0 || s.id === subSec).map(s => (
          <button
            key={s.id}
            role="tab"
            aria-selected={subSec === s.id}
            className={`sub-card${subSec === s.id ? ' active' : ''}`}
            onClick={() => setSubSec(s.id)}
            style={{color: subSec === s.id ? s.col : 'var(--tx3)', borderColor: subSec === s.id ? s.col : undefined, background: 'none', fontFamily: 'inherit'}}
          >
            <span className="sub-n">{countFor(s.id)}</span>
            <span className="sub-l">{s.label}</span>
            <span className="sub-bar" />
          </button>
        ))}
      </div>

      {/* Section Banner */}
      <div className="cred-section-banner" style={{borderColor: subCfg.col, color: subCfg.col}}>
        ▸ {subCfg.label.toUpperCase()} — {countFor(subSec)} credential{countFor(subSec) !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      <div className="card">
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        {filtered.length === 0
          ? (
            <div className="empty-state">
              <div className="empty-state-icon">{tabCfg.icon}</div>
              <div className="empty-state-text">
                No {tabCfg.label} yet — click "+ Add" to get started
              </div>
            </div>
          ) : (
            <div className="cred-card-grid">
              {filtered.map(c => {
                const isC    = c.type === 'credly' || c.type === 'badge'
                const isCert = c.type === 'certificate' || c.type === 'exam'
                const typeLbl   = isC ? 'CREDLY' : isCert ? 'CERTIFICATE' : 'LINKEDIN'
                const typeColor = isC ? 'var(--amber)' : isCert ? 'var(--g)' : 'var(--blue)'
                const typeBorder= isC ? 'rgba(255,170,0,.4)' : isCert ? 'rgba(0,255,136,.3)' : 'rgba(0,212,255,.3)'

                // Image logic matching recruiter.html
                // FIX 3: guard against base64 PDFs being used as banner images
                const pdfIsDataUri = c.pdf && c.pdf.startsWith('data:application/pdf')
                const pdfIsImage = c.pdf && !c.pdf.endsWith('.pdf') && !pdfIsDataUri
                const topImg = c.image || (pdfIsImage ? c.pdf : '')

                // FIX 1+2: credlyImageUrl is either a base64 data-URI or a direct https:// URL.
                // The CDN fallback using credlyBadgeId is WRONG — that ID is the earned assertion
                // UUID, not the image template UUID the Credly CDN requires.
                // Use credlyImageUrl directly; if missing, show the no-image placeholder.
                let logoSrc = ''
                if (isC) {
                  logoSrc = (c.credlyImageUrl && c.credlyImageUrl !== '') ? c.credlyImageUrl : ''
                } else {
                  const iss = (c.issuer || '').toLowerCase()
                  if (iss.includes('amazon') || iss.includes('aws'))
                    logoSrc = 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg'
                  else if (iss.includes('cisco'))
                    logoSrc = 'https://upload.wikimedia.org/wikipedia/commons/0/08/Cisco_logo_blue_2016.svg'
                  else
                    logoSrc = c.logo || ''
                }

                const hasPdf = c.pdf && c.pdf.endsWith('.pdf')
                const href   = c.url || (hasPdf ? c.pdf : '#')

                return (
                  <div key={c.id} className="cred-card">
                    {/* ── Top image area ── */}
                    {topImg ? (
                      <div className="cc-top">
                        <img className="cc-banner" src={topImg} alt={c.title || ''} loading="lazy"
                          onError={e => { e.target.style.display='none'; e.target.parentElement.classList.add('cc-top-noimg') }}/>
                      </div>
                    ) : isC && logoSrc ? (
                      <div className="cc-top cc-top-badge">
                        <img className="cc-badge-img" src={logoSrc} alt={c.title || ''} loading="lazy"
                          onError={e => e.target.style.display='none'}/>
                      </div>
                    ) : (
                      <div className="cc-top cc-top-noimg">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"
                          style={{width:28,height:28,opacity:.12}}>
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <circle cx="8.5" cy="8.5" r="1.5"/>
                          <polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                    )}

                    {/* ── Card body ── */}
                    <div className="cc-body">
                      {/* Header row: logo + issuer + date + type badge */}
                      <div className="cc-hdr">
                        <div className="cc-meta-row">
                          {logoSrc && !isC && (
                            <img className="cc-logo" src={logoSrc} alt={c.issuer || ''} loading="lazy"
                              onError={e => e.target.style.display='none'}/>
                          )}
                          <div className="cc-meta">
                            <span className="cc-issuer">{c.issuer || ''}</span>
                            {c.date && <><span className="cc-dot">·</span><span className="cc-date">{c.date}</span></>}
                          </div>
                        </div>
                        <span style={{
                          fontFamily:"'Orbitron',monospace", fontSize:7, letterSpacing:1,
                          padding:'2px 6px', border:'1px solid', borderColor:typeBorder,
                          color:typeColor, whiteSpace:'nowrap', flexShrink:0
                        }}>{typeLbl}</span>
                      </div>

                      {/* Title */}
                      <div className="cc-title">
                        {c.featured && <span style={{color:'var(--amber)',marginRight:5}}>★</span>}
                        {c.title || 'Untitled'}
                      </div>

                      {/* Tags */}
                      {c.tags?.length > 0 && (
                        <div className="cc-tags">
                          {c.tags.slice(0, 4).map(t => (
                            <span key={t} className="cc-tag">{t}</span>
                          ))}
                        </div>
                      )}

                      {/* Footer: view link + edit/delete */}
                      <div className="cc-footer" style={{justifyContent:'space-between', alignItems:'center'}}>
                        <div style={{display:'flex',gap:6}}>
                          {href && href !== '#' && (
                            <a className="cc-btn" href={href} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{fontSize:9,padding:'4px 8px'}}>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="9" height="9">
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                              </svg>
                              {isC ? 'Badge' : hasPdf ? 'PDF' : 'View'}
                            </a>
                          )}
                          {hasPdf && c.url && c.url !== '#' && (
                            <a className="cc-btn" href={c.pdf} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{fontSize:9,padding:'4px 8px',borderColor:'rgba(0,255,136,.3)',color:'var(--g)'}}>
                              PDF
                            </a>
                          )}
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button className="btn btn-amber btn-sm btn-icon"
                            style={{minHeight:28,minWidth:28,padding:'4px 8px',fontSize:10}}
                            onClick={() => open(c.id)}>✎</button>
                          <button className="btn btn-red btn-sm btn-icon"
                            style={{minHeight:28,minWidth:28,padding:'4px 8px',fontSize:10}}
                            onClick={() => setConfirm(c.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        }
      </div>

      {/* ── MODAL ── */}
      {modal && (
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header">
            <span className="modal-title" style={{ color: tabCfg.color }}>
              {modal === 'new'
                ? `NEW ${credTab === 'credly' ? 'CREDLY BADGE' : credTab === 'professional' ? 'PROFESSIONAL CERT' : 'LINKEDIN / OTHER'}`
                : `EDIT ${credTab === 'credly' ? 'CREDLY BADGE' : credTab === 'professional' ? 'PROFESSIONAL CERT' : 'LINKEDIN / OTHER'}`
              }
            </span>
            <button className="modal-close" onClick={() => setModal(null)} aria-label="Close">×</button>
          </div>
          <div className="modal-body">

            {/* ─ Common fields ─ */}
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">
                  {credTab === 'credly' ? 'Badge Title' : credTab === 'professional' ? 'Certificate Name' : 'Course / Cert Title'}
                </label>
                <input className="form-input" value={form.title || ''} onChange={u('title')}
                  placeholder={credTab === 'credly' ? 'e.g. Certified Ethical Hacker (CEH)' : credTab === 'professional' ? 'e.g. CompTIA Security+' : 'e.g. Ethical Hacking Essentials'}/>
              </div>
              <div className="form-group">
                <label className="form-label">Issuing Organization</label>
                <input className="form-input" value={form.issuer || ''} onChange={u('issuer')}
                  placeholder={credTab === 'credly' ? 'e.g. EC-Council via Credly' : credTab === 'professional' ? 'e.g. CompTIA, ISACA' : 'e.g. LinkedIn Learning, Coursera'}/>
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Issue Date</label>
                <input className="form-input" type="month" value={form.date || ''} onChange={u('date')}/>
              </div>
              <div className="form-group">
                <label className="form-label">Verify / View URL</label>
                <input className="form-input" value={form.url || ''} onChange={u('url')}
                  placeholder={credTab === 'credly' ? 'https://www.credly.com/badges/...' : credTab === 'professional' ? 'https://verify.comptia.org/...' : 'https://www.linkedin.com/learning/...'}/>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Logo / Issuer Image URL</label>
              <input className="form-input" value={form.logo || ''} onChange={u('logo')}
                placeholder="https://logo.clearbit.com/company.com  or paste a direct image URL"/>
              <div className="form-hint">Paste a URL above — OR upload a logo image below</div>
              <div style={{marginTop:10}}>
                <FileUpload
                  value={form.logoUpload || null}
                  accept="image/*"
                  label="Upload Logo Image"
                  onChange={b => setForm(p => ({ ...p, logoUpload: b, logo: b || p.logo }))}
                />
              </div>
              {form.logo && (
                <div style={{marginTop:8,display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--tx3)',letterSpacing:1}}>PREVIEW:</span>
                  <img src={form.logo} alt="logo preview" style={{width:40,height:40,objectFit:'contain',border:'1px solid var(--bd)',background:'var(--bg2)',padding:4}} onError={e=>e.target.style.display='none'}/>
                </div>
              )}
            </div>

            {/* ─ Credly-specific ─ */}
            {credTab === 'credly' && (
              <>
                <hr className="divider"/>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--amber)', letterSpacing: 2, marginBottom: 12 }}>CREDLY DETAILS</div>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label">Credly Badge ID</label>
                    <input className="form-input" value={form.credlyBadgeId || ''} onChange={u('credlyBadgeId')}
                      placeholder="UUID from credly.com/badges/..."/>
                    <div className="form-hint">The unique ID segment in your Credly badge URL</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Earner Profile URL</label>
                    <input className="form-input" value={form.credlyEarnerUrl || ''} onChange={u('credlyEarnerUrl')}
                      placeholder="https://www.credly.com/users/username"/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Badge Image (URL or auto-synced base64)</label>
                  <input className="form-input" value={form.credlyImageUrl || ''} onChange={u('credlyImageUrl')}
                    placeholder="https://images.credly.com/images/{image-uuid}/image.png"/>
                  <div className="form-hint">
                    Auto-filled by the sync workflow (stored as base64). To manually set, paste a direct Credly image URL
                    — NOT the badge page URL. Leave blank to re-sync via GitHub Actions → Force Re-sync.
                  </div>
                  {form.credlyImageUrl && (
                    <div style={{marginTop:8,display:'flex',alignItems:'center',gap:10}}>
                      <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--tx3)',letterSpacing:1}}>PREVIEW:</span>
                      <img src={form.credlyImageUrl} alt="badge preview"
                        style={{width:60,height:60,objectFit:'contain',border:'1px solid var(--bd)',background:'var(--bg2)',padding:4,borderRadius:4}}
                        onError={e=>{e.target.style.display='none'}}/>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ─ Professional-specific ─ */}
            {credTab === 'professional' && (
              <>
                <hr className="divider"/>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--g)', letterSpacing: 2, marginBottom: 12 }}>CERTIFICATE DETAILS</div>
                <div className="form-row form-row-3">
                  <div className="form-group">
                    <label className="form-label">Certificate Number</label>
                    <input className="form-input" value={form.certNumber || ''} onChange={u('certNumber')}
                      placeholder="e.g. COMP001234567"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Exam / Course Code</label>
                    <input className="form-input" value={form.examCode || ''} onChange={u('examCode')}
                      placeholder="e.g. SY0-701"/>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration (hours)</label>
                    <input className="form-input" type="number" value={form.duration || ''} onChange={u('duration')}
                      placeholder="e.g. 40"/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Certificate Sub-Type</label>
                  <select className="form-select" value={form.type || 'certificate'} onChange={u('type')}>
                    <option value="certificate">Certificate of Completion</option>
                    <option value="exam">Exam / Proctored Certification</option>
                  </select>
                </div>
              </>
            )}

            {/* ─ LinkedIn-specific ─ */}
            {credTab === 'linkedin' && (
              <>
                <hr className="divider"/>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--blue)', letterSpacing: 2, marginBottom: 12 }}>COURSE DETAILS</div>
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label">LinkedIn Course ID</label>
                    <input className="form-input" value={form.courseId || ''} onChange={u('courseId')}
                      placeholder="e.g. ethical-hacking-2023"/>
                    <div className="form-hint">The slug from the LinkedIn Learning URL</div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Learning Path Name</label>
                    <input className="form-input" value={form.learningPathName || ''} onChange={u('learningPathName')}
                      placeholder="e.g. Become an Ethical Hacker (optional)"/>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Source / Platform</label>
                  <select className="form-select" value={form.type || 'linkedin'} onChange={u('type')}>
                    <option value="linkedin">LinkedIn Learning</option>
                    <option value="other">Other (Coursera, Udemy, edX, etc.)</option>
                  </select>
                </div>
              </>
            )}

            {/* ─ Shared bottom fields ─ */}
            <hr className="divider"/>
            <div className="form-group">
              <label className="form-label">Tags / Skills</label>
              <TagInput value={form.tags || []} onChange={v => setForm(p => ({ ...p, tags: v }))}
                placeholder="CEH, Networking, Python…"/>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <label className="toggle">
                <input type="checkbox" checked={form.featured || false}
                  onChange={e => setForm(p => ({ ...p, featured: e.target.checked }))}/>
                <span className="toggle-slider"/>
              </label>
              <span style={{ fontSize: 13, color: 'var(--tx2)' }}>Featured on portfolio</span>
            </div>

            <hr className="divider"/>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--tx3)', letterSpacing: 2, marginBottom: 10 }}>
              {credTab === 'credly' ? 'BADGE IMAGE (upload backup)' : 'CERTIFICATE IMAGE'}
            </div>
            <FileUpload value={form.image} accept="image/*" label="Upload Image" onChange={b => setForm(p => ({ ...p, image: b }))}/>
            <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, color: 'var(--tx3)', letterSpacing: 2, margin: '16px 0 10px' }}>
              CERTIFICATE PDF
            </div>
            <FileUpload value={form.pdf} accept="application/pdf,image/*" label="Upload PDF" onChange={b => setForm(p => ({ ...p, pdf: b }))}/>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button
              className="btn"
              style={{ borderColor: subCfg.col, color: subCfg.col }}
              onClick={save}
            >
              Save
            </button>
          </div>
        </div></div>
      )}

      {confirm && <Confirm msg="Delete this credential?" onConfirm={() => del(confirm)} onCancel={() => setConfirm(null)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// PROJECTS
// ══════════════════════════════════════════════════════════════════════════
const BLANK_PROJ = ()=>({id:uid(),title:'',desc:'',tech:[],status:'Completed',liveUrl:'',githubUrl:'',image:null,pdf:null,featured:false})
const STATUS_COLOR = {Completed:'green','In Progress':'amber',Planned:'blue',Archived:'red'}

function ProjectsSection({ data, onSave }) {
  const [items, setItems]     = useState(data||[])
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({})
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving]   = useState(false)
  useEffect(()=>{ setItems(data||[]) }, [data])
  const commit = async (u, prev) => {
    setItems(u)            // optimistic update
    setSaving(true)
    try {
      const cfg = getGithubConfig()
      const MAX = 50_000

      // Pre-upload any large base64 blobs so data_main.json stays lean
      const cleaned = await Promise.all(u.map(async p => {
        if (!cfg?.token) return p
        const out = { ...p }

        // Upload project screenshot image if it's a large base64 blob
        const imgVal = out.image
        if (typeof imgVal === 'string' && imgVal.startsWith('data:image/') && imgVal.length > MAX) {
          try {
            const match = imgVal.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
            if (match) {
              const ext   = match[1].split('/')[1].replace('jpeg','jpg').replace('svg+xml','svg')
              const fname = `projects/${p.id}_image.${ext}`
              const path  = await uploadImage(fname, match[2])
              out.image   = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/main/frontend/${path}`
            }
          } catch(e) {
            console.warn(`[ProjectsSection] image upload failed for ${p.id}:`, e.message)
          }
        }

        // Upload project PDF if it's a base64 blob (any size — PDFs are always files)
        const pdfVal = out.pdf
        if (typeof pdfVal === 'string' && pdfVal.startsWith('data:application/pdf')) {
          try {
            out.pdf = await uploadPdf(`projects/${p.id}.pdf`, pdfVal)
            // Generate and store a thumbnail from the first page if no image yet
            if (!out.image) {
              try {
                out.image = await _pdfFirstPageThumb(pdfVal)
              } catch(te) {
                console.info('[ProjectsSection] PDF thumb skipped:', te.message)
              }
            }
          } catch(e) {
            console.warn(`[ProjectsSection] PDF upload failed for ${p.id}:`, e.message)
          }
        }

        return out
      }))

      setItems(cleaned)    // update state with uploaded URLs
      await onSave(cleaned)
    } catch (e) {
      setItems(prev)       // rollback on failure so UI matches GitHub
      console.error('[ProjectsSection] save failed:', e.message)
      throw e              // bubble up so SyncToast shows the error
    } finally { setSaving(false) }
  }

  /** Generate a small JPEG thumbnail from page 1 of a PDF data URI using canvas + pdf.js */
  async function _pdfFirstPageThumb(dataUri) {
    // Dynamically load pdf.js from CDN only when needed
    if (!window.pdfjsLib) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
        s.onload = res; s.onerror = rej
        document.head.appendChild(s)
      })
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    }
    const raw  = dataUri.replace(/^data:application\/pdf;base64,/, '')
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
    const pdf   = await window.pdfjsLib.getDocument({ data: bytes }).promise
    const page  = await pdf.getPage(1)
    const vp    = page.getViewport({ scale: 0.6 })
    const canvas = document.createElement('canvas')
    canvas.width  = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    return canvas.toDataURL('image/jpeg', 0.72)
  }
  const open   = (id=null) => { setForm(id?{...items.find(p=>p.id===id)}:BLANK_PROJ()); setModal(id||'new') }
  const stripQuotes = s => (s||'').trim().replace(/^['"]+|['"]+$/g,'')
  const save   = async () => {
    if (!form.title || !form.title.trim()) { alert('Project title is required.'); return; }
    const cleaned = {...form, liveUrl: stripQuotes(form.liveUrl), githubUrl: stripQuotes(form.githubUrl)}
    if (cleaned.liveUrl && !/^https?:\/\//i.test(cleaned.liveUrl)) { alert('Live URL must start with https:// (or leave it blank).'); return; }
    if (cleaned.githubUrl && !/^https?:\/\//i.test(cleaned.githubUrl)) { alert('GitHub URL must start with https:// (or leave it blank).'); return; }
    const prev=items; await commit(modal==='new'?[...items,cleaned]:items.map(p=>p.id===modal?cleaned:p), prev); setModal(null)
  }
  const del    = async id  => { const prev=items; await commit(items.filter(p=>p.id!==id), prev); setConfirm(null) }
  const u      = k => e => setForm(p=>({...p,[k]:e.target.value}))
  return (
    <div>
      <div className="section-header">
        <div><span className="section-title">Projects</span><span className="section-count">({items.length})</span></div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saving&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--amber)'}}>⟳ Syncing…</span>}
          <button className="btn btn-green" onClick={()=>open()}>+ Add Project</button>
        </div>
      </div>
      {items.length===0&&<div className="empty-state"><div className="empty-state-icon">◉</div><div className="empty-state-text">No projects yet</div></div>}
      <div className="grid-2" style={{marginBottom:16}}>
        {items.map(p=>(
          <div className="card" key={p.id}>
            <div className="card-corner tl"/><div className="card-corner tr"/>
            <div className="card-corner bl"/><div className="card-corner br"/>
            {p.image&&<img src={p.image} alt="" style={{width:'100%',height:120,objectFit:'cover',marginBottom:14,border:'1px solid var(--bd)'}}/>}
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
              <span style={{fontWeight:700,color:'var(--tx)'}}>{p.title||'Untitled'}</span>
              <span className={`badge badge-${STATUS_COLOR[p.status]||'green'}`} style={{fontSize:9,marginLeft:8}}>{p.status}</span>
            </div>
            {p.featured&&<div style={{marginBottom:6}}><span className="badge badge-amber" style={{fontSize:9}}>★ FEATURED</span></div>}
            <p style={{fontSize:12,color:'var(--tx2)',lineHeight:1.5,marginBottom:12,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',wordBreak:'break-word'}}>{p.desc}</p>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:14}}>{p.tech?.map(t=><span className="badge badge-blue" key={t} style={{fontSize:10}}>{t}</span>)}</div>
            <div style={{display:'flex',gap:8}}>
              {p.liveUrl&&<a href={p.liveUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">↗ Live</a>}
              {p.githubUrl&&<a href={p.githubUrl} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">⌥ GitHub</a>}
              {p.pdf&&<a href={p.pdf} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">📄 PDF</a>}
              <button className="btn btn-amber btn-sm btn-icon" style={{marginLeft:'auto'}} onClick={()=>open(p.id)}>✎</button>
              <button className="btn btn-red btn-sm btn-icon" onClick={()=>setConfirm(p.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>
      {modal&&(
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><span className="modal-title">{modal==='new'?'NEW PROJECT':'EDIT PROJECT'}</span><button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">×</button></div>
          <div className="modal-body">
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title||''} onChange={u('title')} placeholder="Project Name"/></div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-select" value={form.status||'Completed'} onChange={u('status')}>
                  {['Completed','In Progress','Planned','Archived'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.desc||''} onChange={u('desc')} placeholder="What does this project do?"/></div>
            <div className="form-group"><label className="form-label">Tech Stack</label><TagInput value={form.tech||[]} onChange={v=>setForm(p=>({...p,tech:v}))} placeholder="React, Python..."/></div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Live URL</label><input className="form-input" value={form.liveUrl||''} onChange={u('liveUrl')} placeholder="https://..."/></div>
              <div className="form-group"><label className="form-label">GitHub URL</label><input className="form-input" value={form.githubUrl||''} onChange={u('githubUrl')} placeholder="https://github.com/..."/></div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <label className="toggle"><input type="checkbox" checked={form.featured||false} onChange={e=>setForm(p=>({...p,featured:e.target.checked}))}/><span className="toggle-slider"/></label>
              <span style={{fontSize:13,color:'var(--tx2)'}}>Featured</span>
            </div>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:10}}>SCREENSHOT</div>
            <FileUpload value={form.image} accept="image/*" label="Upload Image" onChange={b=>setForm(p=>({...p,image:b}))}/>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--blue)',letterSpacing:2,marginBottom:10,marginTop:16}}>PROJECT PDF / REPORT</div>
            <FileUpload value={form.pdf} accept="application/pdf" label="Upload PDF" onChange={b=>setForm(p=>({...p,pdf:b}))}/>
          </div>
          <div className="modal-footer"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-green" onClick={save}>Save</button></div>
        </div></div>
      )}
      {confirm&&<Confirm msg="Delete this project?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// CTF FLAGS
// ══════════════════════════════════════════════════════════════════════════
// Canonical flag schema — every field maps 1:1 to what recruiter.html reads.
// To add a new field: add it here + in recruiter's rCTF(). Nowhere else.
const BLANK_FLAG = ()=>({
  id:          uid(),
  platform:    'TryHackMe',
  room:        '',
  difficulty:  'Easy',
  category:    '',
  flags_count: 3,
  date:        new Date().toISOString().split('T')[0],
  desc:        '',
  tags:        [],
  url:         '',
  verify_url:  '',
  writeup_url: '',
})
const DIFF_COLORS = {Easy:'green',Medium:'amber',Hard:'red',Insane:'red'}

function FlagsSection({ data, onSave }) {
  const [items,   setItems]   = useState(data||[])
  const [modal,   setModal]   = useState(null)
  const [form,    setForm]    = useState({})
  const [confirm, setConfirm] = useState(null)
  const [saving,  setSaving]  = useState(false)

  useEffect(()=>{ setItems(data||[]) }, [data])

  // Optimistic save with rollback
  const commit = async (next, prev) => {
    setItems(next)
    setSaving(true)
    try     { await onSave(next) }
    catch(e){ setItems(prev); console.error('[FlagsSection]', e.message); throw e }
    finally { setSaving(false) }
  }

  const open = (id=null) => {
    setForm(id ? {...items.find(f=>f.id===id)} : BLANK_FLAG())
    setModal(id||'new')
  }

  // save() writes only canonical fields — no junk enters data_main.json
  const save = async () => {
    if (!form.room?.trim()) { alert('Room / Challenge Name is required.'); return }
    const urlFields = ['url','verify_url','writeup_url']
    for (const k of urlFields) {
      if (form[k]?.trim() && !/^https?:\/\//i.test(form[k].trim())) {
        alert(k.replace(/_/g,' ').toUpperCase()+' must start with https://'); return
      }
    }
    // Build canonical object — only known fields, no ASCII art, no legacy junk
    const clean = {
      id:          form.id,
      platform:    form.platform    || 'TryHackMe',
      room:        form.room.trim(),
      difficulty:  form.difficulty  || 'Easy',
      category:    form.category    || '',
      flags_count: parseInt(form.flags_count)||3,
      date:        form.date        || new Date().toISOString().split('T')[0],
      desc:        (form.desc||'').trim(),
      tags:        form.tags        || [],
      url:         (form.url||'').trim(),
      verify_url:  (form.verify_url||'').trim(),
      writeup_url: (form.writeup_url||'').trim(),
    }
    const prev = items
    await commit(modal==='new' ? [...items,clean] : items.map(f=>f.id===modal?clean:f), prev)
    setModal(null)
  }

  const del = async id => { const prev=items; await commit(items.filter(f=>f.id!==id), prev); setConfirm(null) }
  const u   = k => e  => setForm(p=>({...p,[k]:e.target.value}))

  // Derived stats
  const totalFlags = items.reduce((s,f)=>s+(parseInt(f.flags_count)||3),0)
  const platforms  = [...new Set(items.map(f=>f.platform).filter(Boolean))].length

  const CATS = ['Web Exploitation','Privilege Escalation','Forensics','Cryptography',
                'Reverse Engineering','OSINT','Network','Steganography','Miscellaneous']

  return (
    <div>
      {/* ── Header */}
      <div className="section-header">
        <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <div><span className="section-title">CTF Flags</span><span className="section-count">({items.length})</span></div>
          {items.length>0&&(
            <div style={{display:'flex',border:'1px solid var(--bd)'}}>
              {[{n:items.length,l:'ROOMS'},{n:totalFlags,l:'FLAGS'},{n:platforms||1,l:'PLATFORMS'}].map((s,i)=>(
                <div key={s.l} style={{padding:'4px 12px',borderRight:i<2?'1px solid var(--bd)':'none',textAlign:'center'}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:13,fontWeight:900,color:'var(--g)',lineHeight:1}}>{s.n}</div>
                  <div style={{fontSize:7,letterSpacing:2,color:'var(--tx3)',textTransform:'uppercase',marginTop:2}}>{s.l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saving&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--amber)'}}>⟳ Syncing…</span>}
          <button className="btn btn-green" onClick={()=>open()}>🚩 Capture Flag</button>
        </div>
      </div>

      {/* ── Empty state */}
      {items.length===0&&<div className="empty-state"><div className="empty-state-icon">🚩</div><div className="empty-state-text">No CTF flags yet — start capturing!</div></div>}

      {/* ── Card grid */}
      <div className="grid-2" style={{marginBottom:16}}>
        {items.map(f=>(
          <div className="card" key={f.id} style={{borderLeft:`3px solid var(--${DIFF_COLORS[f.difficulty]||'amber'})`}}>
            <div className="card-corner tl"/><div className="card-corner tr"/>
            <div className="card-corner bl"/><div className="card-corner br"/>

            {/* Mission banner */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              paddingBottom:8,marginBottom:10,borderBottom:'1px solid rgba(26,58,92,.5)'}}>
              <div style={{display:'flex',alignItems:'center',gap:7}}>
                <span>🚩</span>
                <div>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:7,letterSpacing:3,color:'var(--g)'}}>MISSION COMPLETE</div>
                  <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--tx3)'}}>OPS-ID: {(f.id||'????').toUpperCase()}</div>
                </div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:'var(--red)',letterSpacing:2,border:'1px solid rgba(255,34,68,.3)',padding:'2px 6px'}}>{f.platform}</span>
                <span className={`badge badge-${DIFF_COLORS[f.difficulty]||'amber'}`} style={{fontSize:8}}>{f.difficulty}</span>
              </div>
            </div>

            {/* Room name */}
            <div style={{fontFamily:"'Orbitron',monospace",fontSize:12,color:'var(--tx)',
              marginBottom:10,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.room||'Unnamed Room'}</div>

            {/* Metrics grid */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:1,background:'var(--bd)',border:'1px solid var(--bd)',marginBottom:10}}>
              {[
                {v:`${f.flags_count||3}/${f.flags_count||3}`, l:'FLAGS',    c:'var(--g)'},
                {v:(f.category||f.tags?.[0]||'General').slice(0,10).toUpperCase(), l:'CATEGORY', c:'var(--blue)'},
                {v: f.verify_url ? '✓ LIVE' : '— N/A',  l:'VERIFY',   c: f.verify_url?'var(--amber)':'var(--tx3)'},
              ].map(m=>(
                <div key={m.l} style={{background:'var(--panel)',padding:'6px 4px',textAlign:'center'}}>
                  <div style={{fontFamily:"'Orbitron',monospace",fontSize:10,fontWeight:900,color:m.c,lineHeight:1,marginBottom:2}}>{m.v}</div>
                  <div style={{fontSize:6,letterSpacing:2,color:'var(--tx3)',textTransform:'uppercase'}}>{m.l}</div>
                </div>
              ))}
            </div>

            {/* Tags */}
            {f.tags?.length>0&&(
              <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                {f.tags.map(t=><span key={t} style={{fontSize:8,padding:'2px 7px',
                  border:'1px solid rgba(0,212,255,.18)',color:'rgba(0,212,255,.6)',
                  fontFamily:"'Share Tech Mono',monospace"}}>{t}</span>)}
              </div>
            )}

            {/* Desc */}
            {f.desc&&<p style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5,marginBottom:8,
              overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{f.desc}</p>}

            {/* Footer */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              paddingTop:8,borderTop:'1px solid rgba(26,58,92,.35)',flexWrap:'wrap',gap:6}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:'var(--tx3)'}}>{f.date}</span>
              <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                {f.verify_url   && <a href={f.verify_url}   target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{color:'var(--g)',borderColor:'rgba(0,255,136,.3)',fontSize:9}}>✓ Verify</a>}
                {f.url          && <a href={f.url}          target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{fontSize:9}}>↗ Room</a>}
                {f.writeup_url  && <a href={f.writeup_url}  target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{color:'var(--amber)',borderColor:'rgba(255,215,0,.3)',fontSize:9}}>📄 WU</a>}
                <button className="btn btn-amber btn-sm btn-icon" onClick={()=>open(f.id)}>✎</button>
                <button className="btn btn-red   btn-sm btn-icon" onClick={()=>setConfirm(f.id)}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal */}
      {modal&&(
        <div className="modal-overlay"><div className="modal" style={{maxWidth:660}}>
          <div className="modal-header">
            <span className="modal-title">{modal==='new'?'🚩 CAPTURE NEW FLAG':'✎ EDIT FLAG'}</span>
            <button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">×</button>
          </div>
          <div className="modal-body">

            {/* Platform + Difficulty */}
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Platform</label>
                <select className="form-select" value={form.platform||'TryHackMe'} onChange={u('platform')}>
                  {['TryHackMe','HackTheBox','CTF Competition','PicoCTF','VulnHub','PortSwigger','Custom'].map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Difficulty</label>
                <select className="form-select" value={form.difficulty||'Easy'} onChange={u('difficulty')}>
                  {['Easy','Medium','Hard','Insane'].map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* Room + Date */}
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Room / Challenge Name *</label>
                <input className="form-input" value={form.room||''} onChange={u('room')} placeholder="Pickle Rick"/>
              </div>
              <div className="form-group"><label className="form-label">Date Completed</label>
                <input className="form-input" type="date" value={form.date||''} onChange={u('date')}/>
              </div>
            </div>

            {/* Category + Flags Count */}
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Category</label>
                <select className="form-select" value={form.category||''} onChange={u('category')}>
                  <option value="">— Select Category —</option>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Flags Captured</label>
                <input className="form-input" type="number" min="1" max="99"
                  value={form.flags_count||3} onChange={u('flags_count')} placeholder="3"/>
              </div>
            </div>

            {/* Description */}
            <div className="form-group"><label className="form-label">Description</label>
              <textarea className="form-textarea" rows={3} value={form.desc||''} onChange={u('desc')}
                placeholder="What did you exploit? What did you learn?"/>
            </div>

            {/* Tags */}
            <div className="form-group"><label className="form-label">Techniques / Tags</label>
              <TagInput value={form.tags||[]} onChange={v=>setForm(p=>({...p,tags:v}))}
                placeholder="Dir Enumeration, Command Injection, Linux PrivEsc…"/>
            </div>

            {/* URL block */}
            <div style={{padding:'12px',background:'rgba(0,0,0,.2)',border:'1px solid rgba(26,58,92,.4)',marginTop:4,display:'flex',flexDirection:'column',gap:10}}>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:8,letterSpacing:3,color:'var(--blue)',marginBottom:2}}>// CREDENTIAL LINKS — all optional</div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">Room URL</label>
                <input className="form-input" value={form.url||''} onChange={u('url')}
                  placeholder="https://tryhackme.com/room/picklerick"/>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">
                  Verify URL <span style={{color:'var(--g)',fontSize:9,fontWeight:'normal'}}>→ shows green ✓ VERIFY button on card</span>
                </label>
                <input className="form-input" value={form.verify_url||''} onChange={u('verify_url')}
                  placeholder="https://tryhackme.com/p/AasiqSec"/>
              </div>
              <div className="form-group" style={{marginBottom:0}}>
                <label className="form-label">
                  Writeup URL <span style={{color:'var(--amber)',fontSize:9,fontWeight:'normal'}}>→ shows gold 📄 WRITEUP button on card</span>
                </label>
                <input className="form-input" value={form.writeup_url||''} onChange={u('writeup_url')}
                  placeholder="https://github.com/you/ctf-writeups/..."/>
              </div>
            </div>

          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-green" onClick={save}>🚩 {modal==='new'?'Capture Flag':'Save Changes'}</button>
          </div>
        </div></div>
      )}

      {confirm&&<Confirm msg="Remove this CTF flag?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// EXPERIENCE
// ══════════════════════════════════════════════════════════════════════════
const BLANK_EXP = ()=>({id:uid(),company:'',role:'',startDate:'',endDate:'',current:false,location:'',country:'🇮🇳',desc:'',achievements:[],tags:[],type:'Full-time'})

function ExperienceSection({ data, onSave }) {
  const [items, setItems]     = useState(data||[])
  const [modal, setModal]     = useState(null)
  const [form, setForm]       = useState({})
  const [confirm, setConfirm] = useState(null)
  const [saving, setSaving]   = useState(false)
  useEffect(()=>{ setItems(data||[]) }, [data])
  const commit = async (u, prev) => {
    setItems(u)            // optimistic update
    setSaving(true)
    try {
      await onSave(u)
    } catch (e) {
      setItems(prev)       // rollback on failure so UI matches GitHub
      console.error('[ExperienceSection] save failed:', e.message)
      throw e              // bubble up so SyncToast shows the error
    } finally { setSaving(false) }
  }
  const open   = (id=null) => { setForm(id?{...items.find(e=>e.id===id)}:BLANK_EXP()); setModal(id||'new') }
  const save   = async () => { const prev=items; await commit(modal==='new'?[...items,form]:items.map(e=>e.id===modal?form:e), prev); setModal(null) }
  const del    = async id  => { const prev=items; await commit(items.filter(e=>e.id!==id), prev); setConfirm(null) }
  return (
    <div>
      <div className="section-header">
        <div><span className="section-title">Experience</span><span className="section-count">({items.length})</span></div>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          {saving&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--amber)'}}>⟳ Syncing…</span>}
          <button className="btn btn-green" onClick={()=>open()}>+ Add Position</button>
        </div>
      </div>
      {items.length===0&&<div className="empty-state"><div className="empty-state-icon">◍</div><div className="empty-state-text">No experience entries yet</div></div>}
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {items.map(exp=>(
          <div className="card" key={exp.id}>
            <div className="card-corner tl"/><div className="card-corner tr"/>
            <div className="card-corner bl"/><div className="card-corner br"/>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
                  <span style={{fontSize:20}}>{exp.country}</span>
                  <span style={{fontWeight:700,fontSize:16,color:'var(--tx)'}}>{exp.role}</span>
                  {exp.current&&<span className="badge badge-green" style={{fontSize:9}}>CURRENT</span>}
                  <span className="badge badge-blue" style={{fontSize:9}}>{exp.type}</span>
                </div>
                <div style={{color:'var(--g)',fontSize:13,fontWeight:600,marginBottom:4}}>{exp.company}</div>
                <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--tx3)',marginBottom:8}}>{exp.startDate} → {exp.current?'Present':exp.endDate} · {exp.location}</div>
                <p style={{fontSize:12,color:'var(--tx2)',lineHeight:1.5}}>{exp.desc}</p>
              </div>
              <div style={{display:'flex',gap:8,marginLeft:16}}>
                <button className="btn btn-amber btn-sm btn-icon" onClick={()=>open(exp.id)}>✎</button>
                <button className="btn btn-red btn-sm btn-icon" onClick={()=>setConfirm(exp.id)}>✕</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {modal&&(
        <div className="modal-overlay"><div className="modal">
          <div className="modal-header"><span className="modal-title">{modal==='new'?'NEW POSITION':'EDIT POSITION'}</span><button className="modal-close" onClick={()=>setModal(null)} aria-label="Close">×</button></div>
          <div className="modal-body">
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Company</label><input className="form-input" value={form.company||''} onChange={e=>setForm(p=>({...p,company:e.target.value}))} placeholder="Company Name"/></div>
              <div className="form-group"><label className="form-label">Role</label><input className="form-input" value={form.role||''} onChange={e=>setForm(p=>({...p,role:e.target.value}))} placeholder="Security Analyst"/></div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group"><label className="form-label">Start</label><input className="form-input" type="month" value={form.startDate||''} onChange={e=>setForm(p=>({...p,startDate:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">End</label><input className="form-input" type="month" value={form.endDate||''} onChange={e=>setForm(p=>({...p,endDate:e.target.value}))} disabled={form.current}/></div>
              <div className="form-group" style={{display:'flex',flexDirection:'column',justifyContent:'flex-end'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:4}}>
                  <label className="toggle"><input type="checkbox" checked={form.current||false} onChange={e=>setForm(p=>({...p,current:e.target.checked}))}/><span className="toggle-slider"/></label>
                  <span style={{fontSize:13,color:'var(--tx2)'}}>Currently Here</span>
                </div>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-group"><label className="form-label">Location</label><input className="form-input" value={form.location||''} onChange={e=>setForm(p=>({...p,location:e.target.value}))} placeholder="Chennai, India"/></div>
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-select" value={form.type||'Full-time'} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                  {['Full-time','Part-time','Internship','Contract','Freelance','Volunteer'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Country Flag</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:8,padding:10,background:'var(--bg2)',border:'1px solid var(--bd)'}}>
                {FLAG_EMOJIS.map(f=><span key={f} onClick={()=>setForm(p=>({...p,country:f}))} style={{fontSize:22,cursor:'pointer',padding:4,border:`2px solid ${form.country===f?'var(--g)':'transparent'}`,borderRadius:4}}>{f}</span>)}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={form.desc||''} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="Describe responsibilities..."/></div>
            <div className="form-group"><label className="form-label">Achievements (one per line)</label>
              <textarea className="form-textarea" rows={4} value={(form.achievements||[]).join('\n')} onChange={e=>setForm(p=>({...p,achievements:e.target.value.split('\n').filter(Boolean)}))} placeholder="• Reduced incident response by 40%&#10;• Implemented SIEM solution..."/>
            </div>
            <div className="form-group"><label className="form-label">Tags</label><TagInput value={form.tags||[]} onChange={v=>setForm(p=>({...p,tags:v}))} placeholder="Leadership, Python, AWS..."/></div>
          </div>
          <div className="modal-footer"><button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button><button className="btn btn-green" onClick={save}>Save</button></div>
        </div></div>
      )}
      {confirm&&<Confirm msg="Delete this experience?" onConfirm={()=>del(confirm)} onCancel={()=>setConfirm(null)}/>}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// CONTACT
// ══════════════════════════════════════════════════════════════════════════
function ContactSection({ data, onSave }) {
  const [d, setD]     = useState(data||{})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  useEffect(()=>{ setD(data||{}) }, [data])
  const u = k => e => setD(p=>({...p,[k]:e.target.value}))
  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(d)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('[ContactSection] save failed:', e.message)
      throw e              // bubble up so App.handleSave → SyncToast shows the error
    } finally {
      setSaving(false)
    }
  }
  return (
    <div>
      <div className="section-header">
        <div><span className="section-title">Contact</span></div>
        <button className="btn btn-green" onClick={handleSave} disabled={saving}>
          {saving?'⟳ Saving…':saved?'✓ Saved':'Save Changes'}
        </button>
      </div>
      <div className="card" style={{marginBottom:20}}>
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>PRIMARY CONTACT</div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={d.email||''} onChange={u('email')} placeholder="you@email.com"/></div>
          <div className="form-group"><label className="form-label">Phone</label><input className="form-input" type="tel" value={d.phone||''} onChange={u('phone')} placeholder="+91 9876543210"/></div>
        </div>
        <div className="form-group"><label className="form-label">Address / Location</label><input className="form-input" value={d.address||''} onChange={u('address')} placeholder="Pollachi, Tamil Nadu, India (Remote-friendly)"/></div>
        <div className="form-group"><label className="form-label">Specialization (terminal line)</label><input className="form-input" value={d.specialization||''} onChange={u('specialization')} placeholder="Pen Testing | Cloud Security | Network Defense"/></div>
        <div className="form-group"><label className="form-label">Languages (terminal line)</label><input className="form-input" value={d.languages||''} onChange={u('languages')} placeholder="Tamil (Native) · English (Professional)"/></div>
        <div className="form-group"><label className="form-label">CTA Message (status line)</label><textarea className="form-textarea" rows={2} value={d.ctaMessage||''} onChange={u('ctaMessage')} placeholder="Open to cybersecurity roles, collaborations & freelance"/></div>
      </div>
      <div className="card">
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>SOCIAL PROFILES</div>
        <div className="form-row form-row-2">
          {[{k:'linkedin',ph:'linkedin.com/in/...'},{k:'github',ph:'github.com/...'},{k:'twitter',ph:'twitter.com/...'},{k:'tryhackme',ph:'tryhackme.com/p/...'},{k:'hackthebox',ph:'app.hackthebox.com/...'},{k:'discord',ph:'discord.com/users/...'},{k:'telegram',ph:'t.me/...'},{k:'youtube',ph:'youtube.com/@...'}].map(({k,ph})=>(
            <div className="form-group" key={k}>
              <label className="form-label">{k.toUpperCase()}</label>
              <input className="form-input" value={d[k]||''} onChange={u(k)} placeholder={ph}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// SETTINGS
function SettingsSection({ data, ghCfg, onDisconnect }) {
  const [msg, setMsg] = useState(null)
  const [testMsg, setTestMsg] = useState(null)
  const [testing, setTesting] = useState(false)

  const testConn = async () => {
    setTesting(true); setTestMsg(null)
    const r = await testConnection(ghCfg?.owner, ghCfg?.repo, ghCfg?.token)
    setTesting(false)
    setTestMsg(r.ok ? {ok:true,txt:'✓ GitHub connection healthy'} : {ok:false,txt:'⚠ '+r.msg})
  }

  const exportData = () => {
    const blob = new Blob([JSON.stringify({...data,_exported:new Date().toISOString()},null,2)],{type:'application/json'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href=url; a.download=`portfolio-backup-${new Date().toISOString().slice(0,10)}.json`; a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 1000)
  }

  return (
    <div>
      <div className="section-header"><div><span className="section-title">Settings</span></div></div>

      {/* ── PASSWORD + GITHUB ── */}
      <div className="grid-2" style={{marginBottom:20}}>

        <div className="card">
          <div className="card-corner tl"/><div className="card-corner tr"/>
          <div className="card-corner bl"/><div className="card-corner br"/>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>GITHUB CONNECTION</div>
          {testMsg&&<div style={{padding:'10px 14px',border:`1px solid ${testMsg.ok?'var(--g)':'var(--amber)'}`,color:testMsg.ok?'var(--g)':'var(--amber)',fontFamily:"'Share Tech Mono',monospace",fontSize:11,marginBottom:14}}>{testMsg.txt}</div>}
          {[
            {l:'Owner',  v: ghCfg?.owner||'—'},
            {l:'Repo',   v: ghCfg?.repo||'—'},
            {l:'Token',  v: ghCfg?.token ? ghCfg.token.slice(0,16)+'…' : '—'},
            {l:'Files',  v: 'data_main + data_creds_1…4'},
          ].map(i=>(
            <div key={i.l} style={{display:'flex',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid rgba(26,46,28,.4)'}}>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--tx3)'}}>{i.l}</span>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:'var(--g)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis'}}>{i.v}</span>
            </div>
          ))}
          <div style={{display:'flex',gap:10,marginTop:16}}>
            <button className="btn btn-ghost btn-sm" onClick={testConn} disabled={testing}>{testing?'Testing…':'Test Connection'}</button>
            <button className="btn btn-red btn-sm" onClick={()=>{if(window.confirm('Disconnect?')){clearGithubConfig();onDisconnect()}}}>Disconnect</button>
          </div>
        </div>
      </div>

      {/* ── DATA BACKUP ── */}
      <div className="card">
        <div className="card-corner tl"/><div className="card-corner tr"/>
        <div className="card-corner bl"/><div className="card-corner br"/>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:'var(--g)',letterSpacing:2,marginBottom:14}}>DATA BACKUP</div>
        <p style={{fontSize:13,color:'var(--tx2)',lineHeight:1.6,marginBottom:16}}>Export a local JSON backup of all portfolio data.</p>
        <button className="btn btn-green" onClick={exportData}>↓ Export JSON Backup</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════
const DEFAULT_SKILLS = [
  {
    "id": "cat1",
    "name": "Offensive Security",
    "items": [
      {
        "id": "s1",
        "name": "Penetration Testing",
        "level": "Expert"
      },
      {
        "id": "s2",
        "name": "Vulnerability Assessment",
        "level": "Expert"
      },
      {
        "id": "s3",
        "name": "Exploit Development",
        "level": "Advanced"
      },
      {
        "id": "s4",
        "name": "Web Application Hacking",
        "level": "Advanced"
      },
      {
        "id": "s5",
        "name": "Social Engineering",
        "level": "Intermediate"
      }
    ]
  },
  {
    "id": "cat2",
    "name": "Network & Defense",
    "items": [
      {
        "id": "s6",
        "name": "Network Defense",
        "level": "Expert"
      },
      {
        "id": "s7",
        "name": "Incident Response",
        "level": "Advanced"
      },
      {
        "id": "s8",
        "name": "SIEM / Log Analysis",
        "level": "Advanced"
      },
      {
        "id": "s9",
        "name": "Firewall & IDS/IPS",
        "level": "Advanced"
      },
      {
        "id": "s10",
        "name": "Threat Intelligence",
        "level": "Intermediate"
      }
    ]
  },
  {
    "id": "cat3",
    "name": "Cloud & Infrastructure",
    "items": [
      {
        "id": "s11",
        "name": "AWS Security",
        "level": "Expert"
      },
      {
        "id": "s12",
        "name": "Cloud Architecture",
        "level": "Advanced"
      },
      {
        "id": "s13",
        "name": "IAM & Access Control",
        "level": "Advanced"
      },
      {
        "id": "s14",
        "name": "Container Security",
        "level": "Intermediate"
      },
      {
        "id": "s15",
        "name": "DevSecOps",
        "level": "Intermediate"
      }
    ]
  },
  {
    "id": "cat4",
    "name": "Compliance & GRC",
    "items": [
      {
        "id": "s16",
        "name": "Risk Assessment",
        "level": "Advanced"
      },
      {
        "id": "s17",
        "name": "ISO 27001",
        "level": "Advanced"
      },
      {
        "id": "s18",
        "name": "NIST Framework",
        "level": "Advanced"
      },
      {
        "id": "s19",
        "name": "GDPR / Data Privacy",
        "level": "Intermediate"
      },
      {
        "id": "s20",
        "name": "Security Auditing",
        "level": "Intermediate"
      }
    ]
  },
  {
    "id": "cat5",
    "name": "AI & Emerging Tech",
    "items": [
      {
        "id": "s21",
        "name": "AI Security Research",
        "level": "Advanced"
      },
      {
        "id": "s22",
        "name": "AI Red Teaming",
        "level": "Advanced"
      },
      {
        "id": "s23",
        "name": "MLSecOps",
        "level": "Intermediate"
      },
      {
        "id": "s24",
        "name": "LLM Security",
        "level": "Intermediate"
      },
      {
        "id": "s25",
        "name": "Prompt Injection Defence",
        "level": "Intermediate"
      }
    ]
  },
  {
    "id": "cat6",
    "name": "Tools & Languages",
    "items": [
      {
        "id": "s26",
        "name": "Kali Linux / Metasploit",
        "level": "Expert"
      },
      {
        "id": "s27",
        "name": "Burp Suite",
        "level": "Expert"
      },
      {
        "id": "s28",
        "name": "Python / Bash Scripting",
        "level": "Advanced"
      },
      {
        "id": "s29",
        "name": "Wireshark / Nmap",
        "level": "Advanced"
      },
      {
        "id": "s30",
        "name": "OSINT Techniques",
        "level": "Advanced"
      }
    ]
  }
];

const DEFAULTS = {
  about:       {name:'Mohamed Aasiq',title:'Cybersecurity Specialist',bio:'',location:'Pollachi, Tamil Nadu, India',availability:'open'},
  skills:      DEFAULT_SKILLS,
  credentials: [{"id": "cr1", "type": "credly", "title": "Introduction to Cybersecurity", "issuer": "Cisco", "date": "2024-01", "url": "https://www.credly.com/badges/", "tags": ["Cisco", "Cybersecurity", "Networking"], "featured": true, "logo": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAFUAVQDASIAAhEBAxEB/8QAHAABAAMAAwEBAAAAAAAAAAAAAAUGBwEDBAII/8QAWBAAAQMDAQMEDAcMBgkEAwEAAQIDBAAFEQYHEiETMUFRFBciMmFxgZGUobHRCBVCUlNywRYjMzRWYnN0gpKy0jU2N0ODsyREVWN1hJOiwkVUw+ElOKTw/8QAGwEBAAMBAQEBAAAAAAAAAAAAAAECAwQFBgf/xAA4EQACAQIDBQUGBQUAAwAAAAAAAQIDEQQhMQUSE0FRFTJhgZEiU3Gx0eEUUqHB8AYjMzRCQ7Lx/9oADAMBAAIRAxEAPwD8ZVJ6asN21HdW7ZZoTkuS5x3UjgkdKlHmSB1mml7HcNR32LZrYzykmSvdTngEjpUo9AAySa/YOz3Rtq0XYkW63IC3lAGVJUnC319Z6kjoT0ePJrzdo7RjhI2Wcnov3ZyYrFKgrLUz3RGwWzwmkSdUylXKTjJjMKKGEnqKu+X6hWpWjTlgtDYbtdlt8MDpajpCv3sZPnqUpXyVfF1q7vOV/l6Hh1K9So/aYpSlcxiKUrugxZE2Y1Eitl195QQ2gdJNSk27IlK500r3Xy0z7LOMK4sci9uhYAUFAg9II568NTKLi92Ssw04uzFKUqpApSvtlpx55DLSCtxxQShI5yScAUB8UqSv9judikNsXOPyK3Eb6MLCgR08RUbVpwlB7slZkyi4uzFKUqpApSmRnGRk0ApSmR1igFKUoBSlKAUpSgFKUoBSlMjOMjNAKUoCDzEHxUApSlAKUpQHW+wxIb5OQw08g86XEBQ8xqnan2W6Ivza+WsrMJ9XM/C+8rB68DuT5RV1pWlOtUpO8JNF4VJQd4ux+VNpex++aUaduVvWbtakd0t1tGHWR1rR1fnDh14rMq/fBAIweNfnL4QWzJq0b+qtPxwiAtf+mxkDgwongtI6EE8COg+A8Ppdm7XdWSpVteTPXwmOc3uVNepilKUr3z0z9JfBd0q3C09I1TJbHZM9RZjkjillJ7oj6yh5kitmqL0jbUWfStqtbYwIsNps+MJG9681KV8Bi67r1pTfP5HzFeo6lRyFKUrmMRSpHTVrXer5FtiHQyX1EFZGd0AEk46eAr0axsZ09e124yBISEJcSvd3SQesdfCtVRm6fFt7N7eZfhy3N/kdMaw3aRZXbyzDUuC0SFubw6OcgZyQOk169nv9drT+sf8Aiavel/7GZv6CT7TVE2e/12tP6x/4mu14eNGpQafes/1OnhKnOm1zsye22/1pjfqaf41VVoNgu860yLrFhrciR88o4COjicDnOOnFWnbb/WmN+pp/jVU/s6/ssuXik/wVvUw0cRjqkJPqzSVJVcTNPxMkpXqs8JdxucOAhYQqQ4hoKI4DPDNS2udNK0zc2ovZfZKHWuUSvc3SOOCCMmvKjRnKm6iWSOJU5OLnbJHitlgu9yt0m4Qoano0bPKLCgOYZOAeJwOPCmlP60Wr9dZ/jFaXso/s/n/pnv4BWZ6S/rNaP1xn+MV2Tw0aSozT72f6o6JUlBU5LmXjbt+O2r9G77U1SLRYLtdosiTb4an2o4y4oKAxwzgZPE46BV327fjtq/Ru+1Ne/Yz/AFVun6dX+WK7K+HjiNoyhJ5fZG9SkquLlF/zIyaldkZpT8lphBAU64lAJ5skgD21Ytd6UVpdyGOzRKTJSrjye6UqTjPSeHEV48aM5QdRLJa+ZwKnJxclois1RNpMCVctS6aiwZaoksdlOx3QeCXEISpOesZGD4DV7qr6i/tA0p4pn+WK6tnTdOvvLVRl/wCrEHZkjpO9C92nl3GjHmsLLE2Medl5PfJ8XSD0g14dKEnVGrRk/j7OP+gmvNqltzTt5Gr4iFKirSlm8soGd5od6+B85HT1pr70u6HL1rB+MsLCpLS2loOQr/RklJHqrd0o8OpUp92SXk96N15cvCxNsm0e2RqmKJz8O32653ZyMrckKhMBSGlfNKlEAq8AzXstF7g3WA9Lh8sosFSHmFtFLzSwMlCkHiFdXX0VU9nKtSo0RazAh2JbC2S4VuyXg4palErKwEEb29nPGpixW+7t6un3W4m1siTCbaWxEeWtSloUd1xW8kfJJT5KYjC0aTnDnHR3zdnZ3XL9tHcOKVzzaS1VIuV2uMSTb7tu/GBajqVC3Ux0biSEuH5Jzk8cniKsVnukW6x3novKAMyHI7iXE7qkrQcKBH/+4GofRX9J6p/4yv8Aym68Lk9vTGqdRre4RpMEXZodBcbG44B4yEHy0rUKdWpKFKNmlFpddL/O/kGk3ZE9aNQWy63W42yG6tUi3LCHwpGBnJGUnpGQR469LNyivXqRaW99UmOyh53ue5SFkhIz18CcdVUy0W9zTkzSk57uXJzS4NwUel14l5JPic3h5a+4i5D+jtXajjZ7IuJkrjkc/JNILbePIlR8tTUwNLebg/Zdkn43t+zfwsHFcia+62K8478WWq73VllZQuRDjhTW8OcJUojfx+bmpWx3SDeoSZlve5RoqKFBSSlSFg4KVJPFKh0g10aSais6VtLUMJEdMJrk93mwUA585JqL0yA3tG1O0zwZUmG64BzcsUnePjKQKwnSoyVRQTW5nrrmln453y+HiRZZn3D1nbp7jSLXBulw3scqqPGymPk4HKEngeGcDJxxr4sWe2NqcZ4CPC/hXXxsmYaZ0LDLaAkuuvuLPzlF1Qz5gB5Kq+qW56tcX5aUyXrOhuGbqxEOH3GtxWN085SD3yRgkV3U8PSlXrYenkkmrvnacfhn0Xwz5lkldpGhWa9QrtLkNW4uvtxl7ipIR95UvpSlfyiOnHAddeHT0myQdMy51sbfbgMPSXXQreUvfSpXKEAknnBwKlbC5bnbZDctBYMAoT2PyAARudGAOaqdYuGyu9kfOuf+Y5XHClGSkldLeireuvj8itiXOsIbjJkW+13i5RUgFyREi7zaeGSMkjeI6d3ODwqattxhXG2NXOHIQ7EdRvpc5hjpznmxg5zzYrz6QabY0xZ2mkBCEQ2d1I5h3APtqkKDqNj+pExgoFMmcMJ6Ecud7H7OausNRrScIK1pKN73yd1d+nIndTyRZGtZQ321SodpvUy3pJzNYh7zRA51JGd5SfCAalLHerde25Dttf5dqO9yKnAO5UrdCu5PSMKFem2BgW6IIe7yAZRyO5zbu6N3HkqtbORFS/qcQt3kBfHdzd5u9TnHlzWUoUZ06koxacbWz8bZ+PwIyaZbaUpXAUFdM+LGnQn4UxpL0aQ2pp1tXMpKhgjzV3UonbMH4j15p93S+rrjY3VFQivENrI79s8UK8qSKVv+2PZ0NUaqZujQKT2GhteDjJSpf2YpX2eH2pRlSi5vO2Z9BSxtNwTk8zXaUpXxh8+KUpQEppW6JsuoIlzUyXksKJUgHBIIIOPDxr0a4vjeob+u4NMLYb5NLaUrIKsDPE48dQdK1VeapcK/s3v5mnElubnLUuFp1i1C0LJ08qE4t51LiEOhQ3QF9J6cjJqN2fcNa2n9Y/8AE1A8Okivptam3ErbWUrScpUk4IPWK0/FTcoOWe7a3kW40m4t/wDJettv9aY36mn+NVeTTWsmrTo+bZFQnHHXuU5NwKASN9OOPTw8FVSZKkTJCpEuQ4+8rnW6sqUfKa6avPGz48q1PK5aWIlxXUjlc9lkm/Ft3hz+T5TsZ5Dm5nG9g82amdoOpGdS3RiSxGcYbZZ5MBwgqJJyTwqtZHWPPSsI15xpuknkzJVJKDgtGXLSGs2rFpubanITjzjqlqaWlQABUnHdeboqv6VITqa1ZOAJjPH9sVG5HWKA4OUniOkHmqzxM5bilmo6FnVk91PkaTt1I7OtQzx5N32pqG0PrFnTtonQXYTj6n1FbakKAAJTjBz0eKqtNmSprodmynpDgASFOuFRA6smujI6xW9XHSeJdenk39LGk8S3WdSGR2xHjHlMyAkKLTiXAOvBBx6qs20PVbOp3IRYiOR0RkrzyigSSrGeboGKqlK5o1pxpypp5O1/IxVSUYuK0YqNn2luXfLZdVPrQu3h0JbCQQvlEhJyejGKkqVWE5Qd4vqvVWf6FU7HDiEONqbcQlaFApUlQyCDzg1BaN0xF0uic1CkvOtSnw6hDn90AMBAPSAOuvdCvdrmXiZaI0xDk6GAZDQByjPh5jz9HNUhWm/WpRdJ3SlZtdeaF2sitDTc+3yX16dvht0eQ4XVxHoqX2kLUcqUjJBTk8cZxmvdp+xN2t6VMelvT7jMKTJlvABSgkdylKRwSkdAFS9KmeLqzi4t665K7+Ltd+bJ3myBj2KdCv8AKn2+7hmHNfTIlRHIwXvLCQk7i8gpyAM8DTVul4mo3IC5L7rJiOlR5MA8qg4Km1Z+Sd0eap6lSsXWjNVE7SWV7Lpbzy6jed7kbqmztX6zP2115yOXFJW282O6aWlQUlQ8IIrvtNvYttni2tkbzEdlLI3h3wAwc+Pjnx16xxOK8tsuEO5MLfhPcq2h1bKjukYWg4UOPUapxKjpbn/Kd/N//CLu1iCjabulrbMSw6hVDt+8S3Gfhpf5AE5w2okEDqBzipXTdmj2SM4hp16S++6X5Ml85cfcPOpWPMAOAFSVKtUxVWpFxk9dckm/i0rvzJcmyO01am7JZWLW08t5DJWQtSQCd5ZVzDx1xCtLcW/3K7pfWpc5tlCmykYRyYIBB6c5qSpVHWqNyk3nLXxzv80RdkPabC1abzIm26QtiJJO+9BCQWuV+kR8wnpA4GvmFp5mNpmZY0ynFNyjIKnSkbyeWUonA5uG9U1SrPE1ZZt9P00G8zotsZMGBFiJWVpjtIaCiMFQSAM+qo+22xFkskxhpLk8KdkSS1ugKcLiiotjo6cDPPUvSqKrLNPm7v8AnmLmfWdjS67OHYOr7harYQS7bzcENiPnvmzvDfRg5GAfFUpsuitMWq4yokYxoEy4uPQkFJT95ASlKsHjg7pIzVhftVrkSRJftkF58HIdcjoUvzkZr2V218dxKcoK/tdWvpm/F5lnK6FKUrzigpSlAKUpQClKUApSlAK+2m1uuoabTvLWoJSOsk4FfFd0F8xZrEkJ3iy6lzHXgg/ZUq18yVrmbGzA05oGwty5zKX5asJLnJhTji8ZITnmA8nhqm691ZadRWdlmLBdjSm3wolaE8UYI74Hrxwq763sydaadhy7TKaK0HlWSo9ysKGCknoP2isx1BpG72K3Im3EMISt0NJQhzeUTgnPAYxwr6HaLrU4unSj/atql+56mLdSC3YL2LF42XRo7ugJ7jrDS1h57ClIBI+9p6apezS2Q7tqqNFnJDjKW1OFs8yykcAfB0+Srzsp/s9uH6Z//LTWa6VhXabdWk2QkTWkl1BCwgjGM4J4dPNXPWso4Z7t8tOuhlUso0Xa5rWq9Qq06/2MNKOSLclIJfQEhvwjASQMeHFZLZLcu+6iZgMfeuynjxx3iclRPkFbNoyTquQl5nUtvYaQlGEOggKcPSCkEjGOnh4qziHOtti2qOSGShEBuUtslPeoChg48AJPkFb7QhxJU6k29xu1mrNdfI1xUd9wlJ+y3o1axebpP0toKKxEbgb77id4JbQFOKHNvKUfD/8AQrPNoV/tt/lRJVviuRyhpSXkrQkEnII4jn4VeNpej5moJUe6Wp1lxwNBtTa14Ck5JCknm6azfUunrhp5yM3cCyHX0FaUtq3t3BxxNU2pLER3qe5amrWy/crjHVV4btomk2OzWLRmmUXi8sodlrSkrUpG+oKVxCEA83j8dei0X3S2tVOWt+3br24VJQ+2kKIHOUqSeBHnrsvUNrXeh467fIbQ8ClxO8eCXAMKQrHNzn1VE7O9DXK0XtN1ui2W+RSoNttr3iokYyTzAYzXelVhUhTowTpNLlr1udKU4zjCnG8GUDWNlVYNQSLdvlbacLaWedSDzZ8POPJUPVo2oXRi66ufcirC2WEJYSscyinOSPBkkeSqvXzOKjCNaShpd2PIrKKqNR0uK8OoLmzZbJMur/FEVlTm784jmT5TgeWvdVN12iVfL3bNLwH2mSk/GMtxxvlEJQ2fvaVJyM7y+jPRVsJSjVrJTyjq/gs3/OpSKuyKFte0ta7DqaT+NtvqN5V0qRKIKyfqKKPNWgT5ceBBfmynAiPHbU64voCQMk1XLpYtU3O3SbfM1Ha1x5LamnU/FJ4pVz/3lQ/KT7xsjvFpcSp27W9lyDIR8pamiCD+0gA+GvRqQji9ycppves7XyjJ3WqWjv6pF37XMmYU7WVzhouUOHZ4TDqeUYiSy4p5aDxTvqTwQSOjBxmvfb7/ANkaZevD9ulsOx0uB+JuFTgWjgUp+dk8xHPmvdZJ0W5WWLcIbqXIzrKVJWDwAxxB6scx6sVC3bVjQ0TcdR2lCn0xt9DKnUkIWUqCN8daATnPTiubddafDVK3tJdLXys/j1eeRXV2sfKJOuXIQuCIVkTlHKC3qU6XcYzulzvQrH5uM17U6mt/3Gp1S4HEQzGD+5jK8nhueFW9wrwP2VCLSq5ah1RdZTSWuVdW3J7Gj4xnuUt44dXEk8KrgbcXsJtrrbalpjJYkuIAyS22/vK4eIHzV0xoUa+7p34xyTSs75XeumrV+tyySZZ40rXC46bgu32ZKSA4LdyjnL7vPu8p3u/joxjPDNeLZhOYGjJlyeKmI4nzH1lwYKE75UcjrAq3ImxHIQuaZLXYSkcsH94bm5z5zzYxWf2Fpy9bKNQtwG1b816eWUYwTvLJAx4ftqlJqtRlGUVFb0VdctcvL16kLNE3AuOrbxDRc7fGtECG8N+OzNDinnEHvVKKSAjPPjBwKldM3j43iP8ALRjEmxHjHlxyre5NwDPA9KSCCD1GoLTNp+N7BCnwdX6iLLjKe5RIb+9kAAoI5PgQeGD1V7dExrY3JvMi33OfcnVyUtSpEpQUFONoxhCgAFAAgEjpFVxNOlu1ElnHSyeWdrNv987oSSzPFp6+aq1JaW7jbYdpgNZUjMsuL5ZaVEHdCSN1GRjJySc8K5s2oNSagQ63bbdBt7kNZYmuzFLcRy6TxQ2E4KgBg7xI5wMV7dlwxoO0/UX/AJiq6tnX4vff+NyvaK0rulCVZRpr2HZa9Ws+vmS7Z5HqsF4uU9i6wpMSO1eLa5ySkIWSy4oo3m1Anjuq6ucV7NKXYXzT8S5hvknHUkOtZzybiSUrR5FA1G6b/rrqv9LF/wAmoe4XP7jrrqFkD71NYNytyPnSCQ242PCVlCseE1nLDRrSlTpx9pqLXmldfrfwSZFr5Is2nrs7dpN1UGUJhxZZix3ASS6UAb6j0YCjgY6jUvUXpO1/EunINtUd5xlocsr5zh7pZ8qialK4MRucWXD7vLy5+epR2vkKUpWJApSlAKUpQClKUApSlAKUpQClKUBJ2W/3izFXxbPdjpUcqQMKQT17p4V237U17vjSGblN5ZpCt9KA2lIBxjPAVD0rXj1FDc3nbpfIvxJ7u7fIlrXqO82yA5AgzVMxnCpS0BCTkkYPEjPMK8tnuc60TBLt0gsPBJTvBIPA84wa8dKjizy9p5aeHwI35ZZ6Fjna31RMjlh26uJQoYVySEoJHjAzVcpSlSrUqO85N/EmU5Tzk7k3ZtV6gtDIYg3JxDKe9bWAtKfECOHkryXy9XO9vofucoyFoSUo7kJCQeoAVH0qXXqOG45O3S+QdSbjut5Hvs95ulndU5bZrsYq74JOUq8YPA177rrDUlzjqjyro5yShhSG0hsKHUd0ZNQNKRr1Yx3FJ26XCqTS3U3YUpSsigrzswYjU9+e3HQmVISlDrvHeWlPejxDJr0UqVJq9nqBXmjQIcabKmx46G5EspL7ic5cKRgE+EDhXppRSaTSeoICVozTMmQ6+5akAvK3nUNurQ24ekqQlQSfNUyIsYQ+wxHZEbc5PkQgbm5jG7u82MdFd1K0nXq1ElOTdtLsltsgYWjtNQ5DbzFrRlpQW0hbq1ttqHMUoUopB8lS8KHFhQ0Q4rCGo7YKUtgdyASSRx8ZrvpSpXq1e/Jv4tsNt6kA3ozTDcjlkWloDf5TkeUXyO9nOeTzuZ8lTEKJGhIcRFZSylx1TywnpWo5Urxk130pUxFWorTk38W2G29SCnaP05MluynbalLrxy8WXVtB0/nBCgFeWpeDEiwYjcSFHajx2huoabTupSPAK7qUnXq1IqM5NpdWG2zot8OLb4bcOEwliO0CENp5k5OfaTXEGDEgpeTEYQyHnVPOBPylq75R8Jr0UqjnJ3u9dfEXOhiHFYlSZTLCUPyikvrHO4UjCc+IcKq96ir1Fqy1x3LPKaiWiSuS7LkNbqXFAYQhs57oE4UT1JFW+lbUcRKlJzWbtZPplb5aEp2FKUrnKilKUApSlAKUpQClKUApSoLXeomdMacfubiQ47+DjtE9+4eYeIc58ArSjSnWqKnBXbyRKV3ZH1qzVVl0xGS7dJW64sZbYbG8654h1eE4FZ1M21L5YiHp5Ja6C9JO8fIBgVld2uEy63B64XCQp+S8reWtXsHUB0Dory1+h4L+l8JSguOt+Xml5W/c7I0IrU1jt1zfydjelK/lp265v5OxvSlfy1mNsttxuj6mLZb5k51Kd9TcZhTqgnOMkJBOOI411zokuBKXEnRX4khvG+y+2ptacjIylQBHAiu7sHZ3ul6v6l+DDoal265v5OxvSlfy07dc38nY3pSv5azeDY73PhrmQLNcpcZBIU8xEccbTgZOVJBAwOeo8cRkU7B2d7per+o4MOhrHbrm/k7G9KV/LTt1zfydjelK/lrJ6U7A2d7per+pHCh0NY7dc38nY3pSv5aduub+Tsb0pX8tZfboE+5SexbdBlTXykq5KOypxeBzndSCcCuLhCmW6UqLcIciHIQAVNSGlNrSCMglKgCOFOwNne6Xq/qTwYdDUe3XN/J2N6Ur+Wnbrm/k7G9KV/LVDVo/VybV8bK0tfE28N8qZRt7oaCMZ3t7dxu4455q8cyxXuHATPmWW5xoat3dkPRHENHe73CiMHPRx41HYOzfdr1f1HBj0NI7dc38nY3pSv5aduub+Tsb0pX8tZPSp7A2d7per+pHCh0NY7dc38nY3pSv5aduub+Tsb0pX8tZPXrtdrud1dWza7bNnuITvLRFjrdUkZxkhIOBnpp2Bs73S9X9SeFDoab265v5OxvSlfy07dc38nY3pSv5ayuSw/FkORpLLrD7Silxt1BStChzgg8QfAa66dgbO90vV/UcKHQ1jt1zfydjelK/lp265v5OxvSlfy1k9KdgbO90vV/UjhQ6Gsduub+Tsb0pX8tO3XN/J2N6Ur+WsnpTsDZ3ul6v6jhQ6Gsduub+Tsb0pX8tO3XN/J2N6Ur+WsnpTsDZ3ul6v6jhQ6Gsduub+Tsb0pX8tO3XN/J2N6Ur+WsnpTsDZ3ul6v6jhQ6Gsduub+Tsb0pX8tO3XN/J2N6Ur+WsnpTsDZ3ul6v6jhQ6Gsduub+Tsb0pX8tO3XN/J2N6Ur+WsnqWsOnrpeVgxWN1jPF9zgge/wAlZ1di7LpR36lNJeLf1DpwXI0Lt1Tfydjekq/lq1ae1pfbk1y8ywxoDKhlG88pS1eHdwMDx1WtN6Stto3XlJ7Llj+9cTwSfzU9Hj56sNfKbQns9+xhaXm7/or/AD9DKShyRNfdFL+gY9fvp90Uv6Bj1++q3NnMRRhR3l9CE8/l6qijIuF0kpixWnXFuHCGWElSleQcTXlKhF8im4i2ytZljILbC1/NRk/bUevXlxKjuQooT0Z3ifbU3pnY7qS5BLt0cZtDB47rn3x7H1RwHlNaRYdkmkLaEqlR37o6OdUpzuf3E4HnzW8cEnyNY4dvkY6zri7POBtqBGdWfkoStR8wNWmwytV3BSeU0bcy2f7xpspA8i8e2tut1ut9uaDVvgxYiB0MtJR7BXqPHn4+OtfwFN6mqwseZksuLJiO8lKYcYcxndWMHFdNanebbHukMsPpAPOheOKD1j3VmMuO7FlORnk7rjailQrzcVhXQeWjOWtR4b8DqpSlchgKxf4Rc1xV0tNtBIabYW+R0FSlbvsT662isM+ER/Wy3/qP/wAiq+g/piKltCLfJP5G1DvmaUpSv007TR/g06p+5LbNYZzrvJxJbvYErJwNx7uQT4l7h8laB8O7TvxbtGtmpG2ylm7QeTdVjndYOD/2KR5q/PKSpKgpCilYOUqHOCOY1+39YWPt7bEdC3ZhAclGfDdlkc6E73Iyx5O6P7NclZqnVjU5aM6KftwcPMg708dlnwLYsNJ5C6XmIlrgcHlZZK1nxpbKvMKx3Z/8HvVWpNLNaout1tOl7M8gOMPXJZCloPer3eASk9G8QTw4Vdfh0amjyNX6f0a2oCHa2RKloT0KcISkeRtJP7dbB8JTtdjZ3ZnNbR789p1MlHIfE5whKi2eTK8EDdxnd6M1hGcoRTWsm2auMZN30iflfa1sS1Xs8tbF7kSYF4sjykpTPgKJSgq73fSeIB6FAkdGeavfpD4PeuNV6FtWrrLKtL0a5KSG46nFpdbSXCgrX3O7hOCo4JOObJ4Vr0rWGiU/Bzu2mNM6S1/I085bpIiTZltU4w3klQUXSrAQlfHPMMVOaJv1w0x8B5i+Wt3kp0a0Plhwc7a1PrSFDwjeyPFV3XqqK63sVVKG94WuZ5ofZdrjZTttscCx3XTtyu9ztUtxtUxt9EdtCN0LB3e6J5sHz16EaE1Nrz4V0xWrF6c7JsZt8u5sRi7yEhrdSUobCwST3uQrA56qnwQ7pc7pt+trlzuU2etFvmbqpUhbpGUgnBUTjJqx6/UofD0t4CiAblb84PP/AKMikt5Tabz3dQt3dTSyua98KZ/aHA0ddrjp28WOLptm0OoucSQypcl/fyhXJnGAN1QxxHHNZRtxe2kH4N9kN/TpP7n3UW4MdgmR2WByYLe9v9xzDuseSor4fK1jaXZUhagk2IZAJwfv7vRV6+En/wDp/pf9Fav8is6Ud2NPxZeb3nLwRjOzTYJqrWOmRqiXcbZpyxqTvNy7isguIzjfCRjCc9KiM9Ga6tqmwrVWhNPo1Kmdbr/Yju7823qJDQUcJUpJ+STw3gSOvFfp7bInQJ2D2JzVjF7f0shMMoFnOCByX3srwR975vBndqn6Z1hs+ibEbvpzSej9oM/TUqNLAkv21T7LZUghf3zewEpVxPUcmrxxFR+0tL9P36lXRgsjBNjWxnVm08SJVqVGgWuMvk3Z0ve3CvGShCUjKlAEE8wGRxr9J/Bq2N33Zpri73CXdbZdrdMt4YbkRFEFLqXQSlSTzcOkE+So7QSp7XwF3HNLcp8Z/FcorMXPKb/Lq5UjHHe3N7m41UfgAqup1NqcNF82fsNouYJ5LsjfO74N7d3s9OMVFac5wm75LKxNOMYSjlmzFtu/9tWs/wDjUj+M1S6um3f+2rWf/GpH8Zql13U+4vgck+8xSlKuVFKUoBSlKAUruhxZMx0NRI7r6z8ltJVVotOgbrJwuc61CbPOnv1+YcB565cRjKGGV6s0vn6akOSWpUTwqXsmm7vdyFRopQyf753uUeTr8laTZtI2S2FK0x+yXh/eP90c+Acwqer53F/1Ku7h4+b+n8+Bm6vQqdi0NbIO67OPZ7444UMNg/V6fLVrSlKUhKUhKQMAAYAFc0JABJIAHOTXzOIxVbEy3qsrsybb1BIAyTgVETrmtxYjwgpSlHdCkjJUepIr32m2XfV11+KrIwVoHF108EIT85augeDnNbts/wBnlm0o2iQEibc8d1LcT3vgbHyR4efw0pUXLM0p0nMzPQ+yC6XTcm6jdctsVXdBgcZCx4c8EeXJ8FbRpvTdk05G5Cz29qMCMLcAy4v6yzxNS1K7YU4x0OuFOMdBSlKuXFKUoBVE2gsJbu7TyeBeZyrxpOM+yr3VJ2jfj0P9Cr+KuLaC/sPyOfFf4yq0pSvBPMFYZ8Ij+tlv/Uf/AJFVudULaNYLXebs05PYUtaGAlK0uFJAyTjh4a9jYWLhhMWqs72s9DWi7Sufn6laXJ2eWteTHmy2fArdWPYKjJGzmWM9j3RhfgcaKfZmvvae3cDP/u3xTOviRKPWs7JNvWq9m2ll6dtVttU+IZK5CDMDm82VgbyRuqHDIz4yapz+g9QN53ERXvqPY9uK8L2lNRNd9an1DrQQr2Gur8bg6ytxIvzRpGpuu6ZzrzU9x1nq+5anuwbTLuDvKLQ3ncQAkJCU5ycAADjWmbN/hFat0nphvTNwtlt1JamWw2w3OKgttA5kbwyFJHQFAkc2cVkr1ouzP4W2TEeNlXuryrZeR37LqPrIIro/tVI2yaJjUad0zWtq237VuvNP/c4mDb7FZVbodjQt4l4DiEqUcdxkDuQBzcc1Ht7aNQo2NHZaLXazajGMfsnDnL7pc5TPfbuc8ObmrMcjrpvJ+cPPVlRgkkkS6km73LVst1vctnusWdT2qJElSmmXGQ3J3uTIWME9yQc8OupK87T7zddsLG05+329F0ZfYfTGRv8AIEtNhCQcnewQOPGqHkddc1Lpxbu1mQpNKxddse0e77UL/EvN6gwYT0WH2IhETf3SnfUrJ3iTnKjUxrjbRqHV2zW3aDn2u1sQIAjBt9kOcqrkE7qc5URxHPwrMq4yOsU4cclbTQnflnnqbBss+EBq3Q2nRpt6Bb7/AGZAKWY87eCmUn5CVDOUfmkHHRgV27S/hDas1hpdzTEO2WzTtoeRyb7UHeUtxHSjeOAlJ6QAM82cVjW8n5w89cjjzcarwKe9vWzJ4s7WuabsY21aq2YNSINuajXK1SF8quFKKglDnMVoUniknAzwIOObPGro/wDCs1q3dWpFr09p+BBQhYXCCFqS6tWO7UsbpyMcAAOc5zwxgbcaS5+DjPr+q2o/ZXsYsV6e/BWmaodfJED11nUjh096dvNhVpRVkz71ffJOptVXTUUxplmTcpS5TrbWdxKlnJCc5OPHUXU+xo3Ubv8A6fyQ/wB44lP21Ixtnt3XgvyobI8ClLPqFYz2lg6as6i9b/Iyc1zZT6VokXZzHGDKujy+sNNBPrOalomidPR8FUVyQR0vOk+oYFcVX+ocHDuty+C+tirqRMlHE4HE9Q56k4Gn71OwY1tkKSflKTuJ85xWww7dAhjESFGY+o2AfPXqPHn415lb+p5f+Kn6v9l9Srq9DNbfs9uLuFTpjEZPSlsFxX2CrJbdD2KJhTrTkxY6Xldz+6MCrNSvIr7ZxlfJzsvDL7/qUc2zrjsMxmg1HZbZbHyW0hI9VdlKV5jbbuygpSvl1xDTZW4oJSOcmoB9EgAkkADiSa9Gk9P3DW13NvgKLFvZwZcspyEjqHWT0DynhXfozSV21xLy0FwrM2rD0pSe/wAc6Uj5SvUOnqr9A6fs1usNqatlrjpYjtDgBxKj0qUelR666qNDezZvSpb2b0PjTNhtmnbU3bbVHDLKeKieK3FdKlHpNSdKV3JWOxKwpSlAKUpQClfLrjbTZcdWltA51KIAHlNV25a50vBJSu6IfWPkx0lz1jh66rKcY952IlJR1ZZKpO0b8eh/oVfxV5pG1SyoJDFvuDw6zuI+01E3LU7Op3EPsxHIwYBbIWsKzk5zwrgxtenKk4xeZyYirCUGkzyUpSvFOAVV9WAi5JOOBaGPOatFU7XtwbiXCM2pta1FkngRjvjW+H75eGp4KVEfHYKt1EYqPVv8fZUjBY1FOI7C05cHweYoYWR58V3KDZsk2d1Kko+k9dvjKNKSEj/eOJR7TXva0DrtfPYoyPrTmxVuFPoW4cuhXwSOYkVwePPx8dWYbPdbfKtEXyXBuvo7PtYpHG0Nn6sxpX204U+g4cuhU1x46+/YZV9ZsH7K6VW23K763xD42E+6rW7ojVjffWKSR1oUhXsVXhk6fv0YZfstwbHWY6vsFT/cj1RG7JciuqstnUMG1Qj/AICfdXz8RWX/AGTB/wCgmpN1tbSil1C2yOcLSU+2vmp/EVV/0/VkXZHfEVl/2TB/6Ca+k2a0JGE2uEP8BPur30p+Iq/mfqxdnmRbrejvYERPiYT7q7kMso7xlpP1UAV90rNzk9WQcgkcxx4q4pSqgUpSgFKUoBSlKAUpSgFKVZtO6G1BewhxDAgxVf6xJBAx1pRzq9Q8NWjFydkSouTsiqPvJa3U7qluLO622gZUs9QHTV80RssmXN1u56uCo8Yd01bkKwtX6QjvfEOPirQ9H6Ismmj2RHaVKuBGFzJGC54k9CB4B5zVmrtpYdRzkdVOglnI6okdiJGbjRWW2GGkhLbbaQlKR1ADmrtpSuk6BSlKAUpVZ1trGBptrksCTPWnKI4Pe9SlnoHrNVnOMFeREpKKuyeuM6Hboipc6S1HYRzrcVgeIdZ8ArNtS7UFEqYsEYAc3ZMhPrSj3+aqPdrneNS3HlZbq5DnyG08ENjwDmA8Ne+32FpsBctQdX8wd6PfXlV8e3lHI4KmKlLKORGzZt6vz5XKkSpqs8yiSlPk5hXaxp+WsAuuNNDq74+qrMhCEICEJSlI5gBgVzXnyqNu5ytt6kGjTjWO7lOE/mpAqRtsBqAhaGlrUFkE73ir10qjk2QKUpUAVPaZ0hp2+oVcbvbUTH2l8kjlFq3Ann70HB4moGr5s9/od79OfYK7dnpOtn0OjDJOpmS9utFptyQm32yFFA5uRYSn1gZr3EkjBJI8dcUr3j0xgdVKUoBSlKAYFcgkcxI8VcUoD4eZaeTuvNNujqWgKHrqGnaR01NyX7LE3j8ptHJnzpxU5SoaT1DSepRLhsusD+TEfmw1dACw4nzK4+uq3c9ll3ZyqBOiS0jmSvLSvXkeutfpWUqEHyM3Rg+R+dbrpq/WvJnWqU2gfLCN9HnTkVE9OK/UHiqNuVgslxz2daob5Pyi0ArzjBrGWF6MyeH6M/ONK22bs00zIyWUS4pP0T2QPIrNQ8rZNHOTFvbyeoOsA+sEVk8NURm6E0ZVStFd2UXIfgrvCWPzm1p99dCtld+HezrafGpY/wDGq8Gp0K8KfQoNK0FGym8k93crekeALP2V64+yZ8kdkXxodfJxyfaaKhU6DhT6GZ0rYYeyuyNkGVOnSOsApbHqBNT9u0ZpiAQpm0MLWPlvZcP/AHVosNN6l1h5PUwu22u43Nzk7fBkSlf7pskefmFXKybL7xKKV3SQzAb6UJ++OergPPWwtoQ2gIbQlCBzJSMAeQVzW0cLFa5mscPFald09ouwWUpcYiCRIT/fyO7UD4BzDyCrFSldCioqyNkktBSlKkkUpSgFKVn+vdoDNv5S3WRaHpgylyQOKGfF85XqHhqlSpGmryKznGCuyS2g6yY0/HVEiFD1zcT3KOcMg/KV9g6fFWRw4cy8S3Jcl1auUWVOvLOVLPTjrNd9stb054zbgtxQcVvnfJKnCekmrEhKUJCEJCUgYAA4CvCxOJdVnl1arqPM6ocViI0G2EBI6T0nxmu6lK5DIUr0xoUmRjk2iE/OVwFS0O0stYU8eVX1fJHvrSFKUtC8YORGW+3uyiFHKGulR6fFXbfGW2FMNtJ3UhB8vGp8AAYAwKhNR/h2fqH21vOkoU2aTgoxIqlKVyGAq/bPwPiNZ/36vYKoNX7Z/wD0Er9Ov2Cu7Z/+byOnC/5CxUpSvdPSFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKVwpSUpKlKCUgZJJwBQHNeW6XGFa4apc+SiOyn5SjznqA5yfAKrWotcwIQUxbQma+OG/nDST4/leTz1TlR73qKUJc11e70LcGEpHUlNc9TEKOUc2YzrJZRzZ1a017PvJXAtKHokJXckgHlXvAcd6PAPLUbY9OSE7r8qM4pXOlvcOE+Pw+CrvarREt4Cm0lbvS4rn8nVUhXm1IyqO8mckoObvJlaRbZqv7hQ+sQK727NJV3620eXNT1KzWHgQqMSLasrI4uvLX4EjFexiFFZ4tspz1nifXXopWsacY6IuoRWiFKUq5cVCaj/AA7P1D7am6hNR/h2fqH21jX7jMqvdIqlKVwHKKvuz5WbK4Op9XsFUKuz43vMRkQLW842lwlauSRlZPNz9HNXXgpqFW7N6ElGd2ay860yjfecQ0n5y1BI9dRMvVWn4xIXdGFEdDeVn1Cs2FjvM9fKzHCCflPuFSvNxr3x9KMgff5jivAhIA9dem8U+SOt15PRFnf19Y0HDaJj3iaA9pryubRYI7y2Sj9ZaR76j2tO2pvnZW4fz3D9lelu021HewWPKnPtqjxFQrxJn32x4v8Asp7/AKyfdX0jaNCPf2yQPE6k1ymFDTzRI4/w0+6vrsaN/wC3Z/6Y91PxFTqOJPqdzO0Kyq/CMTG/2Eq9hr3x9Z6de/18tH/eNqT9lRJiRDzxWD420+6updtt6++hRz/hipWJmiyqzLfEutsl/i1wiunqS6M+avZ0ZrPnLFaV8TCQD1pJH219x7d2KcwrhcIuOhEgkeY5FaLFdUWVZ80X6lVSNcLzHwFTWZaep5ndV+8kj2VJxr4DgSYymz0ltW+PsNaxrwZoqkWTFK8zM+I8QEPoyehXA+uvSDkZHGtU09C6aYpSlSBSlKAUpSgFKUHHm40ApXmm3CDCBMuZHY/SOAHzc9Q8jVtuGUwmZc9fRyLJCf3lYFVlOMdWQ5JassNdch9mM0XpDrbTY51rUEgeU1T5V61LMymMxEtjZ+UtXKue4VGrsvZboeus+VPc/PVhI8QrCWJitMzJ1lyRMXfXdvYUWbYyue/zAgFKM+0+QVXJidSagV/+Rf7GjE5DXepH7I5/LU3Fixoqd2Ow20PzU8T5a7q5p1ZT1MZSlLVkXbbFAhkL3OWdHy3OOPEOYVKUpWZFrClKUJFKUoBSlKAUpSgFQmo/w7P1D7am6hNR/h2fqH21jX7jMqvdIqlKVwHKKn9P/iJPTvn7KgKsGn/xA/pD9lb4fvmtHvEhSlK7jqFKUoBSlKAUpSgFKUoBSlKAV9odcb7xxafErFfFKA9aLjNRzPqP1gDXam7yxz8mrxpqPpV1UmuZO8+pKC9P9LLZ8prkXpzpjo/eNRVKtxp9Sd+XUklXqX8lqOPHvH7a6l3a4K71bCP8In7a8VKjjT6jfl1O9ydcl889xP6NtCfsNeR5tT/4xKlvDqXIVjzAgV2UqrnJ6sq22dDUOI0d5qKylXWEDPnrvpSqkClKUJFKUoBSlKAUpSgFKUoBSlKAUpSgFQmo/wAOz9Q+2puoTUn4dn6h9tY1+4zKr3SKpSlcByirBp/8QP6Q/ZVfqwaf/ED+kP2Vvh++a0e8SFKUruOoUpSgFKUHHmoBSut59hgZefaaHWtYT7aj39RWNjv7nHyOhKir2VDaRDaRKUqvr1jYwcNuyHj/ALtgmvj7rY6vwNruTn+GE+01VziuZXfj1LHSq590757yxSv2nkCn3RzSeFlOPDJT7qjiw6kcSPUsdKrn3Rzv9jf/ANSfdXP3SSx31lcP1ZKfdTiw6jiR6lipVc+6d0d9Y5o8TiDQ6saT39ouSf2AftpxIdSeJHqWOlVv7srcO/h3FHjY/wDuuRrSyfK7LT42D76tvx6jfj1LHSq+nWVgV/rLo8bKq7E6tsB/17HjaV7qby6k78epOUqHTqiwK5rk15UqH2V9p1HYj/6pG8qiPsqd5dRvLqStKjhfbKTgXWGf8UV9i82gjIucP/qil0TvI91K8KrxaUo31XOElPWX0ge2uE3qzq727W8/8yj31Iue+leL44tH+1bf6Uj318qvdmScG728H9ZR76A99KjVagsSThV5t4/5hPvrpXqnTSO+v1uH+OKAmKVX3Na6Vb575FP1d5XsFeR7aHpNvmuLjn6OOs/YKWYui10qjSNqOnW/wTFwe8TQT7TUZK2ssjPYlkdV4XnwPYDU2YujTKVjc3alfnciNFgRh17iln1moK4ay1POBS9eZKUn5LRDY/7cVO6yN5G8zp0OC2XJstiMkdLrgT7aq132j6bhBSY7zs9wcwYRhP7ysD21iTri3XN91anFn5S1FR85rsZiyXvwbK1eHGBTdRG8XW97Tr3M3m7c0zbmz8offHPOeA8gr17OZcqbGuEiZJdkOqfTlbiyonufDVOj2ZxWC+4EDqTxNXrQ0ZmNCkoZTgFxJJJyTwrHENcNpGVR3RYaUpXnGAqwaf8AxA/pD9lV+p+wEC3qJIACyT4OArfD981o94kaVAXfVlpgEtocMt4fIZOQPGrm9tVG6awu8zKWFphtnoa77948fNiut1Io2lUijRps2JCRvy5LTCfz1AZ8nPVen62tTGUxm35ausDcT5zx9VUSNEm3B0uJStwk9064eHnNTUKwR28KkrLyvmjgn3msZV7GTrPkd0jWl3lLLcGKyznm3UlxXr4equhX3S3D8auDzSD8kubvqTUuy00yjcZbS2nqSMV91g60mZucnzIZrT7BO9JfdeV09HvNe5m2QGe8it561DePrr10rNybKnCEpQMISlI8AxXNKVAFKUoBSlKAUpSgGT1muCAecA+MVzSgOtTDCu+ZaPjQK6lQISu+iMn9gV6aUuDxKtNuV/qqB4iRXWqyW48zS0+Jw123K6W+2o3pspto9CScqPiA41VblrZ15ZYs8NRUeZx0ZPkSPtNawhOehZRbJ2VZ7Wwyp559bDY51LcAA89Va4S4Ti1M2blpChwLzqQG0/aa8a40ye8JF3luPr6Eb3AfYPJXtQlKEhCEhKRzACumFFR1dy6glqRLtnceXykict5zrUgYHiHMK+FWNXQ+2fGipqlbbzLkEbG70OMnyGvk2WSOYsny/wD1U/Sp3mTcr/xPLHMGv3qfFEz/AHf71WClN5i5AC0TOtsftVyLNKPOtoeU+6p6lN5i5BiyvdLzY8hrsTZD8qSPIipilN5i5GIsrA751xXiwK7m7XCTztlX1lGvbSouyDqajsNfg2W0+JNdtKVAFWTSH4rI/SD2VW6smkPxWR+kHsrGv3Cs9CcpSlcRiKou0yfNbksQG5TqIq2t9bSVYSpWSMnHPwq9VSNfwXJd6inO60GMFX7R4CujDd8vT1KfBenIWG4bi8/RkbyfN0eTFWuyy4zBCr1Fcz85nu2x4x33trzRo7UZvcaQAOk9J8ddtdU4xlyNGky7W+dAmNjsKSw6kfJQoZHk5xXqrOXYzDqt9TYCxzLT3Kh5RXpjzbxEwI10cWgfIkJDg8/PXPLD9GUdPoX2lVFjVVwa4TLUh0dKo7uD5jXuY1hZ1YD/AGTFV1OsnHnGaydGa5FXBlgpXgjXu0SMcjcoqs9HKAH117W3G3BltxCx+aoH2Vm01qRY+qVzg9R81cceo1BApSucHqPmoDilcKISMqISOsnFeWRdLbH/AA9wit+AujNSk3oD10qBlavsTGd2Ut89TTZPrOBUPM163ndh29Sj0F5zHqHvrSNGb5FlBsu1dMuVGiN8pKkNMJ63FAVS4zm0DUR3LXa7ipCubsSIoD97H21L23YrtDuiw9KtimM86pL6Qr1nPqrpp4CpPl6I1jh5y0R1XLW1rj5TEQ7LWOkDcR5zx9VV2Zqa/wB0JRG/0Zo9DIx51HjWrWj4PF6wlUy4Wxk9PFbpHkwBVqg7A4aAnszUcheOdLEZKB6ya76ey6vKHqdEcFU/KfnNi0FS+UmPFajxIByT4yak2WW2UbjTaUDwDnr9KxNiGjmgOWdukk9O/ICR/wBqRUtF2T6CYAzYkvEdLr7iv/LFdK2XXlq0bLA1X0PyvXG8n5yfPX67jaA0XH4taYtYPWpgKPrqQa0zpxr8FYbWj6sRsfZWi2RPnJF1s+XNn403k/OT56byfnJ89ftVFrtiBhFuiJ8TCR9ld3Ysb/27P7gq3Y7/AD/p9y3Zz/N+h+JN5Pzk+em8n5yfPX7b7Fjf+3a/cFcLhQ1gBcVhWObLYP2VPY7/AD/p9x2c/wA36H4l3k/OT565BB5iD5a/aLtkszoIdtMBzPPvRkH7K8UjR+lJAw9py0q/5RA9gqr2RPlIh7Pl+Y/HmD1VxX6xk7MtCP539NQ05+i3m/4SKiZmxjQ7+eTizY2fopauHkVms5bJrLRoo8BUWjR+ZKVv87YNZlk9hX24MdQdbQ57Amq9cdg98ayYF7t8kDmDra2ifNvCsJbPxEf+TKWErLkZDSrvdNlOuoAKjZeykD5UV5LmfJkH1VVLnarpbFlFytsyGodD7Cke0VzTpVId6LRjKnOOqPHSg4jI4jwUrMoKsmkPxWR+kHsqt1ZNIfisj9IPZWNfuFZ6E5SlK4jEVW9X/jcf9Ef4qslVvV/43H/RH+KtqHfLw1IOlKV2mopSlAKEAjBGR4aUoDociRXO/jtn9muo2yGOKELbP5iyK9lDwGTwFTdg8qYjiPwVwnN+J819hFwGN29Txjm++H31YLBpXUd+UPimzTJSCccoG91sftqwPXWh6f2F3yTuuXm5xLeg87bILzg8vBI9dbU8NVq92NzWFGpPuoxwpuajxvc4/tn31wzb7lMdDLVxuUhw8yGypaj5Aa/Uli2OaMt26uVGkXN0c5lOndz9VOB581eLZa7ba2eRtsCLDbxjdYaSgeoV309kzfeaR1QwEn3nY/Jdn2O6zvGFC2TWUH5cxwNDzK7r1VdrJ8G9xWFXe+tMjpRGbKz5zgeqv0VSu6nsyjHW7/ngdUMDTWuZltl2D6AgbqpMSVcljn7IfISfInFXWzaO0rZwBbNPWyKRzKRGTvfvEZqdpXXChSh3Yo6I0oR0QAAGAMClKVsaClKUApTIzjPGlAKUpQClKUApTIzjPEUoBSlKAUpkZx00oBSlKAV8uNocQUOIStJ50qGQa+qUBV71s+0bd95UuwQw4f7xlPJK86MVRr7sItL28uzXiXDV0NyEh5Hn4H21sNK56mEo1O9FGM6FOeqPy/f9kOtLXvLYhs3NofKiOZV+4rB82aitOxJcFMqPNivxnkuDLbzZQocOo1+tayPbp/TNt/V1/wAQrw9qbPp0aLqQfT5nnYzCRp03KLM7pSlfNnkiq3q/8bj/AKI/xVZKrer/AMbj/oj/ABVtQ75eGpB0pSu01FK74MOXPlJiwYr0p9XetMoK1HyCtJ0rsV1Lc9x67us2dg8d1X3x4j6oOB5T5K1pUKlV2grmkKU6ndRl/hqa07pXUOoVgWe0SpSCcF0J3Wx41nA9dfozS+ynR9j3HVQTcpKePKzDv4PgR3o81XhtCG0JQ2lKUJGAkDAA8VepR2TJ51Hb4HbTwDffZg+mthM53cd1Bd24yecsRE76vEVq4DyA1penNm2jrGUrjWdqQ+n++lffl+PuuA8gFW+lelSwVGlpE7aeGpw0RwlKUpCUgAAYAHMK5pSuo3FKUoBSlKAUpSgFKUoBSlKAzaGvk/hGX1ZyQjScRWM9Ul+vLE2wCRpKLrMaOvadMKaS5LuBWzmOM7qlclvb60IPOpI6CQCBmpJq13Ibcr5dTBkCA9piNHbk7n3tbofeJQD84BQOPCKrEXT98T8ERzTqrTMF4OnHGBBLZ5blClWEbvX4K6bRdr+BjeS08SWOqdVnb45Y2bLJes/xQysATmQ2EqkEGXu5zzdzu993PNxqW01tFVqC5zGoOnJybbbZ0mFcri++02zHWypQJAJ3nAQkE7o7kKGTkECO5G5Wba3aru/ZbnJgTtOsWvl4scuhh9L5WQ6BxQndVnePDgaaA0xcJGz3WNguLEi3Lut2vCW1OIweTfdWEOAdIIUCOsVDUbX+BKcrn2NqjirL91SNGX1WkdwvfGoLW9yGfw4j73K8ljus4zu8d3FS9/162xeYtj03Z5WpLpIhpnluK6220zGUcIccdWQkbxB3QMk4JxgZqnt3nVLey8aDVoO8nUibX8VBSWk/F5VyfJB/sjO6Gsd3jv8Ao3c192Sz3bZlqpqYq0XK/WiXp+32x2RbmOXejvxEqQN5oHeLa0qzvJzgjiOOabken3I3meHT+skW7We1fVc20XCMq02q3uyre9updSppp9SkgglByMEKBIIINaTqfV0exWO03V2G88i5TocNCEKSCgyFpQlRz0DeycVnC7BqfVsrasXrDIs41DY4sW1dlkAuYZfSN8gkJVvKGU5O6FJzxyK41RcdQ6n05pW0Q9DaiivwL1a3rmqXHDaI6Wnkb+4rJ5XiM7yMgJBJI4A2lCMpLy+SIUml/Oper5riQ1qWVpzTem52obhBbbdn8i+0w1GDgyhCnHCAXFDugkZ4YJxkVUdoO0K8ydM6cuel7PdGlPaijQpzLziIzzTiXwlUVYUcHf4jeSSnHHODUjHXc9B6+1VMkadu92tOoJLM6NKtkfslbTqWUNLZcQDvJ7wKSrBTgkEjFfGt/usvuhLXeJumHo8qDqKJcjbI7gekiGzICuIBwXdzuihJPUCTVYqKayLNtpkmi/2OLtAMu+WM2m9NaVM6ZNdkJWmNFS93TJKTg7qsq3gPLXnO1J1i1NakuWjL5A0q8ELF0dUyVNtLICXnGArlEN8Qc4JAOSBxxB6y03cdearupjwbhboV40I7Baky4ymuSfXIJShaTxCsYJTz4r61Jd9Ual2aytCN6FvUPUFwt5tshb7KRAjbyeTce7IB3VoAypITlR4DdHHEqMXb+WI3nmW7UevDbtYp0nbLBPvN0etguLCY7jaG1N8oUHeWsgIAwDk8+8AATUjobVbOp2bg0u3y7XcrXKMS4QZJSVsubqVjCkEpUlSVJUFA8Qeg8Kr9osU637aGZCY0hy2saQagpmKR3CnUSSd3Pzt3jjw16NAW24Q9o20GbKhPsRptwiLiurThLyUxG0qKT0gKBB8IqjUbZdCycrkZtX1Lqqza90XBsVnkzo0qU/yrbU1pkS1CM6eRO/zbuAvJ4cMc9TN41zJbvz2nrBpmdfbtEjtP3Btl9plqGHBlCFuuEArIBISnPDicAivJtXZnxr/o3Uka1T7lEs9yecmNQWS8+lDkV1oKS2OKgFKTnGSAc4qNiPXPReu9R3h7Tl5udn1IqPOZfgRS+9GeSylpbLrQO+BhKVBQBHEg4xxlJOKy5fuQ203mXPRGqoOqoUpyPHlQpkGSqJPgykhL0V5IBKVYJBBBBCkkgggg1P1Q9llqu4vOqtW3i3uWtzUE5p2PBdUkussMspaQXN0kBat0qKQTjIGc1fKymknkXi21mKyTbp/TNt/V1/xCtbrJNun9M239XX/EK8jbP+pLy+ZybQ/wPyM6pSlfGHz4qt6v/G4/6I/xVZKvuzHQ+n9QMKvN5iqmOR3Sy2ytX3rAAVkpHfHj08PBXZgaMq1bcib4em6k91GN6Y0vf9Sv8lZrY9JAOFO43WkeNZ4D21r2kdhkZrckanuKpCucxYhKUeIrPE+QCtljR2IrCGIzLbLSBhCG0hKUjqAHNXZX1VDZlKGc83+h7NLBQjnLMjrFYrPYoojWi3RoTXSGkYKvGec+WpGlK9FJRVkdiSSshSlKkkUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFDjmrhRASSTgDnrI9n1gh7TbCdbayMm4oub7q7bb1SXER4MVLikNhLaCAXFBO8pZycqwMAYq0Ypq70Kt2dka7wNKztDVx2ZW3Ul1kSpt40lEjolw4nKqfmxMZ5dAU4e7aCcLTvKKhhQ5sVZdR6rttmtdsnlL01F0mRocJEbdKnlvEbpGSBuhOVk54JSTUuD5De6k/wAOqlYrsp1lKt9n1DGiac1DqJcTUdzMlyEhCgynslZSkF1xO+rdwdxveIBHAZAq9P7RtOfcpadQwlyrk3eFhq2xYrBVJku8cthBxgp3Vb28QE7pyRiplSknYhTTVy4UwOqqrp7WrNxvirDc7LdbBduxzJajXBLZ7IaSQFKbcaWtCt0lOU72RvDIwahLLtbs1z0y/qpNmvUfTsaI5Ifub7TaW0qQcKaCd/fWvPDKUlORjeqOHLoTvo0XApVMtOvkyLvb7ddtLagsJuZKYD05potvKCSrcJacXyaykEhKwnOCOfhXxL2htKnXBmyaX1DqCPbXlMTJdvZaLSHE9+hHKOJU6pPMQ2FYPDn4U4chvIu1MDqqoXHaJp9iwWa7QTKuxvqgi1xITW8/KVgqUAlRATugHeKykJwc4NedvaRb2ot9+NbNeLTcbJbl3KRb5TbfKuR0hR32loWptYykp4K4HgcU4cug3kXelVm96zt1p0jA1LIjS1xZzkNtttCU8okyVoQjOTjgXBnj0HGa8N12hRYuspmkYFgvN2u8RlmQ41EQ0Ehpze++Fbi0pABTjBOSSMA8cQoSYcki6cDTA6qxPVurxY9P3J/RFnvQdOtUQ7k7y7awXi+yHQnlXOCXQrcSEgAHOdwca0ex6uZuGpl6bmWm4Wq6Jtrdx5GUWlbzalqQoBTa1AqQoAKwcd0nBOas6bSuQppuxZaVC6e1JDvl3vlvhMSN2zS0w3pCgOTceLaVqSg5yd0LSDkDicccVNVRprUuncVkm3T+mbb+rr/iFa3WSbdP6Ztv6uv+IV5O2f8AUl5fM4tof4H5GdUpSvjD58VsexD+rMr9cV/CmsaaWlxpDiDlK0hST1gjIrT9h1zQh2faXFAKcw+0M8+BuqH8Jr1NjzUcXG/O6OzASUa6uanSlK+0PoRSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoARkYIyKyfQU+XsztbmjNQWa9PW+A+6bTc4FvdmNyIy1qWhCwylSm3EbxSQoAHdBB41rFKtGVlZlWr5lK0k/qPUt0vVxvkF+3abkMIi261zGUpfcA3uVfdHfI394JCCcgJyQCaoWyuDcpWt7fpK5svqi7OUPtIddHCSt4lENY692LvZPQpVbe+3yrK2t5aN9JTvIOFDI5weg1D6Q0xbtMQ5DEFcuQ9KfMiVKlvqefkOEBO8tauJwlKUgcwAAFXVRJMq4ZozbZpqORpG03uBfdKakbU5frjIgKiWl2R2Yhclah3iTuKzzb+6CndIJB4V5zQN8g6V0dervZ7nI7ButxnXW12qW43KjtTlLUOTU0pKlKayneSk8QVYz0/oWlTxrO6Q4eVmZNoe1WCZruNcrHpjVCo9viO4u98nT0htxwBJaZYlKJUSAd5W6AMDBJ5vrZxb5sL4NsG3TtKO3aQmA6h+zSAGVyEl1e82QscCUkkA8/DmzmtXpUOq2SoWMV02ZkbWGno+gfu3btnLlF4g31iR2HFihtXBC5I3g6F7oSG1KB454caiLBp62aUF2s+qrLrx+ai4ypEGRZpVxVHntOuqcRuiO4G23Bvbqgvc4jOTnNfoGlTxmRwzF27DN0svQOp42kZsaBa2JzFxtMWQufIgiWUr5UE5U6QpPd7uT3ZxkCrJd7ncte6f1TZbRp2fFt8iyvxotxuLK4ipElxCkhCGnEhYQOGVqAGTgA4zWiUqHUvm1mSoWyMG1ReLhfNmGm9NwNJ6lFyiTbSLk2/bHW0xAw+zvnfUN1zinhyZVwyo4Aq96YgzGtt2tZ7sN9EV+22xDL6miEOFPL7wSrGCRkZA5sir9SjqXVkv5l9AoZ3MJuNmvKdF6udRZ7g6pnaCm6BlEdRcdjNyI61ONpxlY3UqI3c5wcZNWHatdWbdA09tat0Sc6zZHHBMZVFWy+5AfG44C2sJWClYaXggd6a1WoHVOlbdqV+Cbo7NXGiOh0w0SVIjyFJUlSeVQODgSpIIB4Z66lVU2rkOGWR4dkdklWLQcBm5AfGsvfn3JWOKpL6i65nxFW6PAkVbKUrKT3nculZWFZJt0/pm2/q6/4hWt1h21u5ouGrnGmlBTcNsMZHzuJV6zjyV4+25qOFafNr6nFtGSVG3UqFK8k24w4bqW5L6W1KTvAHqyR9hpXyChJ6I8JRbKrsT1G3qPZ3bni4FSobYiSRniFoAAJ8ad0+er/a50m2XBifDc5N9le8g9HiPgPNX4w2Ta7l6G1B2SEKkW6QAiZHBwVJ6FJ/OTxx18R01+ttP3m2X+1NXS0TG5cV0cFoPMfmqHOlQ6Qa9LaWDnha2/Hut3T6HXi6EqNTeWj0P0fo7Vdv1HDSWlpZmJH32Mo90k9Y60+Hz1YK/MLTjjTiXWlqbWk5SpJIIPgIqywte6pithtNz5ZI+nbSs+fnr0cNt5KNq0c+qOqjtJWtUXobzSsQ7ZOqPpono499O2Tqj6aJ6OPfXV27huj9PubdpUfE2+lYh2ydUfTRPRx76dsnVH00T0ce+nbuG6P0+47So+Jt9KxDtk6o+miejj307ZOqPpono499O3cN0fp9x2lR8Tb6ViHbJ1R9NE9HHvp2ydUfTRPRx76du4bo/T7jtKj4m30rEO2Tqj6aJ6OPfTtk6o+miejj307dw3R+n3HaVHxNvpWIdsnVH00T0ce+nbJ1R9NE9HHvp27huj9PuO0qPibfSsQ7ZOqPpono499O2Tqj6aJ6OPfTt3DdH6fcdpUfE2+lYh2ydUfTRPRx76dsnVH00T0ce+nbuG6P0+47So+Jt9KxDtk6o+miejj307ZOqPpono499O3cN0fp9x2lR8Tb6ViHbJ1R9NE9HHvp2ydUfTRPRx76du4bo/T7jtKj4m30rEO2Tqj6aJ6OPfTtk6o+miejj307dw3R+n3HaVHxNvpWIdsnVH00T0ce+nbJ1R9NE9HHvp27huj9PuO0qPibfSsQ7ZOqPpono499O2Tqj6aJ6OPfTt3DdH6fcdpUfE2+lYh2ydUfTRPRx76dsnVH00T0ce+nbuG6P0+47So+Jt9KxDtk6o+miejj307ZOqPpono499O3cN0fp9x2lR8Tb6ViHbJ1R9NE9HHvp2ydUfTRPRx76du4bo/T7jtKj4m30rEO2Tqj6aJ6OPfTtk6o+miejj307dw3R+n3HaVHxNvpWIHaTqjH4aIP8Alx76jrprPUtxbLT90dQ2RgpZAbB8e7x9dVlt7DpZJv8AnxIe0qSWSZpe0HW8WzxnYFudQ9clDd7k5Sx4T4eoeesVUpS1FSiVKUckniSTXHOfCayXbftTi6ehP2GwyUPXp1JQ662rIhg8/H6TqHRznoFeJVq19p1kkvguSPPnOpjKiSX2Mz2760kz9ocpm0zVIiwG0xApBBC1JJKz+8ojyUrLlEqUVEkk8STSvrqOGp0qagloe5TpRhFRtocVMaW1NfdMzTLsdyfhuHvwk5Q4OpSTwV5RSlbTjGUWpK6NJJSVmfpTY1r286uij41YgpWDgrYbUknybxHmFaZSlfA4qKjVkkj5iskptIUpSucyFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBSlKAUpSgFKUoBXku8pcO3uyW0pUpAyArOPVSlStSVqfmTaNtZ1lPmSrSzNatsVJKFCEgoWsdRWSVeYisuUSokkkk85NKV91gKcIUVuq1z6TCxjGmrI4pSldp0H/2Q==", "logoUpload": "data:image/jpeg;base64,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", "credlyBadgeId": "", "credlyEarnerUrl": "", "credlyImageUrl": "data:image/jpeg;base64,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", "image": null, "pdf": null}, {"id": "cr2", "type": "credly", "title": "Ethical Hacker", "issuer": "Cisco", "date": "2024-02", "url": "https://www.credly.com/badges/", "tags": ["Cisco", "Ethical Hacking", "Cybersecurity", "Networking"], "featured": true, "logo": "data:image/jpeg;base64,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", "logoUpload": "data:image/jpeg;base64,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", "credlyBadgeId": "", "credlyEarnerUrl": "", "credlyImageUrl": "data:image/jpeg;base64,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", "image": null, "pdf": null}, {"id": "cr3", "type": "credly", "title": "Junior Cybersecurity Analyst Career Path", "issuer": "Cisco", "date": "2024-03", "url": "https://www.credly.com/badges/", "tags": ["Cisco", "Cybersecurity", "SOC", "Security"], "featured": true, "logo": "data:image/jpeg;base64,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EAREQBERAEREAREQBERAEREAREQH45rXNLXAEHeCFrqqw2apzM1spSTvIjDT5QtkilGUo7HYi4p7URuowRYJc9SCaH6Ep+vNYE2j23H71XVTPpBrvqCmaK6OLrR2SZW6FN7iASaOnf2d1B+lBl9a8H6PK4d5cKY9bXBWMisWkK63+BHotPgVt73t08No/K72INHtzz21tIB+t7FZKKX8xr8THRKZXbNHlWe/uUA6oyVkxaO4/wC1urj0Nhy+tTtFF4+u/wBX0MrC0uBEYNH9oYQZamsk6NZoHqWxpsIYfgyIoBIRyyPc70Z5LeoqpYqtLbJk1RprcY9JQ0VIP6LSU8H5uMN9SyERUtt5ssStsCIiwZCIiAIiIAiIgCIiAIiIAiIgCItdfLzRWin4ypkzee8ib3zv/bpWYxcnaKzIykoq7M2pnhpoHzzyNjjYM3OccgFXmK8VS3DWpKEuipNznbnSewdC1mIL5WXibOZ2pC05shadg9p6VhUtM6Y5nuWc/OuzhsEqfrT2nHxWO1laOSPiCF8zsm7uU8y2cELIWarR1nnX1GxrGhrBkAvpbjlc4lSq59gREWCoIv1rXOOTQSeYBZMNvqpN0RaOd2xRcktplRb2IxUW3htAGRmlJ6Gj61nQUsEP3uJoPPvKrlXithfHDye3I01NbqibIlvFt53exbSkt8EGTstd/wAZ31LLRa8qspGzChGIREVZaFGq38Mm/OO9akqjVb+GTfnHetbGH2s1cVsR4oiLaNMIiICZYE/q6f8APfUFIVHsCf1dP+e+oKQrg4r82R67Af3eAREVBuBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBfjiGtLnEADaSeRYN0u1Hb2njpNaTLZG3a4+xQ+73qruObHHi4P7tu49fOtijhp1M9iNatioUstrNjiPGMNPrU9r1ZpdxlO1jern9SglVNUVU7p6iR8sjjmXO2lb2mppZ3asTNnKeQLb0dvigyc/KR/ORsHUupT5vDq0VmcirWnWd5EVordPJk98MmryDVO1bRlDVEANp3AdIyUjRJYlvcakqOu7tmhZbKt29jW9bl6stEp7+Vg6hmtyig68gsNBGtjtEI7+V7urYsiO30jN0Qcf8AEc1lIoOpJ7yxUoLY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", "logoUpload": "data:image/jpeg;base64,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EAREQBERAEREAREQBERAEREAREQH45rXNLXAEHeCFrqqw2apzM1spSTvIjDT5QtkilGUo7HYi4p7URuowRYJc9SCaH6Ep+vNYE2j23H71XVTPpBrvqCmaK6OLrR2SZW6FN7iASaOnf2d1B+lBl9a8H6PK4d5cKY9bXBWMisWkK63+BHotPgVt73t08No/K72INHtzz21tIB+t7FZKKX8xr8THRKZXbNHlWe/uUA6oyVkxaO4/wC1urj0Nhy+tTtFF4+u/wBX0MrC0uBEYNH9oYQZamsk6NZoHqWxpsIYfgyIoBIRyyPc70Z5LeoqpYqtLbJk1RprcY9JQ0VIP6LSU8H5uMN9SyERUtt5ssStsCIiwZCIiAIiIAiIgCIiAIiIAiIgCItdfLzRWin4ypkzee8ib3zv/bpWYxcnaKzIykoq7M2pnhpoHzzyNjjYM3OccgFXmK8VS3DWpKEuipNznbnSewdC1mIL5WXibOZ2pC05shadg9p6VhUtM6Y5nuWc/OuzhsEqfrT2nHxWO1laOSPiCF8zsm7uU8y2cELIWarR1nnX1GxrGhrBkAvpbjlc4lSq59gREWCoIv1rXOOTQSeYBZMNvqpN0RaOd2xRcktplRb2IxUW3htAGRmlJ6Gj61nQUsEP3uJoPPvKrlXithfHDye3I01NbqibIlvFt53exbSkt8EGTstd/wAZ31LLRa8qspGzChGIREVZaFGq38Mm/OO9akqjVb+GTfnHetbGH2s1cVsR4oiLaNMIiICZYE/q6f8APfUFIVHsCf1dP+e+oKQrg4r82R67Af3eAREVBuBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBfjiGtLnEADaSeRYN0u1Hb2njpNaTLZG3a4+xQ+73qruObHHi4P7tu49fOtijhp1M9iNatioUstrNjiPGMNPrU9r1ZpdxlO1jern9SglVNUVU7p6iR8sjjmXO2lb2mppZ3asTNnKeQLb0dvigyc/KR/ORsHUupT5vDq0VmcirWnWd5EVordPJk98MmryDVO1bRlDVEANp3AdIyUjRJYlvcakqOu7tmhZbKt29jW9bl6stEp7+Vg6hmtyig68gsNBGtjtEI7+V7urYsiO30jN0Qcf8AEc1lIoOpJ7yxUoLY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", "credlyBadgeId": "", "credlyEarnerUrl": "", "credlyImageUrl": "data:image/jpeg;base64,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EAREQBERAEREAREQBERAEREAREQH45rXNLXAEHeCFrqqw2apzM1spSTvIjDT5QtkilGUo7HYi4p7URuowRYJc9SCaH6Ep+vNYE2j23H71XVTPpBrvqCmaK6OLrR2SZW6FN7iASaOnf2d1B+lBl9a8H6PK4d5cKY9bXBWMisWkK63+BHotPgVt73t08No/K72INHtzz21tIB+t7FZKKX8xr8THRKZXbNHlWe/uUA6oyVkxaO4/wC1urj0Nhy+tTtFF4+u/wBX0MrC0uBEYNH9oYQZamsk6NZoHqWxpsIYfgyIoBIRyyPc70Z5LeoqpYqtLbJk1RprcY9JQ0VIP6LSU8H5uMN9SyERUtt5ssStsCIiwZCIiAIiIAiIgCIiAIiIAiIgCItdfLzRWin4ypkzee8ib3zv/bpWYxcnaKzIykoq7M2pnhpoHzzyNjjYM3OccgFXmK8VS3DWpKEuipNznbnSewdC1mIL5WXibOZ2pC05shadg9p6VhUtM6Y5nuWc/OuzhsEqfrT2nHxWO1laOSPiCF8zsm7uU8y2cELIWarR1nnX1GxrGhrBkAvpbjlc4lSq59gREWCoIv1rXOOTQSeYBZMNvqpN0RaOd2xRcktplRb2IxUW3htAGRmlJ6Gj61nQUsEP3uJoPPvKrlXithfHDye3I01NbqibIlvFt53exbSkt8EGTstd/wAZ31LLRa8qspGzChGIREVZaFGq38Mm/OO9akqjVb+GTfnHetbGH2s1cVsR4oiLaNMIiICZYE/q6f8APfUFIVHsCf1dP+e+oKQrg4r82R67Af3eAREVBuBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBfjiGtLnEADaSeRYN0u1Hb2njpNaTLZG3a4+xQ+73qruObHHi4P7tu49fOtijhp1M9iNatioUstrNjiPGMNPrU9r1ZpdxlO1jern9SglVNUVU7p6iR8sjjmXO2lb2mppZ3asTNnKeQLb0dvigyc/KR/ORsHUupT5vDq0VmcirWnWd5EVordPJk98MmryDVO1bRlDVEANp3AdIyUjRJYlvcakqOu7tmhZbKt29jW9bl6stEp7+Vg6hmtyig68gsNBGtjtEI7+V7urYsiO30jN0Qcf8AEc1lIoOpJ7yxUoLY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", "image": null, "pdf": null}, {"id": "cr4", "type": "credly", "title": "AWS Cloud Quest: Cloud Practitioner \u2013 Training Badge", "issuer": "Amazon Web Services Training and Certification", "date": "2024-04", "url": "https://www.credly.com/badges/", "tags": ["AWS", "Cloud", "Amazon", "Cloud Practitioner"], "featured": true, "logo": "data:image/jpeg;base64,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", "logoUpload": "data:image/jpeg;base64,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", "credlyBadgeId": "", "credlyEarnerUrl": "", "credlyImageUrl": "data:image/jpeg;base64,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", "image": null, "pdf": null}, {"id": "cr5", "type": "credly", "title": "AWS Knowledge: Security Champion \u2013 Training Badge", "issuer": "Amazon Web Services Training and Certification", "date": "2024-05", "url": "https://www.credly.com/badges/", "tags": ["AWS", "Cloud", "Security", "Amazon"], "featured": true, "logo": "data:image/jpeg;base64,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lfC2GGopbcNNHPpYe/cfPq4nT1L57nJfF015UzEx0vajT2HmnOqJiehvS53ChtlOai41lPRwj+eeQMH9+K8Ffs3cOUe1Fa4aq7yjgYm83F/udvPqBWiMR3e20DzW4mvjBKd+3Vzl8juoHVx9QWvsQZzWSj2orFbZq944Szfwo/Z4R/svf3NgcHz4y7z9EcIznyeXvPFYnmw1vm6fXM37esycYXbWOlkhtELv5aZu1Jp+N2/2ALXOJsR2K0zOqcR31j6riRLKZpj/AKd7v2WgcR5k4tvYdHJcnUdO7+jSDmm6ekjvj6yvIOc5zi5xJJOpJO8rirTmFwsauDs/zPrOf7d06JxF+c8Tc/iPW5uvEGdNJDtQ4etDpTwE9YdkdYY3efWVrjEeOsUX/aZX3aYQH+hD/Dj6tG8fXqvNIqfFaXxeK5q6+bojmjw3rPD6Nw2H56KefpnnkREVa+4REQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREH2cP4oxBYHh1putTTN13xh2sZ62nUH2L795zUxlcqYQfWDKJuzo40kYjc/wBJdxHq0Xh0X1W8bibdGpRcmI6M5fPXhLFdWvVREz2P6TzzVEzpp5XyyOOrnvcXOJ9JK/miL5ZnPa+iIyEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQf/2Q==", "logoUpload": "data:image/jpeg;base64,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lfC2GGopbcNNHPpYe/cfPq4nT1L57nJfF015UzEx0vajT2HmnOqJiehvS53ChtlOai41lPRwj+eeQMH9+K8Ffs3cOUe1Fa4aq7yjgYm83F/udvPqBWiMR3e20DzW4mvjBKd+3Vzl8juoHVx9QWvsQZzWSj2orFbZq944Szfwo/Z4R/svf3NgcHz4y7z9EcIznyeXvPFYnmw1vm6fXM37esycYXbWOlkhtELv5aZu1Jp+N2/2ALXOJsR2K0zOqcR31j6riRLKZpj/AKd7v2WgcR5k4tvYdHJcnUdO7+jSDmm6ekjvj6yvIOc5zi5xJJOpJO8rirTmFwsauDs/zPrOf7d06JxF+c8Tc/iPW5uvEGdNJDtQ4etDpTwE9YdkdYY3efWVrjEeOsUX/aZX3aYQH+hD/Dj6tG8fXqvNIqfFaXxeK5q6+bojmjw3rPD6Nw2H56KefpnnkREVa+4REQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREH2cP4oxBYHh1putTTN13xh2sZ62nUH2L795zUxlcqYQfWDKJuzo40kYjc/wBJdxHq0Xh0X1W8bibdGpRcmI6M5fPXhLFdWvVREz2P6TzzVEzpp5XyyOOrnvcXOJ9JK/miL5ZnPa+iIyEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQf/2Q==", "credlyBadgeId": "", "credlyEarnerUrl": "", "credlyImageUrl": "data:image/jpeg;base64,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lfC2GGopbcNNHPpYe/cfPq4nT1L57nJfF015UzEx0vajT2HmnOqJiehvS53ChtlOai41lPRwj+eeQMH9+K8Ffs3cOUe1Fa4aq7yjgYm83F/udvPqBWiMR3e20DzW4mvjBKd+3Vzl8juoHVx9QWvsQZzWSj2orFbZq944Szfwo/Z4R/svf3NgcHz4y7z9EcIznyeXvPFYnmw1vm6fXM37esycYXbWOlkhtELv5aZu1Jp+N2/2ALXOJsR2K0zOqcR31j6riRLKZpj/AKd7v2WgcR5k4tvYdHJcnUdO7+jSDmm6ekjvj6yvIOc5zi5xJJOpJO8rirTmFwsauDs/zPrOf7d06JxF+c8Tc/iPW5uvEGdNJDtQ4etDpTwE9YdkdYY3efWVrjEeOsUX/aZX3aYQH+hD/Dj6tG8fXqvNIqfFaXxeK5q6+bojmjw3rPD6Nw2H56KefpnnkREVa+4REQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREH2cP4oxBYHh1putTTN13xh2sZ62nUH2L795zUxlcqYQfWDKJuzo40kYjc/wBJdxHq0Xh0X1W8bibdGpRcmI6M5fPXhLFdWvVREz2P6TzzVEzpp5XyyOOrnvcXOJ9JK/miL5ZnPa+iIyEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQEREBERAREQf/2Q==", "image": null, "pdf": null}],
  projects:    [],
  flags:       [],
  experience:  [],
  contact:     {email:'',phone:'',github:'',linkedin:'',tryhackme:'',twitter:'',address:'',ctaMessage:''},
}

export default function App() {
  const [setup,    setSetup]   = useState(!getGithubConfig())
  const [authed,   setAuthed]  = useState(false)
  const [page,     setPage]    = useState('dashboard')
  const [data,     setData]    = useState(DEFAULTS)
  const [loading,  setLoading] = useState(true)
  const [syncState,setSyncState] = useState('idle')
  const [syncError,setSyncError] = useState('')          // human-readable error detail for toast
  const [lastSync, setLastSync]  = useState(null)
  const syncTimer = useRef(null)
  const ghCfg = getGithubConfig()

  // Load data from GitHub on auth
  useEffect(()=>{
    if (!authed) return
    ;(async()=>{
      setLoading(true)
      const loaded = await loadAll(DEFAULTS)
      setData(loaded)
      setLoading(false)
    })()
  }, [authed])

  const lastSaveRef = useRef(null)

  const handleSave = async (section, value) => {
    lastSaveRef.current = { section, value }
    setSyncState('saving')
    try {
      await saveSection(section, value)
      setData(d=>({...d,[section]:value}))
      const ts = new Date().toLocaleTimeString('en-GB',{hour12:false})
      setLastSync(ts)
      setSyncState('saved')
      clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(()=>setSyncState('idle'), 2500)
    } catch(e) {
      const msg = e.message || 'Unknown error'
      const isAuthError = /401|403|bad credentials|token/i.test(msg)
      setSyncError(isAuthError
        ? 'Token expired / no write permission — go to Settings to reconnect'
        : msg.length > 80 ? msg.slice(0, 80) + '…' : msg
      )
      setSyncState('error')
      clearTimeout(syncTimer.current)
      syncTimer.current = setTimeout(()=>{ setSyncState('idle'); setSyncError('') }, 6000)
      console.error('[Admin] Save failed:', msg)
      if (isAuthError) console.error('[Admin] TOKEN ERROR — reconnect in Settings')
    }
  }

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave
  const handleRetry = useCallback(() => {
    if (lastSaveRef.current) {
      const { section, value } = lastSaveRef.current
      handleSaveRef.current(section, value)
    }
  }, [])

  const counts = {
    skills:      data.skills?.reduce((a,c)=>a+(c.items?.length||0),0)||0,
    credentials: data.credentials?.length||0,
    projects:    data.projects?.length||0,
    flags:       data.flags?.length||0,
    experience:  data.experience?.length||0,
  }

  if (setup) return <SetupWizard onComplete={()=>setSetup(false)}/>
  if (!authed) return <Login onAuth={()=>setAuthed(true)}/>

  if (loading) return (
    <>
      <FontLink/><style>{CSS}</style>
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',fontFamily:"'Share Tech Mono',monospace",color:'var(--g)',fontSize:14,letterSpacing:3}}>
        LOADING FROM GITHUB...
      </div>
    </>
  )

  return (
    <>
      <FontLink/>
      <style>{CSS}</style>
      {syncState==='saving' && <div className="saving-bar"/>}
      <div className="shell">
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-title">CYB<span>AASH</span></div>
            <div className="logo-sub">// ADMIN PANEL · v4.0</div>
          </div>
          <div className="sb-status">
            <div style={{width:6,height:6,borderRadius:'50%',background:'var(--g)',boxShadow:'0 0 6px var(--g)'}}/>
            <span style={{color:'var(--g)'}}>GITHUB STORAGE</span>
          </div>
          <nav className="nav" aria-label="Admin navigation">
            {NAV.map(n=>(
              <button key={n.id} className={`nav-item${page===n.id?' active':''}`}
                onClick={()=>setPage(n.id)}
                aria-current={page===n.id?'page':undefined}
                style={{width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer'}}>
                <span className="nav-icon" aria-hidden="true">{n.icon}</span>
                <span>{n.label}</span>
                {n.id==='credentials'&&counts.credentials>0&&<span className="nav-badge">{counts.credentials}</span>}
                {n.id==='projects'&&counts.projects>0&&<span className="nav-badge">{counts.projects}</span>}
                {n.id==='flags'&&counts.flags>0&&<span className="nav-badge">{counts.flags}</span>}
                {n.id==='skills'&&counts.skills>0&&<span className="nav-badge">{counts.skills}</span>}
              </button>
            ))}
          </nav>
          <div className="sidebar-footer">
            <div style={{marginBottom:6,letterSpacing:1}}>Logged in as admin</div>
            <div style={{color:'var(--g)',marginBottom:2,letterSpacing:1}}>● SYSTEM ONLINE</div>
            <button className="logout-btn" onClick={()=>setAuthed(false)}>⏻ LOGOUT</button>
          </div>
        </aside>
        <div className="main">
          <div className="topbar">
            <div className="topbar-left">
              <div className="status-dot"/>
              <span className="topbar-title">CYBAASH</span>
              <span className="topbar-breadcrumb">// {NAV.find(n=>n.id===page)?.label?.toUpperCase()}</span>
            </div>
            <div className="topbar-right">
              <Clock/>
              <span className="badge badge-green" style={{fontSize:10}}>LIVE</span>
              <button className="topbar-logout-mobile" onClick={()=>setAuthed(false)} title="Logout" aria-label="Logout">⏻</button>
            </div>
          </div>
          <div className="content">
            {page==='dashboard'   && <Dashboard        data={data} lastSync={lastSync} ghCfg={ghCfg}/>}
            {page==='about'       && <AboutSection       data={data.about}       onSave={v=>handleSave('about',v)}/>}
            {page==='skills'      && <SkillsSection       data={data.skills}      onSave={v=>handleSave('skills',v)}/>}
            {page==='credentials' && <CredentialsSection  data={data.credentials} onSave={v=>handleSave('credentials',v)}/>}
            {page==='projects'    && <ProjectsSection     data={data.projects}    onSave={v=>handleSave('projects',v)}/>}
            {page==='flags'       && <FlagsSection         data={data.flags}       onSave={v=>handleSave('flags',v)}/>}
            {page==='experience'  && <ExperienceSection   data={data.experience}  onSave={v=>handleSave('experience',v)}/>}
            {page==='contact'     && <ContactSection      data={data.contact}     onSave={v=>handleSave('contact',v)}/>}
            {page==='settings'    && <SettingsSection     data={data} ghCfg={ghCfg} onDisconnect={()=>setSetup(true)}/>}
          </div>
        </div>
      </div>
      <SyncToast state={syncState} syncError={syncError} onRetry={handleRetry}/>
    </>
  )
}
