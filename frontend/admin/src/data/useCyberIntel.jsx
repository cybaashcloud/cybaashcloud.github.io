// ╔══════════════════════════════════════════════════════════════╗
// ║  CYBER INTEL ENGINE — useCyberIntel.jsx                    ║
// ║  React integration layer.  One hook feeds Dashboard,       ║
// ║  Terminal, and Simulation components identically.          ║
// ╚══════════════════════════════════════════════════════════════╝

import { useState, useEffect, useCallback } from 'react';
import { loadAndAnalyzeData, getCertSummary, getCertAnalysis, getTimeline } from './pipeline.js';
import { invalidateAll } from './cache.js';

// ─── Primary hook ────────────────────────────────────────────────────────────

/**
 * useCyberIntel(opts?)
 *
 * Provides the full pipeline result to any component.
 *
 * Returns:
 *   data         — { certs, analytics, skillProfile, simulation, meta }
 *   loading      — boolean
 *   error        — Error | null
 *   refresh()    — force re-fetch bypassing cache
 */
export function useCyberIntel({ autoLoad = true } = {}) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadAndAnalyzeData({ forceRefresh });
      setData(result);
    } catch (err) {
      setError(err);
      console.error('[useCyberIntel] Pipeline error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoLoad) load();
  }, [autoLoad, load]);

  return {
    data,
    loading,
    error,
    refresh: () => load(true),
  };
}

// ─── Example: Dashboard component ────────────────────────────────────────────

export function CyberDashboard() {
  const { data, loading, error, refresh } = useCyberIntel();

  if (loading) return <div className="terminal-loading">[ LOADING INTEL... ]</div>;
  if (error)   return <div className="terminal-error">[ ERROR: {error.message} ]</div>;
  if (!data)   return null;

  const { analytics, skillProfile, simulation } = data;

  return (
    <div className="cyber-dashboard">

      {/* Header stats */}
      <section className="stat-row">
        <StatCard label="Total Certs"   value={analytics.total} />
        <StatCard label="Skill Index"   value={`${skillProfile.overall}/100`} />
        <StatCard label="Attack Speed"  value={`x${simulation.attack.attackSpeedMultiplier.toFixed(2)}`} />
        <StatCard label="Detection"     value={`${(simulation.defence.detectionRate * 100).toFixed(0)}%`} />
        <button onClick={refresh} className="refresh-btn">↺ REFRESH</button>
      </section>

      {/* Category distribution */}
      <section className="category-grid">
        <h3>Category Distribution</h3>
        {analytics.categoryDistribution.map(cat => (
          <div key={cat.key} className="cat-bar">
            <span className="cat-label">{cat.label}</span>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${cat.percentage}%` }} />
            </div>
            <span className="cat-count">{cat.count} ({cat.percentage}%)</span>
          </div>
        ))}
      </section>

      {/* Skill radar (raw values — feed into your favourite chart lib) */}
      <section className="skill-radar">
        <h3>Skill Profile</h3>
        {Object.entries(skillProfile)
          .filter(([k]) => k !== 'overall')
          .map(([domain, score]) => (
            <SkillBar key={domain} domain={domain} score={score} />
          ))}
      </section>

      {/* Simulation modifiers */}
      <section className="sim-modifiers">
        <h3>Simulation Modifiers</h3>
        <div className="mod-grid">
          <Modifier label="Attack Speed"      value={simulation.attack.attackSpeedMultiplier.toFixed(2)} unit="x" color="red" />
          <Modifier label="Success Rate"      value={(simulation.attack.successRate * 100).toFixed(0)}  unit="%" color="red" />
          <Modifier label="Detection Time"    value={simulation.defence.detectionTimeSeconds.toFixed(0)} unit="s" color="blue" />
          <Modifier label="Detection Rate"    value={(simulation.defence.detectionRate * 100).toFixed(0)} unit="%" color="blue" />
          <Modifier label="Containment"       value={(simulation.defence.containmentScore * 100).toFixed(0)} unit="%" color="blue" />
        </div>
      </section>

    </div>
  );
}

// ─── Example: Terminal command handler ───────────────────────────────────────

export function useTerminalCertCommands() {
  /**
   * handleCertCommand(input)
   * Call this from your terminal command parser.
   * Returns a string to print to the terminal.
   */
  const handleCertCommand = useCallback(async (input) => {
    const cmd = input.trim().toLowerCase();

    if (cmd === 'certs') {
      return getCertSummary();
    }
    if (cmd === 'certs --analyze' || cmd === 'certs -a') {
      return getCertAnalysis();
    }
    if (cmd === 'certs --timeline' || cmd === 'certs -t') {
      return getTimeline();
    }
    if (cmd === 'certs --refresh') {
      invalidateAll();
      return '[ Cache cleared — next command will re-fetch from GitHub ]';
    }
    if (cmd === 'certs --help') {
      return [
        'CERTS — Cyber Intelligence Commands',
        '',
        '  certs             Quick summary + skill index',
        '  certs --analyze   Full analytics + simulation modifiers',
        '  certs --timeline  Month-by-month certification timeline',
        '  certs --refresh   Force re-fetch from GitHub',
      ].join('\n');
    }
    return null; // not a cert command — let other handlers try
  }, []);

  return { handleCertCommand };
}

// ─── Example: Simulation engine integration ──────────────────────────────────

/**
 * useSimulationModifiers()
 * Returns attack and defence modifiers, ready for the sim engine.
 * Returns defaults while loading so the engine can start immediately.
 */
export function useSimulationModifiers() {
  const { data, loading } = useCyberIntel();

  if (loading || !data) {
    return {
      attack:  { attackSpeedMultiplier: 1.0, successRate: 0.5, automationLevel: 0, lateralMovement: 0 },
      defence: { detectionTimeSeconds: 300, detectionRate: 0.5, containmentScore: 0.5, attributionCapability: 0.5 },
      ready: false,
    };
  }

  return {
    ...data.simulation,
    ready: true,
  };
}

// ─── Tiny UI components ───────────────────────────────────────────────────────

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function SkillBar({ domain, score }) {
  return (
    <div className="skill-row">
      <span className="skill-name">{domain.padEnd(14)}</span>
      <div className="skill-track">
        <div className="skill-fill" style={{ width: `${score}%` }} />
      </div>
      <span className="skill-score">{score}/100</span>
    </div>
  );
}

function Modifier({ label, value, unit, color }) {
  return (
    <div className={`modifier modifier--${color}`}>
      <span className="mod-value">{value}{unit}</span>
      <span className="mod-label">{label}</span>
    </div>
  );
}
