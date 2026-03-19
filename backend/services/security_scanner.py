"""
services/security_scanner.py
Cybersecurity analysis modules:
  - quick_scan         : flags SQLi/XSS/CSRF patterns in input
  - scan_code          : detects insecure code patterns
  - scan_file_content  : full file analysis
  - check_url_safety   : URL reputation & pattern analysis
  - check_password_strength : NIST-aligned password scoring
  - sanitize_input     : input sanitization helper
"""

import re
import html
import urllib.parse
import math
import string
from typing import Any
from utils.logger import setup_logger

logger = setup_logger(__name__)


# ══════════════════════════════════════════════════════════════════════
# PATTERN LIBRARIES
# ══════════════════════════════════════════════════════════════════════

SQLI_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|TRUNCATE)\b)",
    r"(--|\bOR\b\s+['\"]?\d|'\s*OR\s*'1'\s*=\s*'1)",
    r"(\bEXEC\b|\bEXECUTE\b|\bxp_|\bsp_)",
    r"(;\s*(DROP|DELETE|INSERT|UPDATE)\s)",
    r"SLEEP\s*\(\d+\)|BENCHMARK\s*\(",
    r"LOAD_FILE|INTO\s+OUTFILE|INTO\s+DUMPFILE",
]

XSS_PATTERNS = [
    r"<script[\s>].*?</script>",
    r"javascript\s*:",
    r"on\w+\s*=\s*['\"].*?['\"]",           # onerror=, onclick=, etc.
    r"<\s*(img|svg|iframe|object|embed|link|meta)[^>]+src\s*=",
    r"expression\s*\(",                       # CSS expression()
    r"vbscript\s*:",
    r"data\s*:\s*text/html",
]

CSRF_PATTERNS = [
    r"<form[^>]+action\s*=",
    r"fetch\s*\([^)]+method\s*:\s*['\"]POST['\"]",
    r"XMLHttpRequest|\.ajax\s*\(",
]

INSECURE_CODE_PATTERNS = {
    "python": [
        (r"\beval\s*\(", "eval() — arbitrary code execution risk", "HIGH"),
        (r"\bexec\s*\(", "exec() — arbitrary code execution risk", "HIGH"),
        (r"\bpickle\.loads?\s*\(", "pickle.load() — deserialization attack risk", "HIGH"),
        (r"\bsubprocess\.(call|Popen|run)\s*\([^)]*shell\s*=\s*True", "shell=True subprocess — command injection risk", "HIGH"),
        (r"\bos\.system\s*\(", "os.system() — command injection risk", "MEDIUM"),
        (r"\bhashlib\.(md5|sha1)\s*\(", "Weak hash algorithm (MD5/SHA1) — use SHA-256+ for integrity, Argon2 for passwords", "MEDIUM"),
        (r"random\.\w+\s*\(", "random module — not cryptographically secure, use secrets module", "LOW"),
        (r"assert\b.*,", "assert used for security check — disabled with -O flag", "LOW"),
        (r"SECRET\s*=\s*['\"][\w]+['\"]", "Hardcoded secret detected", "HIGH"),
        (r"PASSWORD\s*=\s*['\"][\w]+['\"]", "Hardcoded password detected", "HIGH"),
    ],
    "javascript": [
        (r"\beval\s*\(", "eval() — arbitrary code execution risk", "HIGH"),
        (r"document\.write\s*\(", "document.write() — XSS risk", "HIGH"),
        (r"innerHTML\s*=", "innerHTML assignment — XSS risk (use textContent)", "MEDIUM"),
        (r"dangerouslySetInnerHTML", "dangerouslySetInnerHTML — XSS risk in React", "MEDIUM"),
        (r"Math\.random\(\)", "Math.random() — not cryptographically secure", "LOW"),
        (r"localStorage\.setItem\s*\([^)]*token", "Token stored in localStorage — use HttpOnly cookies", "MEDIUM"),
        (r"http://", "HTTP (non-HTTPS) URL in code", "LOW"),
    ],
    "php": [
        (r"\$_(?:GET|POST|REQUEST|COOKIE)\[", "Unvalidated user input from superglobal", "MEDIUM"),
        (r"\beval\s*\(", "eval() — arbitrary code execution", "HIGH"),
        (r"\bexec\s*\(|\bshell_exec\s*\(|\bsystem\s*\(|\bpassthru\s*\(", "Shell execution function — command injection risk", "HIGH"),
        (r"\bmysql_query\s*\(", "mysql_query() — deprecated, use PDO/mysqli with prepared statements", "HIGH"),
        (r"\bmd5\s*\(|\bsha1\s*\(", "Weak hash for passwords — use password_hash()", "HIGH"),
        (r"\binclude\s*\(\s*\$", "Dynamic include — LFI/RFI risk", "HIGH"),
        (r"\bpreg_replace\s*\(\s*['\"].*?e['\"]", "preg_replace with /e flag — code execution risk", "HIGH"),
    ],
    "html": [
        (r"<script[^>]+src\s*=\s*['\"]http://", "Non-HTTPS script source", "MEDIUM"),
        (r"<form[^>]*method\s*=\s*['\"]get['\"][^>]*>", "Sensitive form using GET method", "LOW"),
        (r"autocomplete\s*=\s*['\"]?on", "Autocomplete enabled on form (disable for sensitive fields)", "LOW"),
    ],
}

