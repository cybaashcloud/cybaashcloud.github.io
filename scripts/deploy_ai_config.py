#!/usr/bin/env python3
"""
scripts/deploy_ai_config.py
Called by sync.yml during GitHub Pages deploy.

Validates data_ai_config.json, enforces the correct Gemini model
based on actual free-tier availability for this project, and copies
the file to _site/. Corrects retired or unsuitable models automatically.
"""

import json, os, sys, shutil

SRC  = "frontend/data_ai_config.json"
DEST = "_site/data_ai_config.json"

# ── Model policy ─────────────────────────────────────────────────────────
# Based on actual rate-limit dashboard for project cybaash:
#   gemini-2.5-flash-lite  →  10 RPM, 250K TPM  ✅ best available
#   gemini-2.5-flash       →  5 RPM,  30 RPD    ❌ 30 req/day too low
#   gemini-2.5-pro         →  0 RPM,  0 RPD     ❌ not available on this key
RECOMMENDED_DEFAULT = "gemini-2.5-flash-lite"
RECOMMENDED_PREMIUM = "gemini-2.5-flash-lite"

RETIRED_MODELS = {
    # Officially retired — return 404
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
    "gemini-pro",
    # Old preview aliases — retired
    "gemini-2.5-flash-lite-preview-06-17",
    "gemini-2.5-pro-preview-03-25",
    "gemini-2.5-pro-preview-05-06",
    # Too restrictive for portfolio use
    "gemini-2.5-flash",   # only 30 RPD on free tier
    "gemini-2.5-pro",     # 0 RPM on this key — not available
}

# ── Load ──────────────────────────────────────────────────────────────────
if not os.path.exists(SRC):
    print("SKIP: frontend/data_ai_config.json not found")
    sys.exit(0)

try:
    d = json.load(open(SRC))
except json.JSONDecodeError as e:
    print(f"ERROR: Invalid JSON: {e}")
    sys.exit(1)

# ── Key leak check ────────────────────────────────────────────────────────
leaked = [k for k in ["gemini_api_key", "apiKey"] if d.get(k, "").strip()]
if leaked:
    print(f"WARNING: API key present in source file: {leaked}")
    print("Revoke at console.cloud.google.com/apis/credentials")

# ── Model enforcement ─────────────────────────────────────────────────────
MODEL_FIELDS = {
    "gemini_model":         RECOMMENDED_DEFAULT,
    "gemini_model_premium": RECOMMENDED_PREMIUM,
    "defaultModel":         RECOMMENDED_DEFAULT,
    "premiumModel":         RECOMMENDED_PREMIUM,
}

corrected = []
for field, recommended in MODEL_FIELDS.items():
    current = d.get(field, "")
    if not current or current in RETIRED_MODELS:
        d[field] = recommended
        corrected.append(f"  {field}: '{current or 'missing'}' → {recommended}")
    else:
        print(f"  {field}: {current}  ✓")

if corrected:
    print("\n⚠ Model corrections applied:")
    for c in corrected: print(c)
    with open(SRC, "w") as f:
        json.dump(d, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  Source updated: {SRC}")
else:
    print("\nAll models OK.")

shutil.copy2(SRC, DEST)
print(f"\nOK: deployed {DEST} ({len(d)} fields)")
