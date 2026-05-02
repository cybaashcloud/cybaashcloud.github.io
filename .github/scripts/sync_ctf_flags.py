#!/usr/bin/env python3
"""
sync_ctf_flags.py  —  CTF Flag Auto-Sync  (v3)

Pulls publicly-visible completed CTF rooms/challenges from supported
platforms and merges them into the `flags` array inside data_main.json,
matching the existing schema exactly.

Supported platforms
────────────────────
  TryHackMe   — __NEXT_DATA__ page scrape + public API  (cookie auth optional)
  HackTheBox  — public profile API                      (no auth required)

CHANGES IN v3
──────────────
  FIX 1 — Added THM_SESSION_COOKIE env var support. TryHackMe blocks GitHub
           Actions runner IPs (AWS ranges) with 403 "host_not_allowed" via
           Cloudflare. A session cookie from a logged-in browser bypasses
           this block entirely. Without the cookie, all fetch attempts fail
           silently and no flags are ever written.

  FIX 2 — Fixed strategy execution order in _thm_get_user_id(). Previously
           Strategy 3 (HTML regex) ran BEFORE Strategy 2 (JSON API), meaning
           the API was only tried when the profile page succeeded. Now the
           order matches the documented order: 1 → 2 → 3, so the API is
           attempted independently of the page fetch result.

  FIX 3 — Added workflow_call inputs for thm_username and htb_identifier in
           sync-ctf-flags.yml. When called from weekly-pipeline.yml as a
           reusable workflow, these inputs were undeclared and always empty.

  FIX 4 — Hardened duplicate detection to use both URL and room name, so
           entries with empty/missing url fields are still deduplicated.

  FIX 5 — _thm_fetch_room_meta() short-circuits immediately when the runner
           IP is known to be blocked, avoiding N×3 wasted retry attempts.

  FIX 6 — _get() now detects the "host_not_allowed" deny reason on 403 and
           sets a module-level _THM_BLOCKED flag, preventing subsequent calls
           from retrying and wasting the full timeout * MAX_RETRIES budget.

ENVIRONMENT VARIABLES
──────────────────────
  THM_USERNAME        — TryHackMe username  (e.g. "mohamedaasiq07")
  THM_SESSION_COOKIE  — Value of the "connect.sid" or full Cookie header
                        from a logged-in TryHackMe browser session.
                        Obtain from DevTools → Application → Cookies.
                        Bypasses Cloudflare IP block on GitHub Actions runners.
  HTB_IDENTIFIER      — HackTheBox user ID or username  (optional)
  DATA_MAIN_PATH      — path to data_main.json (default: frontend/data_main.json)
  DRY_RUN             — "true" to print what would change without writing
  FORCE_RESYNC        — "true" to re-process rooms already in the JSON

DEPENDENCIES  (already in .github/scripts/requirements.txt)
─────────────────────────────────────────────────────────────
  pip install requests beautifulsoup4
"""

import json
import os
import random
import re
import string
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("ERROR: Install dependencies — pip install requests beautifulsoup4")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────

DATA_MAIN_PATH     = Path(os.environ.get("DATA_MAIN_PATH", "frontend/data_main.json"))
THM_USERNAME       = os.environ.get("THM_USERNAME", "").strip()
THM_SESSION_COOKIE = os.environ.get("THM_SESSION_COOKIE", "").strip()
HTB_IDENTIFIER     = os.environ.get("HTB_IDENTIFIER", "").strip()
DRY_RUN            = os.environ.get("DRY_RUN", "false").lower() == "true"
FORCE_RESYNC       = os.environ.get("FORCE_RESYNC", "false").lower() == "true"

REQUEST_TIMEOUT = 20
RETRY_DELAY     = 3
MAX_RETRIES     = 3

# Module-level flag: set to True when we detect that the runner IP is blocked
# by TryHackMe/Cloudflare. All subsequent THM calls short-circuit immediately.
_THM_BLOCKED: bool = False

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/json,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}

