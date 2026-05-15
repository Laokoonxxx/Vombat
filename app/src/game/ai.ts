// =============================================================================
// Simple heuristic AI for Vombat
// =============================================================================
// One AI step = one engine action. The GameScreen useEffect calls aiStep
// repeatedly with a small delay, so the user can see each move.
//
// Strategy is intentionally simple:
//  - Setup: pick a non-cat hex closest to a Devil; buy a mid-tier die.
//  - Turn: if adjacent/on Devil and hand is "ready", fight; otherwise roll.
//  - After roll: prefer using a Houští for a free die; otherwise move toward
//    the nearest Devil; otherwise sleep.
//  - Devil combat: greedily fill the rarest open wound first.
//  - Attack response: surrender potato if available; else lowest die.
// =============================================================================

import type { BoardCell, GameState, Hex, DiceLevel, PlayerState, WoundType } from './types';
import { hexKey, WOUND_TYPES } from './types';
import { hexNeighbors, cubeDistance } from './hex';
import {
  currentPlayer,
  rollDice,
  legalMoveTargets,
  moveVombat,
  canUseField,
  useField,
  sleep,
  beginDevilCombat,
  applyDevilWound,
  devilContinueRoll,
  devilStop,
  resolveAttackWithPotato,
  resolveAttackWithDie,
  placeStartingVombat,
  buyDie,
  finishSetup,
  canFightDevil,
  allWoundsTaken,
  isAccessibleByPlayer,
} from './engine';

// -----------------------------------------------------------------------------
// SETUP AI
// -----------------------------------------------------------------------------

export function aiSetupStep(state: GameState): GameState | null {
  // 1. Place vombats for any AI players that haven't placed yet
  const placer = state.players.find((p) => p.kind === 'ai' && p.vombats.length === 0);
  if (placer) {
    const hex = pickStartingHex(state);
    if (hex) return placeStartingVombat(state, placer.id, hex);
  }
  // 2. Buy at least 1 die for any AI player that hasn't bought
  const buyer = state.players.find((p) => p.kind === 'ai' && p.vombats.length > 0 && p.hand.length === 0);
  if (buyer) {
    // Try to buy 1k6 (9 potatoes), fallback to 1k4 (7), then 1k2 (5)
    const preferred: DiceLevel[] = [6, 4, 2];
    for (const lvl of preferred) {
      const cost = { 2: 5, 4: 7, 6: 9 }[lvl as 2 | 4 | 6];
      if (buyer.potatoes >= cost) return buyDie(state, buyer.id, lvl);
    }
  }
  // 3. If all bought enough, optionally buy a 2nd die or finish
  // We let the human user click "Začít hru" — this returns null meaning AI is done.
  return null;
}

