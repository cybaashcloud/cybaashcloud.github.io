#!/usr/bin/env python3
"""
sync_credly_badges.py  —  Credly Badge Auto-Sync

Fetches NEW Credly badges from the user's public Credly profile and adds
them into data_creds_*.json exactly matching the format used by existing
badges (credlyBadgeId, credlyImageUrl, url, tags, title, issuer, date,
pdf/certificate URL, and real skill tags pulled directly from the Credly API).

HOW IT WORKS
─────────────
1.  Reads all existing badge IDs from data_creds_*.json (so we never add
    duplicates).
2.  Calls the Credly public API:
      GET https://api.credly.com/v1/obi/v2/earners/{username}/badges
    to retrieve the user's full badge list.
3.  For every badge that is NOT already in the JSON files:
    a)  Downloads the badge image from Credly and encodes it as a base64
        data-URI (credlyImageUrl), identical to the format already used.
    b)  Builds a full credential object matching the existing schema.
    c)  Appends it to whichever data_creds_N.json file has room (≤ 90
        entries per file), or creates data_creds_6.json etc. as needed.
4.  Writes updated JSON files back to disk.
5.  Prints a summary so the GitHub Actions step summary is useful.

ENVIRONMENT VARIABLES
──────────────────────
  CREDLY_USERNAME   — required  e.g. "mohamedaasiq"
  MAX_BADGES_FILE   — optional  max credentials per file (default: 90)

DEPENDENCIES (installed by workflow)
──────────────────────────────────────
  pip install requests
"""

import base64
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────

FRONTEND_DIR    = Path("frontend")
CREDS_PATTERN   = "data_creds_{n}.json"
MAX_PER_FILE    = int(os.environ.get("MAX_BADGES_FILE", 90))
CREDLY_USERNAME = os.environ.get("CREDLY_USERNAME", "").strip()

CREDLY_EARNER_URL = "https://www.credly.com/users/{username}/badges.json"
CREDLY_BADGE_URL  = "https://www.credly.com/badges/{badge_id}/public_url"

# Skill keywords → tags (mirrors sync_skills.py taxonomy)
SKILL_KEYWORDS = {
    "offensive":    ["ethical hacking", "penetration", "pentest", "red team", "exploit",
                     "kali", "metasploit", "burp", "web hacking", "ctf", "offensive",
                     "vulnerability"],
    "defensive":    ["blue team", "soc", "siem", "incident response", "threat hunting",
                     "threat intelligence", "malware", "forensics", "dfir", "endpoint",
                     "ids", "ips", "firewall", "defensive", "monitoring", "detection"],
    "cloud":        ["aws", "azure", "gcp", "cloud", "devops", "docker", "kubernetes",
                     "containers", "devsecops", "ci/cd", "infrastructure", "serverless",
                     "amazon web services", "microsoft azure"],
    "networking":   ["network", "cisco", "ccna", "tcp", "ip", "protocol", "routing",
                     "switching", "vpn", "packet", "wireshark"],
    "systems":      ["linux", "bash", "shell", "unix", "operating system", "canonical",
                     "ubuntu", "kernel", "sysadmin"],
    "programming":  ["python", "javascript", "java", "c++", "c#", "rust", "golang",
                     "coding", "development", "software", "scripting", "html"],
    "data":         ["data", "machine learning", "ai", "analytics", "sql", "tableau",
                     "power bi", "statistics", "deep learning", "neural network",
                     "artificial intelligence"],
    "professional": ["leadership", "management", "communication", "marketing",
                     "project management", "agile", "scrum", "business"],
    "security":     ["security", "cybersecurity", "cyber", "hacker", "hacking",
                     "information security", "infosec", "owasp", "zero trust",
                     "encryption", "cryptography"],
}

ALL_SKILL_MAP = {kw: cat for cat, kws in SKILL_KEYWORDS.items() for kw in kws}


# ── Helpers ────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {
        "User-Agent": "CybaashBot/1.0 (+https://cybaashcloud.github.io)",
        "Accept":     "application/json",
    }


def _title_to_tags(text: str) -> list:
    lower = text.lower()
    found = set()
    for kw, cat in ALL_SKILL_MAP.items():
        if kw in lower:
            found.add(cat)
    # Also add the raw skill keyword phrases that are prominent
    for kw in ["aws", "cisco", "cybersecurity", "cloud", "linux", "python"]:
        if kw in lower:
            found.add(kw.upper())
    return sorted(found)


def _download_image_b64(url: str, session) -> Optional[str]:
    """Download image and return as base64 data-URI string."""
    try:
        r = session.get(url, headers=_headers(), timeout=20)
        if r.status_code != 200:
            return None
        ct = r.headers.get("content-type", "image/png").split(";")[0].strip()
        if not ct.startswith("image/"):
            ct = "image/png"
        b64 = base64.b64encode(r.content).decode()
        return f"data:{ct};base64,{b64}"
    except Exception as e:
        print(f"    [img] download error: {e}")
        return None