# ── Category / tag taxonomy ────────────────────────────────────────────────

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Web Exploitation":     ["web", "http", "sql", "injection", "xss", "ssrf",
                             "lfi", "rfi", "upload", "auth bypass", "cookie",
                             "session", "api", "php", "flask", "django", "cms"],
    "Network":              ["network", "packet", "wireshark", "tcp", "udp",
                             "nmap", "port scan", "sniff", "pcap", "smtp",
                             "ftp", "ssh", "dns"],
    "Cryptography":         ["crypto", "cipher", "encrypt", "decrypt", "rsa",
                             "aes", "hash", "base64", "rot13", "otp",
                             "encoding", "steganography"],
    "Reverse Engineering":  ["reverse", "binary", "disassemble", "decompile",
                             "ghidra", "ida", "radare", "elf", "exe", "dll",
                             "crackme", "keygen", "obfuscat"],
    "Pwn / Binary Exploit": ["pwn", "buffer overflow", "bof", "rop", "heap",
                             "stack", "shellcode", "format string",
                             "ret2libc", "aslr", "pie", "canary"],
    "Forensics":            ["forensic", "memory", "volatility", "disk",
                             "artifact", "log analysis", "autopsy", "carve",
                             "recover", "deleted", "timeline"],
    "OSINT":                ["osint", "recon", "reconnaissance", "open source",
                             "google", "shodan", "maltego", "social media",
                             "geolocation", "username"],
    "Linux PrivEsc":        ["privilege escalation", "privesc", "sudo", "suid",
                             "cron", "kernel exploit", "lxd", "docker escape",
                             "capabilities", "writable"],
    "Active Directory":     ["active directory", " ad ", "ldap", "kerberos",
                             "kerberoast", "pass the hash", "bloodhound",
                             "mimikatz", "domain controller"],
    "Steganography":        ["steganography", "steg", "hidden message",
                             "lsb", "exif", "metadata"],
    "Miscellaneous":        [],
}

TAG_KEYWORDS: dict[str, list[str]] = {
    "Web Exploitation":     ["web", "http", "sql", "xss", "ssrf", "lfi", "rfi",
                             "injection", "api", "cms"],
    "Dir Enumeration":      ["directory", "gobuster", "dirb", "dirbuster",
                             "feroxbuster", "ffuf", "enumeration", "fuzzing"],
    "Command Injection":    ["command injection", "rce", "remote code", "exec",
                             "os command"],
    "Linux PrivEsc":        ["privilege escalation", "privesc", "linux", "sudo",
                             "suid", "capabilities"],
    "SQL Injection":        ["sql injection", "sqli", "sqlmap", "database"],
    "Cryptography":         ["crypto", "cipher", "encrypt", "hash", "encoding"],
    "Forensics":            ["forensic", "memory", "volatility", "disk", "carve"],
    "Reverse Engineering":  ["reverse", "disassemble", "ghidra", "binary", "crackme"],
    "OSINT":                ["osint", "recon", "reconnaissance", "footprint"],
    "Active Directory":     ["active directory", "kerberos", "ldap", "domain"],
    "Networking":           ["network", "packet", "wireshark", "tcp", "nmap"],
    "Steganography":        ["steganography", "steg", "hidden"],
    "Buffer Overflow":      ["buffer overflow", "bof", "stack", "shellcode", "rop"],
}

# ── Helpers ────────────────────────────────────────────────────────────────

def _make_id(length: int = 8) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _safe_json(response: requests.Response) -> Optional[dict | list]:
    """
    Safely parse JSON from a response.
    Returns None (never raises) on empty body or parse error.
    """
    try:
        text = response.text.strip()
        if not text:
            return None
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        return None


def _build_headers(accept_html: bool = False) -> dict:
    """Build request headers, injecting the session cookie when available."""
    hdrs = dict(HEADERS)
    if accept_html:
        hdrs["Accept"] = "text/html,application/xhtml+xml,*/*"
    if THM_SESSION_COOKIE:
        # Accept a bare connect.sid value or a full Cookie header string
        if "=" in THM_SESSION_COOKIE:
            hdrs["Cookie"] = THM_SESSION_COOKIE
        else:
            hdrs["Cookie"] = f"connect.sid={THM_SESSION_COOKIE}"
    return hdrs


