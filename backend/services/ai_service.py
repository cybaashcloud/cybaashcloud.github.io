"""
services/ai_service.py
Handles LLM calls via Google Gemini.
Reads config live from the settings DB (changeable via admin panel),
falling back to environment variables if DB is unavailable.
"""

import os
from typing import Optional
from utils.logger import setup_logger

logger = setup_logger(__name__)


async def _get_config(premium: bool) -> dict:
    """Load Gemini config from DB (admin-panel-settable), falling back to env."""
    try:
        from utils.database import get_setting
        api_key    = await get_setting("gemini_api_key")   or os.getenv("GEMINI_API_KEY", "")
        model      = await get_setting("gemini_model_premium" if premium else "gemini_model") or (
                        "gemini-1.5-pro" if premium else "gemini-1.5-flash"
                     )
        max_tokens = int(await get_setting("max_tokens_premium" if premium else "max_tokens") or
                         ("2048" if premium else "1024"))
        temperature = float(await get_setting("temperature") or "0.4")
        system_prompt = await get_setting("system_prompt") or _default_system_prompt()
    except Exception as e:
        logger.warning(f"Could not read settings from DB ({e}), using env vars.")
        api_key       = os.getenv("GEMINI_API_KEY", "")
        model         = "gemini-1.5-pro" if premium else "gemini-1.5-flash"
        max_tokens    = 2048 if premium else 1024
        temperature   = 0.4
        system_prompt = _default_system_prompt()

    return {
        "api_key":      api_key,
        "model":        model,
        "max_tokens":   max_tokens,
        "temperature":  temperature,
        "system_prompt": system_prompt,
    }


async def get_ai_response(
    message: str,
    history: list[dict],
    premium: bool = False,
) -> tuple[str, Optional[int]]:
    """
    Get AI response from Google Gemini.
    Config (key, model, prompt) is read live from the DB — changeable via admin panel.
    Falls back to local demo if no key is configured.
    """
    cfg = await _get_config(premium)

    if cfg["api_key"] and cfg["api_key"] not in ("your_gemini_key_here", ""):
        return await _call_gemini(message, history, cfg)
    else:
        logger.warning("No Gemini API key configured — using demo responder.")
        return _local_demo_response(message), None


async def _call_gemini(
    message: str,
    history: list[dict],
    cfg: dict,
) -> tuple[str, int]:
    try:
        import httpx
    except ImportError:
        raise RuntimeError("httpx not installed. Run: pip install httpx")

    # Build contents array: history + current message
    contents = []
    for entry in history:
        role = "model" if entry.get("role") == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": entry.get("content", "")}]})
    contents.append({"role": "user", "parts": [{"text": message}]})

    payload = {
        "system_instruction": {"parts": [{"text": cfg["system_prompt"]}]},
        "contents": contents,
        "generationConfig": {
            "temperature":    cfg["temperature"],
            "maxOutputTokens": cfg["max_tokens"],
            "topP": 0.95,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT",        "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_HATE_SPEECH",       "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_ONLY_HIGH"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH"},
        ],
    }

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{cfg['model']}:generateContent?key={cfg['api_key']}"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code != 200:
        logger.error(f"Gemini API error {resp.status_code}: {resp.text[:300]}")
        raise RuntimeError(f"Gemini API returned {resp.status_code}: {resp.text[:200]}")

    data = resp.json()
    try:
        reply = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Could not parse Gemini response: {e} — {data}")

    tokens = data.get("usageMetadata", {}).get("totalTokenCount", 0)
    return reply, tokens


def _default_system_prompt() -> str:
    return (
        "You are CyberBot — an expert cybersecurity assistant built for educational and ethical purposes.\n\n"
        "Your capabilities:\n"
        "- Explain vulnerabilities: SQLi, XSS, CSRF, buffer overflows, RCE, LFI/RFI, SSRF, XXE\n"
        "- Teach secure coding in Python, JavaScript, PHP\n"
        "- Guide penetration testing concepts (CTF/lab context only)\n"
        "- Advise on system hardening and CVE analysis\n"
        "- Assist with cryptography, authentication best practices\n\n"
        "Rules:\n"
        "1. NEVER provide step-by-step instructions to attack real systems\n"
        "2. NEVER write working malware or data-exfiltration tools\n"
        "3. Always frame offensive techniques in educational context\n"
        "4. Use markdown: headers, bullets, code blocks\n"
        "5. For each vulnerability: What it is → How it works → How to defend\n\n"
        "Tone: Professional, direct — like a senior security engineer mentoring a junior."
    )


def _local_demo_response(message: str) -> str:
    msg = message.lower()
    if any(k in msg for k in ["sql", "sqli", "injection"]):
        return "## SQL Injection\n\nUse parameterized queries:\n```python\ncursor.execute('SELECT * FROM users WHERE name = %s', (input,))\n```\n> OWASP A03:2021"
    if any(k in msg for k in ["hello", "hi", "help"]):
        return "# CyberBot ⚡\n\nNo Gemini API key configured. Set `GEMINI_API_KEY` in the **Admin Panel → Settings → AI Configuration** or in `.env`."
    return "No Gemini API key configured. Go to **Admin Panel → Settings → AI Configuration** to set your key."
