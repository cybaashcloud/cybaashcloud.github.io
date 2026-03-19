# CyberBot — AI-Powered Cybersecurity Assistant

> A production-ready, full-stack AI chatbot specializing in cybersecurity education. Built with Python FastAPI + OpenAI GPT-4o + vanilla JS. Portfolio-grade code with modular architecture, rate limiting, SQLite analytics, and a polished dark UI.

---

## Screenshots

```
┌─────────────────────────────────────────────────────┐
│  CYBERBOT  AI                    ● Online            │
├─────────────────────────────────────────────────────┤
│  Your AI Cybersecurity Assistant                    │
│  [SQLi] [XSS] [Passwords] [Pen Testing]             │
├──────────────┬──────────────────────────────────────┤
│ // SESSIONS  │  🛡 CyberBot                         │
│ + New        │  ─────────────────────────────────  │
│ Session 1    │  > Explain SQL injection             │
│              │                                      │
│ // TOPICS    │  ## SQL Injection (SQLi)             │
│ SQL Injection│  ...educational response with code  │
│ XSS Attacks  │                                      │
│ CSRF         │  [🔐] [🔗] [🔍] [📁]               │
│              │  ┌──────────────────────┐ [→]        │
│              │  │ Ask about vulns...   │            │
└──────────────┴──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend Framework** | FastAPI 0.115 (Python 3.11+) |
| **AI Model** | OpenAI GPT-4o / GPT-4o-mini |
| **Database** | SQLite via aiosqlite (swap for PostgreSQL) |
| **Rate Limiting** | In-memory sliding window (swap for Redis) |
| **Frontend** | Vanilla HTML/CSS/JS — zero dependencies |
| **Deployment** | Backend: Railway/Render · Frontend: GitHub Pages |
| **Security Patterns** | OWASP Top 10 coverage |

---

## Features

### 🤖 AI Chat
- GPT-4o powered with a cybersecurity-specialized system prompt
- 5-message rolling conversation memory per session
- Multi-session support with session switching
- Educational, ethical responses only — refuses illegal instructions

### 🔍 Security Scanner
- **SQLi detection** — UNION, blind, time-based patterns
- **XSS detection** — reflected, stored, DOM patterns
- **CSRF patterns** — form action, fetch POST, XMLHttpRequest
- **Secrets scanner** — API keys, GitHub PATs, AWS keys, bearer tokens

### 🛡️ Analysis Tools
- **Password Strength** — NIST SP 800-63B aligned, entropy calculation
- **URL Safety Analyzer** — phishing patterns, TLD reputation, IDN homograph
- **Code Scanner** — Python/JS/PHP/HTML insecure pattern detection with mitigations
- **File Upload** — .py/.js/.php/.html/.txt/.log analysis (500KB limit)

### ⚙️ Production Features
- Rate limiting: 20 req/min per user (IP-hashed)
- Anonymous query logging with timestamps
- SQLite analytics: total queries, 24h stats, flag patterns
- API key authentication for premium GPT-4o access
- Input sanitization on all endpoints
- CORS configured for GitHub Pages + localhost
- Full error handling with structured responses
- Request timing header (`X-Process-Time`)

---

## Project Structure

```
cyberbot/
├── backend/
│   ├── main.py                  # FastAPI app, middleware, router registration
│   ├── routes/
│   │   ├── chat.py              # POST /api/chat — main AI endpoint
│   │   ├── analyze.py           # POST /api/analyze/* — security tools
│   │   └── health.py            # GET  /api/health — status check
│   ├── services/
│   │   ├── ai_service.py        # OpenAI integration + local fallback
│   │   ├── memory_service.py    # Per-session conversation history
│   │   └── security_scanner.py  # All detection/analysis modules
│   ├── utils/
│   │   ├── rate_limiter.py      # Sliding-window rate limiting
│   │   ├── database.py          # SQLite init + query logging + analytics
│   │   └── logger.py            # Structured logging setup
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html               # Full chat UI + tool modals
│   ├── style.css                # Dark cybersecurity theme
│   └── script.js                # Chat logic, markdown renderer, tools
└── docs/
    └── README.md
```

---

## Setup Instructions

### Prerequisites
- Python 3.11+
- pip
- OpenAI API key (optional — demo mode works without it)

### 1. Clone and Install

```bash
git clone https://github.com/cybaash/cyberbot.git
cd cyberbot/backend

