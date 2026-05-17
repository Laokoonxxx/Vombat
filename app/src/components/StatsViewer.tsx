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

interface TurnEvent {
  turn: number;
  step: number;
  playerName: string;
  type: string;
  detail: string;
}

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
  events?: TurnEvent[];
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
  sleep_swap: '💤 Výměna (Spánek)',
  pre_roll_swap: '🔄 Třídění před hodem',
  sleep_upgrade: '💤 Upgrade',
  sleep_teleport: '🌀 Teleport',
  sleep_buy_skill: '🛒 Koupit dovednost',
  sleep_skip: '💤 Skip tah',
  use_dirt_plant: '🥕 Hlína: Zasaď',
  use_dirt_kakej: '💩 Hlína: Vyformuj kostku',
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

type GameFilter = 'all' | 'decisive' | 'stalled';
type GameSort = 'order' | 'turns_asc' | 'turns_desc' | 'wounds_desc' | 'cats_desc';

// =============================================================================
// Research published JSON — mirrors src/research/types.ts ResearchPublished
// =============================================================================
// Loaded from /sim/research.json (written by src/research/analyze.ts).
// Separate from /sim/latest.json which is the per-game timeline data.

interface ResearchBucket {
  bucket: string;
  players: number;
  wins: number;
  winRate: number;
  avgWinningTurns: number | null;
}

interface ResearchSkillRow {
  skillId: string;
  label: string;
  treesCost: number;
  learned: number;
  pctLearned: number;
  winRateWhenLearned: number;
  winRateWhenNot: number;
  avgTurnLearned: number | null;
  avgWinningTurnsWhenLearned: number | null;
}

interface ResearchSkillCombo {
  skills: string[];
  labels: string[];
  players: number;
  wins: number;
  winRate: number;
  avgWinningTurns: number | null;
}

interface ResearchActionCorrelation {
  category: string;
  label: string;
  buckets: ResearchBucket[];
}

interface ResearchData {
  generatedAt: string;
  numGames: number;
  decisive: number;
  totalPlayerGames: number;
  turnsToWin: {
    avg: number;
    median: number;
    p25: number;
    p75: number;
    min: number;
    max: number;
  };
  winnerAverages: {
    carrots: number; trees: number; potatoes: number;
    handSize: number; reserveSize: number;
    skillsLearned: number; diceOwnedPeak: number;
  };
  loserAverages: {
    carrots: number; trees: number; potatoes: number;
    handSize: number; reserveSize: number;
    skillsLearned: number; diceOwnedPeak: number;
  };
  skillStats: {
    perSkill: ResearchSkillRow[];
    byCount: ResearchBucket[];
    topCombos: ResearchSkillCombo[];
  };
  resourceStats: {
    carrots: ResearchBucket[];
    trees: ResearchBucket[];
    diceOwnedPeak: ResearchBucket[];
    potatoes: ResearchBucket[];
  };
  actionStats: ResearchActionCorrelation[];
  startStats?: {
    byHexType: ResearchBucket[];
    byTileCenter: ResearchBucket[];
    byStartDie: ResearchBucket[];
    byCombo: ResearchBucket[];
  };
}

