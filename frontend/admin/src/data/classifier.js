// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — classifier.js                         ║
// ║  Maps your real cert tags / issuers to cyber categories.    ║
// ║  Built from the actual tags found in your data files.       ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── Category definitions ─────────────────────────────────────────────────────
// Each category has a set of keyword signals (checked against tags + title + issuer).
// Add more keywords here — no other file needs to change.

export const CATEGORY_MAP = {
  offensive: {
    label:    'Offensive Security',
    keywords: [
      'ethical hacking', 'penetration testing', 'pentest', 'red team',
      'exploit', 'kali', 'metasploit', 'burp', 'web hacking',
      'ctf', 'capture the flag', 'offensive', 'vulnerability',
    ],
  },

  defensive: {
    label:    'Defensive Security',
    keywords: [
      'blue team', 'soc', 'siem', 'incident response', 'threat hunting',
      'threat intelligence', 'malware analysis', 'forensics', 'dfir',
      'endpoint', 'ids', 'ips', 'firewall', 'security operations',
      'defensive', 'monitoring', 'detection',
    ],
  },

  cloud: {
    label:    'Cloud & DevSecOps',
    keywords: [
      'aws', 'azure', 'gcp', 'cloud', 'cloud practitioner', 'devops',
      'docker', 'kubernetes', 'containers', 'devsecops', 'ci/cd',
      'infrastructure', 'amazon', 'serverless',
    ],
  },

  networking: {
    label:    'Networking',
    keywords: [
      'network', 'networking', 'cisco', 'ccna', 'tcp', 'ip', 'protocol',
      'routing', 'switching', 'vpn', 'packet', 'wireshark',
      'cisco networking academy', 'cisco netacad',
    ],
  },

  systems: {
    label:    'Linux & Systems',
    keywords: [
      'linux', 'bash', 'shell', 'unix', 'operating system', 'canonical',
      'ubuntu', 'kernel', 'sysadmin', 'systems',
    ],
  },

  programming: {
    label:    'Programming & Dev',
    keywords: [
      'python', 'javascript', 'java', 'c++', 'c#', 'rust', 'go',
      'coding', 'development', 'software', 'github', 'jetbrains',
      'programming', 'scripting',
    ],
  },

  data: {
    label:    'Data & AI/ML',
    keywords: [
      'data', 'machine learning', 'ai', 'ai/ml', 'analytics', 'sql',
      'tableau', 'power bi', 'knime', 'anaconda', 'statistics',
      'deep learning', 'neural network', 'data science',
    ],
  },

  professional: {
    label:    'Professional Skills',
    keywords: [
      'leadership', 'management', 'communication', 'marketing',
      'project management', 'agile', 'scrum', 'business', 'strategy',
      'linkedin learning', 'coursera', 'udemy', 'soft skills',
      'hootsuite', 'grammarly', 'content marketing',
    ],
  },
};

// ─── Classifier logic ─────────────────────────────────────────────────────────

/**
 * normalise a string for matching (lowercase, trim)
 */
function norm(str) {
  return String(str || '').toLowerCase().trim();
}

/**
 * classifyCredential(cert)
 * Returns the best-matching category key for a single credential object.
 * Falls back to 'other' if nothing matches.
 */
export function classifyCredential(cert) {
  // Build a single searchable string from all relevant fields
  const haystack = [
    ...(cert.tags || []),
    cert.title  || '',
    cert.issuer || '',
  ].map(norm).join(' ');

  // Score each category
  let bestKey   = 'other';
  let bestScore = 0;

  for (const [key, def] of Object.entries(CATEGORY_MAP)) {
    let score = 0;
    for (const keyword of def.keywords) {
      if (haystack.includes(norm(keyword))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestKey   = key;
    }
  }

  return bestKey;
}

/**
 * classifyAll(credentials)
 * Returns the credentials array with a `category` field added to each item.
 * Never mutates the originals — returns new objects.
 */
export function classifyAll(credentials) {
  return credentials.map(cert => ({
    ...cert,
    category: cert.category || classifyCredential(cert),
  }));
}

/**
 * getCategoryLabel(key)
 * Maps a category key back to its human-readable label.
 */
export function getCategoryLabel(key) {
  return CATEGORY_MAP[key]?.label ?? 'Other';
}

/**
 * listCategories()
 * Returns all category keys with their labels.
 */
export function listCategories() {
  return [
    ...Object.entries(CATEGORY_MAP).map(([key, def]) => ({
      key,
      label: def.label,
    })),
    { key: 'other', label: 'Other' },
  ];
}