def _get(url: str, params: dict | None = None,
         retries: int = MAX_RETRIES,
         accept_html: bool = False,
         is_thm: bool = False) -> Optional[requests.Response]:
    """
    GET with retries. Returns None on any failure or empty body.

    is_thm — when True, checks _THM_BLOCKED and short-circuits immediately
             if the runner IP is known to be blocked by TryHackMe.
    """
    global _THM_BLOCKED

    # Short-circuit: don't waste retries when we already know we're blocked
    if is_thm and _THM_BLOCKED:
        return None

    hdrs = _build_headers(accept_html=accept_html)

    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, params=params, headers=hdrs,
                             timeout=REQUEST_TIMEOUT)
            if r.status_code == 200:
                if not accept_html and not r.text.strip():
                    print(f"    [empty-body] {url}")
                    return None
                return r
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", RETRY_DELAY * attempt))
                print(f"    [rate-limit] sleeping {wait}s ...")
                time.sleep(wait)
                continue
            if r.status_code == 403:
                deny_reason = r.headers.get("x-deny-reason", "")
                if is_thm and deny_reason == "host_not_allowed":
                    # GitHub Actions runner IP is on TryHackMe's Cloudflare blocklist.
                    # Set the module flag so all subsequent THM calls skip immediately.
                    print(
                        "    [thm] 403 host_not_allowed — GitHub Actions runner IP "
                        "is blocked by TryHackMe/Cloudflare."
                    )
                    print(
                        "    [thm] Add THM_SESSION_COOKIE to your repository secrets "
                        "(Settings -> Secrets -> Actions) to fix this."
                    )
                    _THM_BLOCKED = True
                    return None
                print(f"    [http 403] {url}")
                return None
            if r.status_code == 404:
                print(f"    [http 404] {url}")
                return None
            print(f"    [http {r.status_code}] {url}")
        except requests.RequestException as exc:
            print(f"    [attempt {attempt}/{retries}] network error: {exc}")
        time.sleep(RETRY_DELAY * attempt)
    return None


def _classify_category(text: str) -> str:
    lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if category == "Miscellaneous":
            continue
        if any(kw in lower for kw in keywords):
            return category
    return "Miscellaneous"


def _extract_tags(text: str) -> list[str]:
    lower = text.lower()
    found = [tag for tag, kws in TAG_KEYWORDS.items() if any(k in lower for k in kws)]
    return found[:6] if found else ["General"]


def _normalize_key(url: str, room: str) -> str:
    """
    Return a stable deduplication key that works even when url is empty.
    FIX: Previously only url was used; entries with missing urls were never
    deduplicated, causing duplicates on FORCE_RESYNC runs.
    """
    if url:
        return url.lower().rstrip("/")
    return room.lower().strip()


# ══════════════════════════════════════════════════════════════════════════
# TryHackMe
# ══════════════════════════════════════════════════════════════════════════

THM_BASE          = "https://tryhackme.com"
THM_PROFILE_URL   = f"{THM_BASE}/p/{{username}}"
THM_PROFILE_API   = f"{THM_BASE}/api/no-auth/user/{{username}}"
THM_COMPLETED_API = f"{THM_BASE}/api/no-auth/hacktivities"
THM_ROOM_API      = f"{THM_BASE}/api/room/details"


def _thm_parse_next_data(html: str) -> Optional[dict]:
    """
    Extract the __NEXT_DATA__ JSON payload embedded in a TryHackMe page.
    This is the most reliable source of structured profile data.
    """
    soup = BeautifulSoup(html, "html.parser")
    tag = soup.find("script", {"id": "__NEXT_DATA__"})
    if not tag or not tag.string:
        return None
    try:
        return json.loads(tag.string)
    except (json.JSONDecodeError, ValueError):
        return None


