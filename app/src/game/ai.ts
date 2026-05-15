// =============================================================================
// Heuristic AI for Vombat — tuned via self-play
// =============================================================================
// One AI step = one engine action. The GameScreen useEffect calls aiStep
// repeatedly with a small delay, so the user can see each move.
//
// Strategy phases:
//   1. Get more dice from Houští (free k4/k6/k8)
//   2. Visit Eukalypty to claim trees (Obsaď)
//   3. Learn Žonglování/Zácpa first (1 tree each = capacity unlock)
//   4. Pump carrotTrack via Záhon/plant on Hlína
//   5. Use Kakej on Hlína with high score for big dice
//   6. Smash a Cat (11-14) for free 1k20 + tunnel
//   7. Once 5+ dice with at least one k10+ and adjacent to Devil → fight
// =============================================================================

import type { BoardCell, GameState, Hex, DiceLevel, PlayerState, SkillId, WoundType } from './types';
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
  learnSkill,
  SKILL_REQUIREMENTS,
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
  // 2. Buying logic: try to maximize dice count first (more flexibility),
  //    then upgrade existing dice if possible.
  const buyer = state.players.find((p) => p.kind === 'ai' && p.vombats.length > 0 && needsMoreDice(p));
  if (buyer) {
    const buy = pickStartingPurchase(buyer);
    if (buy != null) return buyDie(state, buyer.id, buy);
  }
  return null;
}

function needsMoreDice(p: PlayerState): boolean {
  // We want at least 1 die to start. Buy 2nd if budget allows.
  if (p.hand.length === 0) return p.potatoes >= 5;
  if (p.hand.length === 1) return p.potatoes >= 5;
  return false;
}

function pickStartingPurchase(p: PlayerState): DiceLevel | null {
  // Opening hand thinking:
  //   - Need to reach a 1k4-thorn (sum 5+) early for free die snowball.
  //   - 1k6 alone covers sum 1-6 — has 33% chance per roll of being 5+.
  //   - With 10 potatoes: buy 1k6 (9), save 1 potato.
  //   - Could alternatively buy 1k4 (7) and save 3 potatoes for kakej fuel.
  //   - 2 dice greatly increase reliability of high rolls; with 9 left after
  //     1k6, can't afford even a 1k2 (cost 5). But starting brambory of 10
  //     does allow 1k4 + small left over.
  if (p.hand.length === 0) {
    // First die. Prefer 1k6 for ceiling, fallback to 1k4 / k2.
    if (p.potatoes >= 9) return 6;
    if (p.potatoes >= 7) return 4;
    if (p.potatoes >= 5) return 2;
    return null;
  }
  // Second die — only if we can spare it AND already have a small die.
  // With 1k6 (9 spent, 1 left): can't buy anything.
  // With 1k4 (7 spent, 3 left): can't buy anything.
  // So this branch is mostly inactive in opening — kept for future tuning.
  if (p.potatoes >= 5) return 2;
  return null;
}

