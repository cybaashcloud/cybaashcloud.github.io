#!/usr/bin/env bash
# scripts/bootstrap_lfs.sh
# ─────────────────────────────────────────────────────────────────────────────
# LFS IS NO LONGER NEEDED for this repository.
#
# The original portfolio/data.json (~11 MB) required Git LFS to pass
# GitHub's 100 MB push limit. It has been split into 5 smaller files:
#
#   portfolio/data_main.json      (~47 KB)
#   portfolio/data_creds_1.json   (~1.5 MB)
#   portfolio/data_creds_2.json   (~3.3 MB)
#   portfolio/data_creds_3.json   (~3.3 MB)
#   portfolio/data_creds_4.json   (~3.2 MB)
#   portfolio/data_creds_5.json   (overflow buffer)
#
# All five are under 4 MB — no LFS required. Push them normally with git push.
#
# If you had LFS previously set up and want to remove it, run:
#   git lfs uninstall
#   git rm --cached portfolio/data.json   (if it still exists)
#   git add .gitattributes
#   git commit -m "chore: remove Git LFS (data split into smaller files)"
#   git push
#
# This script is kept for reference only and exits immediately.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GREEN='\033[0;32m'; RESET='\033[0m'
info() { echo -e "${GREEN}[INFO]${RESET} $*"; }

info "Git LFS is no longer required for this repository."
info "The data has been split into 5 files under 4 MB each."
info ""
info "Split files:"
for f in \
  "portfolio/data_main.json" \
  "portfolio/data_creds_1.json" \
  "portfolio/data_creds_2.json" \
  "portfolio/data_creds_3.json" \
  "portfolio/data_creds_4.json" \
  "portfolio/data_creds_5.json"; do
  if [ -f "$f" ]; then
    SIZE=$(stat -c%s "$f" 2>/dev/null || stat -f%z "$f")
    info "  ✅  $f  (${SIZE} bytes)"
  else
    info "  ⚠️   $f  (not found — make sure you committed it)"
  fi
done
info ""
info "Push with:  git add portfolio/ && git commit -m 'data: update' && git push"