def _thm_get_user_id(username: str) -> Optional[str]:
    """
    Resolve a TryHackMe username to its internal userId.

    Strategy order (FIXED — was incorrectly 1 -> 3 -> 2, now correct 1 -> 2 -> 3):
      1. __NEXT_DATA__ from public profile page  (most reliable when accessible)
      2. /api/no-auth/user/{username} JSON API   (independent attempt)
      3. Regex scan of profile page HTML          (reuses page from Strategy 1)
    """

    page_html: Optional[str] = None

    # ── Strategy 1: __NEXT_DATA__ ─────────────────────────────────────────
    profile_url = THM_PROFILE_URL.format(username=username)
    r = _get(profile_url, accept_html=True, is_thm=True)
    if r:
        page_html = r.text
        next_data = _thm_parse_next_data(r.text)
        if next_data:
            for path_fn in [
                lambda d: d["props"]["pageProps"]["userData"]["_id"],
                lambda d: d["props"]["pageProps"]["user"]["_id"],
                lambda d: d["props"]["pageProps"]["profileData"]["userId"],
                lambda d: str(d["props"]["pageProps"]["userData"]["userId"]),
                lambda d: d["query"]["userId"],
            ]:
                try:
                    uid = path_fn(next_data)
                    if uid:
                        print(f"    [thm] userId resolved via __NEXT_DATA__: {uid}")
                        return str(uid)
                except (KeyError, TypeError):
                    pass

    # ── Strategy 2: JSON API ──────────────────────────────────────────────
    # FIX: Was nested inside Strategy 1's success block. Now runs independently
    # so the API is tried even when the profile page fetch failed.
    if not _THM_BLOCKED:
        api_url = THM_PROFILE_API.format(username=username)
        r2 = _get(api_url, is_thm=True)
        if r2:
            data = _safe_json(r2)
            if data:
                for path_fn in [
                    lambda d: d["data"]["userInfo"]["_id"],
                    lambda d: d["userInfo"]["_id"],
                    lambda d: d["_id"],
                ]:
                    try:
                        uid = path_fn(data)
                        if uid:
                            print(f"    [thm] userId resolved via API: {uid}")
                            return str(uid)
                    except (KeyError, TypeError):
                        pass

    # ── Strategy 3: raw HTML regex (reuses page fetched in Strategy 1) ────
    if page_html:
        for pattern in [
            r'"userId"\s*:\s*"([a-f0-9]{24})"',
            r'"_id"\s*:\s*"([a-f0-9]{24})"',
            r'userId["\s:=]+([a-f0-9]{24})',
        ]:
            m = re.search(pattern, page_html)
            if m:
                uid = m.group(1)
                print(f"    [thm] userId resolved via HTML regex: {uid}")
                return uid

    print(f"    [thm] Could not resolve userId for {username!r}")
    return None


def _thm_fetch_completed_from_next_data(username: str) -> list[dict]:
    """
    Extract completed rooms directly from the __NEXT_DATA__ block.
    Some profile pages embed the full room list here, avoiding an extra API call.
    """
    r = _get(THM_PROFILE_URL.format(username=username), accept_html=True, is_thm=True)
    if not r:
        return []
    next_data = _thm_parse_next_data(r.text)
    if not next_data:
        return []

    for path_fn in [
        lambda d: d["props"]["pageProps"]["completedRooms"],
        lambda d: d["props"]["pageProps"]["userData"]["completedRooms"],
        lambda d: d["props"]["pageProps"]["rooms"],
    ]:
        try:
            rooms = path_fn(next_data)
            if isinstance(rooms, list) and rooms:
                print(f"    [thm] {len(rooms)} rooms from __NEXT_DATA__")
                return rooms
        except (KeyError, TypeError):
            pass
    return []


def _thm_fetch_completed_rooms(user_id: str, page_size: int = 100) -> list[dict]:
    """Fetch all completed rooms via the public hacktivities API."""
    all_rooms: list[dict] = []
    page = 1
    while True:
        if _THM_BLOCKED:
            break
        r = _get(THM_COMPLETED_API, params={
            "limit":  page_size,
            "page":   page,
            "type":   "completed",
            "userId": user_id,
        }, is_thm=True)
        if not r:
            break
        data = _safe_json(r)
        if not data:
            print(f"    [thm] empty/invalid JSON from hacktivities API (page {page})")
            break
        docs: list[dict] = (
            data.get("data", {}).get("docs") if isinstance(data, dict) else None
        ) or (
            data.get("docs") if isinstance(data, dict) else None
        ) or []
        if not docs:
            break
        all_rooms.extend(docs)
        has_more = (
            (data.get("data", {}).get("hasMore") if isinstance(data, dict) else False)
            or (data.get("hasMore") if isinstance(data, dict) else False)
            or (len(docs) == page_size)
        )
        if not has_more:
            break
        page += 1
        time.sleep(0.5)
    return all_rooms


