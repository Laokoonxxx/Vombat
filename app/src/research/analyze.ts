// =============================================================================
// Research analyzer — reads games.jsonl, generates insights.md
// =============================================================================
// Run: npx tsx src/research/analyze.ts --latest
//      npx tsx src/research/analyze.ts <path-to-run-dir>
//
// Insight engine: aggregates per-game records into actionable game-design
// findings. Where possible, flags issues (dominant openings, dead actions,
// never-bought skills) automatically.
// =============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import type {
  ActionCategory, ActionWinCorrelation, BucketStat, PlayerResearchRecord,
  ResearchGameRecord, ResearchPublished, ResearchRunMeta, SkillComboStat,
  SkillWinRate,
} from './types';
import { SKILL_REQUIREMENTS } from '../game/engine';
import type { SkillId, FormationKind, HexType } from '../game/types';
import { FORMATION_LABEL } from '../game/types';

// =============================================================================
// Czech labels for action categories — keeps the report readable
// =============================================================================

const ACTION_LABEL: Record<ActionCategory, string> = {
  plant_dirt:      '🥕 Mrkev na Hlíně',
  plant_bed:       '🥕 Mrkev na Záhonu',
  vyformuj:        '💩 Vyformuj kostku',
  learn_dirt:      '🧠 Uč se (Hlína)',
  occupy_tree:     '🌳 Obsaď strom',
  tree_learn:      '🌳🧠 Obsaď + Uč se',
  thorn_pickup:    '🌵 Houští (kostka zdarma)',
  cat_smash:       '🎉 Rozdrcení Kočky',
  move:            '🐾 Pohyb (bez akce na poli)',
  devil_combat:    '⚔️ Souboj s Čertem',
  desert_use:      '🏜️ Akce na Poušti',
  sleep_potato:    '💤 Brambora',
  sleep_buy_skill: '💤🛒 Koupil dovednost',
  sleep_teleport:  '💤🌀 Teleport',
  sleep_swap:      '💤🔄 Výměna kostek (Spánek)',
  sleep_upgrade:   '💤⬆️ Upgrade kostky',
  sleep_skip:      '💤✖️ Skip',
  pre_roll_swap:   '🔄 Třídění před hodem',
  attack_lost:     '💔 Útok (kočka/čert)',
  other:           '? Jiné',
};

const HEX_LABEL: Record<HexType, string> = {
  dirt:   '🟫 Hlína',
  bed:    '🌱 Záhon',
  desert: '🏜️ Poušť',
  tree:   '🌳 Eukalyptus',
  thorn:  '🌵 Houští',
  cat:    '🐱 Kočka',
  devil:  '👹 Čert',
};

// =============================================================================
// Helpers
// =============================================================================

function loadGames(runDir: string): { games: ResearchGameRecord[]; meta: ResearchRunMeta } {
  const jsonl = readFileSync(resolve(runDir, 'games.jsonl'), 'utf-8');
  const games: ResearchGameRecord[] = [];
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    games.push(JSON.parse(line));
  }
  const meta: ResearchRunMeta = JSON.parse(readFileSync(resolve(runDir, 'meta.json'), 'utf-8'));
  return { games, meta };
}

function pct(num: number, denom: number): string {
  if (denom === 0) return '—';
  return ((num / denom) * 100).toFixed(1) + '%';
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

// Wilson-score interval for a 95% CI around a proportion.
// We use this to flag "statistically suspicious" findings (e.g. opening
// dominance) rather than chance.
function wilson95(wins: number, n: number): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const z = 1.96;
  const phat = wins / n;
  const denom = 1 + (z * z) / n;
  const center = (phat + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n)) / denom;
  return { lo: Math.max(0, center - half), hi: Math.min(1, center + half) };
}

// =============================================================================
// Insight builders
// =============================================================================

