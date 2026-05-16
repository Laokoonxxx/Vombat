// =============================================================================
// Detailed AI vs AI simulator with per-turn event tracking
// =============================================================================
// Runs N games and writes a Markdown report with aggregate + per-game stats.
//
// Run with: npx tsx src/game/simulate_detailed.ts [numGames] [maxTurns] [seedBase]
// Output: ../sim_results/sim_report_<timestamp>.md  (plus .json with raw data)
// =============================================================================

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createGame, currentPlayer, finishSetup, sleep } from './engine';
import type { GameState, DiceLevel } from './types';
import { aiSetupStep, aiStep } from './ai';
import { makeRNG } from './rng';

// -----------------------------------------------------------------------------
// Event taxonomy
// -----------------------------------------------------------------------------

type EventType =
  | 'roll'
  | 'move'
  | 'sleep_gain_potato'
  | 'sleep_downgrade'
  | 'sleep_swap'
  | 'sleep_upgrade'
  | 'sleep_teleport'
  | 'sleep_buy_skill'
  | 'sleep_skip'
  | 'use_dirt_plant'
  | 'use_dirt_kakej'
  | 'use_dirt_learn'
  | 'use_bed'
  | 'use_tree'
  | 'use_thorn'
  | 'cat_smash'
  | 'cat_attack'
  | 'devil_combat_start'
  | 'devil_wound'
  | 'devil_attack'
  | 'devil_stop'
  | 'skill_milestone'
  | 'pending_die_added'
  | 'pending_released'
  | 'win';

interface TurnEvent {
  turn: number;            // 1-indexed sequence of (player) turns
  step: number;            // step within the turn (1-indexed)
  playerName: string;
  type: EventType;
  detail: string;          // raw log line for context
}

interface SkillGain {
  playerName: string;
  skill: string;
  turn: number;
  method: 'learn_hlina' | 'sleep_shop' | 'milestone';
}

interface WoundEvent {
  playerName: string;
  woundType: '1' | '2' | '7+' | '10+';
  turn: number;
  dieLevel: number;
  rollValue: number;
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
  totalSteps: number;       // engine-step count
  totalTurns: number;       // turns counted as currentPlayerIdx changes
  finalPhase: string;
  events: TurnEvent[];
  skillsTimeline: SkillGain[];
  woundsTimeline: WoundEvent[];
  catSmashes: { playerName: string; turn: number }[];
  // Action counts per player
  actionCountsByPlayer: Record<string, Record<EventType, number>>;
  finalState: {
    players: {
      name: string;
      hand: DiceLevel[];
      reserve: DiceLevel[];
      pending: DiceLevel[];
      potatoes: number;
      carrotTrack: number;
      bobekTrack: number;
      skills: string[];
      vombatPositions: { q: number; r: number }[];
    }[];
  };
  trajectories: Record<string, ResourceSample[]>; // by playerName
  fullLog: string[];        // reversed (chronological)
}

// -----------------------------------------------------------------------------
// Log entry → EventType classifier
// -----------------------------------------------------------------------------

function classify(entry: string): EventType | null {
  if (entry.includes('hodil kostkami')) return 'roll';
  if (entry.includes('přesunul Vombata')) return 'move';
  if (entry.includes('rozmačkal Kočku')) return 'cat_smash';
  if (entry.includes('je vedle Kočky') || entry.includes('jako obranu před Kočkou')) return 'cat_attack';
  if (entry.includes('bojuje s Čertem')) return 'devil_combat_start';
  if (entry.includes('zranil Čerta')) return 'devil_wound';
  if (entry.includes('neuspěl v boji s Čertem')) return 'devil_attack';
  if (entry.includes('ukončil boj s Čertem')) return 'devil_stop';
  if (entry.includes('ZABIL TASMÁNSKÉHO ČERTA')) return 'win';
  if (entry.includes('získává dovednost') && entry.includes('zdarma')) return 'skill_milestone';
  if (entry.includes('uvolnil čekající kostky')) return 'pending_released';
  if (entry.includes('čeká na dovednost Kapacita')) return 'pending_die_added';
  if (entry.includes('teleportoval Vombata')) return 'sleep_teleport';
  if (entry.includes('koupil dovednost')) return 'sleep_buy_skill';
  if (entry.includes('spí a získává')) return 'sleep_gain_potato';
  if (entry.includes('downgradnul kostky')) return 'sleep_downgrade';
  if (entry.includes('provedl výměnu')) return 'sleep_swap';
  if (entry.includes('upgradnul')) return 'sleep_upgrade';
  if (entry.includes('prospal tah')) return 'sleep_skip';
  if (entry.includes('zasadil mrkev')) return 'use_dirt_plant';
  if (entry.includes('provedl Kakej')) return 'use_dirt_kakej';
  if (entry.includes('se naučil')) return 'use_dirt_learn';
  if (entry.includes('obsadil Eukalyptový')) return 'use_tree';
  if (entry.includes('získal 1k') && entry.includes('z Houští')) return 'use_thorn';
  return null;
}

