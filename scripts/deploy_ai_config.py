#!/usr/bin/env python3
"""
scripts/deploy_ai_config.py
Called by sync.yml during GitHub Pages deploy.

Validates data_ai_config.json and copies it to _site/.
The Gemini API key is stored in the user's browser localStorage only
(set via Admin Panel) and is never committed to this file.
This script warns if a key is accidentally present, but does not block.
"""

import json
import os
import sys
import shutil

SRC  = "frontend/data_ai_config.json"
DEST = "_site/data_ai_config.json"

if not os.path.exists(SRC):
    print("SKIP: frontend/data_ai_config.json not found")
    sys.exit(0)

try:
    d = json.load(open(SRC))
except json.JSONDecodeError as e:
    print(f"ERROR: frontend/data_ai_config.json is invalid JSON: {e}")
    sys.exit(1)

# Warn if a key was accidentally committed (should never happen with new admin panel)
KEY_FIELDS = ["gemini_api_key", "apiKey", "api_key"]
leaked = [k for k in KEY_FIELDS if d.get(k, "").strip()]
if leaked:
    print(f"WARNING: Key fields have values in source: {leaked}")
    print("These are public! Revoke them at console.cloud.google.com/apis/credentials")
    print("The Admin Panel now saves keys to localStorage only - not to this file.")

shutil.copy2(SRC, DEST)
print(f"OK: deployed data_ai_config.json ({len(d)} fields)")
