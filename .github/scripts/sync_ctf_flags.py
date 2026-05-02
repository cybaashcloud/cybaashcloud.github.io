#!/usr/bin/env python3
"""
sync_ctf_flags.py  —  CTF Flag Auto-Sync  (v1)

Pulls publicly-visible completed CTF rooms/challenges from supported
platforms and merges them into the `flags` array inside data_main.json,
matching the existing schema exactly.

Supported platforms
────────────────────
  TryHackMe   — public profile API  (no auth required)
  HackTheBox  — public profile API  (no auth required)

HOW IT WORKS
─────────────
1.  Reads all existing flag IDs from data_main.json (no duplicates ever).
2.  For each configured platform it calls the public JSON API to fetch
    completed rooms / challenges for the given username.
3.  For every room NOT already tracked:
    a)  Fetches room metadata (description, difficulty, tags).
    b)  Classifies the room into a CTF category using a keyword taxonomy.
    c)  Builds a flag object matching the existing schema.
    d)  Appends it to the flags list.
4.  Writes the updated data_main.json back to disk (pretty-printed, same
    indentation as the original file).

ENVIRONMENT VARIABLES
──────────────────────
  THM_USERNAME      — TryHackMe username  (e.g. "mohamedaasiq07")
  HTB_IDENTIFIER    — HackTheBox user ID or username  (optional)
  DATA_MAIN_PATH    — path to data_main.json (default: frontend/data_main.json)
  DRY_RUN           — "true" to print what would change without writing
  FORCE_RESYNC      — "true" to re-process rooms already in the JSON

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

DATA_MAIN_PATH = Path(os.environ.get("DATA_MAIN_PATH", "frontend/data_main.json"))
THM_USERNAME   = os.environ.get("THM_USERNAME", "").strip()
HTB_IDENTIFIER = os.environ.get("HTB_IDENTIFIER", "").strip()
DRY_RUN        = os.environ.get("DRY_RUN", "false").lower() == "true"
FORCE_RESYNC   = os.environ.get("FORCE_RESYNC", "false").lower() == "true"

REQUEST_TIMEOUT = 15   # seconds
RETRY_DELAY     = 2    # seconds between retries
MAX_RETRIES     = 3

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; CTF-flag-sync/1.0; "
        "github-actions/portfolio-sync)"
    ),
    "Accept": "application/json, text/html, */*",
}

# ── Category / tag taxonomy ────────────────────────────────────────────────

CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "Web Exploitation":    ["web", "http", "sql", "injection", "xss", "ssrf",
                            "lfi", "rfi", "upload", "auth bypass", "cookie",
                            "session", "api", "php", "flask", "django"],
    "Network":             ["network", "packet", "wireshark", "tcp", "udp",
                            "nmap", "port", "scan", "sniff", "pcap", "smtp",
                            "ftp", "ssh", "dns", "http"],
    "Cryptography":        ["crypto", "cipher", "encrypt", "decrypt", "rsa",
                            "aes", "hash", "base64", "rot13", "otp",
                            "steganography", "steg"],
    "Reverse Engineering": ["reverse", "binary", "disassemble", "decompile",
                            "ghidra", "ida", "radare", "elf", "exe", "dll",
                            "crackme", "keygen"],
    "Pwn / Binary Exploit":["pwn", "buffer overflow", "bof", "rop", "heap",
                            "stack", "shellcode", "format string", "exploit",
                            "ret2libc", "aslr", "pie", "canary"],
    "Forensics":           ["forensic", "memory", "volatility", "disk",
                            "artifact", "log analysis", "autopsy", "carve",
                            "recover", "deleted"],
    "OSINT":               ["osint", "recon", "reconnaissance", "open source",
                            "google", "shodan", "maltego", "social media",
                            "geolocation"],
    "Linux PrivEsc":       ["privilege escalation", "privesc", "sudo", "suid",
                            "cron", "kernel exploit", "lxd", "docker escape",
                            "capabilities"],
    "Active Directory":    ["active directory", "ad", "ldap", "kerberos",
                            "kerberoast", "pass the hash", "bloodhound",
                            "mimikatz", "domain"],
    "Steganography":       ["steganography", "steg", "hidden", "image",
                            "audio", "lsb", "exif"],
    "Miscellaneous":       [],   # fallback
}

TAG_KEYWORDS: dict[str, list[str]] = {
    "Web Exploitation":    ["web", "http", "sql", "xss", "ssrf", "lfi", "rfi",
                            "injection", "api"],
    "Dir Enumeration":     ["directory", "gobuster", "dirb", "dirbuster",
                            "feroxbuster", "ffuf", "enumeration"],
    "Command Injection":   ["command injection", "rce", "remote code", "exec"],
    "Linux PrivEsc":       ["privilege escalation", "privesc", "linux", "sudo",
                            "suid"],
    "SQL Injection":       ["sql injection", "sqli", "sqlmap"],
    "Cryptography":        ["crypto", "cipher", "encrypt", "hash"],
    "Forensics":           ["forensic", "memory", "volatility", "disk"],
    "Reverse Engineering": ["reverse", "disassemble", "ghidra", "binary"],
    "OSINT":               ["osint", "recon", "reconnaissance"],
    "Active Directory":    ["active directory", "kerberos", "ldap"],
    "Networking":          ["network", "packet", "wireshark", "tcp"],
    "Steganography":       ["steganography", "steg"],
    "Buffer Overflow":     ["buffer overflow", "bof", "stack", "shellcode"],
}

# ── Helpers ────────────────────────────────────────────────────────────────

def _make_id(length: int = 8) -> str:
    """Generate a random alphanumeric ID matching the existing format."""
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def _get(url: str, params: dict | None = None,
         retries: int = MAX_RETRIES) -> Optional[requests.Response]:
    """GET with retries; returns Response or None on failure."""
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, params=params, headers=HEADERS,
                             timeout=REQUEST_TIMEOUT)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                wait = int(r.headers.get("Retry-After", RETRY_DELAY * attempt))
                print(f"    [rate-limit] sleeping {wait}s …")
                time.sleep(wait)
                continue
            print(f"    [http {r.status_code}] {url}")
            return None
        except requests.RequestException as exc:
            print(f"    [attempt {attempt}/{retries}] {exc}")
            time.sleep(RETRY_DELAY * attempt)
    return None


def _classify_category(text: str) -> str:
    """Return the best-matching CTF category for the given description."""
    lower = text.lower()
    for category, keywords in CATEGORY_KEYWORDS.items():
        if category == "Miscellaneous":
            continue
        if any(kw in lower for kw in keywords):
            return category
    return "Miscellaneous"


def _extract_tags(text: str) -> list[str]:
    """Extract up to 6 descriptive tags from the given text."""
    lower = text.lower()
    found = []
    for tag, keywords in TAG_KEYWORDS.items():
        if any(kw in lower for kw in keywords):
            found.append(tag)
    return found[:6] if found else ["General"]


# ══════════════════════════════════════════════════════════════════════════
# TryHackMe
# ══════════════════════════════════════════════════════════════════════════

THM_BASE          = "https://tryhackme.com"
THM_PROFILE_API   = f"{THM_BASE}/api/no-auth/user/{{username}}"
THM_COMPLETED_API = f"{THM_BASE}/api/no-auth/hacktivities"
THM_ROOM_API      = f"{THM_BASE}/api/room/details"


def _thm_get_user_id(username: str) -> Optional[str]:
    """Resolve a THM username to its numeric userId."""
    url = THM_PROFILE_API.format(username=username)
    r = _get(url)
    if not r:
        return None
    data = r.json()
    # Multiple possible response shapes across API versions
    for path in [
        lambda d: d["data"]["userInfo"]["_id"],
        lambda d: d["userInfo"]["_id"],
        lambda d: d["_id"],
        lambda d: str(d["data"]["userInfo"]["userId"]),
    ]:
        try:
            uid = path(data)
            if uid:
                return str(uid)
        except (KeyError, TypeError):
            pass
    # Fallback: scrape profile page
    print("    [thm] JSON profile lookup failed, falling back to page scrape …")
    return _thm_scrape_user_id(username)


def _thm_scrape_user_id(username: str) -> Optional[str]:
    """Scrape the public profile page to extract the userId."""
    r = _get(f"{THM_BASE}/p/{username}")
    if not r:
        return None
    soup = BeautifulSoup(r.text, "html.parser")
    # The userId often appears in a <script> tag as window.__USER_ID__ or similar
    for script in soup.find_all("script"):
        text = script.string or ""
        m = re.search(r'"userId"\s*:\s*"([^"]+)"', text)
        if m:
            return m.group(1)
        m = re.search(r'userId["\s:=]+([a-f0-9]{24})', text)
        if m:
            return m.group(1)
    return None


def _thm_fetch_completed_rooms(user_id: str,
                               page_size: int = 100) -> list[dict]:
    """Fetch all completed rooms for a THM userId."""
    all_rooms: list[dict] = []
    page = 1
    while True:
        r = _get(THM_COMPLETED_API, params={
            "limit":  page_size,
            "page":   page,
            "type":   "completed",
            "userId": user_id,
        })
        if not r:
            break
        data = r.json()
        # API may return {"data": {"docs": [...]}} or {"docs": [...]}
        docs: list[dict] = (
            data.get("data", {}).get("docs")
            or data.get("docs")
            or data.get("data")
            or []
        )
        if not docs:
            break
        all_rooms.extend(docs)
        # Pagination
        has_more = (
            data.get("data", {}).get("hasMore")
            or data.get("hasMore")
            or (len(docs) == page_size)
        )
        if not has_more:
            break
        page += 1
        time.sleep(0.5)   # be polite
    return all_rooms


def _thm_fetch_room_meta(room_code: str) -> dict:
    """Fetch full metadata for a THM room (title, desc, difficulty, tasks)."""
    r = _get(THM_ROOM_API, params={"codes": room_code})
    if not r:
        return {}
    data = r.json()
    # data is often a list; pick the first item
    if isinstance(data, list) and data:
        return data[0]
    if isinstance(data, dict):
        return data.get(data.get("code", room_code), data)
    return {}


def _thm_room_to_flag(room: dict, username: str) -> dict:
    """Convert a raw THM completed-room object to the flag schema."""
    code  = room.get("code", room.get("roomCode", room.get("id", "")))
    title = room.get("title", code.replace("-", " ").title())

    # Fetch detailed metadata (description, task count, difficulty)
    meta = _thm_fetch_room_meta(code) if code else {}
    time.sleep(0.3)

    desc = (
        meta.get("description")
        or meta.get("details", {}).get("description")
        or room.get("description", "")
        or f"TryHackMe room: {title}"
    )
    desc = re.sub(r"\s+", " ", desc).strip()
    if len(desc) > 300:
        desc = desc[:297] + "…"

    difficulty = (
        meta.get("difficulty")
        or room.get("difficulty", "")
        or "Unknown"
    ).capitalize()

    task_count = (
        meta.get("totalTasks")
        or meta.get("taskCount")
        or room.get("totalTasks")
        or 1
    )

    # Date: use completedAt → createdAt → today
    raw_date = (
        room.get("completedAt")
        or room.get("completed_at")
        or room.get("createdAt")
        or ""
    )
    if raw_date:
        # Normalise ISO-8601 to YYYY-MM-DD
        date_str = re.sub(r"T.*", "", str(raw_date))
    else:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    full_text = f"{title} {desc}"
    tags = _extract_tags(full_text)
    category = _classify_category(full_text)

    return {
        "id":          _make_id(),
        "platform":    "TryHackMe",
        "room":        title,
        "difficulty":  difficulty,
        "category":    category,
        "flags_count": task_count,
        "date":        date_str,
        "desc":        desc,
        "tags":        tags,
        "url":         f"{THM_BASE}/room/{code}",
        "verify_url":  f"{THM_BASE}/p/{username}",
        "writeup_url": "",
    }


def sync_tryhackme(existing_urls: set[str], username: str) -> list[dict]:
    """Return a list of new flag objects fetched from TryHackMe."""
    if not username:
        print("[THM] THM_USERNAME not set — skipping TryHackMe")
        return []

    print(f"\n[THM] Syncing TryHackMe profile: {username}")

    user_id = _thm_get_user_id(username)
    if not user_id:
        print(f"[THM] ✗ Could not resolve userId for {username!r}")
        print("[THM]   Make sure the profile is public: "
              f"https://tryhackme.com/p/{username}")
        return []

    print(f"[THM] userId={user_id}")
    rooms = _thm_fetch_completed_rooms(user_id)
    print(f"[THM] {len(rooms)} completed rooms found")

    new_flags: list[dict] = []
    for room in rooms:
        code = room.get("code", room.get("roomCode", room.get("id", "")))
        if not code:
            continue
        room_url = f"{THM_BASE}/room/{code}"
        if room_url in existing_urls and not FORCE_RESYNC:
            print(f"    [skip] {code}  (already tracked)")
            continue
        print(f"    [+] {code}")
        flag = _thm_room_to_flag(room, username)
        new_flags.append(flag)

    print(f"[THM] {len(new_flags)} new room(s) to add")
    return new_flags


# ══════════════════════════════════════════════════════════════════════════
# HackTheBox
# ══════════════════════════════════════════════════════════════════════════

HTB_BASE         = "https://www.hackthebox.com"
HTB_PROFILE_API  = f"{HTB_BASE}/api/v4/profile/{{identifier}}"
HTB_ACTIVITY_API = f"{HTB_BASE}/api/v4/profile/activity/{{user_id}}"
HTB_MACHINES_API = f"{HTB_BASE}/api/v4/profile/progress/machines/owns/{{user_id}}"
HTB_MACHINE_API  = f"{HTB_BASE}/api/v4/machine/profile/{{machine_id}}"


def _htb_resolve_user_id(identifier: str) -> Optional[str]:
    """Resolve username or direct ID for HackTheBox."""
    # Try as direct integer ID first
    if identifier.isdigit():
        return identifier
    # Otherwise query by username
    r = _get(f"{HTB_BASE}/api/v4/user/profile/basic/{identifier}")
    if not r:
        return None
    data = r.json()
    try:
        return str(data["profile"]["id"])
    except (KeyError, TypeError):
        return None


def _htb_fetch_owned_machines(user_id: str) -> list[dict]:
    """Fetch machines owned (user + root) from the public HTB profile."""
    r = _get(HTB_MACHINES_API.format(user_id=user_id))
    if not r:
        return []
    data = r.json()
    return data.get("profile", {}).get("userOwns", []) or []


def _htb_fetch_machine_meta(machine_id: int | str) -> dict:
    """Fetch metadata for a single HTB machine."""
    r = _get(HTB_MACHINE_API.format(machine_id=machine_id))
    if not r:
        return {}
    return r.json().get("info", {})


def _htb_machine_to_flag(own: dict, user_id: str) -> dict:
    """Convert an HTB machine-own object to the flag schema."""
    machine_id = own.get("id", "")
    name       = own.get("name", f"HTB-{machine_id}")

    meta = _htb_fetch_machine_meta(machine_id) if machine_id else {}
    time.sleep(0.3)

    difficulty = (
        meta.get("difficultyText")
        or own.get("difficultyText", "")
        or "Unknown"
    ).capitalize()

    os_name   = meta.get("os", "Linux")
    desc      = (
        meta.get("synopsis")
        or meta.get("description")
        or f"HackTheBox machine running {os_name}. Compromise the box to earn user and root flags."
    )
    desc = re.sub(r"\s+", " ", desc).strip()
    if len(desc) > 300:
        desc = desc[:297] + "…"

    raw_date  = own.get("user_own_time") or own.get("root_own_time") or ""
    if raw_date:
        date_str = re.sub(r"T.*", "", str(raw_date))
    else:
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    full_text = f"{name} {desc} {os_name}"
    tags      = _extract_tags(full_text)
    category  = _classify_category(full_text)

    machine_slug = name.lower().replace(" ", "-")

    return {
        "id":          _make_id(),
        "platform":    "HackTheBox",
        "room":        name,
        "difficulty":  difficulty,
        "category":    category,
        "flags_count": 2,   # user flag + root flag
        "date":        date_str,
        "desc":        desc,
        "tags":        tags,
        "url":         f"{HTB_BASE}/machines/{machine_slug}",
        "verify_url":  f"{HTB_BASE}/profile/{user_id}",
        "writeup_url": "",
    }


def sync_hackthebox(existing_urls: set[str], identifier: str) -> list[dict]:
    """Return a list of new flag objects fetched from HackTheBox."""
    if not identifier:
        print("[HTB] HTB_IDENTIFIER not set — skipping HackTheBox")
        return []

    print(f"\n[HTB] Syncing HackTheBox identifier: {identifier}")

    user_id = _htb_resolve_user_id(identifier)
    if not user_id:
        print(f"[HTB] ✗ Could not resolve userId for {identifier!r}")
        return []

    print(f"[HTB] userId={user_id}")
    owns = _htb_fetch_owned_machines(user_id)
    print(f"[HTB] {len(owns)} owned machines found")

    new_flags: list[dict] = []
    for own in owns:
        machine_id   = own.get("id", "")
        machine_name = own.get("name", "")
        machine_slug = machine_name.lower().replace(" ", "-")
        machine_url  = f"{HTB_BASE}/machines/{machine_slug}"

        if machine_url in existing_urls and not FORCE_RESYNC:
            print(f"    [skip] {machine_name}  (already tracked)")
            continue
        print(f"    [+] {machine_name}")
        flag = _htb_machine_to_flag(own, user_id)
        new_flags.append(flag)

    print(f"[HTB] {len(new_flags)} new machine(s) to add")
    return new_flags


# ══════════════════════════════════════════════════════════════════════════
# Auto-detect config from data_main.json
# ══════════════════════════════════════════════════════════════════════════

def _auto_detect_username(data_main: dict) -> tuple[str, str]:
    """
    Try to read THM username and HTB identifier from data_main.json
    when environment variables are not set.
    """
    about = data_main.get("about", {})
    thm = about.get("tryhackme", "")
    htb = about.get("hackthebox", "")

    # Extract username from profile URLs
    thm_user = ""
    if thm:
        m = re.search(r"/p/([^/?\s]+)", thm)
        if m:
            thm_user = m.group(1)

    htb_user = ""
    if htb:
        m = re.search(r"/profile/([^/?\s]+)", htb)
        if m:
            htb_user = m.group(1)

    return thm_user, htb_user


# ══════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("═" * 60)
    print("  CTF Flag Sync")
    print("═" * 60)

    # ── Load data_main.json ───────────────────────────────────────
    if not DATA_MAIN_PATH.exists():
        print(f"ERROR: {DATA_MAIN_PATH} not found")
        sys.exit(1)

    raw_text = DATA_MAIN_PATH.read_text(encoding="utf-8")
    data_main = json.loads(raw_text)

    existing_flags: list[dict] = data_main.setdefault("flags", [])
    existing_urls: set[str] = {f.get("url", "") for f in existing_flags}

    print(f"  Existing flags : {len(existing_flags)}")
    print(f"  Dry run        : {DRY_RUN}")
    print(f"  Force resync   : {FORCE_RESYNC}")

    # ── Resolve usernames ─────────────────────────────────────────
    auto_thm, auto_htb = _auto_detect_username(data_main)
    thm_user = THM_USERNAME or auto_thm
    htb_user = HTB_IDENTIFIER or auto_htb

    if not thm_user and not htb_user:
        print("\nERROR: No platform credentials found.")
        print("  Set THM_USERNAME and/or HTB_IDENTIFIER env vars,")
        print("  or add profile URLs to data_main.json → about.tryhackme/hackthebox")
        sys.exit(1)

    # ── Fetch from each platform ──────────────────────────────────
    new_flags: list[dict] = []
    new_flags.extend(sync_tryhackme(existing_urls, thm_user))
    new_flags.extend(sync_hackthebox(existing_urls, htb_user))

    # ── Sort new flags by date (newest last, matching existing order) ─
    new_flags.sort(key=lambda f: f.get("date", ""))

    # ── Summary ───────────────────────────────────────────────────
    print("\n" + "─" * 60)
    print(f"  New flags found : {len(new_flags)}")

    if not new_flags:
        print("  Nothing to update.")
        print("─" * 60)
        return

    for f in new_flags:
        print(f"  [{f['platform']:10s}] {f['room']:40s}  {f['difficulty']}")

    # ── Write ─────────────────────────────────────────────────────
    if DRY_RUN:
        print("\n  DRY RUN — no file written.")
        print("─" * 60)
        return

    data_main["flags"].extend(new_flags)

    updated = json.dumps(data_main, indent=2, ensure_ascii=False) + "\n"
    DATA_MAIN_PATH.write_text(updated, encoding="utf-8")

    print(f"\n  ✓ Wrote {len(data_main['flags'])} total flags → {DATA_MAIN_PATH}")
    print("─" * 60)

    # GitHub Actions step summary
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as f:
            f.write("## CTF Flag Sync\n")
            f.write(f"- **New rooms added:** {len(new_flags)}\n")
            f.write(f"- **Total flags:** {len(data_main['flags'])}\n\n")
            if new_flags:
                f.write("| Platform | Room | Difficulty | Date |\n")
                f.write("|---|---|---|---|\n")
                for flag in new_flags:
                    f.write(
                        f"| {flag['platform']} | {flag['room']} "
                        f"| {flag['difficulty']} | {flag['date']} |\n"
                    )


if __name__ == "__main__":
    main()