function buildOverview(games: ResearchGameRecord[], meta: ResearchRunMeta): string {
  const decisive = games.filter((g) => g.decisive);
  const stalled = games.length - decisive.length;
  const turnsAvg = decisive.reduce((s, g) => s + g.totalTurns, 0) / Math.max(1, decisive.length);
  const turnsMin = decisive.length ? Math.min(...decisive.map((g) => g.totalTurns)) : 0;
  const turnsMax = decisive.length ? Math.max(...decisive.map((g) => g.totalTurns)) : 0;

  const winsByPlayer = new Map<string, number>();
  for (const g of decisive) {
    if (!g.winnerId) continue;
    const w = g.players.find((p) => p.id === g.winnerId)?.name ?? g.winnerId;
    winsByPlayer.set(w, (winsByPlayer.get(w) ?? 0) + 1);
  }

  let md = `## 📊 Overview\n\n`;
  md += `- **Vygenerováno:** ${meta.generatedAt}\n`;
  md += `- **Počet her:** ${meta.numGames} (max ${meta.maxTurns} tahů/hra)\n`;
  md += `- **Seed base:** ${meta.seedBase}\n`;
  md += `- **Doba simulace:** ${meta.totalDurationSec.toFixed(1)}s · ${(meta.numGames / meta.totalDurationSec).toFixed(0)} her/s\n`;
  md += `- **Rozhodnuté:** ${decisive.length}/${games.length} (${pct(decisive.length, games.length)})\n`;
  md += `- **Zaseknuté (stall):** ${stalled}\n`;
  md += `- **Tahů do výhry:** Ø ${turnsAvg.toFixed(1)} · min ${turnsMin} · max ${turnsMax}\n`;
  md += `- **Výhry:** ${[...winsByPlayer.entries()].map(([n, c]) => `${n} ${c} (${pct(c, decisive.length)})`).join(' · ')}\n\n`;

  // Balance flag: if either player wins > 60% it's a meaningful bias
  if (winsByPlayer.size === 2) {
    const counts = [...winsByPlayer.values()];
    const skew = Math.max(...counts) / Math.max(1, decisive.length);
    if (skew > 0.60) {
      md += `> ⚠️ **Nerovnováha:** Jeden hráč vyhrál ${pct(Math.max(...counts), decisive.length)} her.\n` +
            `> Vzhledem k tomu, že AI začíná první (vs-AI mód), může to být order-effect.\n\n`;
    }
  }
  return md;
}

function buildStartHexAnalysis(games: ResearchGameRecord[]): string {
  // Win rate by start hex type — counts each PLAYER (not each game)
  const stats = new Map<HexType, { n: number; wins: number }>();
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      const s = stats.get(p.startHexType) ?? { n: 0, wins: 0 };
      s.n++;
      if (p.won) s.wins++;
      stats.set(p.startHexType, s);
    }
  }

  let md = `## 🎯 Startovní pole — vliv na výhru\n\n`;
  md += `| Typ pole | Hráčů | Výher | Win rate | 95% CI |\n`;
  md += `|---|---:|---:|---:|---|\n`;
  const sorted = [...stats.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [hex, s] of sorted) {
    const ci = wilson95(s.wins, s.n);
    md += `| ${HEX_LABEL[hex]} | ${s.n} | ${s.wins} | ${pct(s.wins, s.n)} | ${(ci.lo * 100).toFixed(1)}–${(ci.hi * 100).toFixed(1)}% |\n`;
  }
  md += `\n`;

  // Same for tile-center type
  const tile = new Map<'tree' | 'devil', { n: number; wins: number }>();
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      const t = tile.get(p.startTileCenterType) ?? { n: 0, wins: 0 };
      t.n++;
      if (p.won) t.wins++;
      tile.set(p.startTileCenterType, t);
    }
  }
  md += `### Startovní dílek (modrý 🌳 vs. černý 👹)\n\n`;
  md += `| Střed dílku | Hráčů | Win rate |\n|---|---:|---:|\n`;
  for (const [k, s] of tile) {
    const lbl = k === 'tree' ? '🌳 Modrý (Eukalyptus)' : '👹 Černý (Čert)';
    md += `| ${lbl} | ${s.n} | ${pct(s.wins, s.n)} |\n`;
  }
  md += `\n`;
  return md;
}

function buildOpeningAnalysis(games: ResearchGameRecord[]): string {
  // For each opening prefix length (1, 2, 3), bucket player-games by the
  // opening sequence and compute win rate. Surface the top 5 most common
  // openings + dominant (high win rate) ones.
  let md = `## 🚀 Otevírací akce (opening analysis)\n\n`;

  for (const prefixLen of [1, 2, 3]) {
    const bucket = new Map<string, { n: number; wins: number }>();
    for (const g of games) {
      if (!g.decisive) continue;
      for (const p of g.players) {
        if (p.opening.length < prefixLen) continue;
        const key = p.opening.slice(0, prefixLen).join(' → ');
        const s = bucket.get(key) ?? { n: 0, wins: 0 };
        s.n++;
        if (p.won) s.wins++;
        bucket.set(key, s);
      }
    }
    // Sort by sample size, take top 8
    const top = [...bucket.entries()]
      .filter(([, s]) => s.n >= 5)
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 8);
    md += `### Prvních ${prefixLen} ${prefixLen === 1 ? 'akce' : prefixLen < 5 ? 'akce' : 'akcí'}\n\n`;
    md += `| Sekvence | Hráčů | Win rate | 95% CI |\n|---|---:|---:|---|\n`;
    for (const [seq, s] of top) {
      const ci = wilson95(s.wins, s.n);
      const flag = s.n >= 20 && (s.wins / s.n > 0.65 || s.wins / s.n < 0.35) ? ' ⚠️' : '';
      // Translate categories to human-readable labels
      const human = seq.split(' → ').map((c) => ACTION_LABEL[c as ActionCategory] ?? c).join(' → ');
      md += `| ${human} | ${s.n} | ${pct(s.wins, s.n)}${flag} | ${(ci.lo * 100).toFixed(0)}–${(ci.hi * 100).toFixed(0)}% |\n`;
    }
    md += `\n`;
  }
  md += `> ⚠️ označuje sekvenci s win-rate < 35 % nebo > 65 % při alespoň 20 vzorcích = potenciální balanc problém.\n\n`;
  return md;
}