def _thm_fetch_room_meta(room_code: str) -> dict:
    """
    Fetch full metadata for a single THM room.
    FIX: Short-circuits when IP is blocked to avoid N * MAX_RETRIES wasted calls.
    """
    if _THM_BLOCKED:
        return {}
    r = _get(THM_ROOM_API, params={"codes": room_code}, is_thm=True)
    if not r:
        return {}
    data = _safe_json(r)
    if not data:
        return {}
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data.get(room_code, data)
    return {}


def _thm_room_to_flag(room: dict, username: str) -> dict:
    code  = room.get("code") or room.get("roomCode") or room.get("id") or ""
    title = room.get("title") or code.replace("-", " ").title()

    meta = _thm_fetch_room_meta(code) if code else {}
    if meta:
        time.sleep(0.3)

    desc = (
        meta.get("description")
        or meta.get("details", {}).get("description")
        or room.get("description", "")
        or f"TryHackMe room: {title}"
    )
    desc = re.sub(r"\s+", " ", desc).strip()[:300]

    difficulty = (
        meta.get("difficulty") or room.get("difficulty") or "Unknown"
    ).capitalize()

    task_count = (
        meta.get("totalTasks") or meta.get("taskCount")
        or room.get("totalTasks") or 1
    )

    raw_date = (
        room.get("completedAt") or room.get("completed_at")
        or room.get("createdAt") or ""
    )
    date_str = re.sub(r"T.*", "", str(raw_date)) if raw_date else \
        datetime.now(timezone.utc).strftime("%Y-%m-%d")

    full_text = f"{title} {desc}"
    return {
        "id":          _make_id(),
        "platform":    "TryHackMe",
        "room":        title,
        "difficulty":  difficulty,
        "category":    _classify_category(full_text),
        "flags_count": task_count,
        "date":        date_str,
        "desc":        desc,
        "tags":        _extract_tags(full_text),
        "url":         f"{THM_BASE}/room/{code}",
        "verify_url":  f"{THM_BASE}/p/{username}",
        "writeup_url": "",
    }


def sync_tryhackme(existing_keys: set[str], username: str) -> list[dict]:
    if not username:
        print("[THM] THM_USERNAME not set — skipping TryHackMe")
        return []

    print(f"\n[THM] Syncing TryHackMe profile: {username}")
    if THM_SESSION_COOKIE:
        print("    [thm] Session cookie provided — authenticated requests enabled")
    else:
        print("    [thm] No THM_SESSION_COOKIE set — anonymous requests only")
        print("    [thm]   If blocked with 403, add THM_SESSION_COOKIE to")
        print("    [thm]   your repo secrets (Settings -> Secrets -> Actions).")

    # ── Try to get rooms directly from __NEXT_DATA__ first ────────────────
    rooms = _thm_fetch_completed_from_next_data(username)

    # ── Fall back to API if page didn't have them embedded ────────────────
    if not rooms:
        user_id = _thm_get_user_id(username)
        if not user_id:
            print("[THM] Could not resolve userId — skipping TryHackMe")
            print(f"[THM]   Verify the profile is public: {THM_BASE}/p/{username}")
            if _THM_BLOCKED:
                print("[THM]   Runner IP is blocked. Set THM_SESSION_COOKIE to fix.")
            return []
        print(f"[THM] userId={user_id}")
        rooms = _thm_fetch_completed_rooms(user_id)

    print(f"[THM] {len(rooms)} completed room(s) found")
    if not rooms:
        print("[THM] No rooms returned — profile may be private or API changed")
        return []

    new_flags: list[dict] = []
    for room in rooms:
        code = room.get("code") or room.get("roomCode") or room.get("id") or ""
        if not code:
            continue
        room_url   = f"{THM_BASE}/room/{code}"
        room_title = room.get("title") or code.replace("-", " ").title()
        dedup_key  = _normalize_key(room_url, room_title)

        if dedup_key in existing_keys and not FORCE_RESYNC:
            print(f"    [skip] {code}  (already tracked)")
            continue
        print(f"    [+] {code}")
        new_flags.append(_thm_room_to_flag(room, username))

    print(f"[THM] {len(new_flags)} new room(s) to add")
    return new_flags


