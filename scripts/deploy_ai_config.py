#!/usr/bin/env python3
"""
scripts/deploy_ai_config.py
Called by sync.yml during GitHub Pages deploy.

cybaash-ai.js is fully serverless and reads gemini_api_key directly from
/data_ai_config.json at runtime in the browser. The key is intentionally
stored in this public JSON file -- it is set by the user via the admin panel
and written back to the repo. An empty key means demo mode.

This script:
  1. Checks that the file exists and is valid JSON (fast-fail on corruption).
  2. Warns if a Gemini key is present (so you are aware it will be public).
  3. Copies the file as-is to _site/ -- NO fields are stripped.
"""

import json
import os
import sys

SRC  = "frontend/data_ai_config.json"
DEST = "_site/data_ai_config.json"

if not os.path.exists(SRC):
    print("SKIP: frontend/data_ai_config.json not found")
    sys.exit(0)

# Validate JSON is not corrupted
try:
    d = json.load(open(SRC))
except json.JSONDecodeError as e:
    print(f"ERROR: frontend/data_ai_config.json is invalid JSON: {e}")
    sys.exit(1)

# Warn (but don't block) if a Gemini key is committed
key = d.get("gemini_api_key", "") or d.get("apiKey", "")
if key.strip():
    print(f"NOTE: data_ai_config.json contains a Gemini API key -- it will be public on GitHub Pages.")
    print("      This is expected for the serverless chatbot. Rotate the key if it was leaked.")

# Deploy as-is -- cybaash-ai.js needs all fields including the key
import shutil
shutil.copy2(SRC, DEST)
print(f"OK: deployed data_ai_config.json ({len(d)} fields)")
