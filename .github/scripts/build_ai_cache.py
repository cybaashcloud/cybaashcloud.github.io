#!/usr/bin/env python3
"""
build_ai_cache.py — Stage 3 of the weekly pipeline.

Pre-generates answers for common portfolio questions using the Gemini API
and writes them to frontend/data_ai_cache.json. The chatbot (cybaash-ai.js)
serves cached answers before falling back to a live API call, reducing
latency and protecting the API quota.

Environment variables:
    GEMINI_API_KEY  — required for live generation (optional if cache exists)
    FORCE_REBUILD   — set to 'true' to ignore the existing cache

Usage:
    python3 build_ai_cache.py

Dependencies (installed by workflow):
    pip install requests
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

CACHE_PATH   = Path("frontend/data_ai_cache.json")
DATA_MAIN    = Path("frontend/data_main.json")
CRED_FILES   = [Path(f"frontend/data_creds_{n}.json") for n in range(1, 6)]
MODEL        = "gemini-1.5-flash"
API_BASE     = "https://generativelanguage.googleapis.com/v1beta/models"
FORCE        = os.environ.get("FORCE_REBUILD", "false").lower() == "true"

# ── Questions to pre-cache ─────────────────────────────────────────────────

QUESTIONS = [
    "Who is AASIQ and what is their background?",
    "What certifications does AASIQ have?",
    "What are AASIQ's top skills in cybersecurity?",
    "What projects has AASIQ worked on?",
    "How can I contact AASIQ?",
    "What is AASIQ's experience with penetration testing?",
    "What cloud certifications does AASIQ hold?",
    "What CTF challenges has AASIQ completed?",
    "Is AASIQ available for freelance or full-time work?",
    "What programming languages does AASIQ know?",
]


def load_portfolio_context() -> str:
    """Build a compact context string from the portfolio data files."""
    lines = ["=== AASIQ Portfolio Context ==="]

    if DATA_MAIN.exists():
        d = json.loads(DATA_MAIN.read_text(encoding="utf-8"))
        about = d.get("about", {})
        lines.append(f"Name: {about.get('name', 'AASIQ')}")
        lines.append(f"Title: {about.get('title', '')}")
        lines.append(f"Bio: {about.get('bio', '')}")
        lines.append(f"Total Certs: {about.get('certCount', '?')}")

        for skill in d.get("skills", [])[:10]:
            lines.append(f"Skill: {skill.get('name', '')} ({skill.get('level', '')})")

        for proj in d.get("projects", [])[:5]:
            lines.append(f"Project: {proj.get('name', '')} — {proj.get('description', '')[:80]}")

        contact = d.get("contact", {})
        for k in ["email", "linkedin", "github"]:
            if contact.get(k):
                lines.append(f"Contact {k}: {contact[k]}")

    # Add a sample of certs
    cert_sample = []
    for p in CRED_FILES:
        if p.exists():
            data = json.loads(p.read_text(encoding="utf-8"))
            cert_sample.extend(data.get("credentials", []))
        if len(cert_sample) >= 30:
            break

    for cert in cert_sample[:30]:
        lines.append(f"Cert: {cert.get('title', '')} by {cert.get('issuer', '')} ({cert.get('date', '')})")

    return "\n".join(lines)


def call_gemini(question: str, context: str, api_key: str) -> Optional[str]:
    """Call Gemini API and return the answer text."""
    try:
        import requests

        prompt = (
            f"{context}\n\n"
            f"You are AASIQ's AI assistant. Answer the following question "
            f"concisely and accurately using only the portfolio data above.\n\n"
            f"Question: {question}"
        )

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "maxOutputTokens": 300,
                "temperature": 0.3,
            },
        }

        url = f"{API_BASE}/{MODEL}:generateContent?key={api_key}"
        r   = requests.post(url, json=payload, timeout=20)

        if r.status_code != 200:
            print(f"    API error {r.status_code}: {r.text[:200]}")
            return None

        data = r.json()
        text = (
            data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
                .strip()
        )
        return text or None

    except Exception as e:
        print(f"    [gemini] error: {e}")
        return None


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()

    # Load existing cache
    existing = {}
    if CACHE_PATH.exists() and not FORCE:
        try:
            existing = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            print(f"Loaded existing cache: {existing.get('total', 0)} entries")
        except Exception:
            existing = {}

    cached_answers = existing.get("answers", {})

    if not api_key:
        print("⚠  GEMINI_API_KEY not set — skipping live generation.")
        if not existing:
            # Write an empty skeleton so the file always exists
            out = {
                "total": 0,
                "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "model": MODEL,
                "answers": {},
            }
            CACHE_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
            print("Wrote empty cache skeleton.")
        sys.exit(0)

    context  = load_portfolio_context()
    updated  = 0

    for question in QUESTIONS:
        q_key = question.lower().strip()
        if q_key in cached_answers and not FORCE:
            print(f"  ↩ (cached) {question[:60]}")
            continue

        print(f"  → {question[:60]}")
        answer = call_gemini(question, context, api_key)

        if answer:
            cached_answers[q_key] = {
                "question": question,
                "answer":   answer,
                "model":    MODEL,
                "ts":       datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
            updated += 1
            print(f"    ✓ {len(answer)} chars")
        else:
            print(f"    ✗ no answer")

        time.sleep(0.5)   # rate-limit padding

    out = {
        "total":   len(cached_answers),
        "builtAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "model":   MODEL,
        "answers": cached_answers,
    }
    CACHE_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\n── AI Cache ─────────────────────────────────────────")
    print(f"  Total entries : {out['total']}")
    print(f"  New this run  : {updated}")
    print(f"  Written to    : {CACHE_PATH}")


if __name__ == "__main__":
    main()