function pickStartingHex(state: GameState): Hex | null {
  // Prefer placement near a Houští (k4 ideally) for an early free die,
  // AND on/near a Hlína. Avoid adjacent live cats. Reasonable distance to Devil.
  const devilHexes: Hex[] = [];
  state.board.forEach((c) => {
    if (c.type === 'devil') devilHexes.push(c.hex);
  });
  const candidates: { hex: Hex; score: number }[] = [];
  state.board.forEach((c) => {
    if (c.type === 'cat' || c.type === 'devil') return;
    const occupied = state.players.some((p) => p.vombats.some((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r));
    if (occupied) return;
    let score = 0;
    // Cell type itself
    if (c.type === 'dirt') score += 6;
    if (c.type === 'bed') score += 3;
    if (c.type === 'thorn' && c.thornDieLevel === 4) score += 8; // standing on k4 thorn = great
    if (c.type === 'thorn' && c.thornDieLevel === 6) score += 4;
    if (c.type === 'thorn' && c.thornDieLevel === 8) score += 2;
    // Adjacency bonuses
    let adjCat = false;
    let adjBlockedThorn = 0;
    let adjUsefulThorn = 0;
    let adjDirt = 0;
    let adjTree = 0;
    hexNeighbors(c.hex).forEach((h) => {
      const nb = state.board.get(hexKey(h));
      if (!nb) return;
      if (nb.type === 'cat' && nb.catAlive) adjCat = true;
      if (nb.type === 'thorn' && nb.thornDieLevel) {
        adjBlockedThorn += 1;
        if (nb.thornDieLevel === 4) adjUsefulThorn += 1;
      }
      if (nb.type === 'dirt') adjDirt += 1;
      if (nb.type === 'tree') adjTree += 1;
    });
    if (adjCat) score -= 6;
    score += adjUsefulThorn * 5;  // k4 nearby is very useful
    score += adjDirt * 2;
    score += adjTree * 3;
    // Distance to nearest devil — neutral; we don't want to start too close
    if (devilHexes.length > 0) {
      const minDist = Math.min(...devilHexes.map((d) => cubeDistance(c.hex, d)));
      // sweet spot around dist 3-4
      score += Math.max(0, 4 - Math.abs(minDist - 3));
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
    const allDice: { loc: 'hand' | 'reserve'; idx: number; lvl: DiceLevel }[] = [
      ...p.hand.map((lvl, idx) => ({ loc: 'hand' as const, idx, lvl })),
      ...p.reserve.map((lvl, idx) => ({ loc: 'reserve' as const, idx, lvl })),
    ];
    if (allDice.length === 0) return null;
    allDice.sort((a, b) => a.lvl - b.lvl);
    const pick = allDice[0];
    return resolveAttackWithDie(state, pick.loc, pick.idx);
  }

  if (pc.kind === 'select_dirt_action') {
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

  // Only fight Devil if we have a strong hand AND are adjacent
  const adjDevil = p.vombats.some((v) => canFightDevil(state, v.hex));
  if (adjDevil && readyToFightDevil(state, p)) {
    return beginDevilCombat(state);
  }

  // No dice → sleep for potato (gain economy)
  if (p.hand.length === 0) {
    return sleep(state, { kind: 'gain_potato' });
  }
  return rollDice(state);
}

function readyToFightDevil(state: GameState, p: PlayerState): boolean {
  if (p.hand.length === 0) return false;
  const wounds = state.devilWounds.woundsByPlayer[p.id];
  const woundsTaken = WOUND_TYPES.filter((w) => wounds[w] != null).length;
  const remainingWounds = 4 - woundsTaken;
  const handMax = Math.max(...p.hand);
  const sumPotential = p.hand.reduce((a, lvl) => a + lvl, 0);

  // Final blow — all 4 wounds done; just need sum potential >= 25.
  if (woundsTaken === 4) return sumPotential >= 25;

  // Capability: must be able to hit each remaining wound type.
  if (wounds['10+'] == null && handMax < 10) return false;
  if (wounds['7+'] == null && handMax < 8) return false;

  // Hand size guard: each wound costs 1 die. Need ≥2 dice left for 25+ check.
  if (p.hand.length < remainingWounds + 2) return false;

  // Sum potential safety: total potential must comfortably exceed 25 + wound cost.
  // Estimate wound dice cost (avg): k4-k8 used for wounds ≈ 6 each. Remaining
  // sum ≈ sumPotential - 6 * remainingWounds. Want remaining >= 25.
  if (sumPotential < 25 + 6 * remainingWounds) return false;

  return true;
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

  // Pick the BEST overall. Sleep is fallback with a small baseline score.
  const fieldScore = bestField ? bestField.score : -Infinity;
  const moveScore = bestMove ? bestMove.score : -Infinity;
  const sleepScore = 0.5; // always available; very low priority

  if (bestField && fieldScore >= moveScore && fieldScore >= sleepScore) {
    return useField(state, bestField.hex);
  }
  if (bestMove && moveScore >= sleepScore) {
    return moveVombat(state, bestMove.vombatId, bestMove.hex);
  }
  return sleep(state, { kind: 'gain_potato' });
}

function scoreUseField(c: BoardCell, p: PlayerState, state: GameState): number {
  switch (c.type) {
    case 'thorn': {
      // Free die — VERY high priority (turns a turn into a permanent die)
      const lvl = c.thornDieLevel;
      if (!lvl) return 0;
      let base = 12 + lvl; // k4=16, k6=18, k8=20
      if (!canAddDieAnywhere(p, lvl as DiceLevel)) base -= 6;
      return base;
    }
    case 'tree': {
      // Trees are strategic capital. Each tree unlocks more skill options.
      return 14 - p.bobekTrack * 2; // first tree most valuable, plateau later
    }
    case 'bed': {
      // Carrot ramp — useful when ramping for Kakej
      return p.carrotTrack < 4 ? 7 : 4;
    }
    case 'dirt': {
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker;
      }).length;
      // Learning a skill we don't have is high-priority strategic move
      const couldLearn = bestAffordableSkill(p) != null;
      const learnScore = couldLearn ? 13 : 0;
      // Kakej score: bigger is better
      const kakejScore = 6 + adj * 2 + Math.min(p.carrotTrack, 4);
      // Plant early when carrot track low
      const plantScore = p.carrotTrack < 2 ? 7 : 0;
      return Math.max(learnScore, kakejScore, plantScore);
    }
    case 'desert': {
      if (!p.skills.has('koupel')) return 0;
      // Same as dirt-style scoring but bare
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker;
      }).length;
      const couldLearn = bestAffordableSkill(p) != null;
      const learnScore = couldLearn ? 13 : 0;
      return Math.max(learnScore, 6 + adj * 2);
    }
    default:
      return 0;
  }
}