function pickStartingHex(state: GameState): Hex | null {
  // Prefer Hlína (dirt) or Záhon (bed) NOT adjacent to a live cat,
  // closest to nearest Devil (so AI can reach it).
  const devilHexes: Hex[] = [];
  state.board.forEach((c) => {
    if (c.type === 'devil') devilHexes.push(c.hex);
  });
  const candidates: { hex: Hex; score: number }[] = [];
  state.board.forEach((c) => {
    if (c.type === 'cat' || c.type === 'devil') return;
    // Skip if occupied by any vombat
    const occupied = state.players.some((p) => p.vombats.some((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r));
    if (occupied) return;
    const adjCat = hexNeighbors(c.hex).some((h) => {
      const nb = state.board.get(hexKey(h));
      return nb && nb.type === 'cat' && nb.catAlive;
    });
    let score = 0;
    if (c.type === 'dirt') score += 5;
    if (c.type === 'bed') score += 4;
    if (c.type === 'thorn') score += 3;
    if (adjCat) score -= 4;
    // Distance to nearest devil — closer is slightly better (we want path to devil)
    if (devilHexes.length > 0) {
      const minDist = Math.min(...devilHexes.map((d) => cubeDistance(c.hex, d)));
      score += Math.max(0, 6 - minDist);
    }
    candidates.push({ hex: c.hex, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.hex ?? null;
}

// -----------------------------------------------------------------------------
// IN-GAME STEP
// -----------------------------------------------------------------------------

export function aiStep(state: GameState): GameState | null {
  const p = currentPlayer(state);
  if (p.kind !== 'ai') return null;
  if (state.phase === 'game_over') return null;

  // Resolve pending choices first
  if (state.pendingChoice) {
    return aiResolvePending(state);
  }

  switch (state.phase) {
    case 'idle':
      return aiStartTurn(state);
    case 'rolled':
    case 'choose_action':
      return aiChooseAction(state);
    case 'devil_combat':
      return aiContinueDevilCombat(state);
    case 'using_field':
      // After Sprint move — try to use the field we moved onto
      return aiSprintField(state);
    default:
      return null;
  }
}

// ----- Pending choices ------------------------------------------------------

function aiResolvePending(state: GameState): GameState | null {
  const pc = state.pendingChoice;
  const p = currentPlayer(state);
  if (!pc) return null;

  if (pc.kind === 'attack_surrender') {
    if (p.potatoes > 0) return resolveAttackWithPotato(state);
    // Surrender lowest die
    const allDice: { loc: 'hand' | 'reserve'; idx: number; lvl: DiceLevel }[] = [
      ...p.hand.map((lvl, idx) => ({ loc: 'hand' as const, idx, lvl })),
      ...p.reserve.map((lvl, idx) => ({ loc: 'reserve' as const, idx, lvl })),
    ];
    if (allDice.length === 0) {
      // Nothing to surrender — engine should ignore but just clear choice
      // (this branch is unlikely)
      return null;
    }
    allDice.sort((a, b) => a.lvl - b.lvl);
    const pick = allDice[0];
    return resolveAttackWithDie(state, pick.loc, pick.idx);
  }

  if (pc.kind === 'select_dirt_action') {
    // Decide between plant / poop / learn / drill
    return aiChooseDirtAction(state, pc.hex);
  }

  if (pc.kind === 'pick_skill') {
    return aiPickSkill(state);
  }

  return null;
}

// ----- Start of turn --------------------------------------------------------

function aiStartTurn(state: GameState): GameState {
  const p = currentPlayer(state);
  // If adjacent to / on a devil AND have at least 3 dice AND already taken
  // some wounds, attempt combat. Otherwise, roll normally.
  const adjDevil = p.vombats.some((v) => canFightDevil(state, v.hex));
  const woundsTaken = WOUND_TYPES.filter((w) => state.devilWounds.woundsByPlayer[p.id][w] != null).length;
  const handReady = p.hand.length >= 3 || (p.hand.length >= 2 && woundsTaken >= 2);
  if (adjDevil && handReady && p.hand.length > 0) {
    return beginDevilCombat(state);
  }
  if (p.hand.length === 0) {
    // No dice → sleep to gain potato (or stay if also empty potatoes)
    return sleep(state, { kind: 'gain_potato' });
  }
  return rollDice(state);
}

// ----- After roll: pick best action ----------------------------------------

function aiChooseAction(state: GameState): GameState {
  const p = currentPlayer(state);
  const rollSum = (p.lastRoll || []).reduce((a, b) => a + b, 0);

  // Score all possible "use field" options
  const fieldOptions: { hex: Hex; score: number }[] = [];
  state.board.forEach((c) => {
    if (!canUseField(state, c.hex)) return;
    fieldOptions.push({ hex: c.hex, score: scoreUseField(c, p, state) });
  });
  fieldOptions.sort((a, b) => b.score - a.score);
  const bestField = fieldOptions[0] ?? null;

  // Score all possible move options
  const moveOptions: { vombatId: string; hex: Hex; score: number }[] = [];
  for (const v of p.vombats) {
    const targets = legalMoveTargets(state, v.hex);
    for (const t of targets) {
      const target = state.board.get(hexKey(t));
      if (!target) continue;
      moveOptions.push({ vombatId: v.id, hex: t, score: scoreMove(target, p, state) });
    }
  }
  moveOptions.sort((a, b) => b.score - a.score);
  const bestMove = moveOptions[0] ?? null;

  // Pick the best of field vs move; if both poor, sleep.
  const fieldScore = bestField ? bestField.score : -Infinity;
  const moveScore = bestMove ? bestMove.score : -Infinity;

  if (bestField && fieldScore >= 5 && fieldScore >= moveScore) {
    return useField(state, bestField.hex);
  }
  if (bestMove && moveScore >= 2) {
    return moveVombat(state, bestMove.vombatId, bestMove.hex);
  }
  // Fallback: sleep — gain potato is always useful
  return sleep(state, { kind: 'gain_potato' });
}

function scoreUseField(c: BoardCell, p: PlayerState, state: GameState): number {
  switch (c.type) {
    case 'thorn': {
      // Free die — high score unless we can't hold it
      const lvl = c.thornDieLevel;
      if (!lvl) return 0;
      // Higher die = better; +adjustment if we have room
      return 8 + lvl;
    }
    case 'tree': {
      // Eukalyptus — needed for learning skills. Big strategic value.
      return 10;
    }
    case 'bed': {
      // Carrot ramp — useful but not urgent
      return 6;
    }
    case 'dirt': {
      // Multi-purpose. Best when adjacent to many markers (Kakej big).
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker;
      }).length;
      return 5 + adj * 2 + p.carrotTrack;
    }
    case 'desert': {
      if (!p.skills.has('koupel')) return 0;
      return 5;
    }
    default:
      return 0;
  }
}

function scoreMove(target: BoardCell, p: PlayerState, state: GameState): number {
  // Bias toward fields we want to use; deprioritize wasted moves.
  let s = 0;
  if (target.type === 'devil') s += 12;
  if (target.type === 'thorn' && target.thornDieLevel) s += 5 + target.thornDieLevel;
  if (target.type === 'tree' && !target.marker) s += 6;
  if (target.type === 'dirt' && !target.marker) s += 4;
  if (target.type === 'bed' && !target.marker) s += 3;
  if (target.isTunnel) s += 1;
  // Prefer moves that bring us closer to a devil if we are far
  const devilHexes: Hex[] = [];
  state.board.forEach((c) => { if (c.type === 'devil') devilHexes.push(c.hex); });
  if (devilHexes.length > 0) {
    const dist = Math.min(...devilHexes.map((d) => cubeDistance(target.hex, d)));
    s += Math.max(0, 4 - dist);
  }
  return s;
}

// ----- Dirt sub-action choice ----------------------------------------------

function aiChooseDirtAction(state: GameState, hex: Hex): GameState {
  const p = currentPlayer(state);
  const cell = state.board.get(hexKey(hex));
  if (!cell) return state;
  // If lots of adjacent markers AND carrot track decent → Kakej (potential big die)
  const adj = hexNeighbors(hex).filter((h) => {
    const nb = state.board.get(hexKey(h));
    return nb && nb.marker;
  }).length;
  const score = p.carrotTrack + adj;
  if (score >= 3) return useField(state, hex, { dirtAction: 'poop' });
  // Else if no carrots planted yet → plant for ramp
  if (p.carrotTrack === 0) return useField(state, hex, { dirtAction: 'plant' });
  // Otherwise → poop for a small die
  return useField(state, hex, { dirtAction: 'poop' });
}

// ----- Skill picking (when AI is on the pick_skill modal) -------------------

function aiPickSkill(state: GameState): GameState | null {
  // AI shouldn't normally end up in pick_skill modal (we don't trigger 'learn'
  // dirt action). Just bail out to avoid lockup.
  return null;
}

// ----- Sprint after move ---------------------------------------------------

function aiSprintField(state: GameState): GameState {
  // Try to use the field the AI vombat is standing on
  const p = currentPlayer(state);
  for (const v of p.vombats) {
    if (canUseField(state, v.hex)) {
      return useField(state, v.hex);
    }
  }
  // Cannot use field — sleep to end turn
  return sleep(state, { kind: 'skip' });
}

// ----- Devil combat ---------------------------------------------------------

function aiContinueDevilCombat(state: GameState): GameState | null {
  const p = currentPlayer(state);
  if (!p.lastRoll || p.lastRoll.length === 0) {
    if (allWoundsTaken(state, p.id) && p.hand.length > 0) {
      return devilContinueRoll(state);
    }
    return devilStop(state);
  }
  // Find a die that can fill an open wound; prefer "10+" first as hardest.
  const woundOrder: WoundType[] = ['10+', '7+', '2', '1'];
  const taken = state.devilWounds.woundsByPlayer[p.id];
  for (const w of woundOrder) {
    if (taken[w] != null) continue;
    for (let i = 0; i < p.lastRoll.length; i++) {
      const val = p.lastRoll[i];
      const matches =
        (w === '1' && val === 1) ||
        (w === '2' && val === 2) ||
        (w === '7+' && val >= 7) ||
        (w === '10+' && val >= 10);
      if (matches) {
        return applyDevilWound(state, i, w);
      }
    }
  }
  // No die fits any open wound. Roll again with remaining (or fail).
  return devilContinueRoll(state);
}

// -----------------------------------------------------------------------------
// FINISH SETUP for AI side
// -----------------------------------------------------------------------------

// Convenience: when human ends shop, also forces finish if all bought
export { finishSetup };
