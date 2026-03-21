#!/usr/bin/env python3
"""
scripts/stamp_sw_version.py  <sw_path>  [<version>]

Replaces VERSION in sw.js.
- If <version> is given, uses that directly.
- If omitted, computes a SHA-256 of all precached shell files (content hash)
  so the SW version changes IFF any cached file actually changed.

Usage in sync.yml:
  python3 scripts/stamp_sw_version.py _site/sw.js
"""
import hashlib, re, sys
from pathlib import Path

if len(sys.argv) < 2:
    print("Usage: stamp_sw_version.py <sw_path> [<version>]")
    sys.exit(1)

sw_path = Path(sys.argv[1])
if not sw_path.exists():
    print(f"ERROR: {sw_path} not found")
    sys.exit(1)

if len(sys.argv) >= 3:
    version = sys.argv[2]
else:
    # Content-hash mode
    site = sw_path.parent
    shell_files = [
        'index.html', 'recruiter.html', 'dashboard.html',
        'style.css', 'mobile.css', 'script.js', 'github.js',
        'cybaash-ai.js', 'cybaash-ai.css', 'cybaash_chatbot.js',
        'ai/index.html', 'ai/cybaash-ai_script.js', 'ai/style.css',
    ]
    h = hashlib.sha256()
    for f in shell_files:
        p = site / f
        if p.exists():
            h.update(p.read_bytes())
    version = f"cybaash-v4-{h.hexdigest()[:8]}"
    print(f"Content hash: {h.hexdigest()[:8]} (from {len(shell_files)} shell files)")

content = sw_path.read_text()
new_content, count = re.subn(
    r"(const VERSION\s*=\s*')[^']*(')",
    rf"\g<1>{version}\g<2>",
    content
)

if count == 0:
    print(f"ERROR: VERSION constant not found in {sw_path}")
    sys.exit(1)

sw_path.write_text(new_content)
print(f"OK: stamped VERSION = '{version}' in {sw_path}")
