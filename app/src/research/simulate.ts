// =============================================================================
// Research simulator — high-volume AI-vs-AI runs with slim per-game records
// =============================================================================
// Run: npx tsx src/research/simulate.ts [numGames] [maxTurns] [seedBase]
// Output:
//   sim_results/research/<timestamp>/games.jsonl    (one ResearchGameRecord per line)
//   sim_results/research/<timestamp>/meta.json      (run metadata)
//
// Designed for SCALE — 10k games per run is the target. Each game record is
// ~1-2 KB, so a run is ~20 MB. The analyzer (analyze.ts) reads this output
// streaming, line by line, to keep memory low.
// =============================================================================

import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { createGame, finishSetup, sleep } from '../game/engine';
import type { GameState, BoardCell, FormationKind, DiceLevel, SkillId } from '../game/types';
import { hexKey } from '../game/types';
import { aiSetupStep, aiStep } from '../game/ai';
import { makeRNG } from '../game/rng';

import type {
  ActionCategory, PlayerResearchRecord, ResearchGameRecord, ResearchRunMeta,
  SkillPurchaseRecord, FormationRecord,
} from './types';

const OPENING_LENGTH = 6; // how many initial actions we record per player

// =============================================================================
// LOG ENTRY → ActionCategory classifier
// =============================================================================
// The engine writes Czech log entries. We map them to coarse categories so
// the analyzer can group similar actions across games. Order matters — more
// specific patterns first.

function classify(entry: string): ActionCategory | null {
  // Pre-roll swap (Třídění): logged with "(Třídění)" suffix — match BEFORE
  // sleep swap so we don't conflate the two distinct mechanics.
  if (entry.includes('(Třídění)')) return 'pre_roll_swap';

  // Skip roll for potatoes — strategic alternative to rolling at turn start
  if (entry.includes('rozhodl tento tah neházet')) return 'skip_roll_potatoes';

  // Sleep variants — keep above generic "spí" patterns
  if (entry.includes('teleportoval Vombata')) return 'sleep_teleport';
  if (entry.includes('koupil dovednost')) return 'sleep_buy_skill';
  if (entry.includes('spí a získává')) return 'sleep_potato';
  if (entry.includes('downgradnul kostky')) return 'sleep_swap';
  if (entry.includes('provedl výměnu')) return 'sleep_swap';
  if (entry.includes('upgradnul')) return 'sleep_upgrade';
  if (entry.includes('prospal tah')) return 'sleep_skip';

  // Combat / cat
  if (entry.includes('rozdrtil Kočku') || entry.includes('rozmačkal Kočku')) return 'cat_smash';
  if (entry.includes('bojuje s Čertem')) return 'devil_combat';

  // Field uses
  if (entry.includes('vyformoval kostku')) return 'vyformuj';
  if (entry.includes('zasadil mrkev na Záhon')) return 'plant_bed';
  if (entry.includes('zasadil mrkev na Hlíně')) return 'plant_dirt';
  if (entry.includes('se naučil')) return 'learn_dirt'; // also covers tree-learn flow
  if (entry.includes('obsadil Eukalyptový')) return 'occupy_tree';
  if (entry.includes('získal 1k') && entry.includes('Houští')) return 'thorn_pickup';

  // Plain move (no field action) — match LAST since other moves contain it
  if (entry.includes('přesunul Vombata')) return 'move';

  // Lost a die/potato to attack
  if (entry.includes('odevzdal bramboru jako obranu') || entry.includes('odevzdal kostku jako obranu')) {
    return 'attack_lost';
  }

  return null;
}