SUSPICIOUS_URL_PATTERNS = [
    (r"(\d{1,3}\.){3}\d{1,3}", "IP address URL — possible phishing"),
    (r"@", "URL contains @ — possible credential in URL"),
    (r"[-]{2,}", "Multiple consecutive hyphens — typosquatting pattern"),
    (r"\.(tk|ml|ga|cf|gq)(/|$)", "Free TLD (.tk/.ml/.ga) — commonly used in phishing"),
    (r"bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly", "URL shortener — destination unknown"),
    (r"paypal|amazon|google|microsoft|apple|netflix|bank",  "Brand name in suspicious context"),
    (r"login|signin|verify|account|secure|update|confirm", "Sensitive action keyword"),
    (r"[a-z0-9]{30,}", "Very long subdomain — suspicious"),
]

MALICIOUS_TLDS = {".xyz", ".top", ".club", ".work", ".date", ".bid", ".trade"}
SAFE_DOMAINS   = {"google.com", "github.com", "stackoverflow.com", "mozilla.org", "python.org"}


# ══════════════════════════════════════════════════════════════════════
# PUBLIC FUNCTIONS
# ══════════════════════════════════════════════════════════════════════

def quick_scan(text: str) -> list[str]:
    """
    Fast input scan — returns list of flag strings (SQLi, XSS, etc.)
    Used on every chat message.
    """
    flags = []
    tl = text.lower()

    for pat in SQLI_PATTERNS:
        if re.search(pat, tl, re.IGNORECASE):
            flags.append("SQLI_PATTERN")
            break

    for pat in XSS_PATTERNS:
        if re.search(pat, tl, re.IGNORECASE | re.DOTALL):
            flags.append("XSS_PATTERN")
            break

    for pat in CSRF_PATTERNS:
        if re.search(pat, tl, re.IGNORECASE):
            flags.append("CSRF_PATTERN")
            break

    return list(set(flags))


def scan_code(code: str, language: str = "auto") -> dict[str, Any]:
    """Full code security analysis."""
    if language == "auto":
        language = _detect_language(code)

    patterns = INSECURE_CODE_PATTERNS.get(language, [])
    issues = []

    for pat, description, severity in patterns:
        matches = list(re.finditer(pat, code, re.IGNORECASE | re.MULTILINE))
        for m in matches:
            line_num = code[:m.start()].count("\n") + 1
            issues.append({
                "line": line_num,
                "severity": severity,
                "description": description,
                "snippet": code[max(0,m.start()-20):m.end()+20].strip(),
                "mitigation": _get_mitigation(description),
            })

    # Count by severity
    counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    for i in issues:
        counts[i["severity"]] = counts.get(i["severity"], 0) + 1

    risk = "HIGH" if counts["HIGH"] > 0 else ("MEDIUM" if counts["MEDIUM"] > 0 else "LOW" if counts["LOW"] > 0 else "SAFE")

    return {
        "language": language,
        "issues": issues,
        "summary": counts,
        "risk_level": risk,
        "total_issues": len(issues),
        "lines_scanned": code.count("\n") + 1,
    }


