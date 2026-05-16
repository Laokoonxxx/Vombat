import { useEffect, useMemo, useState } from 'react';

// =============================================================================
// In-app stats viewer for AI vs AI simulation data
// =============================================================================
// Loads /sim/latest.json (written by simulate_detailed.ts) and renders
// charts + tables for human-readable analysis.
// =============================================================================

interface PlayerActionCounts {
  [eventType: string]: number;
}

interface SkillGain {
  playerName: string;
  skill: string;
  turn: number;
  method: 'learn_hlina' | 'sleep_shop' | 'milestone';
}

interface WoundEvent {
  playerName: string;
  woundType: string;
  turn: number;
  dieLevel: number;
  rollValue: number;
}

interface CatSmash { playerName: string; turn: number }

interface FinalPlayer {
  name: string;
  hand: number[];
  reserve: number[];
  pending: number[];
  potatoes: number;
  carrotTrack: number;
  bobekTrack: number;
  skills: string[];
}

interface ResourceSample {
  turn: number;
  playerName: string;
  potatoes: number;
  carrotTrack: number;
  bobekTrack: number;
  handSize: number;
  reserveSize: number;
  pendingSize: number;
  maxDieInHand: number;
  skillsCount: number;
}

interface GameStats {
  seed: number;
  winnerName: string | null;
  totalSteps: number;
  totalTurns: number;
  finalPhase: string;
  skillsTimeline: SkillGain[];
  woundsTimeline: WoundEvent[];
  catSmashes: CatSmash[];
  actionCountsByPlayer: Record<string, PlayerActionCounts>;
  finalState: { players: FinalPlayer[] };
  trajectories: Record<string, ResourceSample[]>;
  fullLog: string[];
}

interface SimData {
  generatedAt: string;
  numGames: number;
  maxTurns: number;
  seedBase: number;
  results: GameStats[];
}

const ACTION_LABELS: Record<string, string> = {
  roll: '🎲 Hod',
  move: '🐾 Pohyb',
  sleep_gain_potato: '💤 Spánek + 🥔',
  sleep_downgrade: '💤 Downgrade',
  sleep_swap: '💤 Výměna',
  sleep_upgrade: '💤 Upgrade',
  sleep_teleport: '🌀 Teleport',
  sleep_buy_skill: '🛒 Koupit dovednost',
  sleep_skip: '💤 Skip tah',
  use_dirt_plant: '🥕 Hlína: Zasaď',
  use_dirt_kakej: '💩 Hlína: Kakej',
  use_dirt_learn: '🧠 Hlína: Uč se',
  use_bed: '🌱 Záhon',
  use_tree: '🌳 Eukalyptus',
  use_thorn: '🌵 Houští',
  cat_smash: '🎉 Rozmačkat Kočku',
  cat_attack: '⚠️ Útok Kočky',
  devil_combat_start: '⚔️ Souboj — start',
  devil_wound: '💥 Zranění Čerta',
  devil_attack: '❌ Souboj — fail',
  devil_stop: '🛑 Souboj — stop',
  skill_milestone: '🎁 Milestone',
  pending_die_added: '📥 Pending kostka',
  pending_released: '🔓 Uvolnění pending',
  win: '🏆 Výhra',
};

export function StatsViewer({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SimData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedGameIdx, setExpandedGameIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch('/sim/latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(`Nelze načíst /sim/latest.json: ${e.message}\n\nSpusť 'npx tsx src/game/simulate_detailed.ts' v app/ adresáři.`));
  }, []);

  if (error) {
    return (
      <div className="setup-screen" style={{ maxWidth: 700 }}>
        <h1>📊 Statistiky her</h1>
        <p style={{ whiteSpace: 'pre-wrap', color: '#a05e2e' }}>{error}</p>
        <button onClick={onClose} className="primary" style={{ marginTop: 16 }}>Zpět</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="setup-screen">
        <h1>📊 Statistiky her</h1>
        <p>Načítám…</p>
      </div>
    );
  }

  return <StatsContent data={data} onClose={onClose} expandedGameIdx={expandedGameIdx} setExpandedGameIdx={setExpandedGameIdx} />;
}

