/**
 * CYBAASH AI — Terminal Chatbot Integration
 * Extends the homepage terminal with the full chatbot knowledge base.
 * Registers: ask <question>  |  chatbot  |  ai <question>
 * Knowledge: APTs, zero-days, supply chain, threat hunting, deception tech,
 *            malware analysis, cloud security, social engineering, and more.
 * Falls back to Gemini AI if no local match found.
 *
 * Author: Mohamed Aasiq · cybaash.github.io
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
   * EXTENDED KNOWLEDGE BASE
   * Topics from cybaash_chatbot.py that supplement the main terminal KB.
   * ────────────────────────────────────────────────────────────────────────*/
  const CHATBOT_KB = {

    // ── Advanced Persistent Threats ──────────────────────────────────────
    'apt|advanced persistent threat|nation state|state.sponsored|apt group': `
Advanced Persistent Threats (APTs)
Sophisticated, long-term attacks by well-resourced adversaries targeting specific organizations.

Attack Phases:
  1. Initial Compromise   — spear-phishing, watering hole, 0-day exploit
  2. Establish Foothold   — implant backdoor, C2 beacon
  3. Escalate Privileges  — exploit local vuln, credential theft
  4. Internal Recon       — AD enumeration, network mapping
  5. Lateral Movement     — pass-the-hash, RDP, PSExec, BloodHound paths
  6. Mission Completion   — data exfil, destructive payload, persistence

Notable APT Groups:
  APT28 (Fancy Bear)  — Russia, GRU, election interference
  APT29 (Cozy Bear)   — Russia, SVR, SolarWinds attack
  Lazarus Group       — North Korea, financial theft, WannaCry
  APT41               — China, espionage + financial crime
  FIN7                — Financial sector, Carbanak malware

Detection: Behavioural analytics, threat intel feeds, deception tech, EDR
Reference: MITRE ATT&CK Framework — attack.mitre.org`.trim(),

    // ── Zero-Day Exploits ─────────────────────────────────────────────────
    'zero.day|0day|0-day|unknown vulnerability|unpatched vuln': `
Zero-Day Exploits
Vulnerabilities unknown to the vendor — zero days to patch.

Value Chain:
  Researcher finds bug → Weaponize → Sell (brokers, gov) or Deploy

Markets:
  Zerodium  — pays up to $2.5M for iOS full-chain RCE
  Crowdfense — competitive payouts for mobile/browser chains
  Nation-state stockpiles — NSA EternalBlue, CIA Vault 7

Notable Zero-Days:
  EternalBlue (MS17-010) — WannaCry, NotPetya
  Log4Shell (CVE-2021-44228) — Log4j JNDI, CVSS 10
  PrintNightmare (CVE-2021-34527) — Windows Print Spooler RCE
  Heartbleed (CVE-2014-0160) — OpenSSL memory leak

Defense Strategy:
  ● Attack surface reduction — disable unused services
  ● EDR with behaviour-based detection (not just signatures)
  ● Network segmentation — limit blast radius
  ● Threat intelligence — early warning on exploited 0-days
  ● Virtual patching via WAF / IPS rules`.trim(),

    // ── Supply Chain Attacks ──────────────────────────────────────────────
    'supply chain|solarwinds|3cx|xz utils|software supply|third party attack': `
Supply Chain Attacks
Compromise software/hardware before it reaches the end target.

Famous Examples:
  SolarWinds SUNBURST (2020)
    → Backdoor injected into Orion build process
    → 18,000+ organizations received trojanized update
    → APT29 (Cozy Bear), Russian SVR

  3CX Desktop App (2023)
    → Compromised installer signed by 3CX
    → Triggered by malicious npm package (another supply chain attack)
    → Linked to Lazarus Group (North Korea)

  XZ Utils (2024)
    → Long-term social engineering of open-source maintainer
    → Backdoor in liblzma affecting SSH on Linux distros

  CCleaner (2017) — 2.3M users received trojanized version

Attack Vectors:
  Build pipeline compromise | Malicious open-source package (typosquatting)
  Compromised update server | Hardware implants | Third-party library backdoor

Defense:
  ● SBOM (Software Bill of Materials) — track all dependencies
  ● Code signing and reproducible builds
  ● Dependency pinning + integrity verification (hash checks)
  ● Vendor security assessments
  ● Network monitoring for unexpected outbound connections`.trim(),

    // ── Threat Hunting ────────────────────────────────────────────────────
    'threat hunt|proactive hunt|hunt team|assume breach': `
Threat Hunting
Proactive search for threats already inside the environment.
Core premise: Assume breach — don't wait for alerts.

Methodologies:
  Intelligence-driven  — Hunt for known APT TTPs / IOCs
  Hypothesis-driven    — Form hypotheses based on ATT&CK, crown jewels
  Analytics-driven     — Anomaly detection via ML, baseline deviation

Hunt Process (OODA Loop):
  Observe → Orient → Decide → Act
  1. Form hypothesis (e.g. "Credential dumping via LSASS")
  2. Collect data (EDR telemetry, SIEM, DNS, netflow)
  3. Analyse for anomalies and TTPs
  4. Investigate leads, document findings
  5. Improve detections (close the loop)

Key Data Sources:
  Windows Event Logs (4624, 4625, 4688, 4698)
  Sysmon (process creation, network, registry)
  EDR telemetry | DNS logs | Proxy / web gateway
  Memory forensics (Volatility)

Popular Tools:
  Velociraptor | YARA rules | Sigma | KQL (Sentinel)
  Splunk SIEM | Elastic Stack | CrowdStrike Falcon`.trim(),

    // ── Deception Technology (Honeypots) ──────────────────────────────────
    'honeypot|honeynet|deception tech|decoy|canarytoken|canary': `
Deception Technology
Creates fake assets to detect, slow, and study attackers inside your network.

Types:
  Honeypot    — Single decoy server mimicking real systems (SSH, DB, web)
  Honeynet    — Network of honeypots; full attacker monitoring
  Honeytoken  — Fake credentials, files, or API keys (e.g. Canary Tokens)
  Honeyuser   — Fake AD accounts that trigger alerts when accessed
  Honeydoc    — Beacon document that calls home if opened

Tools:
  OpenCanary      — Lightweight, multi-protocol honeypot
  Cowrie          — SSH/Telnet honeypot (logs commands, records sessions)
  Dionaea         — Malware-catching honeypot
  Canarytokens.org — Free honey tokens (URLs, Word docs, AWS keys)
  HoneyDB         — Aggregated honeypot threat intel

Placement Strategy:
  ● Inside the network, not just perimeter (assume breach)
  ● Near crown jewels — Database VLAN, AD, finance systems
  ● Realistic: match naming conventions, OS versions of real assets

Advantages:
  ✓ Zero false-positives — any interaction is suspicious
  ✓ Early detection of lateral movement
  ✓ Intelligence gathering on attacker TTPs
  ✓ Slows down attackers (wastes their time)`.trim(),

    // ── Malware Analysis ──────────────────────────────────────────────────
    'malware analysis|reverse engineer|static analysis|dynamic analysis|sandbox': `
Malware Analysis
Examining malicious software to understand behaviour, origin, and impact.

Analysis Types:

  Static Analysis (no execution)
    ● strings — extract hardcoded URLs, IPs, registry keys
    ● PE analysis — imports, sections, entropy (packed = high entropy)
    ● YARA rules — pattern matching on file bytes
    ● Tools: PEStudio, Ghidra (free), IDA Pro, Detect-It-Easy

  Dynamic Analysis (execute in sandbox)
    ● Process Monitor — file/registry/network activity
    ● Wireshark — capture C2 traffic
    ● Regshot — compare registry before/after
    ● Tools: Any.run, Cuckoo Sandbox, REMnux (Linux distro)

  Memory Forensics
    ● Volatility 3 — analyse memory dumps
    ● Look for: injected code, network connections, hidden processes

Common Obfuscation:
  Packing (UPX) | Encryption | Obfuscated strings | Code injection
  Living-off-the-land (LOLBins) — PowerShell, certutil, wmic

IOCs to Extract:
  C2 IPs/domains | Mutex names | Registry persistence keys
  File paths/names | YARA-matchable byte sequences

Safe Environment: Isolated VM, no host snapshots, isolated network`.trim(),

    // ── Network Forensics ─────────────────────────────────────────────────
    'network forensics|pcap|wireshark|packet analysis|traffic analysis|netflow': `
Network Forensics
Capturing, recording, and analysing network traffic for investigation and evidence.

Key Protocols to Understand:
  TCP/IP | HTTP/S | DNS | SMTP | SMB | FTP | RDP | ICMP

Core Tools:
  Wireshark      — GUI packet analyser; capture & decode all protocols
  tshark         — CLI version of Wireshark (scriptable)
  tcpdump        — Low-level capture (Linux/macOS)
  NetworkMiner   — Extract files, images, credentials from PCAP
  Zeek (Bro)     — Network security monitor; generates logs from traffic
  Snort/Suricata — IDS/IPS with rule-based detection

Key Wireshark Filters:
  http.request.method == "POST"   # Find POST requests
  dns.qry.name contains "evil"    # DNS lookup hunting
  tcp.flags.syn == 1              # SYN scan detection
  frame contains "password"       # Credential in cleartext
  ip.addr == 192.168.1.100       # Filter by IP

Attack Indicators in Traffic:
  ● Beaconing — regular intervals to same external IP (C2)
  ● DNS tunnelling — abnormally large DNS TXT records
  ● Port scanning — many SYN packets to sequential ports
  ● Data exfil — large outbound HTTPS to unusual destination
  ● Cleartext creds — FTP, HTTP Basic Auth, Telnet

Evidence Handling:
  Hash PCAP files (SHA-256) immediately after capture
  Chain of custody documentation
  Write-block all storage media`.trim(),

    // ── Cloud Security (Deep) ─────────────────────────────────────────────
    'cloud security deep|shared responsibility|cloud misconfig|s3 bucket|iam policy': `
Cloud Security — Deep Dive
Shared Responsibility Model:
  Cloud Provider → Security OF the cloud (hardware, hypervisor, facilities)
  Customer       → Security IN the cloud (data, IAM, network config, apps)

Top Cloud Attack Vectors:
  Misconfiguration  — Public S3 buckets, open security groups, weak IAM
  Credential theft  — Keys in code/repos, no MFA, long-lived access keys
  Insecure APIs     — No auth, no rate limiting, verbose errors
  Serverless vulns  — Function event injection, over-permissive roles
  Shadow IT         — Unauthorised cloud resources outside security visibility

AWS Hardening Checklist:
  ● Enable MFA on root; never use root for daily work
  ● IAM: Least privilege, use roles not long-term keys
  ● S3: Block Public Access at account level; enable versioning
  ● Enable CloudTrail (all regions), GuardDuty, Security Hub, Config
  ● VPC: private subnets, restrictive security groups, VPC Flow Logs
  ● Rotate access keys every 90 days; use Secrets Manager
  ● Enable AWS WAF on public-facing apps; Shield for DDoS

Cloud Security Tools:
  AWS: GuardDuty, Security Hub, Macie, CloudTrail, Inspector
  GCP: Security Command Center, Cloud Armor
  Azure: Defender for Cloud, Sentinel, Entra ID Protection
  Multi-cloud: Prowler, ScoutSuite, Trivy, Checkov (IaC scanning)`.trim(),

    // ── Social Engineering (Deep) ─────────────────────────────────────────
    'social engineer deep|psychological|pretexting|vishing attack|baiting|tailgating': `
Social Engineering — Psychology of Attack
Exploits human psychology rather than technical vulnerabilities.
The most effective attack vector — humans are often the weakest link.

Psychological Triggers Used:
  Authority     — Impersonating CEO, IT, auditor, police
  Urgency       — "Your account will be suspended in 1 hour"
  Fear          — "Your system is infected, call this number"
  Scarcity      — "Only 3 spots left — act now"
  Social Proof  — "Everyone else has already updated"
  Reciprocity   — Give something small to get something valuable

Attack Techniques:
  Phishing       — Mass email impersonation
  Spear Phishing — Targeted, researched (LinkedIn, OSINT)
  Vishing        — Voice/phone impersonation
  Smishing       — SMS-based
  Pretexting     — Fabricated scenario (fake IT support)
  Baiting        — Malicious USB drops; fake download links
  Tailgating     — Physical access by following authorised person
  Quid Pro Quo   — Fake tech support offering "help"
  BEC            — Business Email Compromise ($26B+ annual loss)

Real-World Stats:
  91% of cyberattacks start with a phishing email
  ~$4.7B lost to BEC in 2023 (FBI IC3)
  Average cost of a phishing breach: $4.76M (IBM 2023)

Defence:
  ✓ Security awareness training (simulated phishing)
  ✓ MFA on all accounts — defeats credential phishing
  ✓ DMARC/DKIM/SPF — prevent email spoofing
  ✓ Call-back verification for sensitive requests
  ✓ Zero-trust: verify identity regardless of context
  ✓ Report culture — no punishment for reporting suspicious contact`.trim(),

    // ── Ransomware (Deep) ─────────────────────────────────────────────────
    'ransomware deep|raas|lockbit|blackcat|double extortion|triple extortion': `
Ransomware Deep Dive
Ransomware-as-a-Service (RaaS) — developers lease ransomware to affiliates.

Major Groups (2022–2024):
  LockBit    — most prolific; LockBit 3.0 has a bug bounty programme
  BlackCat   — Rust-based, cross-platform, triple extortion
  Cl0p       — MOVEit, GoAnywhere mass exploitation
  BlackBasta — Targets critical infrastructure
  Akira      — Fast-growing; retro aesthetic ransom notes

Attack Flow (Typical):
  1. Initial Access   — phishing, RDP brute force, VPN 0-day
  2. Persistence      — scheduled task, registry key, service install
  3. Recon            — AD enumeration, network mapping
  4. Credential theft — Mimikatz, LSASS dump, DCSync
  5. Lateral Movement — PsExec, WMI, RDP, BloodHound paths
  6. Data Exfiltration — Rclone to cloud (double extortion)
  7. Encryption       — Shadow copy deletion, then encrypt

Extortion Models:
  Single — encrypt + demand payment
  Double — encrypt + threaten to leak stolen data
  Triple — Double + DDoS victim's website

Response Playbook:
  ● Isolate affected systems immediately (pull network cable)
  ● Do NOT pay ransom (encourages further attacks)
  ● Restore from clean, offline backups (3-2-1 rule)
  ● Preserve forensic evidence (memory dumps, logs)
  ● Notify: legal, CISO, potentially regulators/law enforcement

Prevention:
  ✓ 3-2-1 backup strategy + test restores regularly
  ✓ Disable RDP or put behind VPN + MFA
  ✓ EDR with rollback capability
  ✓ Network segmentation — limit lateral movement
  ✓ Patch management — close initial access vectors`.trim(),

    // ── Password Security ─────────────────────────────────────────────────
    'password strength|password crack|brute force password|rainbow table|credential stuff': `
Password Security & Cracking
Password Strength Factors:
  Length  > 16 chars (most important factor)
  Charset  lower + upper + digits + symbols
  Entropy  log2(charset^length) — higher = stronger

Cracking Techniques:
  Dictionary attack   — wordlists (rockyou.txt has 14M passwords)
  Brute force         — all combinations (GPU-accelerated)
  Rainbow tables      — precomputed hash→password lookups
  Credential stuffing — reuse breached username/password combos
  Rule-based          — hashcat rules (append 1, capitalise, etc.)

Top Tools:
  hashcat  — GPU-accelerated, 300+ hash types
  John the Ripper — classic password cracker
  Hydra    — online login brute force

Secure Storage (Server-Side):
  ✓ bcrypt (cost=12+) or Argon2id — slow by design
  ✗ NEVER: MD5, SHA-1, SHA-256 plain (fast = bad for passwords)

import bcrypt
hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=12))

User Best Practices:
  ● Unique password for every site (use a password manager)
  ● Passphrase: "correct-horse-battery-staple" style
  ● Enable MFA everywhere possible
  ● Check HaveIBeenPwned.com for breaches`.trim(),

    // ── OSINT ─────────────────────────────────────────────────────────────
    'osint|open source intel|shodan|maltego|theHarvester|reconnaissance recon': `
OSINT — Open Source Intelligence
Gathering information from publicly available sources.

Tools:
  Shodan       — Search engine for internet-connected devices
                 shodan search "apache 2.4.50" | port:80 os:"Linux"
  theHarvester — Email, subdomain, IP harvesting from public sources
  Maltego      — Link analysis and data visualisation
  Recon-ng     — Modular OSINT framework
  SpiderFoot   — Automated OSINT for any target
  OSINT Framework — osintframework.com — tool map by category

Passive Recon Sources:
  ● WHOIS + RDAP — domain registration, registrar, nameservers
  ● Shodan / Censys / FOFA — exposed services, banners, certs
  ● crt.sh — certificate transparency logs (subdomain discovery)
  ● Wayback Machine — historical website content
  ● LinkedIn / GitHub / Twitter — employee info, tech stack
  ● Google Dorks: site:target.com filetype:pdf inurl:admin

DNS Enumeration:
  subfinder -d target.com -o subs.txt   # passive subdomain enum
  dnsx -l subs.txt -a -resp            # resolve + get IP
  amass enum -passive -d target.com    # comprehensive OSINT

Ethics & Legality:
  ● OSINT on public data is legal in most jurisdictions
  ● Do NOT access private/protected systems
  ● Always have written authorisation before active recon`.trim(),

    // ── CTI / Threat Intelligence ─────────────────────────────────────────
    'threat intel|cti|ioc|indicator of compromise|mitre attack|stix taxii': `
Cyber Threat Intelligence (CTI)
Evidence-based knowledge about threats to support decision-making.

Intelligence Types:
  Strategic   — High-level, for executives (nation-state trends)
  Operational — TTPs of specific threat actors
  Tactical    — IOCs: IPs, hashes, domains, YARA rules
  Technical   — Malware samples, exploit code

Intelligence Sources:
  OSINT      — Public blogs, security vendors, Twitter/X
  ISAC       — Industry-specific sharing (FS-ISAC, H-ISAC)
  MISP       — Open-source threat sharing platform
  VirusTotal, AbuseIPDB, AlienVault OTX
  Commercial — CrowdStrike Intel, Mandiant, Recorded Future

MITRE ATT&CK Framework:
  Tactics → Techniques → Sub-techniques → Procedures (TTPs)
  14 Tactics: Recon → Initial Access → Execution → Persistence →
              Privilege Escalation → Defence Evasion → Credential Access →
              Discovery → Lateral Movement → Collection →
              Command & Control → Exfiltration → Impact
  attack.mitre.org — free, comprehensive

Sharing Standards:
  STIX 2.1  — Structured Threat Information eXpression (JSON)
  TAXII 2.1 — Transport protocol for STIX objects

IOC Lifecycle:
  Collect → Analyse → Produce → Disseminate → Feedback`.trim(),

  };

  /* ─────────────────────────────────────────────────────────────────────────
   * LOOKUP FUNCTION
   * Check the extended KB before falling through to Gemini.
   * ────────────────────────────────────────────────────────────────────────*/
  function lookupChatbot(query) {
    const q = query.toLowerCase();
    for (const [patterns, response] of Object.entries(CHATBOT_KB)) {
      const keys = patterns.split('|');
      if (keys.some(k => q.includes(k.replace(/\./g, ' ')))) {
        return response;
      }
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * TERMINAL RENDERING HELPERS
   * Safe wrappers in case termPrint / GEMINI_AI are not yet ready.
   * ────────────────────────────────────────────────────────────────────────*/
  function tPrint(lines) {
    if (typeof termPrint === 'function') {
      lines.forEach(l => termPrint(l));
    } else {
      console.log(lines.map(l => l.v || '').join('\n'));
    }
  }

  function renderKBResponse(answer, query) {
    tPrint([
      { t: 't-sys', v: `[CHATBOT] ─── ${query.toUpperCase().slice(0, 60)} ───` },
    ]);
    answer.split('\n').forEach(line => {
      if (line.trim() === '') return;
      const t = line.startsWith('  ') ? 't-dim' :
                line.match(/^[A-Z].+:$|^[A-Z][A-Z]/) ? 't-out' :
                line.startsWith('●') || line.startsWith('✓') || line.startsWith('✗') ? 't-out' :
                't-out';
      tPrint([{ t, v: line }]);
    });
    tPrint([{ t: 't-dim', v: '─────────────────────────────────────────────' }]);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ASK COMMAND HANDLER
   * ask <question>  — query the chatbot knowledge base + Gemini fallback
   * ────────────────────────────────────────────────────────────────────────*/
  function handleAsk(args) {
    if (!args || !args.trim()) {
      tPrint([
        { t: 't-sys',  v: '[CHATBOT] CYBAASH AI — Knowledge Query' },
        { t: 't-out',  v: '  Usage:  ask <question>' },
        { t: 't-out',  v: '  Example: ask what is an APT' },
        { t: 't-out',  v: '           ask explain zero-day exploits' },
        { t: 't-out',  v: '           ask how does threat hunting work' },
        { t: 't-out',  v: '           ask supply chain attack examples' },
        { t: 't-out',  v: '           ask honeypot vs honeynet' },
        { t: 't-dim',  v: '  Powered by local KB + Gemini AI fallback' },
      ]);
      return;
    }

    const query = args.trim();
    const local = lookupChatbot(query);

    if (local) {
      renderKBResponse(local, query);
      return;
    }

    // Also check the existing GEMINI_AI localLookup (if available)
    if (typeof GEMINI_AI !== 'undefined' && typeof GEMINI_AI.localLookup === 'function') {
      const mainLocal = GEMINI_AI.localLookup(query.toLowerCase());
      if (mainLocal) {
        tPrint([{ t: 't-sys', v: `[CHATBOT] ─── ${query.toUpperCase().slice(0, 60)} ───` }]);
        mainLocal.split('\n').forEach(line => {
          if (line.trim() === '') return;
          tPrint([{ t: 't-out', v: line }]);
        });
        tPrint([{ t: 't-dim', v: '─────────────────────────────────────────────' }]);
        return;
      }
    }

    // Fall through to Gemini AI
    if (typeof GEMINI_AI !== 'undefined' && typeof GEMINI_AI.ask === 'function') {
      tPrint([{ t: 't-dim', v: '[CHATBOT] No local match — querying Gemini AI…' }]);
      GEMINI_AI.ask(query);
    } else {
      tPrint([
        { t: 't-warn', v: '[CHATBOT] No local answer found for: ' + query },
        { t: 't-out',  v: '  Try: ask apt | ask zero-day | ask supply chain' },
        { t: 't-out',  v: '       ask threat hunting | ask honeypot' },
        { t: 't-out',  v: '       ask malware analysis | ask osint' },
        { t: 't-out',  v: '       ask threat intel | ask ransomware' },
        { t: 't-dim',  v: '  Or set a Gemini key: gemini key YOUR_KEY' },
      ]);
    }
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * CHATBOT TOPICS COMMAND
   * chatbot  — list available topics
   * ────────────────────────────────────────────────────────────────────────*/
  function handleChatbot(args) {
    if (args && args.trim()) {
      handleAsk(args.trim());
      return;
    }
    tPrint([
      { t: 't-sys', v: '╔══ CYBAASH AI — Chatbot Knowledge Base ══════════╗' },
      { t: 't-out', v: '  Usage:  ask <topic>  |  chatbot <topic>' },
      { t: 't-sys', v: '  Extended Topics (from cybaash_chatbot.py):' },
      { t: 't-out', v: '  ask apt               Advanced Persistent Threats' },
      { t: 't-out', v: '  ask zero-day          Zero-Day Exploits' },
      { t: 't-out', v: '  ask supply chain      Supply Chain Attacks' },
      { t: 't-out', v: '  ask threat hunting    Proactive Threat Hunting' },
      { t: 't-out', v: '  ask honeypot          Deception Technology' },
      { t: 't-out', v: '  ask malware analysis  Static/Dynamic Analysis' },
      { t: 't-out', v: '  ask network forensics Packet Analysis & PCAP' },
      { t: 't-out', v: '  ask cloud security    AWS/Azure/GCP Deep Dive' },
      { t: 't-out', v: '  ask social engineer   Psychology of Attacks' },
      { t: 't-out', v: '  ask ransomware deep   RaaS, LockBit, Response' },
      { t: 't-out', v: '  ask password          Cracking & Secure Storage' },
      { t: 't-out', v: '  ask osint             Reconnaissance Tools' },
      { t: 't-out', v: '  ask threat intel      CTI, MITRE ATT&CK, STIX' },
      { t: 't-dim', v: '  Plus all original terminal topics (help for full list)' },
      { t: 't-sys', v: '╚══════════════════════════════════════════════════╝' },
    ]);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * REGISTER COMMANDS
   * Waits for defCmd to be available (runs after main script).
   * ────────────────────────────────────────────────────────────────────────*/
  function registerCommands() {
    if (typeof defCmd !== 'function') {
      // Not ready yet — try again shortly
      setTimeout(registerCommands, 200);
      return;
    }

    // ask <question> — primary chatbot command
    defCmd('ask', function (args) {
      handleAsk(args);
    });

    // chatbot — show topics or ask question
    defCmd('chatbot', function (args) {
      handleChatbot(args);
    });

    // Patch 'ai' command to also check chatbot KB first
    if (typeof TERM_COMMANDS !== 'undefined') {
      const existingAi = TERM_COMMANDS['ai'];
      defCmd('ai', function (args) {
        if (!args || !args.trim()) {
          if (typeof existingAi === 'function') existingAi(args);
          else handleChatbot('');
          return;
        }
        const local = lookupChatbot(args.trim());
        if (local) {
          renderKBResponse(local, args.trim());
        } else if (typeof existingAi === 'function') {
          existingAi(args);
        } else {
          handleAsk(args);
        }
      });
    }

    console.log('[CYBAASH Chatbot] Terminal commands registered: ask, chatbot, ai');
  }

  // Kick off registration
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerCommands);
  } else {
    // DOM already loaded — delay slightly so main script runs first
    setTimeout(registerCommands, 100);
  }

})();