function buildSkillAnalysis(games: ResearchGameRecord[]): string {
  const skillIds = Object.keys(SKILL_REQUIREMENTS) as SkillId[];

  // Per-skill: how often acquired, breakdown by method
  type SkillAgg = { total: number; methods: Record<string, number>; whenTurns: number[]; winsWhenLearned: number };
  const agg = new Map<SkillId, SkillAgg>();
  for (const sid of skillIds) {
    agg.set(sid, { total: 0, methods: {}, whenTurns: [], winsWhenLearned: 0 });
  }
  let totalPlayerGames = 0;
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      totalPlayerGames++;
      for (const sp of p.skillPurchases) {
        const a = agg.get(sp.skill);
        if (!a) continue;
        a.total++;
        a.methods[sp.method] = (a.methods[sp.method] || 0) + 1;
        a.whenTurns.push(sp.turn);
        if (p.won) a.winsWhenLearned++;
      }
    }
  }

  let md = `## 🧠 Dovednosti — využití\n\n`;
  md += `Procenta = podíl hráčů (přes všechny rozhodnuté hry) co tu dovednost získali.\n\n`;
  md += `| Dovednost | 🌳 cena | Získalo | % hráčů | Ø tah | Win rate když získá | Milestone | Hlína | Strom | Sleep shop |\n`;
  md += `|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n`;
  const sorted = [...agg.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [sid, a] of sorted) {
    const req = SKILL_REQUIREMENTS[sid];
    const avgTurn = a.whenTurns.length ? (a.whenTurns.reduce((s, t) => s + t, 0) / a.whenTurns.length).toFixed(1) : '—';
    const winRate = a.total ? pct(a.winsWhenLearned, a.total) : '—';
    const ms = a.methods['milestone'] || 0;
    const lh = a.methods['learn_hlina'] || 0;
    const tl = a.methods['tree_learn'] || 0;
    const sh = a.methods['sleep_shop'] || 0;
    const flag =
      a.total / totalPlayerGames < 0.05 ? ' ⚠️ MRTVÁ' :
      a.total / totalPlayerGames > 0.9 ? ' ⚠️ AUTO-PICK' :
      '';
    md += `| ${req.label}${flag} | ${req.trees} | ${a.total} | ${pct(a.total, totalPlayerGames)} | ${avgTurn} | ${winRate} | ${ms} | ${lh} | ${tl} | ${sh} |\n`;
  }
  md += `\n`;
  md += `> ⚠️ **MRTVÁ** = méně než 5 % hráčů to získá → potenciálně OP slabá nebo nesmyslná.\n`;
  md += `> ⚠️ **AUTO-PICK** = více než 90 % hráčů to získá → OP silná, hra se jí "musí" naučit.\n\n`;

  // First skill distribution
  const firstSkillCount = new Map<SkillId, { n: number; wins: number }>();
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      if (!p.firstSkill) continue;
      const s = firstSkillCount.get(p.firstSkill) ?? { n: 0, wins: 0 };
      s.n++;
      if (p.won) s.wins++;
      firstSkillCount.set(p.firstSkill, s);
    }
  }
  md += `### První získaná dovednost (často určuje strategii)\n\n`;
  md += `| Dovednost | Hráčů | Win rate |\n|---|---:|---:|\n`;
  for (const [sid, s] of [...firstSkillCount.entries()].sort((a, b) => b[1].n - a[1].n)) {
    md += `| ${SKILL_REQUIREMENTS[sid].label} | ${s.n} | ${pct(s.wins, s.n)} |\n`;
  }
  md += `\n`;
  return md;
}

