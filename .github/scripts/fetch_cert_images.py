#!/usr/bin/env python3
"""
fetch_cert_images.py — Stage 1 of the weekly pipeline.

For every credential in data_creds_*.json that has a `badgeUrl` or `pdfUrl`
but no local image yet, this script:
  1. Tries to fetch the og:image from the badge/verify URL (LinkedIn, Credly, etc.)
  2. Falls back to rendering the first page of a PDF if a pdfUrl is supplied.
  3. Saves the result as a JPEG under frontend/certificates/auto/<id>.jpg
  4. Writes the relative path back into the JSON as `certJpeg`.

Usage:
    python3 fetch_cert_images.py --dir frontend/

Dependencies (installed by workflow):
    pip install requests beautifulsoup4 pymupdf pillow
"""

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Optional


# ── Helpers ────────────────────────────────────────────────────────────────

def _headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (compatible; CybaashBot/1.0; +https://cybaashcloud.github.io)"
        ),
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
    }


def fetch_og_image(url: str, session) -> Optional[bytes]:
    """Return raw image bytes from og:image meta tag, or None."""
    try:
        import requests
        from bs4 import BeautifulSoup

        r = session.get(url, headers=_headers(), timeout=15, allow_redirects=True)
        if r.status_code != 200:
            return None
        soup = BeautifulSoup(r.text, "html.parser")
        tag = soup.find("meta", property="og:image") or \
              soup.find("meta", attrs={"name": "og:image"})
        if not tag:
            return None
        img_url = tag.get("content", "").strip()
        if not img_url or img_url.startswith("data:"):
            return None
        r2 = session.get(img_url, headers=_headers(), timeout=20)
        return r2.content if r2.status_code == 200 else None
    except Exception as e:
        print(f"    [og:image] error: {e}")
        return None


def render_pdf_page(url: str, session, base_dir: Path = None) -> Optional[bytes]:
    """Render the first page of a PDF to JPEG bytes, or None.

    If `url` is a relative path (no scheme), it is resolved against
    `base_dir` and read from disk. Otherwise it is fetched over HTTP.
    """
    try:
        import fitz  # PyMuPDF
        from io import BytesIO

        # ── Local file path (relative, no scheme) ────────────────────────
        if not url.startswith(("http://", "https://")):
            if base_dir is None:
                print(f"    [pdf] skipping relative URL (no base_dir): {url}")
                return None
            # Strip leading slash so it's relative to base_dir
            pdf_path = (base_dir / url.lstrip("/")).resolve()
            if not pdf_path.exists():
                print(f"    [pdf] local file not found: {pdf_path}")
                return None
            pdf_bytes = pdf_path.read_bytes()
        else:
            # ── Remote URL ────────────────────────────────────────────────
            import requests
            r = session.get(url, headers=_headers(), timeout=30)
            if r.status_code != 200 or "pdf" not in r.headers.get("content-type", ""):
                return None
            pdf_bytes = r.content

        doc  = fitz.open(stream=BytesIO(pdf_bytes), filetype="pdf")
        page = doc[0]
        pix  = page.get_pixmap(dpi=120)
        doc.close()
        return pix.tobytes("jpeg")
    except Exception as e:
        print(f"    [pdf] error: {e}")
        return None


def resize_jpeg(data: bytes, max_w: int = 800, quality: int = 82) -> bytes:
    """Resize image to max_w wide, return JPEG bytes."""
    try:
        from PIL import Image
        from io import BytesIO

        img = Image.open(BytesIO(data)).convert("RGB")
        if img.width > max_w:
            ratio  = max_w / img.width
            img    = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)
        buf = BytesIO()
        img.save(buf, "JPEG", quality=quality, optimize=True)
        return buf.getvalue()
    except Exception as e:
        print(f"    [resize] error: {e}")
        return data


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch cert images for portfolio.")
    parser.add_argument("--dir", default=".", help="Frontend directory (contains data_creds_*.json)")
    parser.add_argument("--force", action="store_true", help="Re-fetch even if image already exists")
    args = parser.parse_args()

    frontend  = Path(args.dir).resolve()
    auto_dir  = frontend / "certificates" / "auto"
    auto_dir.mkdir(parents=True, exist_ok=True)

    try:
        import requests
    except ImportError:
        print("ERROR: 'requests' not installed. Run: pip install requests beautifulsoup4 pymupdf pillow")
        sys.exit(1)

    session  = requests.Session()
    fetched  = 0
    skipped  = 0
    failed   = 0
    modified = set()

    cred_files = sorted(frontend.glob("data_creds_*.json"))
    if not cred_files:
        print("No data_creds_*.json files found.")
        sys.exit(0)

    for cred_file in cred_files:
        data  = json.loads(cred_file.read_text(encoding="utf-8"))
        creds = data.get("credentials", [])
        dirty = False

        for cred in creds:
            cid   = cred.get("id", "")
            title = cred.get("title", "?")
            dest  = auto_dir / f"{cid}.jpg"

            # Skip if already has a local image and not forcing
            if cred.get("certJpeg") and dest.exists() and not args.force:
                skipped += 1
                continue

            badge_url = cred.get("badgeUrl") or cred.get("verifyUrl") or ""
            pdf_url   = cred.get("pdfUrl") or ""

            if not badge_url and not pdf_url:
                skipped += 1
                continue

            print(f"  Fetching: {title[:50]} ({cid})")
            raw = None

            if badge_url:
                raw = fetch_og_image(badge_url, session)
            if raw is None and pdf_url:
                raw = render_pdf_page(pdf_url, session, base_dir=frontend)

            if raw:
                try:
                    jpeg = resize_jpeg(raw)
                    dest.write_bytes(jpeg)
                    rel  = f"certificates/auto/{cid}.jpg"
                    cred["certJpeg"] = rel
                    dirty = True
                    fetched += 1
                    print(f"    ✓ saved {dest.name} ({len(jpeg)//1024}KB)")
                except Exception as e:
                    print(f"    ✗ save error: {e}")
                    failed += 1
            else:
                print(f"    ✗ no image found")
                failed += 1

            time.sleep(0.4)   # polite delay

        if dirty:
            cred_file.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )
            modified.add(cred_file.name)

    print(f"\n── Cert Images ──────────────────────────────────────")
    print(f"  Fetched : {fetched}")
    print(f"  Skipped : {skipped}")
    print(f"  Failed  : {failed}")
    if modified:
        print(f"  Updated files: {', '.join(sorted(modified))}")


if __name__ == "__main__":
    main()