function canAddDieAnywhere(p: PlayerState, lvl: DiceLevel): boolean {
  const handLimit = p.skills.has('zonglovani') || p.hand.filter((d) => d === lvl).length < 2;
  const reserveLimit = p.skills.has('zacpa') || p.reserve.length < 3;
  return handLimit || reserveLimit;
}

function scoreMove(target: BoardCell, p: PlayerState, state: GameState): number {
  let s = 0;
  // Cat-smash is a HUGE jackpot (free 1k20 + opens tunnel)
  if (target.type === 'cat' && target.catAlive) return 40;
  // Move onto Devil only matters when ready to fight (caller checks that;
  // moving here mostly to position for next-turn fight)
  if (target.type === 'devil') {
    if (readyToFightDevil(state, p)) s += 15; // strong incentive to position
    else s += 2;
  }
  if (target.type === 'tree' && !target.marker) s += 7;
  if (target.type === 'dirt' && !target.marker) s += 4;
  if (target.type === 'bed' && !target.marker) s += 3;
  if (target.type === 'thorn' && !target.thornDieLevel) s += 2;
  if (target.type === 'desert' && p.skills.has('koupel') && !target.marker) s += 4;
  if (target.isTunnel) s += 1;
  // Distance heuristic — proximity to useful hexes OTHER THAN the target.
  const usefulHexes: Hex[] = [];
  state.board.forEach((c) => {
    if (c.marker) return;
    if (c.hex.q === target.hex.q && c.hex.r === target.hex.r) return;
    if (c.type === 'thorn' && c.thornDieLevel) usefulHexes.push(c.hex);
    if (c.type === 'tree') usefulHexes.push(c.hex);
    if (c.type === 'dirt') usefulHexes.push(c.hex);
    // also live cats — moving toward them is good for future smashing
    if (c.type === 'cat' && c.catAlive) usefulHexes.push(c.hex);
  });
  if (usefulHexes.length > 0) {
    const minDist = Math.min(...usefulHexes.map((u) => cubeDistance(target.hex, u)));
    s += Math.max(0, 2 - minDist);
  }
  return s;
}

// ----- Dirt sub-action choice ----------------------------------------------

function aiChooseDirtAction(state: GameState, hex: Hex): GameState {
  const p = currentPlayer(state);
  const cell = state.board.get(hexKey(hex));
  if (!cell) return state;
  // Priority 1: Learn a skill if we can afford one and don't have it
  const skill = bestAffordableSkill(p);
  if (skill) {
    return useField(state, hex, { dirtAction: 'learn' });
  }
  // Priority 2: Kakej if score is meaningful
  const adj = hexNeighbors(hex).filter((h) => {
    const nb = state.board.get(hexKey(h));
    return nb && nb.marker;
  }).length;
  const kakejScore = p.carrotTrack + adj;
  if (kakejScore >= 2) return useField(state, hex, { dirtAction: 'poop' });
  // Priority 3: Plant for carrot ramp if early game
  if (p.carrotTrack < 3) return useField(state, hex, { dirtAction: 'plant' });
  // Fallback: Kakej anyway
  return useField(state, hex, { dirtAction: 'poop' });
}

// ----- Skill picking --------------------------------------------------------

const SKILL_PRIORITY: SkillId[] = [
  'zonglovani',    // 1 tree, easy first pick
  'zacpa',         // 1 tree, second pick (capacity unlock)
  'sprint',        // 2 trees, movement boost
  'masaz_strev',   // 2 trees, dice upgrade
  'ajurveda',      // 3 trees, big upgrade
  'koupel',        // 2 trees, opens desert
  'klystyr',       // 2 trees, swap helper (least important in MVP)
];

