#!/usr/bin/env python3
"""
sync_skills.py — Stage 2 of the weekly pipeline.

Reads every credential in data_creds_*.json. For credentials that have a
local cert image (certJpeg) but no skill tags, it runs Tesseract OCR on the
image and extracts keyword tags. Tags are normalised, de-duplicated, and
written back into the JSON.

If no image is available, a lightweight keyword heuristic runs against the
cert title and issuer instead (no dependencies required for that path).

Usage:
    python3 sync_skills.py --dir frontend/

Dependencies (installed by workflow):
    sudo apt-get install -y tesseract-ocr
    pip install requests pillow pytesseract
"""

import argparse
import json
import re
import sys
from pathlib import Path


# ── Keyword taxonomy (mirrors the JS one in the admin panel) ──────────────

TAXONOMY = {
    "offensive":    ["ethical hacking", "penetration", "pentest", "red team", "exploit",
                     "kali", "metasploit", "burp", "web hacking", "ctf", "offensive", "vulnerability"],
    "defensive":    ["blue team", "soc", "siem", "incident response", "threat hunting",
                     "threat intelligence", "malware", "forensics", "dfir", "endpoint",
                     "ids", "ips", "firewall", "defensive", "monitoring", "detection"],
    "cloud":        ["aws", "azure", "gcp", "cloud", "devops", "docker", "kubernetes",
                     "containers", "devsecops", "ci/cd", "infrastructure", "serverless"],
    "networking":   ["network", "cisco", "ccna", "tcp", "ip", "protocol", "routing",
                     "switching", "vpn", "packet", "wireshark"],
    "systems":      ["linux", "bash", "shell", "unix", "operating system", "canonical",
                     "ubuntu", "kernel", "sysadmin"],
    "programming":  ["python", "javascript", "java", "c++", "c#", "rust", "golang",
                     "coding", "development", "software", "scripting"],
    "data":         ["data", "machine learning", "ai", "analytics", "sql", "tableau",
                     "power bi", "statistics", "deep learning", "neural network"],
    "professional": ["leadership", "management", "communication", "marketing",
                     "project management", "agile", "scrum", "business"],
}

ALL_KEYWORDS = {kw: cat for cat, kws in TAXONOMY.items() for kw in kws}


def text_to_tags(text: str) -> list[str]:
    """Return a deduplicated list of taxonomy tags extracted from free text."""
    lower = text.lower()
    found = []
    for kw, cat in ALL_KEYWORDS.items():
        if kw in lower and cat not in found:
            found.append(cat)
    return sorted(set(found))


def ocr_image(image_path: Path) -> str:
    """Run Tesseract OCR on an image and return the extracted text."""
    try:
        import pytesseract
        from PIL import Image

        img  = Image.open(image_path).convert("L")   # greyscale
        text = pytesseract.image_to_string(img, config="--psm 6")
        return text
    except Exception as e:
        print(f"    [ocr] error on {image_path.name}: {e}")
        return ""


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Sync skill tags onto credentials.")
    parser.add_argument("--dir", default=".", help="Frontend directory")
    parser.add_argument("--force", action="store_true",
                        help="Re-tag even if tags already exist")
    args = parser.parse_args()

    frontend   = Path(args.dir).resolve()
    cred_files = sorted(frontend.glob("data_creds_*.json"))

    if not cred_files:
        print("No data_creds_*.json files found.")
        sys.exit(0)

    total_updated = 0
    total_skipped = 0

    for cred_file in cred_files:
        data  = json.loads(cred_file.read_text(encoding="utf-8"))
        creds = data.get("credentials", [])
        dirty = False

        for cred in creds:
            existing_tags = cred.get("tags", [])
            if existing_tags and not args.force:
                total_skipped += 1
                continue

            # Build candidate text from title + issuer
            candidate = " ".join([
                cred.get("title", ""),
                cred.get("issuer", ""),
                cred.get("description", ""),
            ])

            # Optionally enhance with OCR
            cert_jpeg = cred.get("certJpeg", "")
            if cert_jpeg:
                img_path = frontend / cert_jpeg
                if img_path.exists():
                    ocr_text = ocr_image(img_path)
                    if ocr_text:
                        candidate += " " + ocr_text

            new_tags = text_to_tags(candidate)
            if not new_tags:
                new_tags = ["professional"]   # fallback

            # Merge with any manually added tags
            merged = sorted(set(existing_tags) | set(new_tags))
            if merged != existing_tags:
                cred["tags"] = merged
                dirty = True
                total_updated += 1
                print(f"  ✓ {cred.get('id','?')} tags: {merged}")
            else:
                total_skipped += 1

        if dirty:
            cred_file.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    print(f"\n── Skill Sync ───────────────────────────────────────")
    print(f"  Updated : {total_updated}")
    print(f"  Skipped : {total_skipped}")


if __name__ == "__main__":
    main()
