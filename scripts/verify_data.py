#!/usr/bin/env python3
"""
verify_data.py — Portfolio data integrity checker (split-file edition)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

data.json has been split into 5 smaller files:
  portfolio/data_main.json     — about, contact, experience, skills, projects, flags
  portfolio/data_creds_1.json  — credentials batch 1
  portfolio/data_creds_2.json  — credentials batch 2
  portfolio/data_creds_3.json  — credentials batch 3
  portfolio/data_creds_4.json  — credentials batch 4
  portfolio/data_creds_5.json  — credentials batch 5 (overflow buffer)

BACKWARDS COMPATIBILITY: If called with --file portfolio/data.json (old workflow),
this script automatically redirects to verify the 5 split files instead and exits 0.

Exit codes:
  0 — all files valid (or redirected from legacy --file argument)
  1 — any file missing, corrupt, or invalid JSON
"""

import argparse, hashlib, json, os, sys, time
from pathlib import Path

_IS_TTY = sys.stdout.isatty()
def _c(code, t): return f"\033[{code}m{t}\033[0m" if _IS_TTY else t
GREEN  = lambda t: _c("92", t)
RED    = lambda t: _c("91", t)
YELLOW = lambda t: _c("93", t)
BOLD   = lambda t: _c("1",  t)
DIM    = lambda t: _c("2",  t)

SPLIT_FILES = [
    "portfolio/data_main.json",
    "portfolio/data_creds_1.json",
    "portfolio/data_creds_2.json",
    "portfolio/data_creds_3.json",
    "portfolio/data_creds_4.json",
    "portfolio/data_creds_5.json",  # added: overflow buffer (may be empty [])
]
MAIN_REQUIRED_KEYS = {"about", "contact", "skills", "experience", "projects", "flags"}
# data_main.json must stay lean — base64 images extracted to separate portfolio/*.png files
MAIN_MAX_SIZE_KB = 200


def fmt_bytes(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024: return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"

def fmt_duration(s):
    return f"{s*1000:.1f} ms" if s < 1 else f"{s:.2f} s"

def stream_file(path, chunk_size):
    hasher = hashlib.sha256()
    collector = bytearray()
    total = 0
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(chunk_size)
            if not chunk: break
            hasher.update(chunk)
            collector.extend(chunk)
            total += len(chunk)
    return bytes(collector), hasher.hexdigest(), total

def check_json(raw, path):
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as e:
        print(RED(f"  ✖ FAIL: {path} is not valid UTF-8 — {e}"))
        sys.exit(1)
    if raw.startswith(b"version https://git-lfs.github.com/spec/"):
        print(RED(f"  ✖ FAIL: {path} is an LFS pointer — run: git lfs pull"))
        sys.exit(1)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        print(RED(f"  ✖ FAIL: invalid JSON in {path} — {e}"))
        sys.exit(1)

def verify_file(path_str, chunk_size, strict):
    path = Path(path_str)
    print(f"\n  {BOLD(path_str)}")
    if not path.exists():
        print(RED(f"  ✖ FAIL: file not found — {path_str}"))
        sys.exit(1)
    if path.stat().st_size == 0:
        print(RED(f"  ✖ FAIL: file is empty"))
        sys.exit(1)
    raw, sha256, total = stream_file(path, chunk_size)
    data = check_json(raw, path)
    fname = path.name
    if fname == "data_main.json":
        if strict:
            missing = MAIN_REQUIRED_KEYS - set(data.keys())
            if missing:
                print(RED(f"  ✖ FAIL (--strict): missing keys: {sorted(missing)}"))
                sys.exit(1)
            # Guard against re-introduction of base64 blobs bloating the file
            size_kb = total / 1024
            if size_kb > MAIN_MAX_SIZE_KB:
                print(RED(f"  ✖ FAIL (--strict): data_main.json is {size_kb:.1f}KB (max {MAIN_MAX_SIZE_KB}KB)."))
                print(RED(f"     Likely cause: base64 image stored inline. Extract to portfolio/avatar.png instead."))
                sys.exit(1)
        print(f"  {GREEN('✔')}  keys     : {sorted(data.keys())}")
    elif fname.startswith("data_creds_"):
        creds = data.get("credentials")
        if not isinstance(creds, list):
            print(RED(f"  ✖ FAIL: must contain a 'credentials' list"))
            sys.exit(1)
        print(f"  {GREEN('✔')}  credentials: {len(creds)}")
    print(f"  {GREEN('✔')}  sha256   : {sha256}")
    print(f"  {GREEN('✔')}  size     : {fmt_bytes(total)}")
    return data, sha256, total


def main():
    parser = argparse.ArgumentParser(description="Verify portfolio data files.")
    parser.add_argument("--chunk-size", type=int, default=524_288, metavar="BYTES")
    parser.add_argument("--strict", action="store_true")
    # Legacy argument: old workflows passed --file portfolio/data.json
    # We accept and ignore it, redirecting to split-file verification instead.
    parser.add_argument("--file", default=None, metavar="PATH",
                        help="[LEGACY] Ignored. Always verifies the 5 split files.")
    args = parser.parse_args()

    print(BOLD(f"\n{'━'*60}"))
    # Keep old title so legacy workflows still match their expected output format
    print(BOLD("  🔍  data.json Integrity Verifier"))
    print(BOLD(f"{'━'*60}"))

    if args.file and "data.json" in args.file and not args.file.endswith(("_main.json",)):
        print(YELLOW(f"  ⚠  Legacy --file {args.file} detected."))
        print(YELLOW("     portfolio/data.json no longer exists — it was split into 5 files."))
        print(YELLOW("     Redirecting to split-file verification automatically.\n"))

    print(f"  {DIM('Files :')} {len(SPLIT_FILES)}")
    print(f"  {DIM('Chunk :')} {fmt_bytes(args.chunk_size)}")
    print(f"  {DIM('Strict:')} {args.strict}\n")

    t_start = time.monotonic()
    all_cred_ids = []
    total_creds  = 0
    summary      = []

    for f in SPLIT_FILES:
        data, sha256, size = verify_file(f, args.chunk_size, args.strict)
        summary.append((f, sha256, size))
        if "credentials" in data:
            ids = [c.get("id") for c in data["credentials"]]
            all_cred_ids.extend(ids)
            total_creds += len(ids)

    # Duplicate ID check
    if all_cred_ids:
        seen, dupes = set(), set()
        for cid in all_cred_ids:
            if cid in seen: dupes.add(cid)
            seen.add(cid)
        if dupes:
            print(RED(f"\n  ✖ FAIL: duplicate credential IDs: {sorted(dupes)}"))
            sys.exit(1)
        print(f"\n  {GREEN('✔')}  Total credentials: {total_creds}  — no duplicates")

    elapsed = time.monotonic() - t_start
    print(f"  {GREEN('✔')}  All {len(SPLIT_FILES)} files verified in {fmt_duration(elapsed)}\n")

    # GitHub Actions outputs
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write("### ✅ Data Files — Integrity Report\n\n")
            fh.write("| File | Size | SHA-256 |\n|---|---|---|\n")
            for fname, sha, size in summary:
                fh.write(f"| `{fname}` | {fmt_bytes(size)} | `{sha[:16]}…` |\n")
            fh.write(f"\n**Total credentials:** {total_creds}\n")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as fh:
            fh.write(f"total_creds={total_creds}\n")

    print(f"  {GREEN(BOLD('✔  All checks passed.'))}\n")
    print(f"{'━'*60}\n")


if __name__ == "__main__":
    main()