# Create virtual environment
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
OPENAI_API_KEY=sk-your-key-here       # Get from platform.openai.com
CYBERBOT_API_KEY=your-secret-key      # Optional: premium access key
DB_PATH=cyberbot.db
LOG_LEVEL=INFO
```

> **No API key?** The bot runs in demo mode with smart keyword-based responses — perfect for showcasing locally.

### 3. Run the Backend

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: http://localhost:8000/docs

### 4. Run the Frontend

```bash
cd ../frontend
# Option A: Python simple server
python -m http.server 3000

# Option B: VS Code Live Server (recommended)
# Install "Live Server" extension → right-click index.html → Open with Live Server
```

Open: http://localhost:3000

---

## API Reference

### `POST /api/chat`
Main AI chat endpoint.

**Request:**
```json
{
  "message": "Explain SQL injection",
  "session_id": "sess_abc123",
  "api_key": "optional-premium-key"
}
```

**Response:**
```json
{
  "reply": "## SQL Injection...\n\n...",
  "session_id": "sess_abc123",
  "timestamp": 1704067200.0,
  "security_flags": [],
  "tokens_used": 312
}
```

### `POST /api/analyze/password`
```json
{ "password": "MyP@ssw0rd!" }
```

### `POST /api/analyze/url`
```json
{ "url": "https://suspicious-site.tk/login" }
```

### `POST /api/analyze/code`
```json
{ "code": "password = 'admin123'", "language": "python" }
```

### `POST /api/analyze/file`
Multipart form upload — field name: `file`

### `GET /api/health`
```json
{ "status": "ok", "service": "CyberBot API", "timestamp": "2025-01-01T00:00:00Z" }
```

---

## Deployment

### Backend → Railway (free tier)

```bash
# 1. Push to GitHub
git push origin main

# 2. railway.app → New Project → Deploy from GitHub
# 3. Add environment variables in Railway dashboard
# 4. Railway auto-detects Python + uvicorn
```

Add `Procfile`:
```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend → GitHub Pages

```bash
# 1. Update CONFIG.apiBase in script.js to your Railway URL
# 2. Push frontend/ to main branch
# 3. GitHub repo → Settings → Pages → Source: main branch / root
```

Or deploy to **Vercel** (drag and drop frontend/ folder).

---

## Example Interactions

**User:** "Explain SQL injection with a Python example"

**CyberBot:**
```
## SQL Injection (SQLi)

**What it is:** An attacker injects malicious SQL...

**Vulnerable code:**
```python
query = f"SELECT * FROM users WHERE name = '{user_input}'"
```

**Safe code:**
```python
cursor.execute("SELECT * FROM users WHERE name = %s", (user_input,))
```

**Defense checklist:**
- ✅ Use parameterized queries
- ✅ Apply input validation
- ✅ Least-privilege DB accounts
```

---

## Security Architecture

```
Request → Rate Limiter → Input Validator → Security Scanner
                                                ↓
                                         Flag Detection
                                         (SQLi/XSS/CSRF)
                                                ↓
                                          AI Service
                                         (w/ memory)
                                                ↓
                                        Response + Log
                                         (anonymized)
```

---

## Future Improvements

- [ ] WebSocket streaming responses (real-time token output)
- [ ] Redis for distributed rate limiting + session storage
- [ ] PostgreSQL for scalable analytics
- [ ] JWT authentication + user accounts
- [ ] Shodan/VirusTotal API integration for URL analysis
- [ ] CVE database lookup in responses
- [ ] Export chat history to PDF
- [ ] HaveIBeenPwned API for password breach checking
- [ ] Voice input/output support
- [ ] Multi-language support (Arabic, Spanish, French)

---

## Author

**Mohamed Aasiq** — Cybersecurity Specialist & Ethical Hacker

- 🌐 Portfolio: [cybaash.github.io](https://cybaash.github.io)
- 💼 LinkedIn: [linkedin.com/in/mohamedaasiq07](https://linkedin.com/in/mohamedaasiq07)
- 🔐 TryHackMe: [tryhackme.com/p/AasiqSec](https://tryhackme.com/p/AasiqSec)
- 🐙 GitHub: [github.com/cybaash](https://github.com/cybaash)

---

## License

MIT — Educational use. Never test against systems you don't own or have explicit written authorization to test.
