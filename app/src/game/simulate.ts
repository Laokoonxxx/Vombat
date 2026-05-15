// =============================================================================
// AI vs AI self-play simulator
// =============================================================================
// Runs N games with two AI players, records aggregate stats. Use to diagnose
// AI behavior and tune heuristics.
//
// Run with: npx tsx src/game/simulate.ts [numGames] [maxTurns]
// =============================================================================

import { createGame, currentPlayer, finishSetup, endTurnNow, sleep } from './engine';
import type { GameState, PlayerState } from './types';
import { aiSetupStep, aiStep } from './ai';
import { makeRNG } from './rng';

interface GameStats {
  seed: number;
  winnerId: string | null;
  winnerName: string | null;
  turns: number;
  setupSteps: number;
  finalPhase: string;
  // per-player end state
  players: {
    name: string;
    handLevels: number[];
    reserveLevels: number[];
    potatoes: number;
    carrotTrack: number;
    bobekTrack: number;
    skills: string[];
    woundsHit: number;
  }[];
  // event counters
  events: {
    rolls: number;
    moves: number;
    fieldUses: number;
    sleeps: number;
    catSmashes: number;
    devilCombatStarted: number;
    devilWoundsApplied: number;
  };
  log: string[]; // last N entries
}

function runOneGame(seed: number, maxTurns = 200): GameStats {
  let state = createGame(
    [
      { name: 'AI-A', kind: 'ai' },
      { name: 'AI-B', kind: 'ai' },
    ],
    seed
  );

  // ---- Setup phase: place vombats + buy dice ----
  let setupSteps = 0;
  while (state.phase === 'setup' && setupSteps < 200) {
    // Run AI setup until no more AI work needed (placement + 1 die)
    const next = aiSetupStep(state);
    if (next == null) break;
    state = next;
    setupSteps++;
  }
  // If both players bought at least one die, finish setup
  if (state.players.every((p) => p.vombats.length > 0 && p.hand.length > 0)) {
    state = finishSetup(state);
  } else {
    // Couldn't finish — abort
    return makeStats(state, seed, 0, setupSteps);
  }

  // ---- Game phase ----
  const events = {
    rolls: 0,
    moves: 0,
    fieldUses: 0,
    sleeps: 0,
    catSmashes: 0,
    devilCombatStarted: 0,
    devilWoundsApplied: 0,
  };
  // Track event types by diffing state.log entries
  let lastLogLen = state.log.length;

  let turns = 0;
  let stuckCounter = 0;
  while (state.phase !== 'game_over' && turns < maxTurns) {
    const beforePhase = state.phase;
    const beforePlayer = state.currentPlayerIdx;
    const next = aiStep(state);
    if (next == null || next === state) {
      // AI returned unchanged state. Try to unstick: sleep + end turn.
      stuckCounter++;
      if (stuckCounter > 3) break; // give up after 3 attempts
      try {
        state = sleep(state, { kind: 'skip' });
      } catch {
        break;
      }
      continue;
    }
    stuckCounter = 0;
    state = next;
    // Count event types from new log entries
    const newEntries = state.log.slice(0, state.log.length - lastLogLen);
    for (const e of newEntries) {
      if (e.includes('hodil kostkami')) events.rolls++;
      else if (e.includes('Pohyb') || e.includes('přesunul')) events.moves++;
      else if (e.includes('rozmačkal Kočku')) events.catSmashes++;
      else if (e.includes('bojuje s Čertem')) events.devilCombatStarted++;
      else if (e.includes('zranil Čerta')) events.devilWoundsApplied++;
      else if (e.includes('zasadil') || e.includes('obsadil') || e.includes('Kakej') ||
               e.includes('získal 1k') || e.includes('naučil') || e.includes('vrtal'))
        events.fieldUses++;
      else if (e.includes('spí') || e.includes('downgradnul') || e.includes('výměnu') ||
               e.includes('prospal'))
        events.sleeps++;
    }
    lastLogLen = state.log.length;
    // Count a turn when currentPlayerIdx changes
    if (beforePlayer !== state.currentPlayerIdx) turns++;
    // Safety: prevent infinite loop on same phase/player with no progress
    if (state.phase === beforePhase && state.currentPlayerIdx === beforePlayer) {
      // Detect AI stuck — break after too many same-phase steps would be ideal,
      // but we'll just trust the engine and stop only when phase doesn't change
      // for many iterations. For now, just continue.
    }
  }

  return makeStats(state, seed, turns, setupSteps, events);
}

