# CYBAASH × Google Gemini — Setup Guide

## Architecture

```
Browser (GitHub Pages)
    ↓  POST /api/chat
FastAPI Backend (Render / Railway / Fly.io)
    ↓  Gemini REST API
Google Gemini 1.5 Flash
```

The **key never leaves your backend** — it's in `.env`, never in frontend code.

---

## 1. Get a Gemini API Key (free)

1. Go to https://aistudio.google.com/app/apikey
2. Click **Create API Key**
3. Copy the key (starts with `AIza...`)

Free tier limits (Gemini 1.5 Flash):
- 15 requests / minute
- 1 million tokens / day
- No credit card required

---

## 2. Deploy the Backend

### Local dev
```bash
cd backend
cp .env.example .env
# Edit .env — set GEMINI_API_KEY=AIza...

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Render (free tier)
1. Push `backend/` to a GitHub repo
2. New Web Service → connect repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add env var: `GEMINI_API_KEY=AIza...`

### Railway / Fly.io
Set the same env vars — the `Procfile` is already included.

---

## 3. Point the Frontend at Your Backend

Edit `frontend/cybaash-ai.js`, line 8:

```js
var BACKEND = 'https://your-app.onrender.com';  // ← your deployed URL
```

Deploy frontend to GitHub Pages — done.

---

## Models used

| Situation | Model |
|-----------|-------|
| Default chat | `gemini-1.5-flash` — fast, free |
| Premium (`CYBERBOT_API_KEY` provided) | `gemini-1.5-pro` — smarter |

---

## What changed from OpenAI version

| | Before | After |
|---|---|---|
| AI Provider | OpenAI GPT-4o | Google Gemini 1.5 |
| Free tier | ❌ | ✅ Generous |
| API key location | Backend `.env` | Backend `.env` (same) |
| Frontend | Calls backend | Calls backend (same) |
| Key exposed? | Never | Never |
| Backend required? | Yes | Yes |