function detectSkillPurchase(entry: string): { skill: string; method: SkillPurchaseRecord['method'] } | null {
  // "X získává dovednost Kapacita zdarma" → milestone
  const ms = /získává dovednost (\w+(?: \w+)?) zdarma/.exec(entry);
  if (ms) return { skill: ms[1], method: 'milestone' };
  // "X se naučil "Kapacita"!" → learn_hlina (or tree_learn — disambiguated below)
  const ln = /se naučil "([^"]+)"/.exec(entry);
  if (ln) return { skill: ln[1], method: 'learn_hlina' };
  // "X koupil dovednost "Sprint" za 10 🥔" → sleep_shop
  const sh = /koupil dovednost "([^"]+)"/.exec(entry);
  if (sh) return { skill: sh[1], method: 'sleep_shop' };
  return null;
}

// Map Czech skill label back to internal SkillId so the record is stable.
const LABEL_TO_SKILL_ID: Record<string, SkillId> = {
  'Kapacita': 'kapacita',
  'Lázně': 'koupel',
  'Koupel': 'koupel',
  'Třídění': 'klystyr',
  'Klystýr': 'klystyr',
  'Žvýkání': 'masaz_strev',
  'Masáž Střev': 'masaz_strev',
  'Bylinkový elixír': 'ajurveda',
  'Ajurvéda': 'ajurveda',
  'Ajurvédská Medicína': 'ajurveda',
  'Sprint': 'sprint',
};

function detectFormation(entry: string): { formation: FormationKind; rewardLvl: DiceLevel | null } | null {
  // "🏅 X splnil úkol "Přímka 5" (2. v pořadí) → odměna 1k12."
  // or "(4.+ v pořadí) — bez odměny (pozdě)."
  const m = /splnil úkol "([^"]+)"[^→\n]*(?:→ odměna 1k(\d+)|bez odměny)/.exec(entry);
  if (!m) return null;
  const label = m[1];
  const reward = m[2] ? (parseInt(m[2], 10) as DiceLevel) : null;
  const f: FormationKind | null =
    label === 'Přímka 5' ? 'primka5' :
    label === 'Obklíčení' ? 'obkliceni' :
    label === 'Průzkumník' ? 'pruzkumnik' :
    null;
  if (!f) return null;
  return { formation: f, rewardLvl: reward };
}

// =============================================================================
// Per-game runner
// =============================================================================

interface RunningPlayerState {
  id: 'p0' | 'p1';
  startHexType: BoardCell['type'] | null;
  startTileCenterType: 'tree' | 'devil' | null;
  startDieLevel: DiceLevel | null;
  opening: ActionCategory[];
  actionCounts: Partial<Record<ActionCategory, number>>;
  skillPurchases: SkillPurchaseRecord[];
  formationsCompleted: FormationRecord[];
  firstSkillTurn: number | null;
  firstSkill: SkillId | null;
  firstCatSmashTurn: number | null;
  firstDevilCombatTurn: number | null;
  firstDevilWoundTurn: number | null;
  firstFormationTurn: number | null;
  firstFormation: FormationKind | null;
  devilCombatAttempts: number;
  devilWoundsLanded: number;
}

function newRunningPlayer(id: 'p0' | 'p1'): RunningPlayerState {
  return {
    id,
    startHexType: null,
    startTileCenterType: null,
    startDieLevel: null,
    opening: [],
    actionCounts: {},
    skillPurchases: [],
    formationsCompleted: [],
    firstSkillTurn: null,
    firstSkill: null,
    firstCatSmashTurn: null,
    firstDevilCombatTurn: null,
    firstDevilWoundTurn: null,
    firstFormationTurn: null,
    firstFormation: null,
    devilCombatAttempts: 0,
    devilWoundsLanded: 0,
  };
}