function makeStats(
  state: GameState,
  seed: number,
  turns: number,
  setupSteps: number,
  events: any = {}
): GameStats {
  const winner = state.players.find((p) => p.id === state.winnerId);
  return {
    seed,
    winnerId: state.winnerId,
    winnerName: winner ? winner.name : null,
    turns,
    setupSteps,
    finalPhase: state.phase,
    players: state.players.map((p) => ({
      name: p.name,
      handLevels: [...p.hand],
      reserveLevels: [...p.reserve],
      potatoes: p.potatoes,
      carrotTrack: p.carrotTrack,
      bobekTrack: p.bobekTrack,
      skills: Array.from(p.skills),
      woundsHit: Object.values(state.devilWounds.woundsByPlayer[p.id]).filter((d) => d != null).length,
    })),
    events: {
      rolls: events.rolls || 0,
      moves: events.moves || 0,
      fieldUses: events.fieldUses || 0,
      sleeps: events.sleeps || 0,
      catSmashes: events.catSmashes || 0,
      devilCombatStarted: events.devilCombatStarted || 0,
      devilWoundsApplied: events.devilWoundsApplied || 0,
    },
    log: state.log.slice(0, 30),
  };
}

function main() {
  const numGames = parseInt(process.argv[2] || '10', 10);
  const maxTurns = parseInt(process.argv[3] || '300', 10);

  console.log(`Running ${numGames} AI-vs-AI games (max ${maxTurns} turns each)...\n`);

  const results: GameStats[] = [];
  const rng = makeRNG(42);
  for (let i = 0; i < numGames; i++) {
    const seed = rng.int(2 ** 30);
    const g = runOneGame(seed, maxTurns);
    results.push(g);
    const winnerLabel = g.winnerName ?? '— (no winner)';
    console.log(
      `Game ${i + 1}: seed=${seed} turns=${g.turns} winner=${winnerLabel} phase=${g.finalPhase}`
    );
  }

  // ---- Aggregate stats ----
  console.log('\n========== AGGREGATE STATS ==========\n');
  const wins = results.filter((r) => r.winnerId).length;
  const draws = results.length - wins;
  console.log(`Decisive games: ${wins}/${results.length}   Stalled: ${draws}`);

  if (wins > 0) {
    const decisive = results.filter((r) => r.winnerId);
    const avgTurns = decisive.reduce((s, r) => s + r.turns, 0) / decisive.length;
    console.log(`Average turns to win: ${avgTurns.toFixed(1)}`);
  }

  // Per-event averages
  const evtAvg = (key: keyof GameStats['events']) =>
    (results.reduce((s, r) => s + r.events[key], 0) / results.length).toFixed(1);

  console.log(`\nAverage event counts per game:`);
  console.log(`  rolls:               ${evtAvg('rolls')}`);
  console.log(`  moves:               ${evtAvg('moves')}`);
  console.log(`  fieldUses:           ${evtAvg('fieldUses')}`);
  console.log(`  sleeps:              ${evtAvg('sleeps')}`);
  console.log(`  catSmashes:          ${evtAvg('catSmashes')}`);
  console.log(`  devilCombatStarted:  ${evtAvg('devilCombatStarted')}`);
  console.log(`  devilWoundsApplied:  ${evtAvg('devilWoundsApplied')}`);

  // Final-state averages (across BOTH players)
  const allFinalPlayers = results.flatMap((r) => r.players);
  const avg = (fn: (p: GameStats['players'][number]) => number) =>
    (allFinalPlayers.reduce((s, p) => s + fn(p), 0) / allFinalPlayers.length).toFixed(1);

  console.log(`\nAverage final state per player:`);
  console.log(`  hand size:           ${avg((p) => p.handLevels.length)}`);
  console.log(`  reserve size:        ${avg((p) => p.reserveLevels.length)}`);
  console.log(`  potatoes:            ${avg((p) => p.potatoes)}`);
  console.log(`  carrotTrack:         ${avg((p) => p.carrotTrack)}`);
  console.log(`  bobekTrack:          ${avg((p) => p.bobekTrack)}`);
  console.log(`  skills learned:      ${avg((p) => p.skills.length)}`);
  console.log(`  devil wounds hit:    ${avg((p) => p.woundsHit)}`);
  console.log(`  max die in hand:     ${avg((p) =>
    p.handLevels.length ? Math.max(...p.handLevels) : 0
  )}`);

  // Sample tail logs of first 3 games
  console.log(`\n========== SAMPLE TAIL LOGS ==========`);
  for (let i = 0; i < Math.min(3, results.length); i++) {
    console.log(`\n--- Game ${i + 1} (seed=${results[i].seed}, winner=${results[i].winnerName ?? '—'}) ---`);
    for (const e of results[i].log.slice(0, 15).reverse()) {
      console.log(`  ${e}`);
    }
  }
}

main();