export function StatsViewer({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SimData | null>(null);
  const [research, setResearch] = useState<ResearchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedGameIdx, setExpandedGameIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<GameFilter>('all');
  const [sort, setSort] = useState<GameSort>('order');

  useEffect(() => {
    fetch('/sim/latest.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(`Nelze načíst /sim/latest.json: ${e.message}\n\nSpusť 'npx tsx src/game/simulate_detailed.ts' v app/ adresáři.`));
    // Research data is OPTIONAL — only present if research:run was executed.
    // Failure here is silent; the section just doesn't render.
    fetch('/sim/research.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setResearch(d))
      .catch(() => { /* fine, research panel just hidden */ });
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

  return (
    <StatsContent
      data={data}
      research={research}
      onClose={onClose}
      expandedGameIdx={expandedGameIdx}
      setExpandedGameIdx={setExpandedGameIdx}
      filter={filter}
      setFilter={setFilter}
      sort={sort}
      setSort={setSort}
    />
  );
}

function StatsContent({
  data,
  research,
  onClose,
  expandedGameIdx,
  setExpandedGameIdx,
  filter,
  setFilter,
  sort,
  setSort,
}: {
  data: SimData;
  research: ResearchData | null;
  onClose: () => void;
  expandedGameIdx: number | null;
  setExpandedGameIdx: (i: number | null) => void;
  filter: GameFilter;
  setFilter: (f: GameFilter) => void;
  sort: GameSort;
  setSort: (s: GameSort) => void;
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

  // Top 5 fastest wins (across decisive games)
  const top5Fastest = useMemo(() => {
    return decisive
      .map((g, idx) => ({ g, originalIdx: data.results.indexOf(g) }))
      .sort((a, b) => a.g.totalTurns - b.g.totalTurns)
      .slice(0, 5);
  }, [decisive, data.results]);

  // Sorted + filtered game list for per-game section
  const visibleGames = useMemo(() => {
    let items = data.results.map((g, originalIdx) => ({ g, originalIdx }));
    if (filter === 'decisive') items = items.filter((x) => x.g.winnerName != null);
    else if (filter === 'stalled') items = items.filter((x) => x.g.winnerName == null);
    switch (sort) {
      case 'turns_asc':
        // Sort ascending by turns; stalled (== maxTurns) go to bottom
        items = items.sort((a, b) => {
          const aT = a.g.winnerName ? a.g.totalTurns : Number.MAX_SAFE_INTEGER;
          const bT = b.g.winnerName ? b.g.totalTurns : Number.MAX_SAFE_INTEGER;
          return aT - bT;
        });
        break;
      case 'turns_desc':
        items = items.sort((a, b) => b.g.totalTurns - a.g.totalTurns);
        break;
      case 'wounds_desc':
        items = items.sort((a, b) => b.g.woundsTimeline.length - a.g.woundsTimeline.length);
        break;
      case 'cats_desc':
        items = items.sort((a, b) => b.g.catSmashes.length - a.g.catSmashes.length);
        break;
    }
    return items;
  }, [data.results, filter, sort]);

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

      {/* Analytika (research pipeline) — only if research.json exists */}
      {research && <AnalyticsPanel research={research} />}

      {/* Overview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card label="Rozhodnuté hry" value={`${decisive.length} / ${data.results.length}`} hint={`${winRate.toFixed(1)}%`} />
        <Card label="Průměrný tah do výhry" value={avgTurns.toFixed(1)} hint={decisive.length ? `min ${minTurns} · max ${maxTurns}` : undefined} />
        <Card label="Výhry podle hráče" value={Object.entries(winsByName).map(([n, c]) => `${n}: ${c}`).join(' · ') || '—'} />
        {finalAvg && (
          <Card label="Průměr finálních hodnot" value={`✋ ${finalAvg.hand.toFixed(1)} 📦 ${finalAvg.reserve.toFixed(1)}`} hint={`🥔 ${finalAvg.potatoes.toFixed(1)} · 🧠 ${finalAvg.skills.toFixed(1)} · 🎲 max ${finalAvg.maxDie.toFixed(1)}`} />
        )}
      </div>

      {/* Top fastest wins */}
      {top5Fastest.length > 0 && (
        <Section title={`🏆 Top ${top5Fastest.length} nejrychlejších výher`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {top5Fastest.map((entry, rank) => {
              const g = entry.g;
              const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `#${rank + 1}`;
              return (
                <button
                  key={entry.originalIdx}
                  onClick={() => {
                    setExpandedGameIdx(entry.originalIdx);
                    // Scroll to per-game section
                    setTimeout(() => {
                      document.getElementById(`game-${entry.originalIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 50);
                  }}
                  className="panel"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '48px 1fr auto auto auto auto',
                    gap: 12,
                    alignItems: 'center',
                    padding: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: rank < 3 ? '#fff5e0' : undefined,
                  }}
                  title="Klikni pro detail"
                >
                  <span style={{ fontSize: 20, textAlign: 'center' }}>{medal}</span>
                  <span style={{ fontWeight: 600 }}>
                    Hra {entry.originalIdx + 1} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(seed {g.seed})</span>
                  </span>
                  <span style={{ color: '#2d4f1a', fontWeight: 600 }}>🏆 {g.winnerName}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>{g.totalTurns} tahů</span>
                  <span style={{ color: 'var(--muted)' }} title="Skills učeno · Kočky · Zranění">
                    🧠 {g.skillsTimeline.length} · 🐱 {g.catSmashes.length} · 💥 {g.woundsTimeline.length}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 18 }}>▸</span>
                </button>
              );
            })}
          </div>
        </Section>
      )}

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
      <Section title={`Detail jednotlivých her (${visibleGames.length} z ${data.results.length})`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, alignItems: 'center', fontSize: 12 }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)' }}>Filtr:</span>
            {(['all', 'decisive', 'stalled'] as GameFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? 'primary' : ''}
                style={{ padding: '3px 10px', fontSize: 12 }}
              >
                {f === 'all' ? 'Vše' : f === 'decisive' ? '🏆 Rozhodnuté' : '⏱ Nedohrané'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)' }}>Řazení:</span>
            {([
              ['order', 'Pořadí'],
              ['turns_asc', 'Tahy ↑'],
              ['turns_desc', 'Tahy ↓'],
              ['wounds_desc', 'Zranění ↓'],
              ['cats_desc', 'Kočky ↓'],
            ] as [GameSort, string][]).map(([s, label]) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={sort === s ? 'primary' : ''}
                style={{ padding: '3px 10px', fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibleGames.map(({ g, originalIdx }) => (
            <div key={originalIdx} id={`game-${originalIdx}`}>
              <GameRow
                game={g}
                idx={originalIdx}
                expanded={expandedGameIdx === originalIdx}
                onToggle={() => setExpandedGameIdx(expandedGameIdx === originalIdx ? null : originalIdx)}
              />
            </div>
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

      {/* Per-turn winner actions */}
      {game.events && game.events.length > 0 && <PerTurnActions game={game} />}

      {/* AI rules cheat sheet */}
      <AIRules />

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

// -----------------------------------------------------------------------------
// Per-turn actions panel — chronological view filtered to one player
// -----------------------------------------------------------------------------

const ACTION_EMOJI: Record<string, string> = {
  roll: '🎲',
  move: '🐾',
  sleep_gain_potato: '💤🥔',
  sleep_downgrade: '💤⬇️',
  sleep_swap: '💤🔄',
  sleep_upgrade: '💤⬆️',
  sleep_teleport: '🌀',
  sleep_buy_skill: '🛒',
  sleep_skip: '💤✖️',
  use_dirt_plant: '🥕',
  use_dirt_kakej: '💩',
  use_dirt_learn: '🧠',
  use_bed: '🌱',
  use_tree: '🌳',
  use_thorn: '🌵',
  cat_smash: '🎉',
  cat_attack: '⚠️',
  devil_combat_start: '⚔️',
  devil_wound: '💥',
  devil_attack: '❌',
  devil_stop: '🛑',
  skill_milestone: '🎁',
  pending_die_added: '📥',
  pending_released: '🔓',
  win: '🏆',
};

function PerTurnActions({ game }: { game: GameStats }) {
  // Default: show winner; if no winner, show first player.
  const players = Object.keys(game.actionCountsByPlayer);
  const initial = game.winnerName ?? players[0];
  const [selected, setSelected] = useState(initial);

  // Group events by turn for the selected player. Filter rolls into a separate
  // header per turn (rather than as a separate row) for cleaner reading.
  const eventsByTurn = useMemo(() => {
    const map = new Map<number, TurnEvent[]>();
    if (!game.events) return map;
    for (const e of game.events) {
      if (e.playerName !== selected) continue;
      if (!map.has(e.turn)) map.set(e.turn, []);
      map.get(e.turn)!.push(e);
    }
    return map;
  }, [game.events, selected]);

  const sortedTurns = useMemo(() => Array.from(eventsByTurn.keys()).sort((a, b) => a - b), [eventsByTurn]);
  const totalActions = useMemo(
    () => sortedTurns.reduce((s, t) => s + eventsByTurn.get(t)!.length, 0),
    [sortedTurns, eventsByTurn]
  );

  if (sortedTurns.length === 0) {
    return (
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ margin: '0 0 6px', fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>
          🎬 Akce hráče po tazích
        </h4>
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>Žádná data.</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <h4 style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>
          🎬 Akce hráče po tazích ({selected} · {sortedTurns.length} tahů, {totalActions} událostí)
        </h4>
        <div style={{ display: 'flex', gap: 4 }}>
          {players.map((p) => (
            <button
              key={p}
              onClick={() => setSelected(p)}
              className={selected === p ? 'primary' : ''}
              style={{ padding: '2px 8px', fontSize: 11 }}
            >
              {p === game.winnerName ? '🏆 ' : ''}{p}
            </button>
          ))}
        </div>
      </div>
      <div
        style={{
          maxHeight: 480,
          overflowY: 'auto',
          background: '#fffaf0',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: 8,
        }}
      >
        {sortedTurns.map((turn) => {
          const events = eventsByTurn.get(turn)!;
          // Try to extract roll values from first roll event
          const rollEvent = events.find((e) => e.type === 'roll');
          const rollMatch = rollEvent ? /hodil kostkami: \[([^\]]+)\] \(součet (\d+)\)/.exec(rollEvent.detail) : null;
          const otherEvents = events.filter((e) => e.type !== 'roll');
          return (
            <div key={turn} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '4px 0', borderBottom: '1px dashed #eee' }}>
              <div style={{ minWidth: 32, color: 'var(--muted)', fontWeight: 600, textAlign: 'right' }}>
                {turn}.
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {rollMatch && (
                  <div style={{ color: '#1c150a' }}>
                    🎲 [{rollMatch[1]}] = <strong>{rollMatch[2]}</strong>
                  </div>
                )}
                {otherEvents.length === 0 && !rollMatch && (
                  <div style={{ color: 'var(--muted)' }}>(no events)</div>
                )}
                {otherEvents.map((e, i) => (
                  <div key={i} style={{ paddingLeft: 8 }}>
                    {ACTION_EMOJI[e.type] || '·'} {stripPlayerName(e.detail, selected)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function stripPlayerName(detail: string, name: string): string {
  // Trim player-prefix to reduce repetition. E.g. "AI-A přesunul..." → "přesunul..."
  if (detail.startsWith(`${name} `)) return detail.slice(name.length + 1);
  return detail;
}

// -----------------------------------------------------------------------------
// AI rules cheat sheet — readable summary of the heuristics in src/game/ai.ts
// -----------------------------------------------------------------------------

function AIRules() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 14, marginBottom: 4 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: 8,
          fontSize: 12,
          textTransform: 'uppercase',
          color: 'var(--muted)',
          background: 'transparent',
          border: '1px dashed var(--border)',
          borderRadius: 4,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>🤖 AI pravidla podle kterých se rozhoduje</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div
          style={{
            marginTop: 6,
            padding: 12,
            background: '#fffaf0',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            AI kombinuje heuristické skóre s <strong>3-step own-turn lookahead</strong>: pro top-6
            kandidátů podle heuristiky aplikuje akci, pak simuluje další 2 svoje tahy (soupeř se
            ignoruje), a hodnotí výsledný stav. Konečné score = <code>heuristika × 1.5 + stateValue</code>.
            Definováno v <code>src/game/ai.ts</code>.
          </p>

          <h4 style={{ margin: '12px 0 4px' }}>🎯 Strategický plán (priority pořadí)</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Posbírat <strong>volné kostky</strong> z Houští 🌵 (k4/k6/k8 zdarma)</li>
            <li>Obsadit <strong>Eukalypty</strong> 🌳 pro stromový kapitál</li>
            <li>Naučit <strong>Kapacitu</strong> 🧠 nejdřív (1 strom)</li>
            <li>Plantovat mrkve na Hlíně/Záhonu pro <strong>Vyformuj kostku</strong> ramp</li>
            <li>Smashovat <strong>Kočky</strong> 🐱 (11-14 = 1k20 + tunel + auto-Koupel)</li>
            <li>Jakmile má 6+ kostek s k10+ a je u Čerta → <strong>bojovat</strong></li>
          </ol>

          <h4 style={{ margin: '12px 0 4px' }}>🏁 Setup placement (revidováno)</h4>
          <p style={{ margin: 0 }}>
            Strategie: maximalizovat <strong>carrot ramp potenciál</strong>. Žádný rush k Čertovi.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Stojí na Hlíně: <code>+8</code> · Záhon: +5 · k4 Houští: +4</li>
            <li>Sousední Hlína: <code>+4 každá</code> · Záhon: +3 · Strom: +2 · k4 Houští: +2</li>
            <li>Sousední živá Kočka: <code>-6</code></li>
            <li><strong>Vzdálenost k Čertovi: irrelevantní</strong> (per uživatelské strategii)</li>
          </ul>

          <h4 style={{ margin: '12px 0 4px' }}>🛒 Setup nákup</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>1k6 (9 🥔) — flexibilní rozsah 1-6 (Hlína 2-4, Záhon 4-6, Houští-k4 use 5+)</li>
            <li>Jinak 1k4 (7 🥔)</li>
            <li>Jinak 1k2 (5 🥔)</li>
          </ol>

          <h4 style={{ margin: '12px 0 4px' }}>▶️ Začátek tahu (idle fáze)</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              Pokud stojí/sousedí s Čertem A je <strong>ready</strong> (viz níže) → <strong>boj s Čertem</strong>
            </li>
            <li>
              Pokud Ruka prázdná → Spánek (koupit dovednost pokud jde, jinak +1 brambora)
            </li>
            <li>Jinak → Hod kostkami</li>
          </ol>
          <p style={{ margin: '4px 0 0' }}>
            <strong>"Ready" k boji:</strong> handMax ≥ k10 (pokud 10+ zranění chybí), handMax ≥ k8 (pokud 7+ chybí),
            počet kostek ≥ zbývajících zranění + 2, sumPotential ≥ 25 + 6×zbývajících zranění.
          </p>

          <h4 style={{ margin: '12px 0 4px' }}>🎲 Po hodu - výběr akce</h4>
          <p style={{ margin: 0 }}>
            AI ohodnotí každou možnost a vybere nejvyšší. Spánek má základní skóre <code>0.5</code>.
          </p>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Skóre využití pole</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              <li><strong>🌵 Houští:</strong> 12 + lvl (k4 = 16, k6 = 18, k8 = 20). −6 pokud se kostka nevejde</li>
              <li><strong>🌳 Eukalyptus:</strong> 14 − bobekTrack×2 (první strom nejcennější)</li>
              <li><strong>🌱 Záhon (Plant):</strong> 12 pokud carrot &lt; 5, jinak 3 (carrot ramp priorita)</li>
              <li><strong>🟫 Hlína:</strong> max ze tří voleb:
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  <li>Uč se → <code>16</code> pokud má na nějakou dovednost</li>
                  <li>Vyformuj kostku: ≥6 raw → 16 (k12+), ≥4 → 13 (k8/10), ≥2 → 8 (k4), &lt;2 → 0</li>
                  <li>Plant → <code>8</code> pokud carrot &lt; 4 (early ramp na Hlíně)</li>
                </ul>
              </li>
              <li><strong>🏜️ Poušť</strong> (s Koupelí): jako Hlína bez plantu</li>
            </ul>
          </details>

          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Skóre pohybu (revidováno)</summary>
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              <li><strong>🐱 Smash živé Kočky:</strong> <code>40</code> 🎉</li>
              <li><strong>👹 Čert:</strong> 25 pokud ready, jinak 2 (žádný rush)</li>
              <li><strong>🌳 Strom (volný):</strong> 7</li>
              <li><strong>🟫 Hlína (volná):</strong> 5</li>
              <li><strong>🌱 Záhon (volný):</strong> 5</li>
              <li><strong>🌵 Houští (po sklizni):</strong> 2</li>
              <li><strong>🏜️ Poušť (s Koupelí, volná):</strong> 4</li>
              <li><strong>🕳️ Tunel:</strong> +1 bonus</li>
              <li>Distance bonus: +max(0, 2−minDist) k nejbližší užitečné Hlíně/Záhonu/Houští/Kočce</li>
            </ul>
          </details>

          <h4 style={{ margin: '12px 0 4px' }}>🟫 Volba akce na Hlíně</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Pokud má dost stromů/brambor na nějakou dovednost → <strong>Uč se</strong></li>
            <li>Pokud carrotTrack + sousední markery ≥ 2 → <strong>Vyformuj</strong> (= alespoň k4)</li>
            <li>Pokud carrotTrack &lt; 4 → <strong>Plant</strong> (carrot ramp)</li>
            <li>Jinak → Vyformuj fallback</li>
          </ol>

          <h4 style={{ margin: '12px 0 4px' }}>🧠 Pořadí dovedností pro učení</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Kapacita (1 🌳)</li>
            <li>Sprint (2 🌳)</li>
            <li>Masáž Střev (2 🌳)</li>
            <li>Ajurvédská Medicína (3 🌳)</li>
            <li>Koupel (2 🌳)</li>
            <li>Klystýr (2 🌳)</li>
          </ol>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            AI bere první "affordable" v pořadí. Koupel je nízko, protože ji typicky dostane zdarma za rozmačkání Kočky.
          </p>

          <h4 style={{ margin: '12px 0 4px' }}>⚔️ Souboj s Čertem (per-iteration)</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              Aplikuj <strong>jedno zranění</strong> tento krok. Pořadí slotů: 1 → 2 → 7+ → 10+.
              Vyber <strong>nejmenší kostku</strong> co splňuje (velké kostky šetří pro 25+).
            </li>
            <li>
              Po aplikaci všech 4 zranění:
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>Pokud aktuální sum ≥ 25 → <strong>vítězství</strong></li>
                <li>Pokud sumPotential zbylých kostek ≥ 25 → re-roll</li>
                <li>Jinak ukončit boj (uchovat kostky)</li>
              </ul>
            </li>
            <li>
              Pokud zranění zbývají & nelze hit:
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>Pokud má ≥ 4 kostky & sumPotential ≥ 25 & může hit všechny → re-roll</li>
                <li>Jinak ukončit boj</li>
              </ul>
            </li>
          </ol>

          <h4 style={{ margin: '12px 0 4px' }}>💤 Spánek (smart sleep, anti-stall)</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Pokud má dost brambor na nenaučenou dovednost → <strong>buy_skill</strong></li>
            <li>
              <strong>Emergency:</strong> Hand je prázdná A Zásoba má kostky →
              swap reserve→hand (jinak by AI věčně spal)
            </li>
            <li>
              <strong>Boj prep:</strong> u Čerta + Zásoba má velkou kostku ≥8 →
              swap reserve→hand (přesně tak jak strategie říká)
            </li>
            <li>
              <strong>Anti-stall:</strong> Hand má víc než 2 kostky a avg lvl ≥ 5
              (= mostly k6/k8/k10+) → stash 1-3 největších kostek do Zásoby. Tím se
              průměrný hod sníží, AI může navigovat na malé aktivace (Hlína 2-4, Záhon 4-6).
            </li>
            <li>Jinak <strong>gain_potato</strong></li>
          </ol>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Klystýr dovednost umožní 3 swap ops v jednom Spánku (jinak 1).
          </p>

          <h4 style={{ margin: '12px 0 4px' }}>🛡️ Anti-stall pravidla (z analýzy zaseknutých her)</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>Hand bloat:</strong> 8+ kostek průměru ~6 znamená skoro vždy
              hod 30+ → nemůže Hlína/Záhon. Sleep stash do Reserve.
            </li>
            <li>
              <strong>Empty hand:</strong> všechny kostky v Reserve, ale není u Čerta →
              emergency swap.
            </li>
            <li>
              <strong>Final blow conservatism:</strong> 4 zranění hotová, ale sum
              potential &lt; 32 → nezapočítává souboj (zabraňuje loop bez šance na 25+).
            </li>
          </ul>

          <h4 style={{ margin: '12px 0 4px' }}>⚠️ Reakce na útok (Kočka / Čert)</h4>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Pokud má brambory → odevzdat 1 bramboru</li>
            <li>Jinak odevzdat nejmenší dostupnou kostku (z Ruky nebo Zásoby)</li>
          </ol>

          <h4 style={{ margin: '12px 0 4px' }}>🔮 Lookahead (3 vlastní tahy dopředu)</h4>
          <p style={{ margin: 0 }}>
            Pro každého z top-6 kandidátů:
          </p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            <li>Aplikuj akci → stav S1</li>
            <li>Resolve sub-volby (dirt action, skill pick) → S1'</li>
            <li>
              Pro další 2 vlastní tahy:
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                <li>Skip soupeřův tah (force sleep-skip, žádný resource impact)</li>
                <li>Simuluj svůj další tah greedy (roll + nejvyšší heuristika)</li>
              </ul>
            </li>
            <li>Score finální stav <code>SN</code> z mého pohledu</li>
          </ol>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
            Vyber kandidáta s nejvyšším <code>heuristika × 1.5 + stateValue(SN)</code>. Soupeř se v
            lookaheadu ignoruje, protože jeho akce stejně nelze spolehlivě předvídat a přidávají šum.
          </p>

          <h4 style={{ margin: '12px 0 4px' }}>📐 stateValue (hodnocení stavu pro lookahead)</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Výhra: <code>+100000</code> · Prohra: <code>-10000</code></li>
            <li>Zranění Čerta: <code>+200</code> každé</li>
            <li>Sum levelů kostek v Ruce/Zásobě: <code>×3</code></li>
            <li>Bobek (stromy): <code>×4</code> · Mrkev (carrot): <code>×5</code></li>
            <li>Brambory: <code>×0.15</code></li>
            <li>Kostky v Ruce: <code>+1</code> každá · v Zásobě: <code>+0.5</code></li>
            <li>Pending kostky: <code>×0.5</code> (zamknutě, nižší hodnota)</li>
            <li>Bonus za blízkost Čerta když ready: <code>+max(0, 30 - dist×5)</code></li>
            <li>Skills v hodnotě nezahrnuté (jejich benefit se projevuje v gameplay)</li>
          </ul>

          <h4 style={{ margin: '12px 0 4px' }}>🎚️ Co AI <strong>nedělá</strong> (známé slabiny)</h4>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>
              <strong>Soupeř se ignoruje</strong> v lookaheadu — předpokládá že nic nezmění naše
              resources. Občas chybné (např. soupeř přebere náš Eukalyptus).
            </li>
            <li>
              <strong>Lookahead je deterministický</strong> — používá jeden vzorek náhodných hodů.
              Monte Carlo přes více vzorků by zlepšilo robustnost vůči pechu na kostkách.
            </li>
            <li>
              <strong>Nevyužívá brambory pro Vyformuj kostku</strong> investice (engine to neumožňuje skrz UI).
            </li>
            <li>
              <strong>Nepoužívá Teleport</strong> (Sleep akce). Mohl by se rychle dostat k Čertovi.
            </li>
            <li>
              <strong>Downgrade kostek</strong> ve Spánku se nepoužívá.
            </li>
            <li>
              <strong>Nepřebírá soupeřovy markery</strong> strategicky.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// AnalyticsPanel — renders aggregate research stats
// =============================================================================
// All data comes pre-computed from analyze.ts. UI is just tables + bar visuals.

function AnalyticsPanel({ research }: { research: ResearchData }) {
  const [open, setOpen] = useState(true);
  const w = research.winnerAverages;
  const l = research.loserAverages;
  return (
    <div
      style={{
        background: '#fff5e0',
        border: '2px solid var(--accent)',
        borderRadius: 10,
        padding: 16,
        marginBottom: 20,
      }}
    >
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <h2 style={{ margin: 0 }}>
          📊 Analytika ({research.decisive.toLocaleString('cs-CZ')} rozhodnutých her)
        </h2>
        <span style={{ color: 'var(--muted)' }}>{open ? '▾ Sbalit' : '▸ Rozbalit'}</span>
      </div>
      <p style={{ margin: '4px 0 12px', color: 'var(--muted)', fontSize: 12 }}>
        Data z research pipeline · vygenerováno {new Date(research.generatedAt).toLocaleString('cs-CZ')} ·
        {research.totalPlayerGames.toLocaleString('cs-CZ')} hráč-her
      </p>

      {open && (
        <>
          {/* ===== Overall turns-to-win distribution ===== */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 8,
              marginBottom: 14,
              padding: 10,
              background: '#fff',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <TurnStatCard label="Ø Tahů k výhře" value={research.turnsToWin.avg.toFixed(1)} accent />
            <TurnStatCard label="Medián" value={String(research.turnsToWin.median)} />
            <TurnStatCard label="P25" value={String(research.turnsToWin.p25)} />
            <TurnStatCard label="P75" value={String(research.turnsToWin.p75)} />
            <TurnStatCard label="Min" value={String(research.turnsToWin.min)} />
            <TurnStatCard label="Max" value={String(research.turnsToWin.max)} />
          </div>

          {/* ===== Startovní pozice ===== */}
          {research.startStats && (
            <>
              <Section title="🏁 Startovní pozice — typ hexu × win rate">
                <BucketBars buckets={research.startStats.byHexType} unitLabel="" />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  💡 Kde AI rozhodla začít s prvním Vombatem. Hlína dominuje, protože AI
                  heuristika ji silně preferuje.
                </p>
              </Section>

              <Section title="🌳/👹 Startovní dílek — modrý vs. černý">
                <BucketBars buckets={research.startStats.byTileCenter} unitLabel="" />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  💡 Střed dílku, kde Vombat začal. Černé (Čert) dílky AI nestartuje skoro
                  nikdy — heuristika je penalizuje.
                </p>
              </Section>

              <Section title="🎲 Startovní kostka — co AI v setupu koupila">
                <BucketBars buckets={research.startStats.byStartDie} unitLabel="" />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  💡 První kostka v Ruce po setupu. Vyšší levely = silnější start, ale méně
                  brambor zbylých na nákupy během hry.
                </p>
              </Section>

              <Section title="🏁 Top 15 startovních kombinací (hex + kostka)">
                <BucketBars buckets={research.startStats.byCombo} unitLabel="" />
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  💡 Seřazeno podle četnosti. Hledáš zlatý poměr „kde začít s čím" pro
                  maximální win rate × rychlost.
                </p>
              </Section>
            </>
          )}

          {/* ===== Winner vs Loser averages ===== */}
          <Section title="🆚 Výherci vs poražení (průměrné finální hodnoty)">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 8px' }}>Metrika</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Výherci</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Poražení</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Δ</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['🎲 Kostky během hry (peak)', w.diceOwnedPeak, l.diceOwnedPeak],
                  ['✋ Velikost Ruky', w.handSize, l.handSize],
                  ['📦 Velikost Zásoby', w.reserveSize, l.reserveSize],
                  ['🧠 Naučených dovedností', w.skillsLearned, l.skillsLearned],
                  ['🥕 Mrkev (ukazatel)', w.carrots, l.carrots],
                  ['🌳 Stromy (ukazatel)', w.trees, l.trees],
                  ['🥔 Brambory', w.potatoes, l.potatoes],
                ].map(([label, wv, lv]) => {
                  const diff = (wv as number) - (lv as number);
                  const color = diff > 0.2 ? '#2d4f1a' : diff < -0.2 ? '#a05e2e' : 'var(--muted)';
                  return (
                    <tr key={label as string} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '4px 8px' }}>{label}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 600 }}>
                        {(wv as number).toFixed(2)}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                        {(lv as number).toFixed(2)}
                      </td>
                      <td style={{ padding: '4px 8px', textAlign: 'right', color, fontWeight: 600 }}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              💡 <strong>Kostky během hry (peak)</strong> = Ruka + Zásoba + zranění Čerta (kostky utracené v boji).
            </p>
          </Section>

          {/* ===== Skills ===== */}
          <Section title="🧠 Dovednosti — win rate když naučená vs když ne">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 6px' }}>Dovednost</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }} title="Cena ve stromech">🌳</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>% hráčů</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }} title="Průměrný tah ZÍSKÁNÍ dovednosti">Ø tah získání</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Win když má</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Win když nemá</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Δ</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }} title="Průměrný počet tahů hry, když hráč s touto dovedností vyhrál">Ø tahů k výhře (s ní)</th>
                </tr>
              </thead>
              <tbody>
                {research.skillStats.perSkill.map((s) => {
                  const delta = s.winRateWhenLearned - s.winRateWhenNot;
                  const flagColor =
                    delta > 0.05 ? '#2d4f1a' : delta < -0.05 ? '#a05e2e' : 'var(--muted)';
                  return (
                    <tr key={s.skillId} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '4px 6px', fontWeight: 600 }}>{s.label}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>{s.treesCost}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        {(s.pctLearned * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        {s.avgTurnLearned != null ? s.avgTurnLearned.toFixed(1) : '—'}
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        {(s.winRateWhenLearned * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                        {(s.winRateWhenNot * 100).toFixed(1)}%
                      </td>
                      <td
                        style={{
                          padding: '4px 6px',
                          textAlign: 'right',
                          color: flagColor,
                          fontWeight: 700,
                        }}
                      >
                        {delta >= 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                        {s.avgWinningTurnsWhenLearned != null
                          ? s.avgWinningTurnsWhenLearned.toFixed(1)
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
              💡 <strong>Δ negativní</strong> = dovednost je <em>anti-korelovaná</em> s výhrou. Možná že AI ji
              učí jen v zoufalých situacích, nebo její zisk stojí příliš mnoho času. <br />
              💡 <strong>Ø tahů k výhře (s ní)</strong> &gt; celkový průměr ({research.turnsToWin.avg.toFixed(1)})
              = výhry s touto dovedností trvají déle.
            </p>
          </Section>

          <Section title="🧠 Počet naučených dovedností → win rate">
            <BucketBars buckets={research.skillStats.byCount} unitLabel="dovedností" />
          </Section>

          <Section title="🧠 Top kombinace dovedností (10 nejčastějších)">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                  <th style={{ padding: '4px 6px' }}>Sada</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Hráčů</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Win rate</th>
                  <th style={{ padding: '4px 6px', textAlign: 'right' }}>Ø tahů k výhře</th>
                </tr>
              </thead>
              <tbody>
                {research.skillStats.topCombos.map((c, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ padding: '4px 6px' }}>
                      {c.labels.length === 0 ? <em>(žádná dovednost)</em> : c.labels.join(' + ')}
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>{c.players}</td>
                    <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>
                      {(c.winRate * 100).toFixed(1)}%
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                      {c.avgWinningTurns != null ? c.avgWinningTurns.toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ===== Resources ===== */}
          <Section title="🥕 Mrkev (ukazatel) → win rate">
            <BucketBars buckets={research.resourceStats.carrots} unitLabel="mrkví" />
          </Section>
          <Section title="🌳 Stromy (ukazatel) → win rate">
            <BucketBars buckets={research.resourceStats.trees} unitLabel="stromů" />
          </Section>
          <Section title="🎲 Kostky během hry (peak) → win rate">
            <BucketBars buckets={research.resourceStats.diceOwnedPeak} unitLabel="kostek" />
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
              💡 Peak = Ruka + Zásoba + kostky utracené na zraněních Čerta.
            </p>
          </Section>
          <Section title="🥔 Brambory (finál) → win rate">
            <BucketBars buckets={research.resourceStats.potatoes} unitLabel="brambor" />
          </Section>

          {/* ===== Actions ===== */}
          <Section title="🎬 Akce → win rate (podle počtu provedení)">
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0, marginBottom: 8 }}>
              Pro každý počet provedení dané akce: kolik hráčů toho dosáhlo a jejich win rate.
              Užitečné pro detekci „mrtvých" akcí a strategie typu „víc je lepší".
            </p>
            {research.actionStats.map((a) => (
              <details key={a.category} style={{ marginBottom: 6 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{a.label}</summary>
                <div style={{ marginTop: 6, marginLeft: 8 }}>
                  <BucketBars buckets={a.buckets} unitLabel="×" />
                </div>
              </details>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

// Horizontal bar chart for a list of buckets, showing player count + win-rate + avg winning turns.
function BucketBars({ buckets, unitLabel }: { buckets: ResearchBucket[]; unitLabel: string }) {
  const maxPlayers = Math.max(...buckets.map((b) => b.players), 1);
  // Compute overall avg winning turns to color-code "fast wins" vs "slow wins"
  const allWinTurns = buckets
    .map((b) => b.avgWinningTurns)
    .filter((t): t is number => t != null);
  const overallAvg = allWinTurns.length
    ? allWinTurns.reduce((s, t) => s + t, 0) / allWinTurns.length
    : 60;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {buckets.map((b) => {
        const winPct = b.winRate * 100;
        // Color gradient: red (<40%), neutral (40-60%), green (>60%)
        const color =
          winPct >= 60 ? '#2d4f1a' :
          winPct >= 40 ? '#a05e2e' :
          winPct > 0 ? '#9b1f1f' :
          '#888';
        const widthPct = b.players === 0 ? 0 : Math.max(2, (b.players / maxPlayers) * 100);
        // Turn color: faster than overall avg = green; slower = orange
        const turnColor =
          b.avgWinningTurns == null ? '#888' :
          b.avgWinningTurns < overallAvg - 5 ? '#2d4f1a' :
          b.avgWinningTurns > overallAvg + 5 ? '#a05e2e' :
          '#555';
        return (
          <div
            key={b.bucket}
            style={{
              display: 'grid',
              gridTemplateColumns: '70px 1fr 60px 80px 90px',
              gap: 6,
              alignItems: 'center',
              fontSize: 12,
            }}
          >
            <span style={{ fontWeight: 600, textAlign: 'right' }}>{b.bucket} {unitLabel}</span>
            <div style={{ background: '#f5efe0', borderRadius: 4, height: 18, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  background: color,
                  opacity: 0.25,
                  height: '100%',
                  width: `${widthPct}%`,
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  padding: '0 6px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 11,
                  color: '#333',
                }}
              >
                n={b.players}
              </div>
            </div>
            <span style={{ textAlign: 'right', color, fontWeight: 700 }}>
              {b.players === 0 ? '—' : `${winPct.toFixed(1)}%`}
            </span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              {b.players === 0 ? '' : `${b.wins} výh.`}
            </span>
            <span
              style={{ textAlign: 'right', color: turnColor, fontWeight: 600 }}
              title="Průměrný počet tahů hry, když hráč v tomto bucketu vyhrál"
            >
              {b.avgWinningTurns != null ? `${b.avgWinningTurns.toFixed(1)} t.` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Small stat card used in the turns-to-win header row
function TurnStatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        background: accent ? '#f1e2c4' : '#fafafa',
        border: `1px solid ${accent ? '#d6a35d' : 'var(--border)'}`,
        borderRadius: 6,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: accent ? '#a05e2e' : 'var(--text)' }}>
        {value}
      </div>
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