# ══════════════════════════════════════════════════════════════════════════
# HackTheBox
# ══════════════════════════════════════════════════════════════════════════

HTB_BASE         = "https://www.hackthebox.com"
HTB_USER_API     = f"{HTB_BASE}/api/v4/user/profile/basic/{{identifier}}"
HTB_MACHINES_API = f"{HTB_BASE}/api/v4/profile/progress/machines/owns/{{user_id}}"
HTB_MACHINE_API  = f"{HTB_BASE}/api/v4/machine/profile/{{machine_id}}"


def _htb_resolve_user_id(identifier: str) -> Optional[str]:
    if identifier.isdigit():
        return identifier
    r = _get(HTB_USER_API.format(identifier=identifier))
    if not r:
        return None
    data = _safe_json(r)
    if not data:
        return None
    try:
        return str(data["profile"]["id"])
    except (KeyError, TypeError):
        return None


def _htb_fetch_owned_machines(user_id: str) -> list[dict]:
    r = _get(HTB_MACHINES_API.format(user_id=user_id))
    if not r:
        return []
    data = _safe_json(r)
    if not data or not isinstance(data, dict):
        return []
    return data.get("profile", {}).get("userOwns", []) or []


def _htb_fetch_machine_meta(machine_id: int | str) -> dict:
    r = _get(HTB_MACHINE_API.format(machine_id=machine_id))
    if not r:
        return {}
    data = _safe_json(r)
    if not data or not isinstance(data, dict):
        return {}
    return data.get("info", {})


def _htb_machine_to_flag(own: dict, user_id: str) -> dict:
    machine_id = own.get("id", "")
    name       = own.get("name", f"HTB-{machine_id}")

    meta       = _htb_fetch_machine_meta(machine_id) if machine_id else {}
    if meta:
        time.sleep(0.3)

    difficulty = (
        meta.get("difficultyText") or own.get("difficultyText") or "Unknown"
    ).capitalize()

    os_name = meta.get("os", "Linux")
    desc    = (
        meta.get("synopsis") or meta.get("description")
        or f"HackTheBox {os_name} machine. Gain user and root access."
    )
    desc = re.sub(r"\s+", " ", desc).strip()[:300]

    raw_date = own.get("user_own_time") or own.get("root_own_time") or ""
    date_str = re.sub(r"T.*", "", str(raw_date)) if raw_date else \
        datetime.now(timezone.utc).strftime("%Y-%m-%d")

    full_text    = f"{name} {desc} {os_name}"
    machine_slug = name.lower().replace(" ", "-")

    return {
        "id":          _make_id(),
        "platform":    "HackTheBox",
        "room":        name,
        "difficulty":  difficulty,
        "category":    _classify_category(full_text),
        "flags_count": 2,
        "date":        date_str,
        "desc":        desc,
        "tags":        _extract_tags(full_text),
        "url":         f"{HTB_BASE}/machines/{machine_slug}",
        "verify_url":  f"{HTB_BASE}/profile/{user_id}",
        "writeup_url": "",
    }


def sync_hackthebox(existing_keys: set[str], identifier: str) -> list[dict]:
    if not identifier:
        print("[HTB] HTB_IDENTIFIER not set — skipping HackTheBox")
        return []

    print(f"\n[HTB] Syncing HackTheBox identifier: {identifier}")

    user_id = _htb_resolve_user_id(identifier)
    if not user_id:
        print(f"[HTB] Could not resolve userId for {identifier!r} — skipping")
        return []

    print(f"[HTB] userId={user_id}")
    owns = _htb_fetch_owned_machines(user_id)
    print(f"[HTB] {len(owns)} owned machine(s) found")

    new_flags: list[dict] = []
    for own in owns:
        machine_name = own.get("name", "")
        machine_slug = machine_name.lower().replace(" ", "-")
        machine_url  = f"{HTB_BASE}/machines/{machine_slug}"
        dedup_key    = _normalize_key(machine_url, machine_name)

        if dedup_key in existing_keys and not FORCE_RESYNC:
            print(f"    [skip] {machine_name}  (already tracked)")
            continue
        print(f"    [+] {machine_name}")
        new_flags.append(_htb_machine_to_flag(own, user_id))

    print(f"[HTB] {len(new_flags)} new machine(s) to add")
    return new_flags