function runOneGame(seed: number, maxTurns: number): ResearchGameRecord {
  const tStart = Date.now();
  let state = createGame(
    [
      { name: 'AI-A', kind: 'ai' },
      { name: 'AI-B', kind: 'ai' },
    ],
    seed
  );

  // ---- Setup ----
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

  // Capture setup-time features for each player
  const running: Record<string, RunningPlayerState> = {};
  state.players.forEach((p) => {
    const id = p.id as 'p0' | 'p1';
    const r = newRunningPlayer(id);
    // start hex type — assume vombats[0] is the first/only one
    const startHex = p.vombats[0]?.hex;
    if (startHex) {
      const cell = state.board.get(hexKey(startHex));
      if (cell) {
        r.startHexType = cell.type;
        // Find tile center for this tile and read its type
        let centerType: 'tree' | 'devil' | null = null;
        state.board.forEach((c) => {
          if (c.tileId === cell.tileId && (c.type === 'tree' || c.type === 'devil')) {
            centerType = c.type as 'tree' | 'devil';
          }
        });
        r.startTileCenterType = centerType;
      }
    }
    r.startDieLevel = (p.hand[0] ?? null) as DiceLevel | null;
    running[p.name] = r;
  });

  // ---- Main loop ----
  let turns = 1;
  let lastPlayerIdx = state.currentPlayerIdx;
  let lastLogLen = state.log.length;
  let stuckCounter = 0;

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
    state = next;

    // Process new log entries (engine prepends with unshift, so newest first)
    const numNew = state.log.length - lastLogLen;
    const newEntries: string[] = [];
    for (let i = numNew - 1; i >= 0; i--) newEntries.push(state.log[i]);
    lastLogLen = state.log.length;

    for (const entry of newEntries) {
      const playerName = state.players.find((p) => entry.includes(p.name))?.name;
      if (!playerName) continue;
      const r = running[playerName];
      if (!r) continue;

      // Action classification
      const cat = classify(entry);
      if (cat) {
        r.actionCounts[cat] = (r.actionCounts[cat] || 0) + 1;
        if (r.opening.length < OPENING_LENGTH) r.opening.push(cat);
        if (cat === 'cat_smash' && r.firstCatSmashTurn == null) r.firstCatSmashTurn = turns;
        if (cat === 'devil_combat') {
          r.devilCombatAttempts++;
          if (r.firstDevilCombatTurn == null) r.firstDevilCombatTurn = turns;
        }
      }

      // Skill purchases
      const sp = detectSkillPurchase(entry);
      if (sp) {
        const sid = LABEL_TO_SKILL_ID[sp.skill];
        if (sid) {
          // Disambiguate: if "se naučil" and the milestone-free phrasing already
          // captured this, skip duplicate. Each `se naučil` is one event.
          r.skillPurchases.push({ skill: sid, turn: turns, method: sp.method });
          if (r.firstSkillTurn == null) {
            r.firstSkillTurn = turns;
            r.firstSkill = sid;
          }
        }
      }

      // Devil wounds — "zranil Čerta na X (kostka 1kN, hod V)"
      if (entry.includes('zranil Čerta')) {
        r.devilWoundsLanded++;
        if (r.firstDevilWoundTurn == null) r.firstDevilWoundTurn = turns;
      }

      // Formations
      const fm = detectFormation(entry);
      if (fm) {
        r.formationsCompleted.push({ formation: fm.formation, turn: turns, reward: fm.rewardLvl });
        if (r.firstFormationTurn == null) {
          r.firstFormationTurn = turns;
          r.firstFormation = fm.formation;
        }
      }
    }

    if (state.currentPlayerIdx !== lastPlayerIdx) {
      turns++;
      lastPlayerIdx = state.currentPlayerIdx;
    }
  }

  // ---- Assemble final record ----
  const winnerId = state.winnerId as 'p0' | 'p1' | null;
  const playerRecords: PlayerResearchRecord[] = state.players.map((p) => {
    const r = running[p.name];
    return {
      id: p.id as 'p0' | 'p1',
      name: p.name,
      startHexType: (r.startHexType ?? 'dirt') as PlayerResearchRecord['startHexType'],
      startTileCenterType: r.startTileCenterType ?? 'tree',
      startDieLevel: r.startDieLevel,
      opening: r.opening,
      actionCounts: r.actionCounts,
      firstSkillTurn: r.firstSkillTurn,
      firstSkill: r.firstSkill,
      firstCatSmashTurn: r.firstCatSmashTurn,
      firstDevilCombatTurn: r.firstDevilCombatTurn,
      firstDevilWoundTurn: r.firstDevilWoundTurn,
      firstFormationTurn: r.firstFormationTurn,
      firstFormation: r.firstFormation,
      skillPurchases: r.skillPurchases,
      formationsCompleted: r.formationsCompleted,
      devilCombatAttempts: r.devilCombatAttempts,
      devilWoundsLanded: r.devilWoundsLanded,
      finalHand: [...p.hand],
      finalReserve: [...p.reserve],
      finalPotatoes: p.potatoes,
      finalCarrotTrack: p.carrotTrack,
      finalBobekTrack: p.bobekTrack,
      finalSkills: Array.from(p.skills),
      won: winnerId === p.id,
    };
  });

  return {
    seed,
    totalTurns: turns - 1,
    decisive: state.phase === 'game_over' && winnerId != null,
    winnerId,
    players: playerRecords,
    durationMs: Date.now() - tStart,
  };
}

