#!/usr/bin/env python3
"""
deploy_ai_config.py — Sanitize AI config before publishing to GitHub Pages.

Reads frontend/data_ai_config.json (written by the admin panel) and strips
any fields that must NOT be published publicly (e.g. raw API keys, internal
system prompts, admin-only flags). Writes a sanitized copy to _site/.

This script runs inside the GitHub Actions deploy job, AFTER _site/ has been
assembled, so it can safely overwrite the file in place.

Safe fields (kept as-is):
    model, temperature, maxTokens, systemPromptPublic, contextWindow,
    enableSearch, enableCitations, language, fallbackMessage

Stripped fields (removed or redacted before publish):
    apiKey, adminSystemPrompt, internalNotes, debugMode, rawSecrets
"""

import json
import sys
from pathlib import Path

SRC  = Path("frontend/data_ai_config.json")
DEST = Path("_site/data_ai_config.json")   # overwrite the copied version

# Fields that are safe to expose publicly
SAFE_FIELDS = {
    "model",
    "temperature",
    "maxTokens",
    "systemPromptPublic",
    "contextWindow",
    "enableSearch",
    "enableCitations",
    "language",
    "fallbackMessage",
    "greeting",
    "persona",
    "topK",
    "topP",
    "safetySettings",
}

# Fields that must never appear in the published site
STRIP_FIELDS = {
    "apiKey",
    "adminSystemPrompt",
    "internalNotes",
    "debugMode",
    "rawSecrets",
    "privatePrompt",
    "geminiApiKey",
    "openaiApiKey",
}


def sanitize(config: dict) -> dict:
    """Return a copy of config with sensitive fields removed."""
    out = {}
    for key, value in config.items():
        if key in STRIP_FIELDS:
            continue                      # drop entirely
        if key not in SAFE_FIELDS:
            # Unknown key — keep it only if it looks non-sensitive
            if any(s in key.lower() for s in ("key", "secret", "token", "password", "auth")):
                print(f"  ⚠  Stripping unknown sensitive-looking key: '{key}'")
                continue
        out[key] = value
    return out


def main():
    if not SRC.exists():
        print(f"  ℹ  {SRC} not found — writing empty AI config to _site/.")
        DEST.parent.mkdir(parents=True, exist_ok=True)
        DEST.write_text(json.dumps({"model": "gemini-1.5-flash"}, indent=2), encoding="utf-8")
        return

    raw    = json.loads(SRC.read_text(encoding="utf-8"))
    clean  = sanitize(raw)
    before = set(raw.keys())
    after  = set(clean.keys())
    removed = before - after

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(clean, indent=2, ensure_ascii=False), encoding="utf-8")

    if removed:
        print(f"  🔒 Stripped sensitive fields: {', '.join(sorted(removed))}")
    else:
        print(f"  ✓  AI config sanitized — no sensitive fields found.")

    print(f"  ✓  Written to {DEST} ({len(clean)} fields)")


if __name__ == "__main__":
    main()
