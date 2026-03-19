#!/usr/bin/env python3
"""
scripts/stamp_sw_version.py <sw_path> <version>

Replaces the VERSION constant in the service worker with the given value
(typically the git commit SHA from CI). This busts the browser cache so
users always get fresh data after a deploy.

Usage:
  python3 scripts/stamp_sw_version.py _site/sw.js "${{ github.sha }}"
"""

import re
import sys

if len(sys.argv) != 3:
    print("Usage: stamp_sw_version.py <sw_path> <version>")
    sys.exit(1)

sw_path, version = sys.argv[1], sys.argv[2]

content = open(sw_path).read()

# Match:  const VERSION = 'anything';
pattern = r"(const VERSION\s*=\s*')[^']*(')"
replacement = rf"\g<1>{version}\g<2>"

new_content, count = re.subn(pattern, replacement, content)

if count == 0:
    print(f"ERROR: could not find 'const VERSION = ...' in {sw_path}")
    print("Check the variable name in sw.js and update this script if it changed.")
    sys.exit(1)

open(sw_path, 'w').write(new_content)
print(f"OK: stamped VERSION = '{version}' in {sw_path}")