function detectSkillFromEntry(entry: string): { skill: string; method: SkillGain['method'] } | null {
  // "X se naučil "Kapacita"!"   → learn_hlina
  // "X koupil dovednost "Sprint" za 10 🥔" → sleep_shop
  // "X získává dovednost Koupel zdarma" → milestone
  const learnMatch = /se naučil "([^"]+)"/.exec(entry);
  if (learnMatch) return { skill: learnMatch[1], method: 'learn_hlina' };
  const buyMatch = /koupil dovednost "([^"]+)"/.exec(entry);
  if (buyMatch) return { skill: buyMatch[1], method: 'sleep_shop' };
  const milestoneMatch = /získává dovednost (\w+(?: \w+)?) zdarma/.exec(entry);
  if (milestoneMatch) return { skill: milestoneMatch[1], method: 'milestone' };
  return null;
}

function detectWoundFromEntry(entry: string): { woundType: WoundEvent['woundType']; dieLevel: number; rollValue: number } | null {
  // "X zranil Čerta na 10+ (kostka 1k20, hod 18)."
  const m = /zranil Čerta na ([\d+]+) \(kostka 1k(\d+), hod (\d+)\)/.exec(entry);
  if (!m) return null;
  return { woundType: m[1] as WoundEvent['woundType'], dieLevel: parseInt(m[2], 10), rollValue: parseInt(m[3], 10) };
}

// -----------------------------------------------------------------------------
// Game runner
// -----------------------------------------------------------------------------

