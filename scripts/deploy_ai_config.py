#!/usr/bin/env python3
"""
scripts/deploy_ai_config.py
Called by sync.yml during GitHub Pages deploy.

Does two things:
  1. BLOCKS the deploy if any API key field contains a real value
     (catches accidental commits of secrets).
  2. Strips private key field names from the deployed copy so the
     config schema is not exposed to the public on GitHub Pages.
"""

import json
import os
import sys

SRC  = "frontend/data_ai_config.json"
DEST = "_site/data_ai_config.json"

# Fields that must never have values committed to the repo,
# and whose names should not appear in the public deployed copy.
KEY_FIELDS = [
    "gemini_api_key",
    "apiKey",
    "api_key",
    "access_key",
    "private_key",
]

if not os.path.exists(SRC):
    print("SKIP: frontend/data_ai_config.json not found")
    sys.exit(0)

if not os.path.exists(DEST):
    print("SKIP: _site/data_ai_config.json not present (not copied by Assemble step)")
    sys.exit(0)

d = json.load(open(SRC))

# Block if any key field has a non-empty value
bad = [k for k in KEY_FIELDS if d.get(k, "").strip()]
if bad:
    print(f"BLOCKED: data_ai_config.json contains live API key values in fields: {bad}")
    print("Remove the key values before deploying (keys are injected at runtime by the chatbot).")
    sys.exit(1)

# Write sanitized copy to _site -- strip field names so schema is not public
clean = {k: v for k, v in d.items() if k not in KEY_FIELDS}
json.dump(clean, open(DEST, "w"), indent=2)
print(f"OK: deployed sanitized data_ai_config.json ({len(d) - len(clean)} key fields stripped)")
