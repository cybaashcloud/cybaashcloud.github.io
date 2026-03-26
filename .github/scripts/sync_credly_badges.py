#!/usr/bin/env python3
"""
sync_credly_badges.py  —  Credly Badge Auto-Sync  (v3)

Fetches NEW Credly badges from the user's public Credly profile and adds
them into data_creds_*.json exactly matching the format used by existing
badges (credlyBadgeId, credlyImageUrl, url, tags, title, issuer, date,
pdf/certificate URL, and real skill tags pulled directly from the Credly API).

HOW IT WORKS
─────────────
1.  Reads all existing badge IDs from data_creds_*.json (so we never add
    duplicates).
2.  Calls the Credly public web endpoint:
      GET https://www.credly.com/users/{username}/badges.json
    to retrieve the user's full badge list (paginated).
3.  For every badge that is NOT already in the JSON files:
    a)  Calls the OBI v2 assertion endpoint to get the full badge detail
        including the real badge image URL, skills, and issuer:
          GET https://api.credly.com/v1/obi/v2/assertions/{badge_id}
    b)  Downloads the badge image and encodes it as a base64 data-URI.
        Retries up to 3 times on transient network failures.
    c)  Extracts real skill tags from badge alignment (OBI), badge.tags,
        or falls back to a rich keyword heuristic.
    d)  Extracts the real issuer name with multiple fallback paths.
    e)  Builds a full credential object matching the existing schema.
    f)  Appends it to whichever data_creds_N.json has the most entries
        but is still below the cap (fills files before creating new ones),
        or creates data_creds_6.json etc. as needed.
4.  Writes updated JSON files back to disk.

FIXES vs v2
────────────
  FIX 1 — _extract_image_url: CDN fallback now uses badge_template.image.id
           (the image UUID) instead of the earned badge assertion ID.
  FIX 2 — _extract_image_url: OBI badge.image dict URL is validated to be a
           real image URL (not an internal Credly API endpoint).
  FIX 3 — _badge_to_credential: stores None instead of "" when image download
           fails, so frontend CDN fallback logic works correctly.
  FIX 4 — _download_image_b64: retries up to 3 times on transient CI failures.
  FIX 5 — _append_credential: fills the most-populated file first (was
           mistakenly picking the least-populated file).
  FIX 6 — _patch_existing_badge: force-resync now also re-patches badges whose
           credlyImageUrl is an empty string (not just None).

ENVIRONMENT VARIABLES
──────────────────────
  CREDLY_USERNAME   — required  e.g. "mohamedaasiq"
  FORCE_RESYNC      — optional  "true" to re-download and patch existing badges
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
FORCE_RESYNC    = os.environ.get("FORCE_RESYNC", "false").strip().lower() == "true"

# Public web endpoint — lists all earned badges for a user (paginated)
CREDLY_LIST_URL      = "https://www.credly.com/users/{username}/badges.json"
# OBI v2 assertion endpoint — full badge detail: image, skills, issuer, evidence
CREDLY_ASSERTION_URL = "https://api.credly.com/v1/obi/v2/assertions/{badge_id}"
# Public badge page URL
CREDLY_BADGE_URL     = "https://www.credly.com/badges/{badge_id}"

# Credly CDN — image URLs always take this form:
#   https://images.credly.com/size/340x340/images/{image_uuid}/image.png
# The {image_uuid} comes from badge_template.image.id, NOT the earned badge ID.
CREDLY_CDN_TEMPLATE  = "https://images.credly.com/size/340x340/images/{image_id}/image.png"

# ── Rich skill taxonomy ────────────────────────────────────────────────────
SKILL_TAXONOMY = {
    "offensive":    ["ethical hacking", "penetration", "pentest", "pen test",
                     "red team", "exploit", "kali", "metasploit", "burp suite",
                     "web hacking", "ctf", "offensive", "vulnerability assessment",
                     "vulnerability scanning", "attack", "social engineering",
                     "privilege escalation", "reverse engineering"],
    "defensive":    ["blue team", "soc", "siem", "incident response", "threat hunting",
                     "threat intelligence", "malware", "forensics", "dfir", "endpoint",
                     "ids", "ips", "firewall", "defensive", "monitoring", "detection",
                     "intrusion", "threat detection", "security operations",
                     "host-based intrusion", "antimalware", "access controls"],
    "cloud":        ["aws", "azure", "gcp", "google cloud", "cloud", "devops",
                     "docker", "kubernetes", "containers", "devsecops", "ci/cd",
                     "infrastructure", "serverless", "amazon web services",
                     "microsoft azure", "cloud practitioner", "cloud quest",
                     "cloud computing", "cloud security", "cloud platform"],
    "networking":   ["network", "cisco", "ccna", "tcp", "ip", "udp", "protocol",
                     "routing", "switching", "vpn", "packet", "wireshark",
                     "network hardening", "network infrastructure", "wlan",
                     "wireless", "network vulnerabilities"],
    "systems":      ["linux", "bash", "shell", "unix", "operating system", "canonical",
                     "ubuntu", "kernel", "sysadmin", "windows", "endpoint protection",
                     "system hardening"],
    "programming":  ["python", "javascript", "java", "c++", "c#", "rust", "golang",
                     "coding", "development", "software", "scripting", "html", "css",
                     "typescript", "react", "node"],
    "data":         ["data", "machine learning", "analytics", "sql", "tableau",
                     "power bi", "statistics", "deep learning", "neural network",
                     "artificial intelligence", "generative ai", "llm",
                     "data visualization", "data science", "business intelligence",
                     "amazon q", "quicksight"],
    "professional": ["leadership", "management", "communication", "marketing",
                     "project management", "agile", "scrum", "business", "design thinking",
                     "enterprise design", "product management", "governance", "compliance",
                     "risk", "data privacy", "professional"],
    "security":     ["security", "cybersecurity", "cyber", "information security",
                     "infosec", "owasp", "zero trust", "encryption", "cryptography",
                     "iam", "identity", "access management", "key management",
                     "threat modeling", "security champion", "security fundamentals",
                     "vulnerability management", "grc"],
    "ai":           ["generative ai", "prompt engineering", "large language model",
                     "llm", "chatgpt", "gpt", "machine learning", "deep learning",
                     "neural", "ai developer", "amazon q", "ai tools"],
}

ALL_SKILL_KEYWORDS = {kw: cat for cat, kws in SKILL_TAXONOMY.items() for kw in kws}


# ── Helpers ────────────────────────────────────────────────────────────────

def _headers() -> dict:
    return {
        "User-Agent": "CybaashBot/3.0 (+https://cybaashcloud.github.io)",
        "Accept":     "application/json",
    }


def _text_to_tags(text: str) -> list:
    """Extract taxonomy category tags from free text using keyword matching."""
    lower = text.lower()
    found = set()
    for kw, cat in ALL_SKILL_KEYWORDS.items():
        if kw in lower:
            found.add(cat)
    return sorted(found)


def _api_skills_to_tags(api_skills: list) -> list:
    """
    Convert Credly API skill objects to display tags.
    api_skills = [{"name": "Python"}, {"name": "Cloud Security"}, ...]
    Returns real skill name strings (up to 20), sorted.
    """
    names = []
    seen  = set()
    for s in api_skills:
        name = (s.get("name") or "").strip()
        if name and name.lower() not in seen:
            seen.add(name.lower())
            names.append(name)
        if len(names) >= 20:
            break
    return sorted(names)


def _is_image_url(url: str) -> bool:
    """
    Return True only if the URL looks like a real renderable image,
    not an internal Credly API endpoint.

    FIX 2: OBI badge.image dict may contain API endpoint URLs like
    https://api.credly.com/v1/obi/v2/badge_classes/.../image
    which are JSON resources, not renderable images.
    """
    if not url or not url.startswith("http"):
        return False
    image_signals = (
        "images.credly.com",
        ".png",
        ".jpg",
        ".jpeg",
        ".svg",
        ".webp",
        ".gif",
    )
    return any(sig in url.lower() for sig in image_signals)


# FIX 1 + FIX 2
def _extract_image_url(obi: dict, raw: dict) -> str:
    """
    Extract badge image URL. Priority:
      1. obi.badge.image  (string URL or {"id": url} / {"url": url})
         — validated to be a real image URL, not a Credly API endpoint
      2. raw.badge_template.image.url / image_url
      3. Credly CDN using badge_template.image.id  ← FIX 1
         (the image UUID stored in the template, not the earned badge ID)
      4. Last-resort CDN attempt using the earned badge_id
    """
    # 1. OBI assertion badge.image
    badge = obi.get("badge", {}) or {}
    img   = badge.get("image")
    if img:
        if isinstance(img, str) and _is_image_url(img):          # FIX 2
            return img
        if isinstance(img, dict):
            for key in ("id", "url"):
                candidate = img.get(key) or ""
                if _is_image_url(candidate):                      # FIX 2
                    return candidate

    # 2. List endpoint badge_template fields
    tmpl = raw.get("badge_template", {}) or {}
    img2 = tmpl.get("image") or {}
    if isinstance(img2, dict):
        u = img2.get("url", "")
        if u and _is_image_url(u):
            return u
    elif isinstance(img2, str) and _is_image_url(img2):
        return img2

    for field in ("image_url",):
        u = (tmpl.get(field) or raw.get(field) or "").strip()
        if _is_image_url(u):
            return u

    # 3. FIX 1 — CDN fallback using badge_template.image.id (the image UUID)
    #    The Credly CDN URL format is:
    #      https://images.credly.com/size/340x340/images/{IMAGE_UUID}/image.png
    #    where IMAGE_UUID is badge_template.image.id — NOT the earned badge ID.
    tmpl_img = tmpl.get("image") or {}
    image_id = ""

    if isinstance(tmpl_img, dict):
        # image.id is sometimes a full URL; extract the UUID segment from it
        raw_id = (tmpl_img.get("id") or "").strip()
        if raw_id:
            # If it's already a UUID (no slashes), use it directly
            if "/" not in raw_id:
                image_id = raw_id
            else:
                # Extract UUID from a URL like:
                # https://api.credly.com/v1/obi/v2/badge_classes/{UUID}/image
                # https://images.credly.com/size/340x340/images/{UUID}/image.png
                parts = [p for p in raw_id.split("/") if p]
                # The UUID is typically 36 chars (with hyphens) or 32 chars
                for part in reversed(parts):
                    if len(part) in (32, 36) and part not in ("image", "image.png"):
                        image_id = part
                        break

    if not image_id:
        # Try badge_template.image_id as a direct field
        image_id = (tmpl.get("image_id") or "").strip()

    if image_id:
        cdn_url = CREDLY_CDN_TEMPLATE.format(image_id=image_id)
        print(f"    [img] CDN fallback (template image id): {cdn_url[:80]}")
        return cdn_url

    # 4. Absolute last resort — use the earned badge assertion ID.
    #    This rarely works but is better than nothing.
    badge_id = raw.get("id", "").strip()
    if badge_id:
        cdn_url = CREDLY_CDN_TEMPLATE.format(image_id=badge_id)
        print(f"    [img] CDN fallback (badge id — may 404): {cdn_url[:80]}")
        return cdn_url

    return ""


# FIX 4
def _download_image_b64(url: str, session) -> Optional[str]:
    """
    Download image and return as base64 data-URI string.
    Retries up to 3 times on transient network failures (common in CI).
    """
    if not url:
        return None
    for attempt in range(1, 4):
        try:
            r = session.get(url, headers=_headers(), timeout=25)
            if r.status_code == 200:
                ct = r.headers.get("content-type", "image/png").split(";")[0].strip()
                if not ct.startswith("image/"):
                    ct = "image/png"
                b64 = base64.b64encode(r.content).decode()
                return f"data:{ct};base64,{b64}"
            print(f"    [img] HTTP {r.status_code} for {url[:60]} (attempt {attempt}/3)")
        except Exception as e:
            print(f"    [img] download error (attempt {attempt}/3): {e}")
        if attempt < 3:
            time.sleep(1.5)
    return None


def _fetch_obi_assertion(badge_id: str, session) -> dict:
    """
    Fetch full badge detail from the OBI v2 assertion endpoint.
    Returns the parsed JSON dict, or {} on failure.

    Key fields in the response we use:
      badge.name           - badge title
      badge.image          - image URL (string) or {"id": url}
      badge.issuer.name    - issuer name
      badge.alignment[]    - skill alignments with targetName
      badge.tags[]         - simple tag strings
      badge.description    - description for fallback heuristic
      evidence[]           - certificate/PDF URLs
      issuedOn             - ISO date string
    """
    url = CREDLY_ASSERTION_URL.format(badge_id=badge_id)
    try:
        r = session.get(url, headers=_headers(), timeout=20)
        if r.status_code == 200:
            return r.json()
        print(f"    [obi] HTTP {r.status_code} for badge {badge_id}")
    except Exception as e:
        print(f"    [obi] fetch error for {badge_id}: {e}")
    return {}


def _extract_issuer(obi: dict, raw: dict) -> str:
    """
    Extract real issuer name. Priority:
      1. obi.badge.issuer.name   (most reliable)
      2. obi.badge.issuing_org.name
      3. raw.badge_template.issuing_org.name
      4. raw.badge_template.issuer.name / issuer (string)
      5. raw.issuer_name
      6. "Credly"
    """
    # 1-2. OBI assertion
    badge = obi.get("badge", {}) or {}
    for key in ("issuer", "issuing_org"):
        obj = badge.get(key) or {}
        if isinstance(obj, dict):
            name = obj.get("name", "").strip()
            if name:
                return name
        elif isinstance(obj, str) and obj.strip():
            return obj.strip()

    # 3-4. List endpoint badge_template
    tmpl = raw.get("badge_template", {}) or {}
    for key in ("issuing_org", "issuer"):
        obj = tmpl.get(key) or {}
        if isinstance(obj, dict):
            name = obj.get("name", "").strip()
            if name:
                return name
        elif isinstance(obj, str) and obj.strip():
            return obj.strip()

    # 5. Top-level list endpoint field
    name = (raw.get("issuer_name") or "").strip()
    if name:
        return name

    return "Credly"


def _extract_skills(obi: dict, raw: dict, title: str, issuer: str) -> list:
    """
    Extract skill tags. Priority:
      1. obi.badge.alignment[].targetName  (official skill alignments — best)
      2. obi.badge.tags[]                  (simple tag strings)
      3. raw.badge_template.skills[].name  (list endpoint skills array)
      4. Rich keyword heuristic on title + issuer + description
    """
    badge = obi.get("badge", {}) or {}

    # 1. OBI alignment — real skill names from the badge definition
    alignments = badge.get("alignment") or []
    if alignments:
        tags = []
        seen = set()
        for a in alignments:
            name = (a.get("targetName") or a.get("target_name") or "").strip()
            if name and name.lower() not in seen:
                seen.add(name.lower())
                tags.append(name)
        if tags:
            return sorted(tags[:25])

    # 2. OBI badge.tags (simple string list)
    obi_tags = badge.get("tags") or []
    if obi_tags and isinstance(obi_tags, list) and len(obi_tags) > 0:
        if isinstance(obi_tags[0], str):
            clean = [t.strip() for t in obi_tags if t.strip()]
            if clean:
                return sorted(clean[:25])

    # 3. List endpoint badge_template.skills
    tmpl       = raw.get("badge_template", {}) or {}
    api_skills = tmpl.get("skills") or []
    if api_skills:
        tags = _api_skills_to_tags(api_skills)
        if tags:
            return tags

    # 4. Rich keyword heuristic
    desc     = (badge.get("description") or tmpl.get("description") or "").strip()
    combined = f"{title} {issuer} {desc}"
    tags     = _text_to_tags(combined)
    return tags if tags else ["professional"]


def _extract_pdf(obi: dict, raw: dict) -> str:
    """
    Extract certificate/PDF URL. Priority:
      1. obi.evidence[].id  (OBI evidence — most reliable)
      2. raw.badge_template.certificate_url
      3. raw.evidence.url / raw.evidence_file_url
      4. raw.badge_template.global_activity_url
    """
    # 1. OBI evidence array
    evidence = obi.get("evidence") or []
    if isinstance(evidence, list):
        for ev in evidence:
            url = (ev.get("id") or ev.get("url") or "").strip()
            if url and url.startswith("http"):
                return url
    elif isinstance(evidence, dict):
        url = (evidence.get("id") or evidence.get("url") or "").strip()
        if url and url.startswith("http"):
            return url

    # 2-4. List endpoint fields
    tmpl = raw.get("badge_template", {}) or {}
    for field in ("certificate_url", "global_activity_url"):
        url = (tmpl.get(field) or "").strip()
        if url and url.startswith("http"):
            return url

    ev2 = raw.get("evidence") or {}
    if isinstance(ev2, dict):
        url = (ev2.get("url") or "").strip()
        if url and url.startswith("http"):
            return url

    url = (raw.get("evidence_file_url") or "").strip()
    if url and url.startswith("http"):
        return url

    return ""


def _fetch_credly_badge_list(username: str, session) -> list:
    """
    Fetch all badges from the public Credly earner profile list endpoint.
    Returns a list of raw badge dicts.
    """
    url        = CREDLY_LIST_URL.format(username=username)
    all_badges = []
    page       = 1

    while True:
        try:
            r = session.get(
                url,
                headers=_headers(),
                params={"page": page, "page_size": 48},
                timeout=20,
            )
            if r.status_code == 404:
                print(f"  [credly] Profile '{username}' not found (404). "
                      "Check CREDLY_USERNAME env var.")
                return []
            if r.status_code != 200:
                print(f"  [credly] List API error HTTP {r.status_code} on page {page}")
                break

            data   = r.json()
            badges = data.get("data", [])
            if not badges:
                break

            all_badges.extend(badges)

            meta     = data.get("metadata", {}) or {}
            total    = int(meta.get("total_count") or meta.get("count") or len(all_badges))
            per_page = int(meta.get("per_page", 48))

            if len(all_badges) >= total or len(badges) < per_page:
                break

            page += 1
            time.sleep(0.4)

        except Exception as e:
            print(f"  [credly] fetch error on page {page}: {e}")
            break

    return all_badges


def _badge_to_credential(raw: dict, session) -> Optional[dict]:
    """
    Convert a raw Credly list-endpoint badge object to our credential schema.
    Enriches it via the OBI v2 assertion endpoint for image, issuer, tags, pdf.
    Returns None if the badge cannot be processed.
    """
    try:
        badge_id = (raw.get("id") or "").strip()
        if not badge_id:
            return None

        # ── Fetch OBI assertion for enriched data ────────────────────────
        print(f"    Fetching OBI assertion …")
        obi = _fetch_obi_assertion(badge_id, session)
        time.sleep(0.3)

        # ── Title ────────────────────────────────────────────────────────
        tmpl  = raw.get("badge_template", {}) or {}
        obi_b = obi.get("badge", {}) or {}
        name  = (
            (obi_b.get("name") or "").strip() or
            (tmpl.get("name") or "").strip() or
            (raw.get("badge_name") or "").strip() or
            "Unnamed Badge"
        )

        # ── Issuer ───────────────────────────────────────────────────────
        issuer = _extract_issuer(obi, raw)
        print(f"    Issuer   : {issuer}")

        # ── Date ─────────────────────────────────────────────────────────
        issued_at = (raw.get("issued_at") or obi.get("issuedOn") or "").strip()
        date_str  = ""
        if issued_at:
            try:
                dt       = datetime.fromisoformat(issued_at.replace("Z", "+00:00"))
                date_str = dt.strftime("%Y-%m")
            except Exception:
                date_str = issued_at[:7]

        # ── Badge image ──────────────────────────────────────────────────
        image_url        = _extract_image_url(obi, raw)
        credly_image_b64 = None                                   # FIX 3: None, not ""
        if image_url:
            print(f"    Downloading image from {image_url[:70]} …")
            credly_image_b64 = _download_image_b64(image_url, session)  # FIX 4: retries
            if credly_image_b64:
                print(f"    ✓ Image  : {len(credly_image_b64)//1024}KB")
            else:
                print(f"    ✗ Image download failed — card will use CDN fallback")
        else:
            print(f"    ✗ No image URL found")

        # ── Skill tags ───────────────────────────────────────────────────
        tags = _extract_skills(obi, raw, name, issuer)
        print(f"    Tags ({len(tags)}): {', '.join(tags[:5])}{'…' if len(tags)>5 else ''}")

        # ── PDF / Certificate URL ────────────────────────────────────────
        pdf_url = _extract_pdf(obi, raw)
        print(f"    PDF      : {pdf_url[:70] if pdf_url else 'not available'}")

        # ── Public badge URL ─────────────────────────────────────────────
        badge_url = CREDLY_BADGE_URL.format(badge_id=badge_id)

        # ── Assemble credential ──────────────────────────────────────────
        local_id   = "crd" + str(uuid.uuid4()).replace("-", "")[:6]

        credential = {
            "id":              local_id,
            "type":            "credly",
            "title":           name,
            "issuer":          issuer,
            "date":            date_str,
            "url":             badge_url,
            "pdf":             pdf_url,
            "image":           None,
            "logo":            "",
            "tags":            tags,
            "featured":        False,
            "credlyBadgeId":   badge_id,
            "credlyImageUrl":  credly_image_b64,                  # FIX 3: None when missing
            "credlyEarnerUrl": badge_url,
        }
        return credential

    except Exception as e:
        print(f"    [badge] conversion error for {raw.get('id', '?')}: {e}")
        return None


# ── Load / Save JSON files ─────────────────────────────────────────────────

def _load_all_creds(frontend: Path) -> dict:
    """Returns { filepath_str: {"credentials": [...]} } for every data_creds_N.json."""
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


# FIX 5
def _append_credential(files: dict, frontend: Path, cred: dict) -> str:
    """
    Append a credential to the file closest to full (but still below MAX_PER_FILE).
    This fills existing files before creating new ones.

    FIX 5: v2 used `n < best_count` which picked the LEAST populated file,
    spreading badges thinly and creating unnecessary new files. Corrected to
    `n > best_count` so we pack the most-populated eligible file first.

    Creates a new file if all existing ones are at capacity.
    Returns the filepath the credential was appended to.
    """
    best_file  = None
    best_count = -1                                               # FIX 5: start at -1

    for fname, data in files.items():
        n = len(data.get("credentials", []))
        if n < MAX_PER_FILE and n > best_count:                  # FIX 5: > not <
            best_count = n
            best_file  = fname

    if best_file is None:
        new_n    = len(files) + 1
        new_path = str(frontend / CREDS_PATTERN.format(n=new_n))
        files[new_path] = {"credentials": []}
        best_file = new_path

    files[best_file]["credentials"].append(cred)
    return best_file


def _patch_existing_badge(files: dict, raw: dict, obi: dict, session) -> bool:
    """
    Patch an existing credential that is missing image / pdf / tags / issuer.
    Returns True if any field was updated.

    FIX 6: Also treats credlyImageUrl == "" as missing (was only checking None/falsy
    — empty string is falsy in Python so this was already handled, but now we
    also store None instead of "" so the check is consistent going forward).
    """
    badge_id = raw.get("id", "")
    patched  = False

    for data in files.values():
        for cred in data.get("credentials", []):
            if cred.get("credlyBadgeId") != badge_id:
                continue

            title  = cred.get("title", "")
            issuer = cred.get("issuer", "")

            # Fix issuer stuck at "Credly"
            if issuer == "Credly":
                real = _extract_issuer(obi, raw)
                if real and real != "Credly":
                    cred["issuer"] = real
                    issuer = real
                    print(f"    ✓ issuer  : {real}")
                    patched = True

            # Fix weak/missing tags
            if not cred.get("tags") or len(cred.get("tags", [])) <= 2:
                tags = _extract_skills(obi, raw, title, issuer)
                if tags and len(tags) > len(cred.get("tags", [])):
                    cred["tags"] = tags
                    print(f"    ✓ tags    : {tags[:4]}…")
                    patched = True

            # Fix missing PDF
            if not cred.get("pdf"):
                pdf = _extract_pdf(obi, raw)
                if pdf:
                    cred["pdf"] = pdf
                    print(f"    ✓ pdf     : {pdf[:60]}")
                    patched = True

            # FIX 6: treat both None and "" as missing image
            if not cred.get("credlyImageUrl"):
                image_url = _extract_image_url(obi, raw)
                if image_url:
                    b64 = _download_image_b64(image_url, session)  # FIX 4: retries
                    if b64:
                        cred["credlyImageUrl"] = b64
                        print(f"    ✓ image   : {len(b64)//1024}KB")
                        patched = True

            return patched

    return False


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    if not CREDLY_USERNAME:
        print("ERROR: CREDLY_USERNAME environment variable is not set.")
        print("Set it in: repo Settings → Secrets and variables → Actions → New repository secret")
        print("  Name:  CREDLY_USERNAME")
        print("  Value: your Credly username  (e.g. mohamedaasiq)")
        sys.exit(1)

    print(f"Credly username : {CREDLY_USERNAME}")
    print(f"Frontend dir    : {FRONTEND_DIR.resolve()}")
    print(f"Force re-sync   : {FORCE_RESYNC}")
    print()

    try:
        import requests
        session = requests.Session()
    except ImportError:
        print("ERROR: 'requests' not installed. Run: pip install requests")
        sys.exit(1)

    # 1. Load existing credential files
    print("── Loading existing credentials …")
    files          = _load_all_creds(FRONTEND_DIR)
    existing_ids   = _collect_existing_badge_ids(files)
    total_existing = sum(len(d.get("credentials", [])) for d in files.values())
    print(f"   {total_existing} credentials in {len(files)} file(s), "
          f"{len(existing_ids)} known Credly badge IDs")
    print()

    # 2. Fetch badge list from Credly
    print(f"── Fetching badge list for '{CREDLY_USERNAME}' …")
    raw_badges = _fetch_credly_badge_list(CREDLY_USERNAME, session)
    print(f"   Credly returned {len(raw_badges)} badge(s).")
    print()

    if not raw_badges:
        print("No badges returned from Credly. Check CREDLY_USERNAME and try again.")
        _write_summary(0, 0, 0, 0)
        return

    # 3. Split into new vs already stored
    new_badges   = [b for b in raw_badges if b.get("id") and b["id"] not in existing_ids]
    known_badges = [b for b in raw_badges if b.get("id") and b["id"] in existing_ids]

    print(f"── New badges to add : {len(new_badges)}")
    print(f"── Already stored    : {len(known_badges)}")

    # 4. In force-resync mode, identify existing badges that need patching
    patch_targets = []
    if FORCE_RESYNC:
        for b in known_badges:
            bid = b.get("id", "")
            for data in files.values():
                for cred in data.get("credentials", []):
                    if cred.get("credlyBadgeId") == bid:
                        needs = (
                            not cred.get("credlyImageUrl") or   # FIX 6: catches "" and None
                            not cred.get("tags") or
                            len(cred.get("tags", [])) <= 2 or
                            not cred.get("pdf") or
                            cred.get("issuer") == "Credly"
                        )
                        if needs:
                            patch_targets.append(b)
        print(f"── Badges to patch   : {len(patch_targets)} (force-resync)")
    print()

    added   = 0
    skipped = 0
    patched = 0

    # 5. Process new badges
    for raw in new_badges:
        tmpl = raw.get("badge_template", {}) or {}
        name = tmpl.get("name") or raw.get("badge_name") or raw.get("id", "?")
        print(f"  ── Adding: {name[:60]}")
        print(f"     badge_id: {raw.get('id')}")

        cred = _badge_to_credential(raw, session)
        if cred is None:
            print(f"     ✗ Skipped (conversion failed)")
            skipped += 1
            print()
            continue

        target = _append_credential(files, FRONTEND_DIR, cred)
        added += 1
        print(f"     ✓ Added to {Path(target).name}")
        print()
        time.sleep(0.5)

    # 6. Patch existing badges (force-resync mode only)
    for raw in patch_targets:
        tmpl = raw.get("badge_template", {}) or {}
        name = tmpl.get("name") or raw.get("badge_name") or raw.get("id", "?")
        bid  = raw.get("id", "")
        print(f"  ── Patching: {name[:60]}")

        obi = _fetch_obi_assertion(bid, session)
        time.sleep(0.3)

        ok = _patch_existing_badge(files, raw, obi, session)
        if ok:
            patched += 1
            print(f"     ✓ Patched")
        else:
            print(f"     — Nothing needed")
        print()
        time.sleep(0.5)

    if added == 0 and patched == 0:
        print("Nothing to commit — all badges already present and complete.")
        _write_summary(len(raw_badges), 0, 0, skipped)
        return

    # 7. Write modified files back to disk
    print("── Writing updated JSON files …")
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

    print()
    print("── Summary ──────────────────────────────────────────")
    print(f"   Credly badges found  : {len(raw_badges)}")
    print(f"   New badges added     : {added}")
    print(f"   Existing patched     : {patched}")
    print(f"   Skipped              : {skipped}")
    print(f"   Files modified       : {', '.join(modified) if modified else 'none'}")

    _write_summary(len(raw_badges), added, patched, skipped)


def _write_summary(total: int, added: int, patched: int, skipped: int):
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY", "")
    if summary_path:
        try:
            with open(summary_path, "a") as f:
                f.write("## Credly Badge Sync\n")
                f.write(f"- **Total Credly badges found** : {total}\n")
                f.write(f"- **New badges added to JSON**  : {added}\n")
                f.write(f"- **Existing badges patched**   : {patched}\n")
                f.write(f"- **Skipped**                   : {skipped}\n")
        except Exception:
            pass


if __name__ == "__main__":
    main()
