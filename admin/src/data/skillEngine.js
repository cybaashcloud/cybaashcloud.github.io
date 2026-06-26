// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — skillEngine.js                        ║
// ║  Converts classified credentials into a normalised skill    ║
// ║  profile used by the Attack Engine, Defence Engine, and     ║
// ║  Dashboard heatmap.                                         ║
// ╚══════════════════════════════════════════════════════════════╝

// ─── Category → Skill domain mapping ─────────────────────────────────────────
// Maps classifier keys to the high-level skill domains the simulation uses.
// One classifier category can contribute to multiple skill domains.

const DOMAIN_MAP = {
  offensive:    { domains: ['offensive', 'recon'],       weight: 1.0 },
  defensive:    { domains: ['defensive', 'detection'],   weight: 1.0 },
  cloud:        { domains: ['cloud', 'devops'],          weight: 0.8 },
  networking:   { domains: ['networking'],               weight: 1.0 },
  systems:      { domains: ['systems', 'linux'],         weight: 0.9 },
  programming:  { domains: ['scripting', 'automation'],  weight: 0.7 },
  data:         { domains: ['intelligence', 'analytics'],weight: 0.6 },
  professional: { domains: ['opsec', 'leadership'],      weight: 0.4 },
  other:        { domains: ['general'],                  weight: 0.3 },
};

// ─── Skill profile builder ────────────────────────────────────────────────────

/**
 * buildSkillProfile(classifiedCredentials)
 *
 * Returns a normalised skill profile object where each value is 0-100.
 *
 * Output shape:
 * {
 *   offensive:   number,   // red-team / exploit proficiency
 *   defensive:   number,   // blue-team / SOC proficiency
 *   networking:  number,   // network-layer knowledge
 *   systems:     number,   // Linux / OS depth
 *   cloud:       number,   // cloud / infra coverage
 *   scripting:   number,   // code / automation ability
 *   intelligence:number,   // data / OSINT / analytics
 *   opsec:       number,   // professional / operational
 *   overall:     number,   // weighted composite
 * }
 */
export function buildSkillProfile(classifiedCredentials) {
  if (!classifiedCredentials?.length) return emptyProfile();

  // 1. Count raw domain hits from credentials
  const rawScores = {};

  for (const cert of classifiedCredentials) {
    const mapping = DOMAIN_MAP[cert.category] ?? DOMAIN_MAP.other;
    for (const domain of mapping.domains) {
      rawScores[domain] = (rawScores[domain] ?? 0) + mapping.weight;
    }
  }

  // 2. Find the max score so we can normalise to 0-100
  const maxRaw = Math.max(...Object.values(rawScores), 1);

  const norm = (domain) =>
    Math.min(100, Math.round(((rawScores[domain] ?? 0) / maxRaw) * 100));

  // 3. Build the canonical profile
  const profile = {
    offensive:    norm('offensive'),
    defensive:    norm('defensive'),
    networking:   norm('networking'),
    systems:      norm('systems'),
    cloud:        norm('cloud'),
    scripting:    norm('scripting'),
    intelligence: norm('intelligence'),
    opsec:        norm('opsec'),
  };

  // 4. Composite overall score (weighted average)
  const WEIGHTS = {
    offensive:    0.20,
    defensive:    0.20,
    networking:   0.15,
    systems:      0.15,
    cloud:        0.10,
    scripting:    0.10,
    intelligence: 0.05,
    opsec:        0.05,
  };

  const overall = Math.round(
    Object.entries(profile).reduce(
      (sum, [k, v]) => sum + v * (WEIGHTS[k] ?? 0),
      0
    )
  );

  return { ...profile, overall };
}

// ─── Simulation engine helpers ────────────────────────────────────────────────

/**
 * getAttackModifiers(skillProfile)
 *
 * Returns multipliers for the attack simulation engine.
 * Higher offensive/scripting → faster attacks, higher success rate.
 */
export function getAttackModifiers(skillProfile) {
  const sp = skillProfile ?? emptyProfile();

  return {
    // 0.5 = slow / novice … 2.0 = expert speed
    attackSpeedMultiplier: lerp(0.5, 2.0, sp.offensive / 100),

    // 0.1 = 10% chance … 0.9 = 90% chance
    successRate: lerp(0.10, 0.90, weightedAvg([
      [sp.offensive,  0.50],
      [sp.scripting,  0.30],
      [sp.networking, 0.20],
    ]) / 100),

    // How much automation the attacker can bring
    automationLevel: lerp(0, 10, sp.scripting / 100),

    // Pivot / lateral-movement capability
    lateralMovement: lerp(0, 5, weightedAvg([
      [sp.networking, 0.60],
      [sp.systems,    0.40],
    ]) / 100),
  };
}

/**
 * getDefenceModifiers(skillProfile)
 *
 * Returns multipliers for the defence simulation engine.
 * Higher defensive/detection → better detection, lower attacker dwell time.
 */
export function getDefenceModifiers(skillProfile) {
  const sp = skillProfile ?? emptyProfile();

  return {
    // How quickly alerts surface (seconds, 600 = slow, 10 = instant)
    detectionTimeSeconds: lerp(600, 10, sp.defensive / 100),

    // Probability of detecting a running attack per sim tick
    detectionRate: lerp(0.05, 0.95, weightedAvg([
      [sp.defensive,    0.50],
      [sp.intelligence, 0.30],
      [sp.cloud,        0.20],
    ]) / 100),

    // How well the operator contains an incident (0-1)
    containmentScore: lerp(0.1, 1.0, weightedAvg([
      [sp.defensive,  0.40],
      [sp.systems,    0.30],
      [sp.networking, 0.30],
    ]) / 100),

    // Whether the blue team can attribute the attacker
    attributionCapability: sp.intelligence / 100,
  };
}

// ─── Text summaries for Terminal ─────────────────────────────────────────────

/**
 * describeSkillProfile(skillProfile)
 * Returns a short human-readable assessment string for the terminal.
 */
export function describeSkillProfile(skillProfile) {
  const sp = skillProfile ?? emptyProfile();
  const lines = [];

  lines.push(`Overall Cyber Skill Index: ${sp.overall}/100`);

  if (sp.offensive >= 70) lines.push('🔴 Strong offensive capability — red-team ready');
  if (sp.defensive >= 70) lines.push('🔵 Strong defensive posture — SOC proficient');
  if (sp.networking >= 70) lines.push('🟡 Deep networking knowledge');
  if (sp.cloud >= 70) lines.push('☁️  Cloud-native proficiency');
  if (sp.scripting >= 70) lines.push('⚡ High automation / scripting ability');

  const dominant = Object.entries(sp)
    .filter(([k]) => k !== 'overall')
    .sort((a, b) => b[1] - a[1])[0];

  if (dominant) lines.push(`Primary strength: ${dominant[0]} (${dominant[1]}/100)`);

  return lines.join('\n');
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function emptyProfile() {
  return {
    offensive: 0, defensive: 0, networking: 0, systems: 0,
    cloud: 0, scripting: 0, intelligence: 0, opsec: 0, overall: 0,
  };
}

/** Linear interpolation: lerp(a, b, t) where t ∈ [0, 1] */
function lerp(a, b, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return a + (b - a) * clamped;
}

/** Weighted average: pairs = [[value, weight], ...] */
function weightedAvg(pairs) {
  const totalWeight = pairs.reduce((s, [, w]) => s + w, 0);
  return pairs.reduce((s, [v, w]) => s + v * w, 0) / totalWeight;
}
