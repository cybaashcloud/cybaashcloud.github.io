/**
 * CYBAASH AI — Terminal Chatbot
 * Speaks like a real human — conversational, opinionated, helpful.
 * Registers: ask <question>  |  chatbot  |  ai <question>
 *
 * Source: cybaash_chatbot.py — 10 core topics (deduplicated byte-for-byte)
 *         PY_KB_SOURCE const below embeds the raw Python topic definitions.
 *
 * Author: Mohamed Aasiq · cybaash.github.io · mohamedaasiq07@gmail.com
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────────────────
   * PYTHON KNOWLEDGE BASE SOURCE
   * Verbatim topic definitions from cybaash_chatbot.py (deduplicated).
   * Original file had 111,652 lines — 4043x duplication of 10 unique topics.
   * ────────────────────────────────────────────────────────────────────────*/
  const PY_KB_SOURCE = {
    advanced_persistent_threats: 'Advanced Persistent Threats (APTs) are sophisticated, long-term attacks by well-resourced adversaries targeting specific organizations. They typically involve multiple phases: initial compromise, esta',
    zero_day_exploits: "Zero-day exploits target vulnerabilities that are unknown to the software vendor and have no patch available. The term comes from developers having 'zero days' to fix the issue. Zero-days are highly v",
    supply_chain_attacks: 'Supply chain attacks target the software or hardware supply chain to compromise end targets. Famous examples: SolarWinds SUNBURST (2020) - Hackers inserted backdoor into SolarWinds Orion updates affec',
    ransomware_deep_dive: 'Modern ransomware operates as Ransomware-as-a-Service (RaaS) where developers lease ransomware to affiliates who conduct attacks. Major groups: LockBit (most active 2022-2024), BlackCat/ALPHV, Cl0p, B',
    threat_hunting: 'Threat hunting is the proactive search for threats already present in an environment rather than waiting for alerts. It assumes breach and actively looks for signs of attacker presence. Methodologies:',
    malware_analysis: 'Malware analysis involves examining malicious software to understand its behavior, origin, and impact. Types: Static analysis (examining without executing - strings, imports, PE structure), Dynamic an',
    network_forensics: 'Network forensics involves capturing, recording, and analyzing network traffic for investigation and evidence. Key protocols to understand: TCP/IP, HTTP/S, DNS, SMTP, SMB, FTP. Tools: Wireshark (GUI a',
    cloud_security_deep: 'Cloud security encompasses protecting data, applications, and infrastructure in cloud environments. Shared responsibility model: Cloud provider responsible for security OF the cloud (physical, infrast',
    social_engineering_deep: 'Social engineering exploits human psychology rather than technical vulnerabilities. The most effective attack vector - humans are often the weakest link. Key psychological principles exploited: Author',
    deception_technology: 'Deception technology creates fake assets (honeypots, honeytokens, honeynets) to detect and mislead attackers. Types: Honeypot - decoy server that mimics real systems to detect intrusions. Honeynet - n',
  };

  /* ─────────────────────────────────────────────────────────────────────────
   * PERSONALITY ENGINE
   * Randomised openers, transitions, and follow-up nudges so every
   * response feels slightly different — not canned.
   * ────────────────────────────────────────────────────────────────────────*/
  const OPENERS = [
    "Alright, let me break this down for you.",
    "Good question — here's how I think about it.",
    "So this is actually one of my favourite topics.",
    "Okay, let's get into it.",
    "I've spent a lot of time on this one — here's the real deal.",
    "Happy to walk you through this.",
    "Sure thing. Here's what you need to know.",
    "This one's important. Pay attention.",
    "Great topic to dig into. Let's go.",
    "Honestly, this is something more people should understand.",
  ];

  const FOLLOW_UPS = [
    "Want me to go deeper on any part of that?",
    "Let me know if something doesn't click — happy to explain differently.",
    "Got questions? Just ask.",
    "If you want a practical example or a tool walkthrough, just say the word.",
    "There's a lot more depth here if you want it — just ask.",
    "Any of that unclear? I can break it down further.",
    "That's the overview — want to zoom in on something specific?",
  ];

  const THINKING = [
    "hmm, let me think...",
    "good one — checking what I know...",
    "digging through my knowledge base...",
    "one sec...",
    "let me pull that up...",
  ];

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * CONVERSATIONAL KNOWLEDGE BASE
   * Written the way a senior security engineer actually explains things —
   * not a textbook dump. Each entry is an array of lines.
   * ────────────────────────────────────────────────────────────────────────*/
  const CHATBOT_KB = {

    'apt|advanced persistent threat|nation state|state.sponsored|apt group': [
      "APTs are what happens when a government or well-funded criminal org decides they want inside YOUR network — and they're willing to spend months getting there.",
      "",
      "The thing that makes APTs different from regular hackers is patience. They don't smash and grab. They move slowly, quietly, and they'll sit inside your network for months before you notice.",
      "",
      "Here's the typical playbook they follow:",
      "  1. Initial access    — spear-phishing, exploiting a public app, or buying access",
      "  2. Get a foothold    — drop a lightweight backdoor, set up C2, stay quiet",
      "  3. Move around       — enumerate Active Directory, find the crown jewels",
      "  4. Escalate          — credential theft, Kerberoasting, BloodHound to map paths",
      "  5. Collect & exfil   — slowly siphon data out over encrypted channels",
      "  6. Stay persistent   — multiple backdoors, scheduled tasks, golden tickets",
      "",
      "Some names you should know:",
      "  APT28 (Fancy Bear)  — Russia's GRU. Election interference, NATO targets.",
      "  APT29 (Cozy Bear)   — Russia's SVR. They did SolarWinds. Very patient, very good.",
      "  Lazarus Group       — North Korea. Financially motivated. Did WannaCry.",
      "  APT41               — China. Both espionage AND financial crime. Unusual combo.",
      "",
      "How do you catch them? Signatures alone won't do it. You need behavioural analytics,",
      "deception tech (honeypots), and proper threat hunting. MITRE ATT&CK is your bible here.",
    ],

    'zero.day|0day|0-day|unknown vulnerability|unpatched vuln': [
      "A zero-day is a vulnerability the vendor doesn't know about yet. The name comes from the fact that developers have had zero days to fix it — so by definition, there's no patch.",
      "",
      "Here's what makes them scary: you can't defend against something you don't know exists. Your antivirus won't catch it. Your IDS won't alert on it. You're flying blind.",
      "",
      "There's actually a whole market for these things:",
      "  Zerodium pays up to $2.5M for a full iOS chain RCE. Yes, really.",
      "  Nation-states stockpile them — the NSA had EternalBlue for years before it leaked.",
      "  The CIA's Vault 7 dump showed just how many tools they'd built around zero-days.",
      "",
      "Some real ones that changed the game:",
      "  EternalBlue (MS17-010)      — became WannaCry and NotPetya. Devastating.",
      "  Log4Shell (CVE-2021-44228)  — CVSS 10.0. Log4j was everywhere. Chaos.",
      "  PrintNightmare              — Windows Print Spooler. Embarrassingly widespread.",
      "  Heartbleed                  — OpenSSL. Quietly leaked memory for two years.",
      "",
      "Your best defences are architectural, not signature-based:",
      "  → Behaviour-based EDR (CrowdStrike, SentinelOne)",
      "  → Network segmentation — limit the blast radius",
      "  → Attack surface reduction — if you don't need it, disable it",
      "  → Virtual patching via WAF/IPS while you wait for an actual fix",
    ],

    'supply chain|solarwinds|3cx|xz utils|software supply|third party attack': [
      "Supply chain attacks are clever because they let attackers compromise thousands of targets by hitting ONE supplier. Instead of breaking into each house, they poison the water supply.",
      "",
      "The SolarWinds attack in 2020 is the textbook example. APT29 quietly injected a backdoor into the Orion build process. 18,000+ organisations downloaded a legitimately signed update containing malware. Nobody noticed for months.",
      "",
      "More recent ones worth knowing:",
      "  3CX (2023)      — Compromised installer, signed by 3CX's own certificate.",
      "                   But here's the twist: 3CX got infected via a malicious npm package.",
      "                   A supply chain attack triggering another supply chain attack.",
      "",
      "  XZ Utils (2024) — Someone spent TWO YEARS gaining trust in an open-source project",
      "                   just to slip in a backdoor. Patience like an APT. Targeted SSH.",
      "",
      "  CCleaner (2017) — 2.3 million users got a trojanized version of a cleanup tool.",
      "",
      "What you can actually do about it:",
      "  → SBOM (Software Bill of Materials) — know exactly what's in your software",
      "  → Pin dependencies and verify hashes — don't trust auto-updates blindly",
      "  → Code signing helps, but remember 3CX was properly signed",
      "  → Monitor for unexpected outbound connections post-update",
      "  → Vendor risk assessments — ask about their build pipeline security",
    ],

    'threat hunt|proactive hunt|hunt team|assume breach': [
      "Most security teams are reactive — they wait for an alert, then respond. Threat hunting flips that. You assume the attacker is already inside, and you go looking for them.",
      "",
      "It's one of my favourite disciplines because it requires real skill — you're not following a playbook, you're forming hypotheses and investigating like a detective.",
      "",
      "The core approaches:",
      "  Intelligence-driven  — You have intel that APT28 is targeting your sector.",
      "                        Hunt for their known TTPs before they trigger alerts.",
      "",
      "  Hypothesis-driven    — 'What if someone is doing credential dumping right now?'",
      "                        Form a hypothesis, go look for evidence, prove or disprove.",
      "",
      "  Analytics-driven     — Build baselines and look for statistical anomalies.",
      "                        'This workstation is talking to 40 internal hosts at 3am — weird.'",
      "",
      "Your process (think OODA loop: Observe → Orient → Decide → Act):",
      "  1. Write your hypothesis",
      "  2. Collect the right data (EDR telemetry, SIEM, DNS, netflow)",
      "  3. Hunt for anomalies and matching TTPs",
      "  4. Document everything — even dead ends have value",
      "  5. Convert findings into detections so the next hunt is automated",
      "",
      "Data you'll live in:",
      "  Windows Event IDs: 4624 (logon), 4625 (failed), 4688 (process), 4698 (scheduled task)",
      "  Sysmon logs — if you're not running Sysmon, start today",
      "  DNS query logs — amazing for catching C2 beaconing",
    ],

    'honeypot|honeynet|deception tech|decoy|canarytoken|canary': [
      "Deception technology is underrated. The idea is simple: scatter fake assets around your network, and any attacker who touches them instantly gives themselves away.",
      "",
      "Zero false positives. If something pings your honeypot, that's suspicious by definition — no legitimate user should ever be touching a decoy server.",
      "",
      "The different flavours:",
      "  Honeypot    — A decoy server that looks real. SSH honeypot, fake database.",
      "               Attacker pokes it, you get an alert.",
      "",
      "  Honeynet    — A whole network of honeypots. Watch attackers move in real time",
      "               and learn their TTPs before they hit your real assets.",
      "",
      "  Honeytoken  — Fake credentials or API keys. Drop a fake AWS key in a GitHub repo",
      "               and get notified if anyone tries to use it. Canarytokens.org does this free.",
      "",
      "  Honeyuser   — A fake Active Directory account. If anyone authenticates as it,",
      "               you know you have lateral movement happening right now.",
      "",
      "Tools I'd recommend starting with:",
      "  Cowrie         — SSH/Telnet honeypot. Records everything the attacker types.",
      "  OpenCanary     — Lightweight, runs on a Raspberry Pi, covers lots of protocols.",
      "  Canarytokens   — Free, brilliant, takes 2 minutes to set up.",
      "",
      "Placement tip: put them near your crown jewels, not just at the perimeter.",
      "An attacker already inside your network is the one you most need to catch.",
    ],

    'malware analysis|reverse engineer|static analysis|dynamic analysis|sandbox': [
      "Malware analysis is part science, part detective work. You're trying to understand what a piece of software does — without getting infected yourself.",
      "",
      "Two main approaches, and in practice you use both:",
      "",
      "Static analysis (never run the file):",
      "  → strings — first thing I always do. Pull out hardcoded URLs, IPs, registry keys.",
      "  → PE analysis — look at imports (what APIs does it call?), sections, entropy.",
      "    High entropy usually means it's packed or encrypted. Suspicious.",
      "  → YARA rules — write patterns to match it across your environment.",
      "  → Tools: PEStudio (free, great for beginners), Ghidra (NSA's free disassembler),",
      "    IDA Pro (industry standard, expensive), Detect-It-Easy.",
      "",
      "Dynamic analysis (run it in an isolated sandbox):",
      "  → Process Monitor — watch exactly what files, registry keys, network connections it touches.",
      "  → Wireshark — capture any C2 traffic it tries to establish.",
      "  → Regshot — snapshot registry before and after. See what changed.",
      "  → Tools: Any.run (online, free tier), Cuckoo Sandbox (self-hosted), REMnux.",
      "",
      "Memory forensics — for malware that lives entirely in RAM:",
      "  → Volatility 3 — dump and analyse process memory, find injected shellcode,",
      "    recover network connections, spot hidden processes.",
      "",
      "Golden rule: always do this in an isolated VM. Snapshot before execution.",
      "Never on your host machine, never connected to anything you care about.",
    ],

    'network forensics|pcap|wireshark|packet analysis|traffic analysis|netflow': [
      "Network forensics is about answering questions from packets — who talked to who, when, what did they send, and did anything look wrong.",
      "",
      "If you're investigating an incident, network traffic is often the most honest witness you have. Logs can be cleared. PCAPs are much harder to fake after the fact.",
      "",
      "Key protocols you need to know well:",
      "  DNS  — attackers love it for C2 tunnelling and data exfil. Monitor it closely.",
      "  HTTP/S — where most attacks happen. Know how to spot malicious POST requests.",
      "  SMB  — lateral movement, pass-the-hash, ransomware spreading.",
      "  RDP  — brute force, valid credential abuse, initial access.",
      "",
      "Your main tools:",
      "  Wireshark   — GUI, powerful display filters, great for deep dives.",
      "  tshark      — CLI Wireshark. Perfect for scripting.",
      "  NetworkMiner — extracts files, images, credentials from PCAPs automatically.",
      "  Zeek        — gives you high-level logs from traffic, not raw packets. Brilliant.",
      "",
      "Wireshark filters I use constantly:",
      '  http.request.method == "POST"  — look for data being sent out',
      '  dns.qry.name contains "evil"   — suspicious domain lookups',
      "  tcp.flags.syn == 1             — detect port scans",
      '  frame contains "password"      — catch cleartext credentials',
      "",
      "Red flags to hunt for:",
      "  → Regular beaconing to the same external IP at fixed intervals (C2 traffic)",
      "  → Large DNS TXT records (DNS tunnelling)",
      "  → Massive outbound HTTPS to cloud storage you don't recognise (data exfil)",
      "  → Cleartext credentials on FTP, Telnet, or basic HTTP auth",
      "",
      "Evidence handling: hash your PCAPs with SHA-256 the moment you capture them.",
      "Document chain of custody. This stuff might end up in court.",
    ],

    'cloud security|shared responsibility|cloud misconfig|s3 bucket|iam policy': [
      "Cloud security is misunderstood more than almost any other topic. The number one mistake people make is assuming the cloud provider is responsible for securing everything.",
      "",
      "They're not. Shared responsibility model means:",
      "  AWS secures the physical hardware, hypervisor, and global network.",
      "  YOU secure your data, your IAM policies, your network config, your apps.",
      "",
      "The most common ways organisations get breached in the cloud:",
      "",
      "  Misconfiguration  — Public S3 buckets still happen in 2024. Open security groups,",
      "                     unrestricted egress, weak IAM policies.",
      "",
      "  Credential theft  — Access keys checked into GitHub. No MFA on root.",
      "                     Long-lived access keys that never rotate.",
      "",
      "  Insecure APIs     — No authentication, verbose errors leaking info,",
      "                     no rate limiting on your Lambda endpoints.",
      "",
      "  Shadow IT         — Someone spun up an EC2 instance outside your visibility.",
      "                     You can't secure what you don't know exists.",
      "",
      "AWS hardening — basics I'd implement on day one:",
      "  → MFA on root. Never use root for anything day-to-day.",
      "  → IAM: least privilege. Use roles, not long-lived access keys.",
      "  → Block Public Access at the account level for S3. It's one toggle.",
      "  → Turn on CloudTrail everywhere. GuardDuty. Security Hub. Config.",
      "  → VPC Flow Logs — your network visibility in the cloud.",
      "  → Rotate access keys every 90 days. Use Secrets Manager for everything else.",
      "",
      "Tools worth knowing:",
      "  AWS native: GuardDuty, Macie, Inspector, SecurityHub",
      "  Open-source: Prowler (compliance), ScoutSuite, Trivy (containers), Checkov (IaC)",
    ],

    'social engineer|psychological|pretexting|vishing|baiting|tailgating|phishing': [
      "Uncomfortable truth: no matter how good your technical defences are, one well-crafted email can bypass all of it. Social engineering targets the human, not the system.",
      "",
      "Attackers exploit the same psychological shortcuts we all rely on every day:",
      "  Authority   — 'This is the CEO. Wire that money now.'",
      "  Urgency     — 'Your account gets deleted in 1 hour.'",
      "  Fear        — 'Your computer is infected. Call this number immediately.'",
      "  Reciprocity — Give you something small to make you feel obligated.",
      "",
      "The main attack techniques:",
      "  Phishing       — Mass email campaigns impersonating trusted brands.",
      "  Spear phishing — Targeted. They've researched you on LinkedIn first.",
      "                  Knows your manager's name, your projects, your language.",
      "  Vishing        — Phone calls. Fake IT support, fake bank fraud departments.",
      "  Pretexting     — Elaborate fake scenario. 'I'm from your IT vendor...'",
      "  Baiting        — USB drive left in the car park. Curiosity is the attack.",
      "  BEC            — Business Email Compromise. $26 billion lost annually.",
      "                  Fake email from your CFO asking for a wire transfer.",
      "",
      "Stats that should worry you:",
      "  91% of cyberattacks start with a phishing email.",
      "  $4.7B lost to BEC in 2023 alone (FBI IC3 figures).",
      "  Average cost of a phishing breach: $4.76M (IBM 2023).",
      "",
      "Defence that actually works:",
      "  → MFA everywhere — stolen credentials become useless",
      "  → Simulated phishing — make mistakes in training, not production",
      "  → DMARC + DKIM + SPF — stop email spoofing at source",
      "  → Call-back verification for any sensitive financial requests",
      "  → Culture: no blame for reporting. People hide mistakes when they fear punishment.",
    ],

    'ransomware|raas|lockbit|blackcat|double extortion|triple extortion': [
      "Ransomware has evolved into a full criminal industry. These aren't lone hackers anymore — it's organised crime with HR departments, affiliate programmes, and bug bounties.",
      "",
      "RaaS — Ransomware-as-a-Service — is how most of it works now. Developers build the ransomware and lease it to affiliates who do the actual intrusions. Profits split 70/30.",
      "",
      "The major groups you'll hear about:",
      "  LockBit    — Most prolific group ever. LockBit 3.0 literally has a bug bounty.",
      "  BlackCat   — Written in Rust. Cross-platform. Pioneered triple extortion.",
      "  Cl0p       — Specialises in mass exploitation. MOVEit, GoAnywhere.",
      "  BlackBasta — Targets critical infrastructure. Very aggressive.",
      "  Akira      — Fast-growing. Retro 80s aesthetic ransom notes (I'm serious).",
      "",
      "How a typical attack unfolds:",
      "  1. Get in        — phishing, RDP brute force, vulnerable VPN, bought access",
      "  2. Stay quiet    — low-and-slow recon, map the environment",
      "  3. Grab creds    — Mimikatz, LSASS dump, DCSync against AD",
      "  4. Move around   — PsExec, WMI, RDP with valid creds",
      "  5. Exfil data    — Rclone to cloud storage (double extortion leverage)",
      "  6. Encrypt       — Delete shadow copies first, then encrypt everything",
      "",
      "Extortion models:",
      "  Single   — Encrypt. Pay for the key.",
      "  Double   — Encrypt AND threaten to publish stolen data.",
      "  Triple   — Double + DDoS your website while you're trying to recover.",
      "",
      "If you get hit:",
      "  → Isolate immediately. Pull the network cable if you have to.",
      "  → Do NOT pay. It funds the next attack and doesn't guarantee your data.",
      "  → Restore from clean, offline, TESTED backups (you do test them, right?).",
      "  → Call legal and CISO before doing much else. Preserve evidence.",
      "",
      "Prevention is boring but it works: 3-2-1 backups, MFA on RDP,",
      "EDR with rollback capability, network segmentation, patch management.",
    ],

    'password strength|password crack|brute force password|rainbow table|credential stuff': [
      "Passwords are still a mess in 2024. Let me give you the real picture.",
      "",
      "What actually makes a password strong:",
      "  Length matters most. A 20-character passphrase beats a complex 8-char password.",
      "  Entropy = log2(charset^length). More randomness = harder to crack.",
      "  'correct-horse-battery-staple' style passphrases are both strong AND memorable.",
      "",
      "How attackers crack passwords:",
      "  Dictionary attack    — rockyou.txt alone has 14 million real passwords from breaches.",
      "  Brute force          — GPU-accelerated. RTX 4090 cracks 8-char NTLM in minutes.",
      "  Rainbow tables       — precomputed hash lookups. Salting kills this attack.",
      "  Credential stuffing  — reuse passwords from one breach to attack other sites.",
      "  Rule-based           — hashcat rules: 'password' becomes 'P@ssw0rd1!' automatically.",
      "",
      "Tools attackers (and pentesters) use:",
      "  hashcat        — GPU-accelerated, 300+ hash types, extremely powerful",
      "  John the Ripper — classic, still very relevant",
      "  Hydra          — online brute force against login forms",
      "",
      "Server-side storage — get this right:",
      "  → bcrypt with cost factor 12+ or Argon2id",
      "  → NEVER MD5, SHA-1, or plain SHA-256 — they're too fast",
      "  → Always salt. Always.",
      "",
      "Advice that actually gets followed:",
      "  → Password manager — Bitwarden is free and open-source",
      "  → Different password for every site. Every. Single. One.",
      "  → MFA wherever possible — stolen credentials become useless",
      "  → Check haveibeenpwned.com — you might already be in a breach",
    ],

    'osint|open source intel|shodan|maltego|reconnaissance|recon': [
      "OSINT is one of those skills that separates average security people from great ones. The amount of information publicly available about any organisation is genuinely shocking.",
      "",
      "Key tools and what they're actually good for:",
      "  Shodan      — The world's most dangerous search engine. Finds exposed devices,",
      "               open ports, service banners, default credentials, vulnerable versions.",
      "               Try: shodan search 'default password' country:IN",
      "",
      "  theHarvester — Scrapes emails, subdomains, employee names from public sources.",
      "               Good first pass before any assessment.",
      "",
      "  Maltego     — Visualises relationships between entities. Domains to IPs to emails",
      "               to people to organisations. Great for mapping attack surface.",
      "",
      "  crt.sh      — Certificate transparency logs. Often reveals subdomains that",
      "               never appear in DNS. Companies forget these exist.",
      "",
      "Google Dorks that find surprising things:",
      '  site:target.com filetype:pdf        — internal documents, reports',
      "  site:target.com inurl:admin         — admin panels",
      '  site:target.com intext:"password"   — oops',
      "",
      "DNS enumeration workflow I actually use:",
      "  subfinder -d target.com -o subs.txt   # passive subdomain discovery",
      "  dnsx -l subs.txt -a -resp            # resolve them, get IPs",
      "  httpx -l subs.txt -status-code       # which ones have web servers?",
      "",
      "Important: OSINT on publicly available information is legal.",
      "The moment you start accessing systems you're not authorised to — that's a crime.",
      "Always get written scope before active recon.",
    ],

    'threat intel|cti|ioc|indicator of compromise|mitre attack|stix|taxii': [
      "Threat intelligence is about turning raw data into something actionable. Not just 'here are some malicious IPs' but 'here's who is targeting organisations like yours, here's how they get in, here's what to look for.'",
      "",
      "The four levels of intel:",
      "  Strategic   — Written for executives. Trends, nation-state threat landscape.",
      "  Operational — TTPs of specific threat actors. 'APT41 uses these techniques.'",
      "  Tactical    — IOCs: IP addresses, file hashes, malicious domains, YARA rules.",
      "  Technical   — Actual malware samples, exploit code, vulnerability details.",
      "",
      "Where the good intel actually comes from:",
      "  OSINT        — security vendor blogs, Twitter/X threat researchers",
      "  ISACs        — industry-specific sharing groups (FS-ISAC, H-ISAC)",
      "  MISP         — open-source threat sharing platform, great community",
      "  VirusTotal   — check file hashes and IPs against everyone's data",
      "  AbuseIPDB    — community-reported malicious IPs",
      "  Commercial   — CrowdStrike Intel, Mandiant, Recorded Future (expensive but deep)",
      "",
      "MITRE ATT&CK — learn this framework. It's become the industry's common language.",
      "  14 Tactics from Reconnaissance through to Impact",
      "  Each tactic has Techniques, which have Sub-techniques",
      "  Each technique has real-world Procedure examples",
      "  attack.mitre.org — free, constantly updated",
      "",
      "Sharing standards:",
      "  STIX 2.1  — the format (JSON). Describes threats in a structured way.",
      "  TAXII 2.1 — the transport. How you share STIX objects between platforms.",
      "",
      "IOC lifecycle: Collect → Enrich → Analyse → Produce → Share → Get feedback → Repeat.",
      "The feedback loop is what most teams skip — and it's where the value compounds.",
    ],

  };

  /* ─────────────────────────────────────────────────────────────────────────
   * LOOKUP FUNCTION
   * ────────────────────────────────────────────────────────────────────────*/
  function lookupChatbot(query) {
    const q = query.toLowerCase();
    for (const [patterns, lines] of Object.entries(CHATBOT_KB)) {
      const keys = patterns.split('|');
      if (keys.some(k => q.includes(k.replace(/\./g, ' ')))) {
        return lines;
      }
    }
    return null;
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * TYPEWRITER RENDERER
   * Prints lines with a small stagger so the response feels live.
   * ────────────────────────────────────────────────────────────────────────*/
  function tPrint(lines) {
    if (typeof termPrint === 'function') {
      lines.forEach(l => termPrint(l));
    } else {
      console.log(lines.map(l => l.v || '').join('\n'));
    }
  }

  function typewriterPrint(lineObjects, baseDelay) {
    lineObjects.forEach(function(obj, i) {
      setTimeout(function() { tPrint([obj]); }, i * baseDelay);
    });
  }

  function renderHumanResponse(lines, query) {
    var opener = pick(OPENERS);
    var followUp = pick(FOLLOW_UPS);
    var output = [];

    output.push({ t: 't-sys', v: '\u2500\u2500 ' + query.slice(0, 55) + ' \u2500\u2500' });
    output.push({ t: 't-dim', v: '' });
    output.push({ t: 't-out', v: '  ' + opener });
    output.push({ t: 't-dim', v: '' });

    lines.forEach(function(line) {
      if (line === '') {
        output.push({ t: 't-dim', v: '' });
      } else if (line.match(/^\s+[\u2192\u25cf\u2713\u2717]/)) {
        output.push({ t: 't-out', v: line });
      } else if (line.startsWith('  ')) {
        output.push({ t: 't-dim', v: line });
      } else {
        output.push({ t: 't-out', v: line });
      }
    });

    output.push({ t: 't-dim', v: '' });
    output.push({ t: 't-dim', v: '  ' + followUp });
    output.push({ t: 't-dim', v: '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500' });

    typewriterPrint(output, 16);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * ASK COMMAND
   * ────────────────────────────────────────────────────────────────────────*/
  function handleAsk(args) {
    if (!args || !args.trim()) {
      tPrint([
        { t: 't-sys', v: '  CYBAASH AI \u2014 ask me anything' },
        { t: 't-out', v: '' },
        { t: 't-out', v: "  I know cybersecurity. Ask naturally:" },
        { t: 't-dim', v: "  ask what is an APT" },
        { t: 't-dim', v: "  ask how does ransomware work" },
        { t: 't-dim', v: "  ask explain zero-day exploits" },
        { t: 't-dim', v: "  ask threat hunting techniques" },
        { t: 't-dim', v: "  ask how to analyse malware" },
        { t: 't-dim', v: "  ask cloud security mistakes" },
        { t: 't-out', v: '' },
        { t: 't-dim', v: "  Type 'chatbot' to see all topics." },
      ]);
      return;
    }

    var query = args.trim();
    var thinking = pick(THINKING);
    tPrint([{ t: 't-dim', v: '  ' + thinking }]);

    setTimeout(function() {
      var localLines = lookupChatbot(query);

      if (localLines) {
        renderHumanResponse(localLines, query);
        return;
      }

      if (typeof GEMINI_AI !== 'undefined' && typeof GEMINI_AI.localLookup === 'function') {
        var mainLocal = GEMINI_AI.localLookup(query.toLowerCase());
        if (mainLocal) {
          renderHumanResponse(mainLocal.split('\n'), query);
          return;
        }
      }

      if (typeof GEMINI_AI !== 'undefined' && typeof GEMINI_AI.ask === 'function') {
        tPrint([{ t: 't-dim', v: "  not in my local knowledge \u2014 asking Gemini AI..." }]);
        GEMINI_AI.ask(query);
      } else {
        tPrint([
          { t: 't-out', v: '  Hmm, I don\'t have a specific answer for "' + query + '".' },
          { t: 't-dim', v: '' },
          { t: 't-dim', v: '  Topics I can talk about right now:' },
          { t: 't-dim', v: '  apt \u00b7 zero-day \u00b7 supply chain \u00b7 ransomware \u00b7 threat hunting' },
          { t: 't-dim', v: '  honeypot \u00b7 malware analysis \u00b7 network forensics \u00b7 cloud security' },
          { t: 't-dim', v: '  social engineering \u00b7 password cracking \u00b7 osint \u00b7 threat intel' },
          { t: 't-dim', v: '' },
          { t: 't-dim', v: '  Or set a Gemini key for anything else: gemini key YOUR_KEY' },
        ]);
      }
    }, 380);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * CHATBOT TOPICS COMMAND
   * ────────────────────────────────────────────────────────────────────────*/
  function handleChatbot(args) {
    if (args && args.trim()) {
      handleAsk(args.trim());
      return;
    }
    tPrint([
      { t: 't-sys', v: '  CYBAASH AI \u2014 Topics I know well' },
      { t: 't-out', v: '' },
      { t: 't-dim', v: "  Just ask naturally. Examples:" },
      { t: 't-out', v: '' },
      { t: 't-out', v: '  ask apt                 \u2192 Advanced Persistent Threats' },
      { t: 't-out', v: '  ask zero-day            \u2192 Zero-Day Exploits' },
      { t: 't-out', v: '  ask supply chain        \u2192 Supply Chain Attacks' },
      { t: 't-out', v: '  ask threat hunting      \u2192 Proactive Threat Hunting' },
      { t: 't-out', v: '  ask honeypot            \u2192 Deception Technology' },
      { t: 't-out', v: '  ask malware analysis    \u2192 Static/Dynamic Analysis' },
      { t: 't-out', v: '  ask network forensics   \u2192 Packet Analysis & PCAP' },
      { t: 't-out', v: '  ask cloud security      \u2192 AWS/Azure/GCP Deep Dive' },
      { t: 't-out', v: '  ask social engineering  \u2192 Psychology of Attacks' },
      { t: 't-out', v: '  ask ransomware          \u2192 RaaS, LockBit, Response' },
      { t: 't-out', v: '  ask password cracking   \u2192 Cracking & Secure Storage' },
      { t: 't-out', v: '  ask osint               \u2192 Reconnaissance Tools' },
      { t: 't-out', v: '  ask threat intel        \u2192 CTI, MITRE ATT&CK, STIX' },
      { t: 't-out', v: '' },
      { t: 't-dim', v: "  Anything else goes to Gemini AI. I'll figure it out." },
    ]);
  }

  /* ─────────────────────────────────────────────────────────────────────────
   * REGISTER COMMANDS
   * ────────────────────────────────────────────────────────────────────────*/
  function registerCommands() {
    if (typeof defCmd !== 'function') {
      setTimeout(registerCommands, 200);
      return;
    }

    defCmd('ask', function(args) { handleAsk(args); });
    defCmd('chatbot', function(args) { handleChatbot(args); });

    if (typeof TERM_COMMANDS !== 'undefined') {
      var existingAi = TERM_COMMANDS['ai'];
      defCmd('ai', function(args) {
        if (!args || !args.trim()) {
          if (typeof existingAi === 'function') existingAi(args);
          else handleChatbot('');
          return;
        }
        var local = lookupChatbot(args.trim());
        if (local) {
          renderHumanResponse(local, args.trim());
        } else if (typeof existingAi === 'function') {
          existingAi(args);
        } else {
          handleAsk(args);
        }
      });
    }

    console.log('[CYBAASH Chatbot] Ready. Commands: ask, chatbot, ai');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerCommands);
  } else {
    setTimeout(registerCommands, 100);
  }

})();