function StatsContent({
  data,
  onClose,
  expandedGameIdx,
  setExpandedGameIdx,
}: {
  data: SimData;
  onClose: () => void;
  expandedGameIdx: number | null;
  setExpandedGameIdx: (i: number | null) => void;
}) {
  // ---- Aggregate computations ----
  const decisive = useMemo(() => data.results.filter((r) => r.winnerName != null), [data]);
  const winRate = (decisive.length / data.results.length) * 100;
  const avgTurns = decisive.length
    ? decisive.reduce((s, r) => s + r.totalTurns, 0) / decisive.length
    : 0;
  const minTurns = decisive.length ? Math.min(...decisive.map((r) => r.totalTurns)) : 0;
  const maxTurns = decisive.length ? Math.max(...decisive.map((r) => r.totalTurns)) : 0;

  const winsByName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of decisive) m[r.winnerName!] = (m[r.winnerName!] || 0) + 1;
    return m;
  }, [decisive]);

  // Aggregate action counts across all player-games
  const aggActions = useMemo(() => {
    const counts: Record<string, number> = {};
    let totalPlayerGames = 0;
    for (const r of data.results) {
      for (const [, c] of Object.entries(r.actionCountsByPlayer)) {
        totalPlayerGames++;
        for (const [k, v] of Object.entries(c)) counts[k] = (counts[k] || 0) + v;
      }
    }
    return { counts, totalPlayerGames };
  }, [data]);

  // Skills counts
  const skillCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    for (const r of data.results) {
      for (const s of r.skillsTimeline) {
        counts[s.skill] = counts[s.skill] || { total: 0, milestone: 0, sleep_shop: 0, learn_hlina: 0 };
        counts[s.skill].total++;
        counts[s.skill][s.method]++;
      }
    }
    return counts;
  }, [data]);

  // Final state averages
  const finalAvg = useMemo(() => {
    let p = 0, c = 0, b = 0, h = 0, r2 = 0, pd = 0, sk = 0, mx = 0, cnt = 0;
    for (const g of data.results) {
      for (const pl of g.finalState.players) {
        p += pl.potatoes;
        c += pl.carrotTrack;
        b += pl.bobekTrack;
        h += pl.hand.length;
        r2 += pl.reserve.length;
        pd += pl.pending.length;
        sk += pl.skills.length;
        mx += pl.hand.length ? Math.max(...pl.hand) : 0;
        cnt++;
      }
    }
    return cnt === 0 ? null : {
      potatoes: p / cnt, carrot: c / cnt, bobek: b / cnt,
      hand: h / cnt, reserve: r2 / cnt, pending: pd / cnt,
      skills: sk / cnt, maxDie: mx / cnt,
    };
  }, [data]);

  const sortedActions = useMemo(() => Object.entries(aggActions.counts).sort((a, b) => b[1] - a[1]), [aggActions]);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>📊 Statistiky AI vs AI</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Vygenerováno {new Date(data.generatedAt).toLocaleString('cs-CZ')} ·
            seed base {data.seedBase} · {data.numGames} her · max {data.maxTurns} tahů
          </p>
        </div>
        <button onClick={onClose}>↩ Zpět do lobby</button>
      </div>

      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card label="Rozhodnuté hry" value={`${decisive.length} / ${data.results.length}`} hint={`${winRate.toFixed(1)}%`} />
        <Card label="Průměrný tah do výhry" value={avgTurns.toFixed(1)} hint={decisive.length ? `min ${minTurns} · max ${maxTurns}` : undefined} />
        <Card label="Výhry podle hráče" value={Object.entries(winsByName).map(([n, c]) => `${n}: ${c}`).join(' · ') || '—'} />
        {finalAvg && (
          <Card label="Průměr finálních hodnot" value={`✋ ${finalAvg.hand.toFixed(1)} 📦 ${finalAvg.reserve.toFixed(1)}`} hint={`🥔 ${finalAvg.potatoes.toFixed(1)} · 🧠 ${finalAvg.skills.toFixed(1)} · 🎲 max ${finalAvg.maxDie.toFixed(1)}`} />
        )}
      </div>

      {/* Action bar chart */}
      <Section title="Akce (počty napříč všemi hrami)">
        <BarChart
          data={sortedActions.map(([k, v]) => ({
            label: ACTION_LABELS[k] || k,
            rawKey: k,
            value: v,
            perGame: v / aggActions.totalPlayerGames,
          }))}
          unitSuffix=""
        />
      </Section>

      {/* Skills */}
      <Section title="Dovednosti — celkem naučeno a jakou cestou">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
              <th style={{ padding: '6px 8px' }}>Dovednost</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Celkem</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>🎁 Milestone</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>🛒 Sleep shop</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>🟫 Hlína</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(skillCounts).sort((a, b) => b[1].total - a[1].total).map(([skill, c]) => (
              <tr key={skill} style={{ borderTop: '1px solid #eee' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{skill}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{c.total}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{c.milestone}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{c.sleep_shop}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>{c.learn_hlina}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Per-game list */}
      <Section title={`Detail jednotlivých her (${data.results.length})`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {data.results.map((g, idx) => (
            <GameRow
              key={idx}
              game={g}
              idx={idx}
              expanded={expandedGameIdx === idx}
              onToggle={() => setExpandedGameIdx(expandedGameIdx === idx ? null : idx)}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

// -----------------------------------------------------------------------------

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ marginBottom: 18, padding: 16 }}>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.05em' }}>{title}</h3>
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Bar chart (pure SVG)
// -----------------------------------------------------------------------------

function BarChart({ data, unitSuffix }: { data: { label: string; rawKey: string; value: number; perGame: number }[]; unitSuffix: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {data.map((d) => (
        <div key={d.rawKey} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 100px', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span title={d.rawKey}>{d.label}</span>
          <div style={{ background: '#f5efe0', height: 18, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
            <div style={{
              background: 'linear-gradient(90deg, #b86e3a, #d68a3d)',
              width: `${(d.value / max) * 100}%`,
              height: '100%',
              transition: 'width 200ms ease',
            }} />
            <span style={{ position: 'absolute', left: 6, top: 1, color: '#fff', fontWeight: 600, fontSize: 11 }}>
              {d.value}{unitSuffix}
            </span>
          </div>
          <span style={{ color: 'var(--muted)', textAlign: 'right' }}>
            ⌀ {d.perGame.toFixed(2)}/hráč/hra
          </span>
        </div>
      ))}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-game accordion row
// -----------------------------------------------------------------------------

function GameRow({ game, idx, expanded, onToggle }: { game: GameStats; idx: number; expanded: boolean; onToggle: () => void }) {
  const winColor = game.winnerName ? '#2d4f1a' : '#a05e2e';
  return (
    <div className="panel" style={{ padding: 0 }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 10,
          background: expanded ? '#f9efd9' : 'transparent',
          border: 'none',
          borderBottom: expanded ? '1px solid var(--border)' : 'none',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto auto auto',
          gap: 12,
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 14 }}>{expanded ? '▾' : '▸'}</span>
        <span style={{ fontWeight: 600 }}>Hra {idx + 1} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(seed {game.seed})</span></span>
        <span style={{ color: winColor, fontWeight: 600 }}>{game.winnerName ?? '— nedohrána'}</span>
        <span style={{ color: 'var(--muted)' }}>{game.totalTurns} tahů</span>
        <span style={{ color: 'var(--muted)' }}>{game.skillsTimeline.length}× 🧠 · {game.catSmashes.length}× 🐱 · {game.woundsTimeline.length}× 💥</span>
      </button>
      {expanded && <GameDetail game={game} />}
    </div>
  );
}

function GameDetail({ game }: { game: GameStats }) {
  return (
    <div style={{ padding: 14, fontSize: 13 }}>
      {/* Skills timeline */}
      {game.skillsTimeline.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>🧠 Učení dovedností (chronologicky)</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                <th style={{ padding: '4px 8px' }}>Tah</th>
                <th style={{ padding: '4px 8px' }}>Hráč</th>
                <th style={{ padding: '4px 8px' }}>Dovednost</th>
                <th style={{ padding: '4px 8px' }}>Cesta</th>
              </tr>
            </thead>
            <tbody>
              {game.skillsTimeline.map((s, i) => (
                <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px' }}>{s.turn}</td>
                  <td style={{ padding: '4px 8px' }}>{s.playerName}</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{s.skill}</td>
                  <td style={{ padding: '4px 8px' }}>
                    {s.method === 'milestone' ? '🎁 Milestone'
                      : s.method === 'sleep_shop' ? '🛒 Sleep shop'
                      : '🟫 Hlína Uč se'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Devil wounds */}
      {game.woundsTimeline.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>⚔️ Zranění Čerta</h4>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11 }}>
                <th style={{ padding: '4px 8px' }}>Tah</th>
                <th style={{ padding: '4px 8px' }}>Hráč</th>
                <th style={{ padding: '4px 8px' }}>Slot</th>
                <th style={{ padding: '4px 8px' }}>Kostka</th>
                <th style={{ padding: '4px 8px' }}>Hod</th>
              </tr>
            </thead>
            <tbody>
              {game.woundsTimeline.map((w, i) => (
                <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                  <td style={{ padding: '4px 8px' }}>{w.turn}</td>
                  <td style={{ padding: '4px 8px' }}>{w.playerName}</td>
                  <td style={{ padding: '4px 8px', fontWeight: 600 }}>{w.woundType}</td>
                  <td style={{ padding: '4px 8px' }}>1k{w.dieLevel}</td>
                  <td style={{ padding: '4px 8px' }}>{w.rollValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cat smashes */}
      {game.catSmashes.length > 0 && (
        <p style={{ margin: '0 0 12px' }}>
          <strong>🐱 Rozmačkané Kočky:</strong>{' '}
          {game.catSmashes.map((c, i) => <span key={i}>{c.playerName} (tah {c.turn}){i < game.catSmashes.length - 1 ? ', ' : ''}</span>)}
        </p>
      )}

      {/* Action counts side-by-side */}
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Počet akcí</h4>
        <ActionCountsTable counts={game.actionCountsByPlayer} />
      </div>

      {/* Final state */}
      <div style={{ marginBottom: 8 }}>
        <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>Finální stav</h4>
        {game.finalState.players.map((p) => (
          <div key={p.name} style={{ marginBottom: 4 }}>
            <strong>{p.name}:</strong>{' '}
            ✋ [{p.hand.map(d => `k${d}`).join(', ') || '—'}]{' '}
            📦 [{p.reserve.map(d => `k${d}`).join(', ') || '—'}]{' '}
            {p.pending.length > 0 && <>📥 [{p.pending.map(d => `k${d}`).join(', ')}] </>}
            🥔{p.potatoes} 🥕{p.carrotTrack} 🌳{p.bobekTrack}{' '}
            <span style={{ color: 'var(--muted)' }}>· dovednosti: {p.skills.join(', ') || '—'}</span>
          </div>
        ))}
      </div>

      {/* Log tail */}
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 12 }}>📜 Posledních 25 log záznamů</summary>
        <div style={{ marginTop: 6, fontSize: 11, background: '#fffaf0', padding: 8, borderRadius: 4, maxHeight: 320, overflowY: 'auto' }}>
          {game.fullLog.slice(-25).map((e, i) => <div key={i}>{e}</div>)}
        </div>
      </details>
    </div>
  );
}

function ActionCountsTable({ counts }: { counts: Record<string, PlayerActionCounts> }) {
  const players = Object.keys(counts);
  const allTypes = new Set<string>();
  Object.values(counts).forEach((c) => Object.keys(c).forEach((k) => allTypes.add(k)));
  const types = Array.from(allTypes).sort();
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
          <th style={{ padding: '4px 6px' }}>Akce</th>
          {players.map((p) => (
            <th key={p} style={{ padding: '4px 6px', textAlign: 'right' }}>{p}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {types.map((t) => (
          <tr key={t} style={{ borderTop: '1px solid #eee' }}>
            <td style={{ padding: '4px 6px' }}>{ACTION_LABELS[t] || t}</td>
            {players.map((p) => (
              <td key={p} style={{ padding: '4px 6px', textAlign: 'right' }}>{counts[p][t] || 0}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