function runOneGame(seed: number, maxTurns: number): GameStats {
  let state = createGame(
    [
      { name: 'AI-A', kind: 'ai' },
      { name: 'AI-B', kind: 'ai' },
    ],
    seed
  );

  // Setup phase
  let setupSteps = 0;
  while (state.phase === 'setup' && setupSteps < 200) {
    const next = aiSetupStep(state);
    if (next == null) break;
    state = next;
    setupSteps++;
  }
  if (state.players.every((p) => p.vombats.length > 0 && p.hand.length > 0)) {
    state = finishSetup(state);
  }

  const events: TurnEvent[] = [];
  const skillsTimeline: SkillGain[] = [];
  const woundsTimeline: WoundEvent[] = [];
  const catSmashes: { playerName: string; turn: number }[] = [];
  const actionCountsByPlayer: Record<string, Record<EventType, number>> = {};
  state.players.forEach((p) => {
    actionCountsByPlayer[p.name] = {} as Record<EventType, number>;
  });
  const trajectories: Record<string, ResourceSample[]> = {};
  state.players.forEach((p) => { trajectories[p.name] = []; });

  let turns = 1;
  let lastPlayerIdx = state.currentPlayerIdx;
  let stepInTurn = 0;
  let lastLogLen = state.log.length;
  let stuckCounter = 0;
  let engineSteps = 0;

  // Snapshot initial state
  state.players.forEach((p) => {
    trajectories[p.name].push(sampleResources(p, 0));
  });

  while (state.phase !== 'game_over' && turns <= maxTurns) {
    const next = aiStep(state);
    if (next == null || next === state) {
      stuckCounter++;
      if (stuckCounter > 3) break;
      try {
        state = sleep(state, { kind: 'skip' });
      } catch {
        break;
      }
      continue;
    }
    stuckCounter = 0;
    engineSteps++;
    state = next;
    stepInTurn++;

    // Detect new log entries since last check
    const numNewEntries = state.log.length - lastLogLen;
    const newEntries: string[] = [];
    for (let i = numNewEntries - 1; i >= 0; i--) {
      newEntries.push(state.log[i]);
    }
    lastLogLen = state.log.length;

    // Process each new entry into events
    for (const entry of newEntries) {
      // Extract player name. Some entries start with emoji (⚠️, ⚔️, ✨, 🎉, 📥, 🔓, 🏆)
      // so we search anywhere in the entry, not just startsWith.
      const playerName = state.players.find((p) => entry.includes(p.name))?.name ?? null;

      const type = classify(entry);
      if (!type || !playerName) continue;

      events.push({ turn: turns, step: stepInTurn, playerName, type, detail: entry });
      actionCountsByPlayer[playerName][type] = (actionCountsByPlayer[playerName][type] || 0) + 1;

      // Specialized timelines
      if (type === 'skill_milestone' || type === 'use_dirt_learn' || type === 'sleep_buy_skill') {
        const skillInfo = detectSkillFromEntry(entry);
        if (skillInfo) {
          skillsTimeline.push({ playerName, skill: skillInfo.skill, turn: turns, method: skillInfo.method });
        }
      }
      if (type === 'devil_wound') {
        const wInfo = detectWoundFromEntry(entry);
        if (wInfo) woundsTimeline.push({ playerName, ...wInfo, turn: turns });
      }
      if (type === 'cat_smash') {
        catSmashes.push({ playerName, turn: turns });
      }
    }

    // Turn boundary: when currentPlayerIdx changes, count a turn and sample
    if (state.currentPlayerIdx !== lastPlayerIdx) {
      // Sample EVERY player so we get a complete trajectory
      state.players.forEach((p) => {
        trajectories[p.name].push(sampleResources(p, turns));
      });
      turns++;
      lastPlayerIdx = state.currentPlayerIdx;
      stepInTurn = 0;
    }
  }

  return {
    seed,
    winnerName: state.winnerId ? state.players.find((p) => p.id === state.winnerId)?.name ?? null : null,
    totalSteps: engineSteps,
    totalTurns: turns - 1,
    finalPhase: state.phase,
    events,
    skillsTimeline,
    woundsTimeline,
    catSmashes,
    actionCountsByPlayer,
    finalState: {
      players: state.players.map((p) => ({
        name: p.name,
        hand: [...p.hand],
        reserve: [...p.reserve],
        pending: [...p.pendingDice],
        potatoes: p.potatoes,
        carrotTrack: p.carrotTrack,
        bobekTrack: p.bobekTrack,
        skills: Array.from(p.skills),
        vombatPositions: p.vombats.map((v) => ({ q: v.hex.q, r: v.hex.r })),
      })),
    },
    trajectories,
    fullLog: [...state.log].reverse(), // chronological
  };
}

function sampleResources(p: any, turn: number): ResourceSample {
  return {
    turn,
    playerName: p.name,
    potatoes: p.potatoes,
    carrotTrack: p.carrotTrack,
    bobekTrack: p.bobekTrack,
    handSize: p.hand.length,
    reserveSize: p.reserve.length,
    pendingSize: p.pendingDice.length,
    maxDieInHand: p.hand.length ? Math.max(...p.hand) : 0,
    skillsCount: p.skills.size,
  };
}

// -----------------------------------------------------------------------------
// Report generation
// -----------------------------------------------------------------------------

function formatActionTable(counts: Record<string, Record<EventType, number>>): string {
  const allTypes = new Set<string>();
  Object.values(counts).forEach((m) => Object.keys(m).forEach((k) => allTypes.add(k)));
  const types = Array.from(allTypes).sort();
  const players = Object.keys(counts);
  let md = `| Akce | ${players.join(' | ')} |\n`;
  md += `|---|${players.map(() => '---').join('|')}|\n`;
  for (const t of types) {
    md += `| \`${t}\` | ${players.map((p) => counts[p][t as EventType] || 0).join(' | ')} |\n`;
  }
  return md;
}