# ══════════════════════════════════════════════════════════════════════════
# Auto-detect usernames from data_main.json
# ══════════════════════════════════════════════════════════════════════════

def _auto_detect_usernames(data_main: dict) -> tuple[str, str]:
    about   = data_main.get("about", {})
    thm_url = about.get("tryhackme", "")
    htb_url = about.get("hackthebox", "")

    thm_user = ""
    if thm_url:
        m = re.search(r"/p/([^/?\s]+)", thm_url)
        if m:
            thm_user = m.group(1)

    htb_user = ""
    if htb_url:
        m = re.search(r"/profile/([^/?\s]+)", htb_url)
        if m:
            htb_user = m.group(1)

    return thm_user, htb_user


# ══════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("=" * 60)
    print("  CTF Flag Sync  (v3)")
    print("=" * 60)

    if not DATA_MAIN_PATH.exists():
        print(f"ERROR: {DATA_MAIN_PATH} not found")
        sys.exit(1)

    data_main      = json.loads(DATA_MAIN_PATH.read_text(encoding="utf-8"))
    existing_flags = data_main.setdefault("flags", [])

    # FIX: Build dedup keys using both URL and room name.
    # Previously only url was used — entries with empty/missing urls were never
    # deduplicated, causing duplicate entries on FORCE_RESYNC runs.
    existing_keys: set[str] = {
        _normalize_key(f.get("url", ""), f.get("room", ""))
        for f in existing_flags
    }

    print(f"  Existing flags : {len(existing_flags)}")
    print(f"  Dry run        : {DRY_RUN}")
    print(f"  Force resync   : {FORCE_RESYNC}")

    auto_thm, auto_htb = _auto_detect_usernames(data_main)
    thm_user = THM_USERNAME   or auto_thm
    htb_user = HTB_IDENTIFIER or auto_htb

    if not thm_user and not htb_user:
        print("\nERROR: No platform credentials found.")
        print("  Set THM_USERNAME / HTB_IDENTIFIER env vars, or add profile")
        print("  URLs to data_main.json -> about.tryhackme / about.hackthebox")
        sys.exit(1)

    new_flags: list[dict] = []
    new_flags.extend(sync_tryhackme(existing_keys, thm_user))
    new_flags.extend(sync_hackthebox(existing_keys, htb_user))
    new_flags.sort(key=lambda f: f.get("date", ""))

    print("\n" + "-" * 60)
    print(f"  New flags found : {len(new_flags)}")

    if not new_flags:
        print("  Nothing to update.")
        print("-" * 60)
        return

    for f in new_flags:
        print(f"  [{f['platform']:10s}] {f['room']:40s}  {f['difficulty']}")

    if DRY_RUN:
        print("\n  DRY RUN -- no file written.")
        print("-" * 60)
        return

    data_main["flags"].extend(new_flags)
    DATA_MAIN_PATH.write_text(
        json.dumps(data_main, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"\n  Wrote {len(data_main['flags'])} total flags -> {DATA_MAIN_PATH}")
    print("-" * 60)

    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write("## CTF Flag Sync\n")
            fh.write(f"- **New rooms added:** {len(new_flags)}\n")
            fh.write(f"- **Total flags:** {len(data_main['flags'])}\n\n")
            fh.write("| Platform | Room | Difficulty | Date |\n")
            fh.write("|---|---|---|---|\n")
            for flag in new_flags:
                fh.write(
                    f"| {flag['platform']} | {flag['room']} "
                    f"| {flag['difficulty']} | {flag['date']} |\n"
                )


if __name__ == "__main__":
    main()