def scan_file_content(content: str, ext: str) -> dict[str, Any]:
    """Scan uploaded file content."""
    lang_map = {".py": "python", ".js": "javascript", ".php": "php", ".html": "html", ".sh": "shell"}
    language = lang_map.get(ext, "auto")
    code_result = scan_code(content, language)

    # Also do input-level scans
    flags = quick_scan(content)

    # Secrets detection
    secrets = _detect_secrets(content)

    return {
        **code_result,
        "input_flags": flags,
        "secrets_detected": secrets,
        "preview": content[:500] + ("..." if len(content) > 500 else ""),
    }


def check_url_safety(url: str) -> dict[str, Any]:
    """Analyze a URL for safety indicators."""
    url_clean = url.strip()
    flags = []
    risk_score = 0

    # Parse URL
    try:
        parsed = urllib.parse.urlparse(url_clean if "://" in url_clean else "https://" + url_clean)
    except Exception:
        return {"url": url, "risk_level": "UNKNOWN", "flags": ["Invalid URL format"], "score": 100}

    # HTTPS check
    if parsed.scheme == "http":
        flags.append("Non-HTTPS connection — traffic not encrypted")
        risk_score += 20

    # Suspicious patterns
    for pat, desc in SUSPICIOUS_URL_PATTERNS:
        if re.search(pat, url_clean, re.IGNORECASE):
            flags.append(desc)
            risk_score += 15

    # Malicious TLD
    host = parsed.hostname or ""
    for tld in MALICIOUS_TLDS:
        if host.endswith(tld):
            flags.append(f"Suspicious TLD ({tld})")
            risk_score += 25

    # Punycode / IDN homograph
    if "xn--" in host:
        flags.append("IDN/Punycode domain — possible homograph attack")
        risk_score += 30

    # Known safe domain (reduce score)
    for safe in SAFE_DOMAINS:
        if host.endswith(safe):
            risk_score = max(0, risk_score - 30)
            break

    risk_score = min(100, risk_score)
    risk_level = "SAFE" if risk_score < 20 else "LOW" if risk_score < 40 else "MEDIUM" if risk_score < 70 else "HIGH"

    return {
        "url": url_clean,
        "scheme": parsed.scheme,
        "host": host,
        "path": parsed.path,
        "risk_level": risk_level,
        "risk_score": risk_score,
        "flags": flags,
        "recommendation": _url_recommendation(risk_level),
    }


def check_password_strength(password: str) -> dict[str, Any]:
    """NIST SP 800-63B aligned password strength checker."""
    length = len(password)
    score = 0
    feedback = []

    # Length scoring (most important per NIST)
    if length >= 20:   score += 40
    elif length >= 16: score += 35
    elif length >= 12: score += 25
    elif length >= 8:  score += 15
    else:
        score += 5
        feedback.append("Too short — minimum 12 characters recommended (NIST 2023)")

    # Character class diversity
    has_lower  = bool(re.search(r'[a-z]', password))
    has_upper  = bool(re.search(r'[A-Z]', password))
    has_digit  = bool(re.search(r'\d', password))
    has_special = bool(re.search(r'[!@#$%^&*()_+\-=\[\]{};:\'",.<>?/\\|`~]', password))

    diversity = sum([has_lower, has_upper, has_digit, has_special])
    score += diversity * 8

    if not has_upper:   feedback.append("Add uppercase letters")
    if not has_digit:   feedback.append("Add numbers")
    if not has_special: feedback.append("Add special characters (!@#$...)")

    # Entropy estimate
    charset = 0
    if has_lower:   charset += 26
    if has_upper:   charset += 26
    if has_digit:   charset += 10
    if has_special: charset += 32
    entropy = length * math.log2(charset) if charset > 0 else 0

    # Common password patterns
    common_patterns = [r"^[a-z]+\d{1,4}$", r"^password", r"^123", r"^qwerty", r"^abc"]
    for pat in common_patterns:
        if re.search(pat, password, re.IGNORECASE):
            score -= 20
            feedback.append("Matches common password pattern — avoid predictable sequences")
            break

    # Repeated characters
    if re.search(r'(.)\1{3,}', password):
        score -= 10
        feedback.append("Too many repeated characters")

    score = max(0, min(100, score))

    if score >= 80:   strength = "VERY STRONG"; color = "#00ff88"
    elif score >= 60: strength = "STRONG";       color = "#00d4ff"
    elif score >= 40: strength = "MODERATE";     color = "#ffd700"
    elif score >= 20: strength = "WEAK";          color = "#ff6600"
    else:             strength = "VERY WEAK";     color = "#ff2244"

    if not feedback:
        feedback.append("Great password! Consider using a password manager to store it.")

    return {
        "score": score,
        "strength": strength,
        "color": color,
        "length": length,
        "entropy_bits": round(entropy, 1),
        "has_lowercase": has_lower,
        "has_uppercase": has_upper,
        "has_digits": has_digit,
        "has_special": has_special,
        "feedback": feedback,
    }