// =============================================================================
// CLI
// =============================================================================

function main() {
  const numGames = parseInt(process.argv[2] || '1000', 10);
  const maxTurns = parseInt(process.argv[3] || '400', 10);
  const seedBase = parseInt(process.argv[4] || `${Math.floor(Date.now() / 1000) % 1_000_000_000}`, 10);

  console.log(`📊 Research simulator`);
  console.log(`   Games:     ${numGames}`);
  console.log(`   Max turns: ${maxTurns}`);
  console.log(`   Seed base: ${seedBase}`);

  // Output directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const baseDir = resolve(__dirname, '..', '..', 'sim_results', 'research');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = resolve(baseDir, timestamp);
  mkdirSync(runDir, { recursive: true });
  const jsonlPath = resolve(runDir, 'games.jsonl');
  const metaPath = resolve(runDir, 'meta.json');
  const latestPath = resolve(baseDir, 'latest.txt'); // pointer

  const rng = makeRNG(seedBase);
  const tRun = Date.now();
  let decisive = 0;
  let stalled = 0;
  // Progress reporting cadence — every 5% of games OR every 100, whichever larger
  const reportEvery = Math.max(100, Math.floor(numGames / 20));

  // Truncate output file
  writeFileSync(jsonlPath, '', 'utf-8');

  for (let i = 0; i < numGames; i++) {
    const seed = rng.int(2 ** 30);
    const g = runOneGame(seed, maxTurns);
    if (g.decisive) decisive++; else stalled++;
    appendFileSync(jsonlPath, JSON.stringify(g) + '\n', 'utf-8');
    if ((i + 1) % reportEvery === 0 || i + 1 === numGames) {
      const elapsed = (Date.now() - tRun) / 1000;
      const rate = (i + 1) / elapsed;
      const eta = (numGames - i - 1) / rate;
      console.log(`   [${i + 1}/${numGames}] decisive=${decisive} stalled=${stalled} · ${rate.toFixed(0)} games/s · ETA ${eta.toFixed(0)}s`);
    }
  }

  const totalDuration = (Date.now() - tRun) / 1000;
  const meta: ResearchRunMeta = {
    generatedAt: new Date().toISOString(),
    numGames,
    maxTurns,
    seedBase,
    saveVersion: 11,
    totalDurationSec: totalDuration,
    decisive,
    stalled,
  };
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  // Update "latest" pointer (used by analyze.ts when --latest is passed)
  writeFileSync(latestPath, runDir + '\n', 'utf-8');

  console.log(`\n✓ Run complete: ${totalDuration.toFixed(1)}s`);
  console.log(`  JSONL: ${jsonlPath}`);
  console.log(`  Meta:  ${metaPath}`);
  console.log(`\n  Decisive: ${decisive}/${numGames} (${(decisive / numGames * 100).toFixed(1)}%)`);
  console.log(`  Stalled:  ${stalled}/${numGames}`);
  console.log(`\n  Next: npx tsx src/research/analyze.ts --latest`);
}

main();