def _fetch_credly_badges(username: str, session) -> list:
    """
    Fetch all badges from a public Credly earner profile.
    Returns a list of raw badge dicts from the Credly API.
    """
    url  = CREDLY_EARNER_URL.format(username=username)
    all_badges = []
    page = 1

    while True:
        try:
            r = session.get(
                url,
                headers=_headers(),
                params={"page": page, "page_size": 48},  # credly.com max page size
                timeout=20,
            )
            if r.status_code == 404:
                print(f"  [credly] Profile '{username}' not found (404). "
                      f"Check CREDLY_USERNAME env var.")
                return []
            if r.status_code != 200:
                print(f"  [credly] API error {r.status_code} on page {page}")
                break

            data   = r.json()
            badges = data.get("data", [])
            if not badges:
                break

            all_badges.extend(badges)
            meta     = data.get("metadata", {})
            # Public endpoint uses 'total_count'; fall back to 'count' for safety
            total    = meta.get("total_count") or meta.get("count") or len(all_badges)
            per_page = meta.get("per_page", 48)  # credly.com default page size is 48

            if len(all_badges) >= total or len(badges) < per_page:
                break
            page += 1
            time.sleep(0.3)   # polite delay

        except Exception as e:
            print(f"  [credly] fetch error on page {page}: {e}")
            break

    return all_badges


def _badge_to_credential(raw: dict, session) -> Optional[dict]:
    """
    Convert a raw Credly API badge object to our credential schema.
    Returns None if the badge cannot be processed.
    """
    try:
        badge_id = raw.get("id", "")
        if not badge_id:
            return None

        # The public endpoint (credly.com/users/{u}/badges.json) nests info
        # under 'badge_template'; fall back to top-level fields for safety.
        badge_template = raw.get("badge_template", {}) or {}
        name           = (badge_template.get("name") or raw.get("badge_name", "")).strip()

        # Issuer: public endpoint has issuer inside badge_template.issuing_org
        # OR at the top level as badge_template.issuer
        issuer_info = (
            badge_template.get("issuing_org") or
            badge_template.get("issuer") or
            {}
        )
        issuer_name = (issuer_info.get("name") or "").strip() or "Credly"

        # Badge image URL — public endpoint puts it at badge_template.image.url
        # OR badge_template.image_url (flat string), OR top-level image_url
        image_info = badge_template.get("image") or {}
        image_url  = (
            (image_info.get("url") if isinstance(image_info, dict) else image_info) or
            badge_template.get("image_url") or
            raw.get("image_url") or
            ""
        )

        # Issued date  e.g. "2026-03-15T12:00:00.000Z"
        issued_at      = raw.get("issued_at", "") or ""
        date_str       = ""
        if issued_at:
            try:
                dt       = datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
                date_str = dt.strftime("%Y-%m")
            except Exception:
                date_str = issued_at[:7]

        # Public badge URL
        badge_url = CREDLY_BADGE_URL.format(badge_id=badge_id)

        # ── Skills / Tags ──────────────────────────────────────────────
        # Prefer real skill names from the API over keyword guessing.
        # Credly public API: badge_template.skills = [{"name": "Python"}, ...]
        api_skills = badge_template.get("skills") or []
        api_skill_names = [s.get("name", "").strip() for s in api_skills if s.get("name")]

        if api_skill_names:
            # Use the actual skill names Credly provides — these are the real tags
            tags = sorted(set(api_skill_names))
            print(f"    Skills from API ({len(tags)}): {', '.join(tags[:5])}{'…' if len(tags)>5 else ''}")
        else:
            # Fall back to keyword heuristic against title + issuer
            tags = _title_to_tags(f"{name} {issuer_name}")
            print(f"    Skills (heuristic): {tags}")

        # ── PDF / Certificate URL ──────────────────────────────────────
        # Credly public API may provide a certificate PDF URL in several places.
        # Check them all in priority order.
        pdf_url = (
            badge_template.get("certificate_url") or          # direct cert PDF
            (raw.get("evidence", {}) or {}).get("url") or     # evidence block
            raw.get("evidence_file_url") or                    # flat field
            badge_template.get("global_activity_url") or      # activity cert page
            ""
        )

        # ── Download badge image as base64 ────────────────────────────
        credly_image_b64 = ""
        if image_url:
            print(f"    Downloading badge image for: {name[:50]} …")
            credly_image_b64 = _download_image_b64(image_url, session) or ""

        # Generate a short local ID so it doesn't collide with existing ones
        local_id = "crd" + str(uuid.uuid4()).replace("-", "")[:6]

        credential = {
            "id":               local_id,
            "type":             "credly",
            "title":            name,
            "issuer":           issuer_name,
            "date":             date_str,
            "url":              badge_url,
            "pdf":              pdf_url,      # Certificate/PDF URL from Credly API
            "image":            None,
            "logo":             "",
            "tags":             tags,
            "featured":         False,
            "credlyBadgeId":    badge_id,
            "credlyImageUrl":   credly_image_b64,
            "credlyEarnerUrl":  badge_url,
        }
        return credential

    except Exception as e:
        print(f"    [badge] conversion error for badge {raw.get('id', '?')}: {e}")
        return None


