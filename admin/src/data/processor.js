// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — processor.js                          ║
// ║  Turns your flat credential array into structured           ║
// ║  analytics: totals, category distribution, issuer stats,    ║
// ║  timeline, and featured certs.                              ║
// ╚══════════════════════════════════════════════════════════════╝

import { getCategoryLabel } from './classifier.js';

// ─── Main processor ───────────────────────────────────────────────────────────

/**
 * processCredentials(credentials)
 *
 * Input:  classified credentials array (from classifyAll)
 * Output: structured analytics object consumed by Dashboard / Terminal / Sim engine
 *
 * @param {Array} credentials  Already classified (each has a `.category` field)
 * @returns {Object}  analytics
 */
export function processCredentials(credentials) {
  if (!credentials?.length) return emptyAnalytics();

  const total    = credentials.length;
  const featured = credentials.filter(c => c.featured);

  // ── Category distribution ───────────────────────────────────────────────────
  const categoryCount = {};
  for (const cert of credentials) {
    const cat = cert.category || 'other';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }

  const categoryDistribution = Object.entries(categoryCount)
    .map(([key, count]) => ({
      key,
      label:      getCategoryLabel(key),
      count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  // ── Issuer stats ────────────────────────────────────────────────────────────
  const issuerCount = {};
  for (const cert of credentials) {
    const issuer = cert.issuer || 'Unknown';
    issuerCount[issuer] = (issuerCount[issuer] || 0) + 1;
  }

  const topIssuers = Object.entries(issuerCount)
    .map(([issuer, count]) => ({ issuer, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ── Timeline (grouped by YYYY-MM) ───────────────────────────────────────────
  // Your dates are stored as "2026-03" or "2026-02" — YYYY-MM format
  const timelineMap = {};
  const VALID_DATE  = /^\d{4}-\d{2}$/;

  for (const cert of credentials) {
    const raw = String(cert.date || '').trim();
    if (!VALID_DATE.test(raw)) continue;

    if (!timelineMap[raw]) {
      timelineMap[raw] = { date: raw, count: 0, certs: [] };
    }
    timelineMap[raw].count++;
    timelineMap[raw].certs.push({ id: cert.id, title: cert.title, category: cert.category });
  }

  const timeline = Object.values(timelineMap)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Attach a running cumulative total so the dashboard can render a growth chart
  let cumulative = 0;
  for (const entry of timeline) {
    cumulative += entry.count;
    entry.cumulative = cumulative;
  }

  // ── Cert type breakdown (credly vs pdf vs other) ─────────────────────────
  const typeCount = {};
  for (const cert of credentials) {
    const t = cert.type || 'other';
    typeCount[t] = (typeCount[t] || 0) + 1;
  }

  // ── Tags frequency ──────────────────────────────────────────────────────────
  const tagCount = {};
  for (const cert of credentials) {
    for (const tag of cert.tags || []) {
      const t = tag.toLowerCase().trim();
      tagCount[t] = (tagCount[t] || 0) + 1;
    }
  }

  const topTags = Object.entries(tagCount)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // ── Assemble ────────────────────────────────────────────────────────────────
  return {
    total,
    featuredCount:        featured.length,
    categoryDistribution,
    topIssuers,
    timeline,
    typeBreakdown:        typeCount,
    topTags,
    // convenience: most active month
    peakMonth: timeline.reduce(
      (best, e) => (e.count > (best?.count ?? 0) ? e : best),
      null
    ),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyAnalytics() {
  return {
    total: 0,
    featuredCount: 0,
    categoryDistribution: [],
    topIssuers: [],
    timeline: [],
    typeBreakdown: {},
    topTags: [],
    peakMonth: null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * filterByCategory(credentials, categoryKey)
 * Utility to pull all certs from one category.
 */
export function filterByCategory(credentials, categoryKey) {
  return credentials.filter(c => c.category === categoryKey);
}

/**
 * filterByDateRange(credentials, startYYYYMM, endYYYYMM)
 * e.g. filterByDateRange(certs, '2025-01', '2026-03')
 */
export function filterByDateRange(credentials, start, end) {
  return credentials.filter(c => {
    const d = String(c.date || '');
    return d >= start && d <= end;
  });
}