function buildActionDistribution(games: ResearchGameRecord[]): string {
  // Action frequency: % of player-games where the action occurred at least once,
  // and average count per player-game.
  const stats = new Map<ActionCategory, { totalUses: number; gamesWithIt: number }>();
  let totalPlayerGames = 0;
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      totalPlayerGames++;
      for (const [k, v] of Object.entries(p.actionCounts)) {
        const cat = k as ActionCategory;
        const s = stats.get(cat) ?? { totalUses: 0, gamesWithIt: 0 };
        s.totalUses += v ?? 0;
        if ((v ?? 0) > 0) s.gamesWithIt++;
        stats.set(cat, s);
      }
    }
  }

  let md = `## 🎬 Distribuce akcí\n\n`;
  md += `| Akce | Použití celkem | Ø/hra/hráč | % her kde proběhne |\n|---|---:|---:|---:|\n`;
  const sorted = [...stats.entries()].sort((a, b) => b[1].totalUses - a[1].totalUses);
  for (const [cat, s] of sorted) {
    const avgPer = s.totalUses / Math.max(1, totalPlayerGames);
    const pres = s.gamesWithIt / Math.max(1, totalPlayerGames);
    const flag = pres < 0.05 ? ' ⚠️ MRTVÁ' : '';
    md += `| ${ACTION_LABEL[cat]}${flag} | ${s.totalUses} | ${avgPer.toFixed(2)} | ${pct(s.gamesWithIt, totalPlayerGames)} |\n`;
  }
  md += `\n`;
  return md;
}

function buildMilestoneAnalysis(games: ResearchGameRecord[]): string {
  // Distribution of turn at which first X happened — for winners only.
  // This shows the "winning template" — when do successful players hit key milestones?
  let md = `## 🏁 Milestone-turn analýza (jen výherci)\n\n`;

  function distFor(label: string, getter: (p: PlayerResearchRecord) => number | null): string {
    const turns: number[] = [];
    for (const g of games) {
      if (!g.decisive) continue;
      for (const p of g.players) {
        if (!p.won) continue;
        const t = getter(p);
        if (t != null) turns.push(t);
      }
    }
    if (turns.length === 0) return `- **${label}:** —\n`;
    turns.sort((a, b) => a - b);
    const median = turns[Math.floor(turns.length / 2)];
    const avg = turns.reduce((s, t) => s + t, 0) / turns.length;
    const p25 = turns[Math.floor(turns.length * 0.25)];
    const p75 = turns[Math.floor(turns.length * 0.75)];
    return `- **${label}:** medián ${median} · Ø ${avg.toFixed(1)} · IQR ${p25}–${p75} · n=${turns.length}\n`;
  }

  md += distFor('1. dovednost', (p) => p.firstSkillTurn);
  md += distFor('1. rozdrcení Kočky', (p) => p.firstCatSmashTurn);
  md += distFor('1. souboj s Čertem', (p) => p.firstDevilCombatTurn);
  md += distFor('1. zranění Čerta', (p) => p.firstDevilWoundTurn);
  md += distFor('1. formace', (p) => p.firstFormationTurn);
  md += `\n`;
  return md;
}

function buildFormationAnalysis(games: ResearchGameRecord[]): string {
  const formations: FormationKind[] = ['primka5', 'obkliceni', 'pruzkumnik'];

  type FormAgg = { totalCompletions: number; firstPlayersWon: number; firstPlayersTotal: number; turns: number[] };
  const agg = new Map<FormationKind, FormAgg>();
  for (const f of formations) agg.set(f, { totalCompletions: 0, firstPlayersWon: 0, firstPlayersTotal: 0, turns: [] });

  let totalPlayerGames = 0;
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      totalPlayerGames++;
      for (const fc of p.formationsCompleted) {
        const a = agg.get(fc.formation)!;
        a.totalCompletions++;
        a.turns.push(fc.turn);
        if (fc.reward === 20) {
          a.firstPlayersTotal++;
          if (p.won) a.firstPlayersWon++;
        }
      }
    }
  }

  let md = `## 🏅 Úkoly (formace)\n\n`;
  if ([...agg.values()].every((a) => a.totalCompletions === 0)) {
    md += `> AI v této simulaci úkoly nesplnila ani jednou. To je očekávané — AI heuristika nemá formace v cílové funkci.\n\n`;
    return md;
  }
  md += `| Formace | Splněno | % hráčů | Ø tah | 1. místo win-rate |\n|---|---:|---:|---:|---:|\n`;
  for (const f of formations) {
    const a = agg.get(f)!;
    const avgTurn = a.turns.length ? (a.turns.reduce((s, t) => s + t, 0) / a.turns.length).toFixed(1) : '—';
    const firstWR = a.firstPlayersTotal ? pct(a.firstPlayersWon, a.firstPlayersTotal) : '—';
    md += `| ${FORMATION_LABEL[f]} | ${a.totalCompletions} | ${pct(a.totalCompletions, totalPlayerGames)} | ${avgTurn} | ${firstWR} |\n`;
  }
  md += `\n`;
  return md;
}