def sanitize_input(text: str) -> str:
    """Sanitize user input — strip dangerous patterns."""
    text = html.escape(text)
    text = text.replace("\x00", "")
    text = re.sub(r'<script.*?</script>', '[REMOVED]', text, flags=re.IGNORECASE | re.DOTALL)
    return text.strip()


# ══════════════════════════════════════════════════════════════════════
# PRIVATE HELPERS
# ══════════════════════════════════════════════════════════════════════

def _detect_language(code: str) -> str:
    """Naive language detection from code content."""
    if re.search(r'^\s*(import|from|def |class |if __name__|print\()', code, re.MULTILINE):
        return "python"
    if re.search(r'(function\s*\(|=>|const |let |var |console\.log)', code):
        return "javascript"
    if re.search(r'(<\?php|\$[a-z_]+\s*=)', code, re.IGNORECASE):
        return "php"
    if re.search(r'<!DOCTYPE html|<html|<div|<script', code, re.IGNORECASE):
        return "html"
    return "generic"


def _get_mitigation(description: str) -> str:
    mitigations = {
        "eval":        "Replace with ast.literal_eval() or a whitelist-based parser",
        "exec":        "Avoid dynamic code execution; use explicit function calls",
        "pickle":      "Use JSON or msgpack for serialization; never unpickle untrusted data",
        "shell=True":  "Use shell=False with a list of arguments; validate all inputs",
        "os.system":   "Use subprocess.run() with shell=False and a list of args",
        "md5":         "Use hashlib.sha256() for integrity; use Argon2 for passwords",
        "random":      "Use the secrets module for all security-sensitive randomness",
        "hardcoded":   "Move secrets to environment variables or a secrets manager (Vault, AWS SSM)",
        "innerHTML":   "Use textContent or createElement(); sanitize with DOMPurify if HTML is needed",
        "localStorage": "Store auth tokens in HttpOnly cookies, not localStorage",
        "mysql_query": "Use PDO with prepared statements: $pdo->prepare('... WHERE id = ?')",
        "dynamic include": "Whitelist valid file names; never include user-supplied paths directly",
    }
    for key, fix in mitigations.items():
        if key.lower() in description.lower():
            return fix
    return "Review OWASP guidelines for this vulnerability type."


def _detect_secrets(content: str) -> list[dict]:
    """Scan for accidentally committed secrets."""
    patterns = [
        (r"(?i)(api[_-]?key|apikey)\s*[=:]\s*['\"]([A-Za-z0-9_\-]{20,})['\"]", "API Key"),
        (r"(?i)(password|passwd|secret)\s*[=:]\s*['\"]([^'\"]{8,})['\"]", "Password/Secret"),
        (r"sk-[A-Za-z0-9]{32,}", "OpenAI API Key"),
        (r"ghp_[A-Za-z0-9]{36}", "GitHub PAT"),
        (r"AKIA[0-9A-Z]{16}", "AWS Access Key"),
        (r"(?i)bearer\s+([A-Za-z0-9_\-\.]{20,})", "Bearer Token"),
    ]
    found = []
    for pat, label in patterns:
        for m in re.finditer(pat, content):
            found.append({
                "type": label,
                "line": content[:m.start()].count("\n") + 1,
                "redacted": m.group(0)[:8] + "****",
            })
    return found


def _url_recommendation(risk: str) -> str:
    recs = {
        "SAFE":   "URL appears safe. Always verify the site's SSL certificate before entering credentials.",
        "LOW":    "Minor concerns detected. Proceed with caution and verify the site is legitimate.",
        "MEDIUM": "Multiple risk indicators. Do not enter credentials or click links from untrusted sources.",
        "HIGH":   "High risk — likely phishing or malicious URL. Do NOT visit. Report to your security team.",
    }
    return recs.get(risk, "Unable to assess. Proceed with extreme caution.")