# ── Load / Save JSON files ─────────────────────────────────────────────────

def _load_all_creds(frontend: Path) -> dict:
    """
    Returns { filename: { "credentials": [...] } } for every data_creds_N.json.
    """
    result = {}
    for n in range(1, 20):
        p = frontend / CREDS_PATTERN.format(n=n)
        if not p.exists():
            break
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            result[str(p)] = data
        except Exception as e:
            print(f"  [load] could not read {p.name}: {e}")
    return result


def _collect_existing_badge_ids(files: dict) -> set:
    """Return a set of all credlyBadgeId values already stored."""
    ids = set()
    for data in files.values():
        for cred in data.get("credentials", []):
            bid = cred.get("credlyBadgeId", "")
            if bid:
                ids.add(bid)
    return ids


def _append_credential(files: dict, frontend: Path, cred: dict) -> str:
    """
    Append a credential to the file with fewest entries (that is still below
    MAX_PER_FILE).  Creates a new file if all existing ones are full.
    Returns the filename it was appended to.
    """
    # Find the file with most space
    best_file = None
    best_count = MAX_PER_FILE + 1

    for fname, data in files.items():
        n = len(data.get("credentials", []))
        if n < MAX_PER_FILE and n < best_count:
            best_count = n
            best_file  = fname

    if best_file is None:
        # All files are full — create a new one
        new_n = len(files) + 1
        new_path = str(frontend / CREDS_PATTERN.format(n=new_n))
        files[new_path] = {"credentials": []}
        best_file = new_path

    files[best_file]["credentials"].append(cred)
    return best_file


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    if not CREDLY_USERNAME:
        print("ERROR: CREDLY_USERNAME environment variable is not set.")
        print("Set it to your Credly username (the part in credly.com/users/<username>).")
        sys.exit(1)

    print(f"Credly username : {CREDLY_USERNAME}")
    print(f"Frontend dir    : {FRONTEND_DIR.resolve()}")
    print()

    try:
        import requests
        session = requests.Session()
    except ImportError:
        print("ERROR: 'requests' not installed. Run: pip install requests")
        sys.exit(1)

    # 1. Load existing credential files
    print("── Loading existing credentials …")
    files = _load_all_creds(FRONTEND_DIR)
    existing_ids = _collect_existing_badge_ids(files)
    total_existing = sum(len(d.get("credentials", [])) for d in files.values())
    print(f"   Found {total_existing} existing credentials across {len(files)} file(s).")
    print(f"   Known Credly badge IDs: {len(existing_ids)}")
    print()

    # 2. Fetch badges from Credly
    print(f"── Fetching badges from Credly for '{CREDLY_USERNAME}' …")
    raw_badges = _fetch_credly_badges(CREDLY_USERNAME, session)
    print(f"   Credly returned {len(raw_badges)} total badge(s).")
    print()

    if not raw_badges:
        print("No badges returned from Credly. Nothing to add.")
        _write_summary(0, 0, 0)
        return

    # 3. Filter to only NEW badges
    new_badges = [
        b for b in raw_badges
        if b.get("id") and b["id"] not in existing_ids
    ]
    print(f"── New badges (not yet in JSON): {len(new_badges)}")

    if not new_badges:
        print("   All Credly badges are already present. Nothing to add.")
        _write_summary(len(raw_badges), 0, 0)
        return

    # 4. Process each new badge
    added   = 0
    skipped = 0

    for raw in new_badges:
        badge_id   = raw.get("id", "?")
        badge_tmpl = raw.get("badge_template", {}) or {}
        badge_name = badge_tmpl.get("name", "Unnamed badge")

        print(f"  Processing: {badge_name[:60]} ({badge_id})")
        cred = _badge_to_credential(raw, session)

        if cred is None:
            print(f"    ✗ skipped (could not convert)")
            skipped += 1
            continue

        target = _append_credential(files, FRONTEND_DIR, cred)
        added += 1
        print(f"    ✓ added to {Path(target).name}")
        time.sleep(0.3)

    print()

    # 5. Write modified files back
    modified = []
    for fname, data in files.items():
        p = Path(fname)
        try:
            p.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            modified.append(p.name)
        except Exception as e:
            print(f"  [write] error writing {p.name}: {e}")

    print(f"── Summary ───────────────────────────────────────────")
    print(f"   Credly badges found : {len(raw_badges)}")
    print(f"   New badges added    : {added}")
    print(f"   Skipped             : {skipped}")
    print(f"   Files updated       : {', '.join(modified) if modified else 'none'}")

    _write_summary(len(raw_badges), added, skipped)


def _write_summary(total: int, added: int, skipped: int):
    """Write to GITHUB_STEP_SUMMARY if available."""
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if summary_path:
        try:
            with open(summary_path, "a") as f:
                f.write("## Credly Badge Sync\n")
                f.write(f"- **Total Credly badges found** : {total}\n")
                f.write(f"- **New badges added to JSON**  : {added}\n")
                f.write(f"- **Skipped**                   : {skipped}\n")
        except Exception:
            pass


if __name__ == "__main__":
    main()