function bestAffordableSkill(p: PlayerState): SkillId | null {
  for (const sid of SKILL_PRIORITY) {
    if (p.skills.has(sid)) continue;
    const req = SKILL_REQUIREMENTS[sid].trees;
    // Can afford via trees only, or trees + potato substitution (3 brambory = 1 strom)
    if (p.bobekTrack >= req) return sid;
    const missing = req - p.bobekTrack;
    if (p.potatoes >= missing * 3) return sid;
  }
  return null;
}

function aiPickSkill(state: GameState): GameState | null {
  const p = currentPlayer(state);
  const skill = bestAffordableSkill(p);
  if (!skill) {
    // Bail out: cancel learning by sleeping (defensive — shouldn't happen
    // if dirt action only picks 'learn' when affordable)
    return null;
  }
  const req = SKILL_REQUIREMENTS[skill].trees;
  const treesUsed = Math.min(p.bobekTrack, req);
  const missing = req - treesUsed;
  const potatoesUsed = missing * 3;
  return learnSkill(state, skill, treesUsed, potatoesUsed, []);
}

// ----- Sprint after move ---------------------------------------------------

function aiSprintField(state: GameState): GameState {
  const p = currentPlayer(state);
  for (const v of p.vombats) {
    if (canUseField(state, v.hex)) {
      return useField(state, v.hex);
    }
  }
  return sleep(state, { kind: 'skip' });
}

// ----- Devil combat ---------------------------------------------------------

function aiContinueDevilCombat(state: GameState): GameState | null {
  const p = currentPlayer(state);
  if (!p.lastRoll || p.lastRoll.length === 0) {
    if (allWoundsTaken(state, p.id) && p.hand.length > 0) return devilContinueRoll(state);
    return devilStop(state);
  }
  // Step 1: try to apply ONE wound this iteration (preference: cheapest die).
  const taken = state.devilWounds.woundsByPlayer[p.id];
  for (const w of ['1', '2', '7+', '10+'] as WoundType[]) {
    if (taken[w] != null) continue;
    const candidates: { idx: number; val: number; lvl: DiceLevel }[] = [];
    for (let i = 0; i < p.lastRoll.length; i++) {
      const val = p.lastRoll[i];
      const lvl = p.hand[i];
      const matches =
        (w === '1' && val === 1) ||
        (w === '2' && val === 2) ||
        (w === '7+' && val >= 7) ||
        (w === '10+' && val >= 10);
      if (matches) candidates.push({ idx: i, val, lvl });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.lvl - b.lvl);
    return applyDevilWound(state, candidates[0].idx, w);
  }

  // Step 2: no wound applicable in current roll. Decide: roll again or stop?
  if (allWoundsTaken(state, p.id)) {
    // All wounds done — going for 25+ blow.
    const currentSum = p.lastRoll.reduce((a, b) => a + b, 0);
    // The engine has an instant-win check in devilContinueRoll if current sum >= 25
    if (currentSum >= 25) return devilContinueRoll(state);
    // Else re-roll for 25+ if we have a reasonable shot
    const sumPotential = p.hand.reduce((a, lvl) => a + lvl, 0);
    if (sumPotential >= 25) return devilContinueRoll(state);
    return devilStop(state);
  }

  // Wounds remain but current roll missed all. Decide whether to re-roll.
  // Re-rolling risks the engine's "fail if no possible wound" check, which
  // would trigger an attack. Be conservative — preserve dice for next turn.
  const sumPotential = p.hand.reduce((a, lvl) => a + lvl, 0);
  const handMax = Math.max(...p.hand);
  const remainingWoundList = WOUND_TYPES.filter((w) => taken[w] == null);
  const canStillHitAll = remainingWoundList.every((w) => {
    if (w === '1' || w === '2') return true;
    if (w === '7+') return handMax >= 8;
    if (w === '10+') return handMax >= 10;
    return false;
  });
  if (!canStillHitAll) {
    // Some wounds we can never hit with current hand — stop.
    return devilStop(state);
  }
  // If we have a strong-enough hand to re-roll, do it. Else stop.
  if (p.hand.length >= 4 && sumPotential >= 25) return devilContinueRoll(state);
  return devilStop(state);
}

// -----------------------------------------------------------------------------

export { finishSetup };