function buildDevilAnalysis(games: ResearchGameRecord[]): string {
  let totalCombats = 0;
  let totalWounds = 0;
  const winsByCombats = new Map<number, { n: number; wins: number }>();
  const winsByWounds = new Map<number, { n: number; wins: number }>();
  for (const g of games) {
    if (!g.decisive) continue;
    for (const p of g.players) {
      totalCombats += p.devilCombatAttempts;
      totalWounds += p.devilWoundsLanded;
      const c = winsByCombats.get(p.devilCombatAttempts) ?? { n: 0, wins: 0 };
      c.n++;
      if (p.won) c.wins++;
      winsByCombats.set(p.devilCombatAttempts, c);
      const w = winsByWounds.get(p.devilWoundsLanded) ?? { n: 0, wins: 0 };
      w.n++;
      if (p.won) w.wins++;
      winsByWounds.set(p.devilWoundsLanded, w);
    }
  }
  let md = `## ⚔️ Souboj s Čertem\n\n`;
  md += `- Celkem zahájených soubojů: **${totalCombats}**\n`;
  md += `- Celkem zasazených zranění: **${totalWounds}**\n`;
  md += `- Průměr zranění na souboj: **${totalCombats ? (totalWounds / totalCombats).toFixed(2) : '—'}**\n\n`;

  md += `### Win rate podle počtu zahájených soubojů\n\n`;
  md += `| Soubojů | Hráčů | Win rate |\n|---:|---:|---:|\n`;
  for (const [k, s] of [...winsByCombats.entries()].sort((a, b) => a[0] - b[0])) {
    md += `| ${k} | ${s.n} | ${pct(s.wins, s.n)} |\n`;
  }
  md += `\n`;
  return md;
}

function buildAutoInsights(games: ResearchGameRecord[]): string {
  // Auto-generated bullet-list of actionable findings. Re-uses computations
  // from sections above, but synthesizes them into "what would I change".
  const lines: string[] = [];
  const decisive = games.filter((g) => g.decisive);
  const playerGames = decisive.length * 2;

  // Skill underuse
  const skillCount = new Map<SkillId, number>();
  for (const sid of Object.keys(SKILL_REQUIREMENTS) as SkillId[]) skillCount.set(sid, 0);
  for (const g of decisive) for (const p of g.players) for (const sp of p.skillPurchases) {
    skillCount.set(sp.skill, (skillCount.get(sp.skill) ?? 0) + 1);
  }
  for (const [sid, n] of skillCount) {
    if (n / playerGames < 0.05) {
      lines.push(`🔴 **Slabá dovednost** "${SKILL_REQUIREMENTS[sid].label}": získá ji jen ${pct(n, playerGames)} hráčů. Zvaž posílení nebo levnější cenu.`);
    } else if (n / playerGames > 0.9) {
      lines.push(`🟡 **Dominantní dovednost** "${SKILL_REQUIREMENTS[sid].label}": získá ji ${pct(n, playerGames)} hráčů → spíš auto-pick než volba.`);
    }
  }

  // Action underuse
  const actionPresence = new Map<ActionCategory, number>();
  for (const g of decisive) for (const p of g.players) for (const [k, v] of Object.entries(p.actionCounts)) {
    if ((v ?? 0) > 0) actionPresence.set(k as ActionCategory, (actionPresence.get(k as ActionCategory) ?? 0) + 1);
  }
  for (const [cat, n] of actionPresence) {
    if (n / playerGames < 0.05) {
      lines.push(`🔴 **Mrtvá akce** "${ACTION_LABEL[cat]}": objevuje se v ${pct(n, playerGames)} her. Možná není vůbec dostupná / je dominována jinou.`);
    }
  }

  // Order effect (AI-A always goes first as ai-first; if win % > 60 there's a meta issue)
  const aiAWins = decisive.filter((g) => g.players.find((p) => p.id === g.winnerId)?.name === 'AI-A').length;
  const winShareA = aiAWins / decisive.length;
  if (Math.abs(winShareA - 0.5) > 0.10) {
    lines.push(`🟡 **Order-effect:** První hráč vyhrál ${pct(aiAWins, decisive.length)} her. Větší než ±10 % = první hráč má strukturální výhodu/nevýhodu.`);
  }

  // Game length
  const turnsAvg = decisive.reduce((s, g) => s + g.totalTurns, 0) / decisive.length;
  if (turnsAvg > 100) {
    lines.push(`🟡 **Dlouhé hry:** Ø ${turnsAvg.toFixed(0)} tahů na hru. Hra cílí ~30-60 min (rychlovka). AI je nejspíš pasivní — zvaž round limit z BACKLOG.md.`);
  } else if (turnsAvg < 30) {
    lines.push(`🟢 **Krátké hry:** Ø ${turnsAvg.toFixed(0)} tahů. To je rychlovka, jak má být.`);
  }

  // Stall rate
  const stalled = games.length - decisive.length;
  if (stalled / games.length > 0.05) {
    lines.push(`🔴 **Stall risk:** ${pct(stalled, games.length)} her se nedohrálo do limitu. AI uvízla bez progresu.`);
  }

  // Formation completion rate
  let totalFormations = 0;
  for (const g of decisive) for (const p of g.players) totalFormations += p.formationsCompleted.length;
  if (totalFormations === 0) {
    lines.push(`🟢 **Úkoly:** AI nikdy úkol nedokončila. Heuristika je nevidí. Pro hráče zůstávají skrytým bonusem (správně).`);
  } else if (totalFormations / playerGames < 0.05) {
    lines.push(`🟢 **Úkoly:** Splněno v ${pct(totalFormations, playerGames)} her — pro lidského hráče stále dostupné.`);
  }

  let md = `## 💡 Auto-detekované insighty\n\n`;
  if (lines.length === 0) {
    md += `_(žádné významné problémy nenalezeny — hra je v dobré rovnováze podle těchto metrik)_\n\n`;
  } else {
    for (const l of lines) md += `- ${l}\n`;
    md += `\n`;
  }
  return md;
}

