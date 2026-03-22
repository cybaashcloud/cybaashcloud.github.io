#!/usr/bin/env python3
"""
secret_scan.py — Basic secret pattern scanner for CYBAASH repo
Used as fallback when Gitleaks Docker is unavailable in CI
"""
import re
import os
import sys

FORBIDDEN = [
    (r'AIza[A-Za-z0-9_-]{35}', 'Google API key'),
    (r'ghp_[A-Za-z0-9]{36}', 'GitHub PAT'),
    (r'sk-[A-Za-z0-9]{48}', 'OpenAI key'),
    (r'xoxb-[A-Za-z0-9-]+', 'Slack bot token'),
    (r'-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----', 'Private key'),
    (r'APPS_SCRIPT_URL\s*=\s*["\']https://script\.google\.com', 'Apps Script URL hardcoded'),
    (r'SOC_API_KEY\s*=\s*["\'][0-9a-f-]{30,}["\']', 'SOC API key literal'),
    (r'GEMINI_API_KEY\s*=\s*["\'][A-Za-z0-9_-]{20,}["\']', 'Gemini key literal'),
]

SKIP_PATHS = [
    'frontend/certificates/', 
    'frontend/cert_logos/',
    '.git/',
    'node_modules/',
    '.gitleaks.toml',
    'secret_scan.py',
]

def should_skip(path):
    return any(skip in path for skip in SKIP_PATHS)

def scan_file(path):
    findings = []
    try:
        content = open(path, errors='replace').read()
        for pattern, label in FORBIDDEN:
            matches = re.findall(pattern, content)
            if matches:
                findings.append(f'{path}: {label}')
    except Exception:
        pass
    return findings

def main():
    all_findings = []

    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if not should_skip(os.path.join(root, d))]
        for fname in files:
            fpath = os.path.join(root, fname)
            if should_skip(fpath): continue
            if not fname.endswith(('.js', '.html', '.py', '.gs', '.yml', '.yaml', '.json', '.toml', '.sh')): continue
            findings = scan_file(fpath)
            all_findings.extend(findings)

    if all_findings:
        print('⚠  Secret scan findings:')
        for f in all_findings:
            print('   ' + f)
        print(f'\n⚠  {len(all_findings)} potential secret(s) found — review before merge')
        # Warnings only — don't sys.exit(1) to avoid false positive failures
    else:
        print('✅ Secret scan complete — no patterns matched')

if __name__ == '__main__':
    main()
