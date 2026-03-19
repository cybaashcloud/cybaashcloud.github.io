# CYBAASH AI — Project Overview

CYBAASH AI merges a professional cybersecurity portfolio website with a production-grade AI chatbot into a single, interactive project. Recruiters can see your skills *and* interact with your AI assistant — showcasing Python, FastAPI, Google Gemini integration, and frontend skills all in one place.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla HTML/CSS/JS + React (admin panel) |
| **Backend** | Python 3.11 + FastAPI |
| **AI** | Google Gemini 1.5 Flash / Pro |
| **Auth** | GitHub Personal Access Token (PAT) |
| **Storage** | GitHub repository (zero-cost) + SQLite (backend) |
| **Deploy** | GitHub Pages (frontend) + Render (backend) |

## Project Structure

```
cybaash-gemini/
├── frontend/
│   ├── index.html          ← Main portfolio + cyber range simulation
│   ├── style.css           ← Global styles
│   ├── script.js           ← Portfolio data loading + chat UI
│   ├── cybaash-ai.js       ← Chatbot widget (calls backend)
│   ├── cybaash-ai.css      ← Chatbot widget styles
│   ├── dashboard.html      ← Operator dashboard (GitHub-backed)
│   ├── recruiter.html      ← Recruiter-facing summary page
│   ├── sw.js               ← Service worker (PWA/offline)
│   ├── manifest.json       ← PWA manifest
│   ├── data_main.json      ← Portfolio content (about, skills, projects)
│   ├── data_creds_1-5.json ← Credentials/certifications (split)
│   ├── icon/               ← PWA icons
│   └── admin/              ← React admin panel (Vite)
│       └── src/App.jsx     ← Full admin UI incl. AI config (Settings tab)
├── backend/
│   ├── main.py             ← FastAPI app entry point
│   ├── routes/
│   │   ├── chat.py         ← POST /api/chat
│   │   ├── analyze.py      ← POST /api/analyze/*
│   │   ├── admin.py        ← GET|POST /api/admin/settings  ← NEW
│   │   └── health.py       ← GET /api/health
│   ├── services/
│   │   ├── ai_service.py   ← Google Gemini integration (reads config from DB)
│   │   └── security_scanner.py
│   └── utils/
│       └── database.py     ← SQLite + settings table (admin-changeable)
└── docs/
    ├── README.md
    └── CYBERBOT_README.md
```

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
# Set GEMINI_API_KEY and CYBERBOT_API_KEY in .env

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Admin Panel

```bash
cd frontend/admin
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build → dist/
```

### Environment Variables

```env
GEMINI_API_KEY=AIza...          # Google AI Studio key (fallback)
CYBERBOT_API_KEY=any_secret     # Admin panel password
DB_PATH=cyberbot.db
LOG_LEVEL=INFO
```

## Changing the Gemini API Key (Admin Panel)

1. Deploy backend with `CYBERBOT_API_KEY` set
2. Open `/admin` → **Settings** tab
3. Enter your `CYBERBOT_API_KEY` → **Connect**
4. Under **⚡ Gemini AI Configuration**:
   - Paste new API key → **Test** → **Save AI Config**
   - Change model, temperature, system prompt live
   - View usage analytics

Changes take effect within 30 seconds, no restart required.

## Deploy to Render

1. Push repo to GitHub
2. New Web Service → connect `backend/` folder
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Environment variables: `GEMINI_API_KEY`, `CYBERBOT_API_KEY`