// =============================================================================
// Published JSON for in-app StatsViewer
// =============================================================================
// All correlations bucketed/aggregated up front so the UI renders instantly.

function bucketize(
  records: { value: number; won: boolean; turns: number }[],
  ranges: { label: string; min: number; max: number }[],
): BucketStat[] {
  return ranges.map((r) => {
    const inBucket = records.filter((x) => x.value >= r.min && x.value <= r.max);
    const winners = inBucket.filter((x) => x.won);
    const avgWinningTurns = winners.length
      ? winners.reduce((s, x) => s + x.turns, 0) / winners.length
      : null;
    return {
      bucket: r.label,
      players: inBucket.length,
      wins: winners.length,
      winRate: inBucket.length ? winners.length / inBucket.length : 0,
      avgWinningTurns,
    };
  });
}

// Approximate "total dice owned" — includes dice still alive at end + dice
// spent on devil wounds (those came from the player too). Pending counts
// because they were acquired during the game.
function diceOwnedPeak(p: PlayerResearchRecord): number {
  return p.finalHand.length + p.finalReserve.length + p.devilWoundsLanded;
}

function buildPublished(games: ResearchGameRecord[]): ResearchPublished {
  const decisive = games.filter((g) => g.decisive);
  // Each row pairs a player with the game they were in — so we can carry
  // game.totalTurns through all bucket aggregations.
  type Row = { p: PlayerResearchRecord; turns: number };
  const rows: Row[] = decisive.flatMap((g) => g.players.map((p) => ({ p, turns: g.totalTurns })));
  const playerGames: PlayerResearchRecord[] = rows.map((r) => r.p);
  const totalPlayerGames = playerGames.length;

  // Helper: given an extractor, build the {value, won, turns} array for bucketize.
  const extract = (valueFn: (p: PlayerResearchRecord) => number) =>
    rows.map((r) => ({ value: valueFn(r.p), won: r.p.won, turns: r.turns }));

  // ---- Overall turns-to-win distribution ----
  const sortedTurns = decisive.map((g) => g.totalTurns).sort((a, b) => a - b);
  const turnsToWin = sortedTurns.length
    ? {
        avg: sortedTurns.reduce((s, t) => s + t, 0) / sortedTurns.length,
        median: sortedTurns[Math.floor(sortedTurns.length / 2)],
        p25: sortedTurns[Math.floor(sortedTurns.length * 0.25)],
        p75: sortedTurns[Math.floor(sortedTurns.length * 0.75)],
        min: sortedTurns[0],
        max: sortedTurns[sortedTurns.length - 1],
      }
    : { avg: 0, median: 0, p25: 0, p75: 0, min: 0, max: 0 };

  // ---- Winner / loser averages ----
  const winners = playerGames.filter((p) => p.won);
  const losers = playerGames.filter((p) => !p.won);
  const avg = (arr: PlayerResearchRecord[], key: (p: PlayerResearchRecord) => number) =>
    arr.length ? arr.reduce((s, p) => s + key(p), 0) / arr.length : 0;
  const winnerAvg = {
    carrots: avg(winners, (p) => p.finalCarrotTrack),
    trees: avg(winners, (p) => p.finalBobekTrack),
    potatoes: avg(winners, (p) => p.finalPotatoes),
    handSize: avg(winners, (p) => p.finalHand.length),
    reserveSize: avg(winners, (p) => p.finalReserve.length),
    skillsLearned: avg(winners, (p) => p.finalSkills.length),
    diceOwnedPeak: avg(winners, diceOwnedPeak),
  };
  const loserAvg = {
    carrots: avg(losers, (p) => p.finalCarrotTrack),
    trees: avg(losers, (p) => p.finalBobekTrack),
    potatoes: avg(losers, (p) => p.finalPotatoes),
    handSize: avg(losers, (p) => p.finalHand.length),
    reserveSize: avg(losers, (p) => p.finalReserve.length),
    skillsLearned: avg(losers, (p) => p.finalSkills.length),
    diceOwnedPeak: avg(losers, diceOwnedPeak),
  };

  // ---- Skill stats ----
  const skillIds = Object.keys(SKILL_REQUIREMENTS) as SkillId[];
  const perSkill: SkillWinRate[] = skillIds.map((sid) => {
    const req = SKILL_REQUIREMENTS[sid];
    const withSkillRows = rows.filter((r) => r.p.finalSkills.includes(sid));
    const withoutSkillRows = rows.filter((r) => !r.p.finalSkills.includes(sid));
    const wWinners = withSkillRows.filter((r) => r.p.won);
    const wWins = wWinners.length;
    const woWins = withoutSkillRows.filter((r) => r.p.won).length;
    const turns = withSkillRows.flatMap((r) =>
      r.p.skillPurchases.filter((sp) => sp.skill === sid).map((sp) => sp.turn)
    );
    return {
      skillId: sid,
      label: req.label,
      treesCost: req.trees,
      learned: withSkillRows.length,
      pctLearned: withSkillRows.length / Math.max(1, totalPlayerGames),
      winRateWhenLearned: withSkillRows.length ? wWins / withSkillRows.length : 0,
      winRateWhenNot: withoutSkillRows.length ? woWins / withoutSkillRows.length : 0,
      avgTurnLearned: turns.length ? turns.reduce((s, t) => s + t, 0) / turns.length : null,
      avgWinningTurnsWhenLearned: wWinners.length
        ? wWinners.reduce((s, r) => s + r.turns, 0) / wWinners.length
        : null,
    };
  });
  perSkill.sort((a, b) => b.learned - a.learned);

  // Skill count → win rate
  const skillCountBuckets = bucketize(
    extract((p) => p.finalSkills.length),
    [
      { label: '0', min: 0, max: 0 },
      { label: '1', min: 1, max: 1 },
      { label: '2', min: 2, max: 2 },
      { label: '3', min: 3, max: 3 },
      { label: '4', min: 4, max: 4 },
      { label: '5+', min: 5, max: 99 },
    ],
  );

  // Top skill combos (canonical sorted SkillId[])
  const comboMap = new Map<string, { skills: SkillId[]; players: number; wins: number; winningTurnsSum: number }>();
  for (const r of rows) {
    const sorted = [...r.p.finalSkills].sort();
    const key = sorted.join(',');
    const c = comboMap.get(key) ?? { skills: sorted as SkillId[], players: 0, wins: 0, winningTurnsSum: 0 };
    c.players++;
    if (r.p.won) {
      c.wins++;
      c.winningTurnsSum += r.turns;
    }
    comboMap.set(key, c);
  }
  const topCombos: SkillComboStat[] = [...comboMap.values()]
    .sort((a, b) => b.players - a.players)
    .slice(0, 10)
    .map((c) => ({
      skills: c.skills,
      labels: c.skills.map((s) => SKILL_REQUIREMENTS[s].label),
      players: c.players,
      wins: c.wins,
      winRate: c.players ? c.wins / c.players : 0,
      avgWinningTurns: c.wins ? c.winningTurnsSum / c.wins : null,
    }));

  // ---- Resource buckets ----
  const carrotBuckets = bucketize(
    extract((p) => p.finalCarrotTrack),
    [
      { label: '0', min: 0, max: 0 },
      { label: '1-2', min: 1, max: 2 },
      { label: '3-4', min: 3, max: 4 },
      { label: '5-6', min: 5, max: 6 },
      { label: '7-8', min: 7, max: 8 },
      { label: '9+', min: 9, max: 99 },
    ],
  );
  const treeBuckets = bucketize(
    extract((p) => p.finalBobekTrack),
    [
      { label: '0', min: 0, max: 0 },
      { label: '1', min: 1, max: 1 },
      { label: '2', min: 2, max: 2 },
      { label: '3', min: 3, max: 3 },
      { label: '4+', min: 4, max: 99 },
    ],
  );
  const diceBuckets = bucketize(
    extract(diceOwnedPeak),
    [
      { label: '0-2', min: 0, max: 2 },
      { label: '3-4', min: 3, max: 4 },
      { label: '5-6', min: 5, max: 6 },
      { label: '7-8', min: 7, max: 8 },
      { label: '9-10', min: 9, max: 10 },
      { label: '11+', min: 11, max: 99 },
    ],
  );
  const potatoBuckets = bucketize(
    extract((p) => p.finalPotatoes),
    [
      { label: '0-2', min: 0, max: 2 },
      { label: '3-5', min: 3, max: 5 },
      { label: '6-10', min: 6, max: 10 },
      { label: '11-15', min: 11, max: 15 },
      { label: '16+', min: 16, max: 999 },
    ],
  );

  // ---- Action correlation ----
  // For each action category we care about, bucket by count and compute win rate.
  function actionBuckets(cat: ActionCategory): BucketStat[] {
    return bucketize(
      extract((p) => p.actionCounts[cat] ?? 0),
      [
        { label: '0', min: 0, max: 0 },
        { label: '1', min: 1, max: 1 },
        { label: '2', min: 2, max: 2 },
        { label: '3-4', min: 3, max: 4 },
        { label: '5+', min: 5, max: 999 },
      ],
    );
  }
  const ACTION_LABELS: Partial<Record<ActionCategory, string>> = {
    pre_roll_swap: '🔄 Třídění před hodem',
    sleep_swap: '💤🔄 Výměna kostek (Spánek)',
    sleep_buy_skill: '💤🛒 Koupil dovednost (Sleep)',
    sleep_teleport: '💤🌀 Teleport',
    vyformuj: '💩 Vyformuj kostku',
    thorn_pickup: '🌵 Houští (kostka zdarma)',
    cat_smash: '🎉 Rozdrcení Kočky',
    devil_combat: '⚔️ Souboj s Čertem',
    occupy_tree: '🌳 Obsaď strom',
    plant_dirt: '🥕 Mrkev na Hlíně',
    plant_bed: '🥕 Mrkev na Záhonu',
    learn_dirt: '🧠 Uč se (Hlína/Strom)',
  };
  const actionStats: ActionWinCorrelation[] = Object.entries(ACTION_LABELS).map(
    ([cat, label]) => ({
      category: cat,
      label: label!,
      buckets: actionBuckets(cat as ActionCategory),
    }),
  );

  return {
    generatedAt: new Date().toISOString(),
    numGames: games.length,
    decisive: decisive.length,
    totalPlayerGames,
    turnsToWin,
    winnerAverages: winnerAvg,
    loserAverages: loserAvg,
    skillStats: { perSkill, byCount: skillCountBuckets, topCombos },
    resourceStats: {
      carrots: carrotBuckets,
      trees: treeBuckets,
      diceOwnedPeak: diceBuckets,
      potatoes: potatoBuckets,
    },
    actionStats,
  };
}

