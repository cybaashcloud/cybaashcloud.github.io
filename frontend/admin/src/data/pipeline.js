// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — pipeline.js                           ║
// ║  Main data pipeline: fetch → cache → classify → process     ║
// ║  → skill profile.  Single entry point for all consumers.    ║
// ╚══════════════════════════════════════════════════════════════╝

import { fetchCredentials } from './fetcher.js';
import {
  getCachedData, setCachedData, CACHE_KEYS,
} from './cache.js';
import { classifyAll }            from './classifier.js';
import { processCredentials }     from './processor.js';
import {
  buildSkillProfile,
  getAttackModifiers,
  getDefenceModifiers,
  describeSkillProfile,
} from './skillEngine.js';

// ─── Core pipeline ────────────────────────────────────────────────────────────

/**
 * loadAndAnalyzeData(opts?)
 *
 * The one function all consumers call.  Orchestrates the full pipeline:
 *   1. Return cached result if still fresh
 *   2. Fetch raw credentials from GitHub (parallel)
 *   3. Cache raw credentials
 *   4. Classify each cert into a cyber domain
 *   5. Run analytics processor
 *   6. Build skill profile
 *   7. Cache and return full result
 *
 * @param {Object} opts
 * @param {boolean} opts.forceRefresh  Bypass cache and re-fetch
 * @returns {Promise<PipelineResult>}
 */
export async function loadAndAnalyzeData({ forceRefresh = false } = {}) {
  // ── 1. Cache hit check ────────────────────────────────────────────────────
  if (!forceRefresh) {
    const cached = getCachedData(CACHE_KEYS.PIPELINE);
    if (cached) {
      console.info('[Pipeline] Serving from cache.');
      return cached;
    }
  }

  console.info('[Pipeline] Starting full analysis run…');
  const t0 = performance.now();

  // ── 2. Fetch ──────────────────────────────────────────────────────────────
  let certs = getCachedData(CACHE_KEYS.CREDENTIALS);
  if (forceRefresh || !certs) {
    certs = await fetchCredentials();
    setCachedData(CACHE_KEYS.CREDENTIALS, certs);
  }

  // ── 3. Classify ───────────────────────────────────────────────────────────
  const classified = classifyAll(certs);

  // ── 4. Process (analytics) ────────────────────────────────────────────────
  const analytics = processCredentials(classified);
  setCachedData(CACHE_KEYS.ANALYTICS, analytics);

  // ── 5. Skill profile ──────────────────────────────────────────────────────
  const skillProfile = buildSkillProfile(classified);
  setCachedData(CACHE_KEYS.SKILL_PROFILE, skillProfile);

  // ── 6. Simulation modifiers ───────────────────────────────────────────────
  const attackMods  = getAttackModifiers(skillProfile);
  const defenceMods = getDefenceModifiers(skillProfile);

  // ── 7. Assemble result ────────────────────────────────────────────────────
  const result = {
    certs:       classified,   // full classified cert array
    analytics,                 // processed analytics (for Dashboard)
    skillProfile,              // normalised 0-100 domain scores
    simulation: {              // ready-to-use modifiers for engines
      attack:  attackMods,
      defence: defenceMods,
    },
    meta: {
      totalCerts:    certs.length,
      elapsedMs:     Math.round(performance.now() - t0),
      generatedAt:   new Date().toISOString(),
    },
  };

  setCachedData(CACHE_KEYS.PIPELINE, result);
  console.info(`[Pipeline] Done in ${result.meta.elapsedMs}ms — ${certs.length} certs analysed.`);
  return result;
}

// ─── Terminal-facing helpers ──────────────────────────────────────────────────

/**
 * getCertSummary()
 * Short stats string for the `certs` terminal command.
 */
export async function getCertSummary() {
  const { analytics, skillProfile } = await loadAndAnalyzeData();
  const { total, featuredCount, categoryDistribution, peakMonth } = analytics;

  const topCats = categoryDistribution
    .slice(0, 3)
    .map(c => `${c.label} (${c.count})`)
    .join(', ');

  return [
    `┌─ CREDENTIAL SUMMARY ─────────────────────────────────`,
    `│  Total certifications : ${total}`,
    `│  Featured             : ${featuredCount}`,
    `│  Top categories       : ${topCats}`,
    `│  Peak month           : ${peakMonth?.date ?? 'N/A'} (${peakMonth?.count ?? 0} certs)`,
    `│  Cyber skill index    : ${skillProfile.overall}/100`,
    `└───────────────────────────────────────────────────────`,
  ].join('\n');
}

/**
 * getCertAnalysis()
 * Full analytics dump for `certs --analyze`.
 */
export async function getCertAnalysis() {
  const { analytics, skillProfile, simulation } = await loadAndAnalyzeData();

  const catLines = analytics.categoryDistribution
    .map(c => `│  ${c.label.padEnd(26)} ${String(c.count).padStart(3)}  (${String(c.percentage).padStart(3)}%)`)
    .join('\n');

  const skillLines = Object.entries(skillProfile)
    .filter(([k]) => k !== 'overall')
    .map(([k, v]) => {
      const bar = '█'.repeat(Math.round(v / 5)).padEnd(20, '░');
      return `│  ${k.padEnd(14)} ${bar} ${String(v).padStart(3)}/100`;
    })
    .join('\n');

  return [
    `┌─ CERT ANALYSIS ──────────────────────────────────────`,
    `│  Total: ${analytics.total}  │  Generated: ${analytics.generatedAt}`,
    `├─ CATEGORY DISTRIBUTION ──────────────────────────────`,
    catLines,
    `├─ SKILL DOMAINS ──────────────────────────────────────`,
    skillLines,
    `├─ SIMULATION ENGINE ──────────────────────────────────`,
    `│  Attack speed      x${simulation.attack.attackSpeedMultiplier.toFixed(2)}`,
    `│  Success rate       ${(simulation.attack.successRate * 100).toFixed(0)}%`,
    `│  Detection time    ${simulation.defence.detectionTimeSeconds.toFixed(0)}s`,
    `│  Detection rate     ${(simulation.defence.detectionRate * 100).toFixed(0)}%`,
    `└───────────────────────────────────────────────────────`,
  ].join('\n');
}

/**
 * getTimeline()
 * Timeline string for `certs --timeline`.
 */
export async function getTimeline() {
  const { analytics } = await loadAndAnalyzeData();
  const { timeline }  = analytics;

  if (!timeline.length) return 'No timeline data available.';

  const lines = timeline.map(e => {
    const bar = '▪'.repeat(Math.min(e.count, 30));
    return `│  ${e.date}  ${bar.padEnd(30)} +${e.count}  (total: ${e.cumulative})`;
  });

  return [
    `┌─ CERTIFICATION TIMELINE ─────────────────────────────`,
    ...lines,
    `└───────────────────────────────────────────────────────`,
  ].join('\n');
}
