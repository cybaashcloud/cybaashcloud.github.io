#!/usr/bin/env python3
"""
scripts/deploy_ai_config.py
Called by sync.yml during GitHub Pages deploy.

Validates data_ai_config.json and copies it to _site/.
Also enforces the current recommended Gemini model — if a retired or
unknown model is found it is silently corrected before deploy so the
live site never serves a config that causes 429 / model-not-found errors.

The Gemini API key is stored in the user's browser localStorage only
(set via Admin Panel) and is never committed to this file.
"""

import json
import os
import sys
import shutil

SRC  = "frontend/data_ai_config.json"
DEST = "_site/data_ai_config.json"

# ── Model policy ─────────────────────────────────────────────────────────
# Default model used when none is set or a retired one is detected.
RECOMMENDED_DEFAULT = "gemini-2.5-pro"
RECOMMENDED_PREMIUM = "gemini-2.5-flash"

# Any model in this set is retired / known to return 429 or 404.
# Add new entries here whenever Google retires a model.
RETIRED_MODELS = {
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro",
    "gemini-2.5-pro-preview-03-25",        # old preview — superseded
    "gemini-2.5-pro-preview-05-06",        # old preview — superseded
    "gemini-2.5-flash-lite-preview-06-17", # old preview — use gemini-2.5-pro
    "gemini-2.5-flash-lite",               # lighter model — use gemini-2.5-pro
}

# ── Load ──────────────────────────────────────────────────────────────────
if not os.path.exists(SRC):
    print("SKIP: frontend/data_ai_config.json not found")
    sys.exit(0)

try:
    d = json.load(open(SRC))
except json.JSONDecodeError as e:
    print(f"ERROR: frontend/data_ai_config.json is invalid JSON: {e}")
    sys.exit(1)

# ── Key leak check ────────────────────────────────────────────────────────
KEY_FIELDS = ["gemini_api_key", "apiKey", "api_key"]
leaked = [k for k in KEY_FIELDS if d.get(k, "").strip()]
if leaked:
    print(f"WARNING: Key fields have values in source: {leaked}")
    print("These are public! Revoke them at console.cloud.google.com/apis/credentials")
    print("The Admin Panel saves keys to localStorage only — not to this file.")

# ── Model enforcement ─────────────────────────────────────────────────────
MODEL_FIELDS = {
    # field_in_json               recommended_value
    "gemini_model":         RECOMMENDED_DEFAULT,
    "gemini_model_premium": RECOMMENDED_PREMIUM,
    "defaultModel":         RECOMMENDED_DEFAULT,
    "premiumModel":         RECOMMENDED_PREMIUM,
}

corrected = []
for field, recommended in MODEL_FIELDS.items():
    current = d.get(field, "")
    if not current:
        d[field] = recommended
        corrected.append(f"  {field}: (missing) → {recommended}")
    elif current in RETIRED_MODELS:
        d[field] = recommended
        corrected.append(f"  {field}: '{current}' is retired → {recommended}")
    else:
        print(f"  {field}: {current}  ✓")

if corrected:
    print("\n⚠ Model corrections applied:")
    for c in corrected:
        print(c)
    # Write corrected config back so source stays in sync with deployed version
    with open(SRC, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  Source file updated: {SRC}")
else:
    print("\nAll models OK — no corrections needed.")

# ── Deploy ────────────────────────────────────────────────────────────────
shutil.copy2(SRC, DEST)
print(f"\nOK: deployed data_ai_config.json ({len(d)} fields) → {DEST}")