function generateReport(results: GameStats[], numGames: number, maxTurns: number): string {
  const decisive = results.filter((r) => r.winnerName != null);
  const stalled = results.length - decisive.length;

  let md = `# Vombat AI vs AI — Detailní statistiky\n\n`;
  md += `**Generováno:** ${new Date().toISOString()}\n`;
  md += `**Počet her:** ${numGames}  \n`;
  md += `**Max tahů na hru:** ${maxTurns}\n\n`;
  md += `---\n\n`;

  // === AGGREGATE ===
  md += `## 📊 Agregované statistiky\n\n`;

  md += `### Výsledky\n\n`;
  md += `- **Rozhodnuté hry:** ${decisive.length} / ${results.length} (${((decisive.length / results.length) * 100).toFixed(1)}%)\n`;
  md += `- **Zaseknuté hry (max turns):** ${stalled}\n`;
  if (decisive.length > 0) {
    const turnsAvg = decisive.reduce((s, r) => s + r.totalTurns, 0) / decisive.length;
    const turnsMin = Math.min(...decisive.map((r) => r.totalTurns));
    const turnsMax = Math.max(...decisive.map((r) => r.totalTurns));
    md += `- **Průměrný počet tahů do výhry:** ${turnsAvg.toFixed(1)} (min ${turnsMin}, max ${turnsMax})\n`;
  }

  // Wins by player name
  const winsByName: Record<string, number> = {};
  for (const r of decisive) winsByName[r.winnerName!] = (winsByName[r.winnerName!] || 0) + 1;
  md += `- **Výhry podle hráče:** ${Object.entries(winsByName).map(([n, c]) => `${n}: ${c}`).join(', ')}\n\n`;

  // Average action counts (across all players & games)
  md += `### Průměrné počty akcí (na hru, na hráče)\n\n`;
  const aggActionCounts: Record<string, number> = {};
  let totalPlayerGames = 0;
  for (const r of results) {
    for (const [, counts] of Object.entries(r.actionCountsByPlayer)) {
      totalPlayerGames++;
      for (const [k, v] of Object.entries(counts)) {
        aggActionCounts[k] = (aggActionCounts[k] || 0) + v;
      }
    }
  }
  const aggSorted = Object.entries(aggActionCounts).sort((a, b) => b[1] - a[1]);
  md += `| Akce | Celkem | Průměr/hráč/hra |\n`;
  md += `|---|---:|---:|\n`;
  for (const [k, v] of aggSorted) {
    md += `| \`${k}\` | ${v} | ${(v / totalPlayerGames).toFixed(2)} |\n`;
  }
  md += `\n`;

  // Skills acquisition stats
  md += `### Dovednosti — průměrný počet a první-naučená cesta\n\n`;
  const skillCounts: Record<string, number> = {};
  const skillFirstMethod: Record<string, Record<string, number>> = {};
  for (const r of results) {
    for (const s of r.skillsTimeline) {
      skillCounts[s.skill] = (skillCounts[s.skill] || 0) + 1;
      skillFirstMethod[s.skill] = skillFirstMethod[s.skill] || {};
      skillFirstMethod[s.skill][s.method] = (skillFirstMethod[s.skill][s.method] || 0) + 1;
    }
  }
  md += `| Dovednost | Naučení celkem | Milestone | Sleep shop | Hlína Uč se |\n`;
  md += `|---|---:|---:|---:|---:|\n`;
  for (const [skill, count] of Object.entries(skillCounts).sort((a, b) => b[1] - a[1])) {
    const ms = skillFirstMethod[skill]?.['milestone'] || 0;
    const sh = skillFirstMethod[skill]?.['sleep_shop'] || 0;
    const lh = skillFirstMethod[skill]?.['learn_hlina'] || 0;
    md += `| ${skill} | ${count} | ${ms} | ${sh} | ${lh} |\n`;
  }
  md += `\n`;

  // Devil combat stats
  md += `### Souboj s Čertem\n\n`;
  let totalCombats = 0;
  let totalWounds = 0;
  let totalAttacks = 0;
  for (const r of results) {
    for (const [, c] of Object.entries(r.actionCountsByPlayer)) {
      totalCombats += c.devil_combat_start || 0;
      totalWounds += c.devil_wound || 0;
      totalAttacks += c.devil_attack || 0;
    }
  }
  md += `- **Celkem zahájených soubojů:** ${totalCombats}\n`;
  md += `- **Celkem zasazených zranění:** ${totalWounds}\n`;
  md += `- **Celkem neúspěšných pokusů:** ${totalAttacks}\n`;
  md += `- **Průměr zranění/souboj:** ${totalCombats > 0 ? (totalWounds / totalCombats).toFixed(2) : '—'}\n\n`;

  // Final state averages
  md += `### Průměrné finální hodnoty\n\n`;
  let totalP = 0, totalCarrot = 0, totalBobek = 0, totalHand = 0, totalReserve = 0, totalPending = 0, totalSkills = 0, totalMaxDie = 0;
  let count = 0;
  for (const r of results) {
    for (const p of r.finalState.players) {
      totalP += p.potatoes;
      totalCarrot += p.carrotTrack;
      totalBobek += p.bobekTrack;
      totalHand += p.hand.length;
      totalReserve += p.reserve.length;
      totalPending += p.pending.length;
      totalSkills += p.skills.length;
      totalMaxDie += p.hand.length ? Math.max(...p.hand) : 0;
      count++;
    }
  }
  md += `| Metric | Průměr |\n|---|---:|\n`;
  md += `| 🥔 Brambory | ${(totalP / count).toFixed(2)} |\n`;
  md += `| 🥕 Mrkev (ukazatel) | ${(totalCarrot / count).toFixed(2)} |\n`;
  md += `| 🌳 Stromy (ukazatel) | ${(totalBobek / count).toFixed(2)} |\n`;
  md += `| ✋ Velikost Ruky | ${(totalHand / count).toFixed(2)} |\n`;
  md += `| 📦 Velikost Zásoby | ${(totalReserve / count).toFixed(2)} |\n`;
  md += `| 📥 Čekající | ${(totalPending / count).toFixed(2)} |\n`;
  md += `| 🧠 Dovedností | ${(totalSkills / count).toFixed(2)} |\n`;
  md += `| 🎲 Max kostka | ${(totalMaxDie / count).toFixed(2)} |\n\n`;

  // === PER-GAME DETAILS ===
  md += `---\n\n## 🎮 Detail jednotlivých her\n\n`;

  results.forEach((r, idx) => {
    md += `### Hra ${idx + 1} (seed ${r.seed})\n\n`;
    md += `- **Výherce:** ${r.winnerName ?? '— *(nedohrána)*'}\n`;
    md += `- **Tahy:** ${r.totalTurns} (engine kroky: ${r.totalSteps})\n`;
    md += `- **Finální fáze:** \`${r.finalPhase}\`\n\n`;

    // Skill timeline
    if (r.skillsTimeline.length > 0) {
      md += `**🧠 Učení dovedností (chronologicky):**\n\n`;
      md += `| Tah | Hráč | Dovednost | Cesta |\n|---:|---|---|---|\n`;
      for (const s of r.skillsTimeline) {
        const methodCs = s.method === 'milestone' ? '🎁 Milestone' : s.method === 'sleep_shop' ? '🛒 Sleep shop' : '🟫 Hlína Uč se';
        md += `| ${s.turn} | ${s.playerName} | ${s.skill} | ${methodCs} |\n`;
      }
      md += `\n`;
    }

    // Devil wounds timeline
    if (r.woundsTimeline.length > 0) {
      md += `**⚔️ Zranění Čerta:**\n\n`;
      md += `| Tah | Hráč | Slot | Kostka | Hod |\n|---:|---|---|---|---:|\n`;
      for (const w of r.woundsTimeline) {
        md += `| ${w.turn} | ${w.playerName} | ${w.woundType} | 1k${w.dieLevel} | ${w.rollValue} |\n`;
      }
      md += `\n`;
    }

    // Cat smashes
    if (r.catSmashes.length > 0) {
      md += `**🐱 Rozmačkané Kočky:** ${r.catSmashes.map((c) => `${c.playerName} (tah ${c.turn})`).join(', ')}\n\n`;
    }

    // Action counts
    md += `**📊 Počet akcí:**\n\n`;
    md += formatActionTable(r.actionCountsByPlayer);
    md += `\n`;

    // Final state
    md += `**Finální stav:**\n\n`;
    for (const p of r.finalState.players) {
      md += `- **${p.name}**: ` +
        `Ruka [${p.hand.map(d => `k${d}`).join(', ') || '—'}], ` +
        `Zásoba [${p.reserve.map(d => `k${d}`).join(', ') || '—'}], ` +
        `Čekající [${p.pending.map(d => `k${d}`).join(', ') || '—'}], ` +
        `🥔${p.potatoes}, 🥕${p.carrotTrack}, 🌳${p.bobekTrack}, ` +
        `dovednosti: ${p.skills.join(', ') || '—'}\n`;
    }
    md += `\n`;

    // Last few log entries
    md += `<details><summary>📜 Posledních 20 log záznamů</summary>\n\n`;
    const lastN = r.fullLog.slice(-20);
    for (const e of lastN) md += `- ${e}\n`;
    md += `\n</details>\n\n`;
  });

  return md;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

function main() {
  const numGames = parseInt(process.argv[2] || '20', 10);
  const maxTurns = parseInt(process.argv[3] || '400', 10);
  const seedBase = parseInt(process.argv[4] || '42', 10);

  console.log(`Running ${numGames} detailed AI-vs-AI games (max ${maxTurns} turns each)…`);

  const results: GameStats[] = [];
  const rng = makeRNG(seedBase);
  for (let i = 0; i < numGames; i++) {
    const seed = rng.int(2 ** 30);
    const g = runOneGame(seed, maxTurns);
    results.push(g);
    console.log(`  Game ${i + 1}/${numGames}: seed=${seed} turns=${g.totalTurns} winner=${g.winnerName ?? '—'}`);
  }

  const md = generateReport(results, numGames, maxTurns);

  // Compute output directory (../sim_results relative to this file)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const outDir = resolve(__dirname, '..', '..', 'sim_results');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const mdPath = resolve(outDir, `sim_report_${timestamp}.md`);
  const jsonPath = resolve(outDir, `sim_data_${timestamp}.json`);

  writeFileSync(mdPath, md, 'utf-8');
  writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

  // Also publish a "latest" snapshot to the app's public/ folder for the
  // in-app StatsViewer. We strip out heavy fields (per-step events,
  // resource trajectories, all-but-last-50 log entries) to keep this file
  // small enough to commit (~100KB instead of ~3MB).
  const publicSimDir = resolve(__dirname, '..', '..', 'public', 'sim');
  if (!existsSync(publicSimDir)) mkdirSync(publicSimDir, { recursive: true });
  const latestPath = resolve(publicSimDir, 'latest.json');
  const slim = results.map((r) => ({
    seed: r.seed,
    winnerName: r.winnerName,
    totalSteps: r.totalSteps,
    totalTurns: r.totalTurns,
    finalPhase: r.finalPhase,
    skillsTimeline: r.skillsTimeline,
    woundsTimeline: r.woundsTimeline,
    catSmashes: r.catSmashes,
    actionCountsByPlayer: r.actionCountsByPlayer,
    finalState: r.finalState,
    // Per-step events with truncated detail for the in-app per-turn view.
    // (Trajectories omitted entirely — not currently consumed.)
    events: r.events.map((e) => ({
      turn: e.turn,
      step: e.step,
      playerName: e.playerName,
      type: e.type,
      detail: e.detail.length > 120 ? e.detail.slice(0, 117) + '…' : e.detail,
    })),
    trajectories: {},
    fullLog: r.fullLog.slice(-50),
  }));
  const meta = {
    generatedAt: new Date().toISOString(),
    numGames,
    maxTurns,
    seedBase,
    results: slim,
  };
  writeFileSync(latestPath, JSON.stringify(meta, null, 2), 'utf-8');
  console.log(`✓ Latest snapshot: ${latestPath} (consumable by in-app StatsViewer)`);

  console.log(`\n✓ Markdown report: ${mdPath}`);
  console.log(`✓ JSON raw data:   ${jsonPath}`);
  console.log(
    `\nSummary: ${results.filter((r) => r.winnerName).length}/${results.length} decisive, ` +
    `avg turns ${(results.filter(r => r.winnerName).reduce((s, r) => s + r.totalTurns, 0) / Math.max(1, results.filter(r => r.winnerName).length)).toFixed(1)}`
  );
}

main();