// =============================================================================
// Main
// =============================================================================

function resolveLatestRunDir(): string | null {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const baseDir = resolve(__dirname, '..', '..', 'sim_results', 'research');
  const latestPointer = resolve(baseDir, 'latest.txt');
  if (!existsSync(latestPointer)) return null;
  const pointer = readFileSync(latestPointer, 'utf-8').trim();
  return existsSync(pointer) ? pointer : null;
}

function main() {
  const arg = process.argv[2];
  let runDir: string;
  if (!arg || arg === '--latest') {
    const latest = resolveLatestRunDir();
    if (!latest) {
      console.error('Žádný run nenalezen. Nejdřív spusť: npx tsx src/research/simulate.ts');
      process.exit(1);
    }
    runDir = latest;
  } else {
    runDir = resolve(arg);
  }
  console.log(`Analyzing: ${runDir}`);

  const { games, meta } = loadGames(runDir);
  console.log(`Loaded ${games.length} games`);

  let md = `# Vombat — Analytické insighty\n\n`;
  md += `_Run dir: \`${runDir}\`_\n\n`;
  md += buildOverview(games, meta);
  md += buildAutoInsights(games);
  md += buildStartHexAnalysis(games);
  md += buildOpeningAnalysis(games);
  md += buildSkillAnalysis(games);
  md += buildActionDistribution(games);
  md += buildMilestoneAnalysis(games);
  md += buildFormationAnalysis(games);
  md += buildDevilAnalysis(games);
  md += `\n---\n\n_Generated by \`src/research/analyze.ts\`. To regenerate: \`npx tsx src/research/analyze.ts --latest\`._\n`;

  const outPath = resolve(runDir, 'insights.md');
  writeFileSync(outPath, md, 'utf-8');
  console.log(`\n✓ Insights: ${outPath}`);

  // Publish aggregate JSON for in-app StatsViewer consumption.
  // Written to app/public/sim/research.json — served by Vite at /sim/research.json.
  const published = buildPublished(games);
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const publicDir = resolve(__dirname, '..', '..', 'public', 'sim');
  if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
  const publishedPath = resolve(publicDir, 'research.json');
  writeFileSync(publishedPath, JSON.stringify(published, null, 2), 'utf-8');
  console.log(`✓ Published: ${publishedPath}`);
  console.log(`  → načte se v aplikaci v sekci 📊 Statistiky / Analytika.`);
}

main();
