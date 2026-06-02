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
import { pSumInRange, pSumLessThan } from './probabilities';
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
  preRollSwap,
  preRollSwapsRemaining,
  skipRollForPotatoes,
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
  // Just one starting die. Cost up to 9 (1k6).
  return p.hand.length === 0 && p.potatoes >= 5;
}

function pickStartingPurchase(p: PlayerState): DiceLevel | null {
  // Opening hand:
  //   - 1× k6 covers sum 1-6 → reaches Hlína (2-4), Záhon (4-6), and even
  //     k4-Houští use (5+). Best single-die flexibility.
  //   - 2× k2 reliably hits 2-4 but only ever activates Hlína — too narrow.
  //   - 1× k4 leaves 3 brambory but range is shorter than k6.
  if (p.hand.length === 0) {
    if (p.potatoes >= 9) return 6;
    if (p.potatoes >= 7) return 4;
    if (p.potatoes >= 5) return 2;
    return null;
  }
  return null;
}

function pickStartingHex(state: GameState): Hex | null {
  // STRATEGY (revised): maximize early carrot-ramp potential.
  //   - Standing on Hlína / Záhon is best (immediate Plant target).
  //   - Many adjacent Hlína + Záhon hexes is what matters most — you'll
  //     plant for many turns and Kakej with adjacency bonus.
  //   - Distance to Devil is IRRELEVANT in early game (you don't rush there).
  //   - Avoid adjacent live cats (attack risk).
  //   - K4 thorn nearby is a small bonus (free early die if luck).
  const candidates: { hex: Hex; score: number }[] = [];
  state.board.forEach((c) => {
    if (c.type === 'cat' || c.type === 'devil') return;
    const occupied = state.players.some((p) => p.vombats.some((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r));
    if (occupied) return;
    let score = 0;
    // Standing cell:
    if (c.type === 'dirt') score += 8;
    if (c.type === 'bed') score += 5;
    if (c.type === 'thorn' && c.thornDieLevel === 4) score += 4;
    // Adjacency:
    let adjCat = false;
    let adjUsefulThorn = 0;
    let adjDirt = 0;
    let adjBed = 0;
    let adjTree = 0;
    hexNeighbors(c.hex).forEach((h) => {
      const nb = state.board.get(hexKey(h));
      if (!nb) return;
      if (nb.type === 'cat' && nb.catAlive) adjCat = true;
      if (nb.type === 'thorn' && nb.thornDieLevel === 4) adjUsefulThorn += 1;
      if (nb.type === 'dirt') adjDirt += 1;
      if (nb.type === 'bed') adjBed += 1;
      if (nb.type === 'tree') adjTree += 1;
    });
    if (adjCat) score -= 6;
    // Hlína + Záhon adjacency is HEAVILY weighted — that's where the
    // early-game carrot ramp + Kakej dice come from.
    score += adjDirt * 4;
    score += adjBed * 3;
    score += adjTree * 2;       // useful eventually but not in carrot ramp
    score += adjUsefulThorn * 2; // small bonus, not critical
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

  if (pc.kind === 'select_tree_action') {
    // CRITICAL: when this choice opens, the tree HASN'T been claimed yet —
    // p.bobekTrack is still the pre-occupy count. We must check skill
    // affordability AS IF the +1 tree from this very occupy is already in.
    // Otherwise the AI takes a tree but never claims the once-per-game
    // "Obsaď + Uč se" bonus even when it could have learned for free.
    const action = bestAffordableSkill(p, 1) ? 'occupy_and_learn' : 'occupy';
    return useField(state, pc.hex, { treeAction: action });
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

  // No dice → sleep (buy a skill if we can, else gain potato)
  if (p.hand.length === 0) {
    return aiSleep(state);
  }

  // PRE-ROLL SWAP (Třídění): if we have spare swaps and Hand is bloated
  // (avg > 5 = mostly big dice that miss Hlína/Záhon activations), unload
  // 1 big die to Reserve. Returns one swap op; aiStep is called again and
  // can choose to swap more if useful.
  if (preRollSwapsRemaining(state) > 0) {
    const op = pickPreRollSwap(state, p);
    if (op) return preRollSwap(state, op);
  }

  // SKIP-ROLL DECISION: after pre-roll swaps are settled, evaluate whether
  // rolling is worth it. If expected value from rolling is much lower than
  // the guaranteed value of 2 brambor, take brambor.
  //
  // CRITICAL guard: brambor accumulation must have a cap, otherwise AI in
  // a "bad position" (e.g., Vombat surrounded by own markers, hand mismatch)
  // would loop on skip forever — situation never changes. We cap at
  // POTATO_CAP. Beyond that, AI must roll even with poor odds.
  //
  // Threshold tuning: 2 brambor ≈ 3-4 score units (5 🥔 = skill). We pick
  // 3.0 to be conservative — only skip when roll is clearly bad.
  const POTATO_CAP = 8;
  const SKIP_THRESHOLD = 3.0;
  if (p.hand.length > 0 && p.potatoes < POTATO_CAP) {
    const targets = computeSwapTargets(state, p);
    if (targets.length > 0) {
      const catThreat = p.vombats.some((v) =>
        hexNeighbors(v.hex).some((h) => {
          const c = state.board.get(hexKey(h));
          return !!c && c.type === 'cat' && c.catAlive;
        }),
      );
      const rollScore = scoreHandForTurn(p.hand, targets, catThreat);
      if (rollScore < SKIP_THRESHOLD) {
        return skipRollForPotatoes(state);
      }
    }
  }

  return rollDice(state);
}

// =============================================================================
// PROBABILITY-DRIVEN PRE-ROLL SWAP
// =============================================================================
// Given the player's Hand, Reserve, and adjacent map situation, find the swap
// that maximizes expected payoff from this turn's roll.
//
// Algorithm:
//   1. Build a list of weighted activation TARGETS from cells the player could
//      reach this turn (stand-on + adjacent), each with [min, max] sum range
//      and a weight reflecting "how much I want to hit this".
//   2. Score a candidate Hand by SUM over targets of P(sum ∈ range) × weight,
//      minus a cat-attack risk penalty.
//   3. Enumerate single-swap candidates (no-op, every hand→reserve, every
//      reserve→hand), pick the swap with the highest score gain over baseline.
//
// The math itself lives in probabilities.ts; this function is the strategy
// layer that turns board state into a search problem.

interface SwapTarget {
  min: number;
  max: number;
  weight: number;
  /** debug-only label */
  label: string;
}

// Build the list of activation targets the player could meaningfully act on
// this turn. We include both movement targets (sum lands in cell's move range)
// and use-field targets (cell adjacent to a vombat, not yet used by us).
function computeSwapTargets(state: GameState, p: PlayerState): SwapTarget[] {
  const targets: SwapTarget[] = [];
  const seen = new Set<string>(); // dedupe per-hex

  function add(hex: Hex, range: { min: number; max: number }, weight: number, label: string) {
    const k = `${hex.q},${hex.r}|${range.min}-${range.max}|${label}`;
    if (seen.has(k)) return;
    seen.add(k);
    targets.push({ ...range, weight, label });
  }

  const adjDevilReady = readyToFightDevil(state, p);

  for (const v of p.vombats) {
    // Standing cell — use-field possibilities
    const standCell = state.board.get(hexKey(v.hex));
    if (standCell) addCellTargets(state, p, standCell, add, adjDevilReady);

    // Adjacent cells — movement + use-field
    for (const nbHex of hexNeighbors(v.hex)) {
      const cell = state.board.get(hexKey(nbHex));
      if (!cell) continue;
      addCellTargets(state, p, cell, add, adjDevilReady);
    }
  }

  return targets;
}

// Add per-cell targets (one for "useful as move target" and/or "useful as use target")
function addCellTargets(
  state: GameState,
  p: PlayerState,
  cell: BoardCell,
  add: (hex: Hex, range: { min: number; max: number }, weight: number, label: string) => void,
  adjDevilReady: boolean,
) {
  // Movement target (cell type's activation range, if accessible)
  const moveRange = movementRangeFor(cell, p);
  if (moveRange) {
    const moveW = movementWeight(cell, p, state, adjDevilReady);
    if (moveW > 0) add(cell.hex, moveRange, moveW, `move-${cell.type}`);
  }

  // Use-field target (only if we can use it — not marked by us, etc.)
  // We approximate canUseField without re-checking the actual roll; just
  // check ownership and basic eligibility.
  if (canPlayerUseFieldType(state, p, cell)) {
    const useRange = useFieldRangeFor(cell, p);
    if (useRange) {
      const useW = useFieldWeight(cell, p, state);
      if (useW > 0) add(cell.hex, useRange, useW, `use-${cell.type}`);
    }
  }
}

// Movement activation range for moving ONTO this cell. Null if not a valid
// move target (e.g. occupied by our vombat, blocked thorn, etc.).
function movementRangeFor(cell: BoardCell, p: PlayerState): { min: number; max: number } | null {
  // Can't move onto our own vombat
  if (p.vombats.some((v) => v.hex.q === cell.hex.q && v.hex.r === cell.hex.r)) return null;
  // Blocked thorn (still has a die)
  if (cell.type === 'thorn' && cell.thornDieLevel != null && !cell.marker) return null;
  switch (cell.type) {
    case 'dirt':   return { min: 2, max: 4 };
    case 'bed':    return { min: 4, max: 6 };
    case 'desert': return { min: 7, max: 99 };
    case 'tree':   return { min: 7, max: 8 };
    case 'thorn':  return { min: 5, max: 9 };
    case 'cat':    return cell.catAlive ? { min: 11, max: 14 } : { min: 0, max: 99 };
    case 'devil':  return { min: 12, max: 99 };
  }
}

// Use-field activation range. Null if we can't use this cell type as an action.
function useFieldRangeFor(cell: BoardCell, p: PlayerState): { min: number; max: number } | null {
  switch (cell.type) {
    case 'dirt':   return { min: 2, max: 4 };
    case 'bed':    return { min: 4, max: 6 };
    case 'desert': return p.skills.has('koupel') ? { min: 7, max: 99 } : null;
    case 'tree':   return { min: 7, max: 8 };
    case 'thorn': {
      if (!cell.thornDieLevel) return null;
      const need = cell.thornDieLevel === 4 ? 5 : cell.thornDieLevel === 6 ? 7 : 9;
      return { min: need, max: 99 };
    }
    case 'cat':
    case 'devil':
      return null;
  }
}

// Whether the player COULD use this field (ignoring roll). Used to filter out
// fields already marked by us.
function canPlayerUseFieldType(_state: GameState, p: PlayerState, cell: BoardCell): boolean {
  if (cell.marker && cell.marker.playerId === p.id) return false;
  if (cell.marker && cell.type !== 'bed' && cell.type !== 'tree' && cell.type !== 'dirt') return false;
  if (cell.type === 'cat' || cell.type === 'devil') return false;
  if (cell.type === 'desert' && !p.skills.has('koupel')) return false;
  if (cell.type === 'thorn' && cell.thornDieLevel == null) return false;
  return true;
}

// Weight for "I want to move onto this cell this turn".
function movementWeight(cell: BoardCell, p: PlayerState, _state: GameState, devilReady: boolean): number {
  if (cell.type === 'cat' && cell.catAlive) {
    // Cat smash: 1k8 + tunnel + milestone Lázně (if first)
    const milestoneBonus = !p.skills.has('koupel') ? 10 : 0;
    return 18 + milestoneBonus;
  }
  if (cell.type === 'devil') return devilReady ? 30 : 2;
  if (cell.marker) return 1; // already used by someone — low value to walk onto
  if (cell.type === 'tree') return 8;
  if (cell.type === 'dirt') return 6;
  if (cell.type === 'bed') return 6;
  if (cell.type === 'thorn' && cell.thornDieLevel == null) return 3; // open thorn — pass-through
  return 2;
}

// Weight for "I want to USE this field this turn".
function useFieldWeight(cell: BoardCell, p: PlayerState, state: GameState): number {
  if (cell.type === 'thorn' && cell.thornDieLevel) {
    // Free die — high value
    if (!canAddDieAnywhere(p, cell.thornDieLevel as DiceLevel)) return 8;
    return 14 + cell.thornDieLevel; // k4=18, k6=20, k8=22
  }
  if (cell.type === 'tree') return 12 - p.bobekTrack; // first trees most valuable
  if (cell.type === 'dirt' || cell.type === 'desert') {
    // Vyformuj kostku score depends on carrots + opponent-adjacent markers
    const adjOpp = hexNeighbors(cell.hex).filter((h) => {
      const nb = state.board.get(hexKey(h));
      return nb && nb.marker && nb.marker.playerId !== p.id;
    }).length;
    const score = p.carrotTrack + adjOpp;
    if (score >= 6) return 16; // k12+
    if (score >= 4) return 12; // k8/k10
    if (score >= 2) return 8;  // k4/k6
    if (bestAffordableSkill(p) != null) return 14; // could learn skill instead
    return 4; // plant for ramp
  }
  if (cell.type === 'bed') return p.carrotTrack < 5 ? 10 : 3;
  return 0;
}

// Score a hand against weighted targets.
//   score = Σ over targets: P(sum ∈ [min,max]) × weight
//        − cat-attack risk penalty if adjacent to live cat
function scoreHandForTurn(
  hand: DiceLevel[],
  targets: SwapTarget[],
  catThreatNearby: boolean,
): number {
  if (hand.length === 0) return 0; // empty hand rolls 0 — can't do anything
  let s = 0;
  for (const t of targets) {
    s += pSumInRange(hand, t.min, t.max) * t.weight;
  }
  // Penalty for rolling < 5 next to a live cat (forced potato/die surrender)
  if (catThreatNearby) {
    s -= pSumLessThan(hand, 5) * 15;
  }
  return s;
}

// Pick the best single pre-roll swap (or null if no swap improves the hand).
// Considers: no-op, every hand→reserve, every reserve→hand.
function pickPreRollSwap(state: GameState, p: PlayerState): import('./engine').SwapOp | null {
  if (p.hand.length === 0 && p.reserve.length === 0) return null;

  // PRIORITY 1: if adjacent to a Devil and we are NOT currently fight-ready,
  // check whether a reserve→hand swap would make us ready. The probability
  // scoring (PRIORITY 2 below) tends to undervalue this — devil weight is
  // capped low when not ready, so the heuristic prefers tuning small dice
  // for nearby Hlína/Záhon instead of pulling a k10+ for the kill.
  //
  // This was observed in real gameplay: AI sat next to Devil with k12 in
  // Reserve and small dice in Hand — readyToFightDevil(false), heuristic
  // didn't pull k12 → AI rolled, used field, never attacked.
  const adjDevil = p.vombats.some((v) => canFightDevil(state, v.hex));
  if (adjDevil && !readyToFightDevil(state, p)) {
    for (let i = 0; i < p.reserve.length; i++) {
      const lvl = p.reserve[i];
      // Must fit in Hand under capacity rules
      if (!p.skills.has('kapacita') && p.hand.filter((d) => d === lvl).length >= 2) continue;
      const newHand: DiceLevel[] = [...p.hand, lvl];
      const newP: PlayerState = { ...p, hand: newHand };
      if (readyToFightDevil(state, newP)) {
        return { op: 'reserve_to_hand', index: i };
      }
    }
  }

  const targets = computeSwapTargets(state, p);
  if (targets.length === 0) return null;

  const catThreatNearby = p.vombats.some((v) =>
    hexNeighbors(v.hex).some((h) => {
      const c = state.board.get(hexKey(h));
      return !!c && c.type === 'cat' && c.catAlive;
    }),
  );

  const baseline = scoreHandForTurn(p.hand, targets, catThreatNearby);
  let bestOp: import('./engine').SwapOp | null = null;
  let bestScore = baseline;
  // Require a minimum improvement to avoid infinite swap loops on ties.
  const EPSILON = 0.05;

  // Candidate: hand → reserve (stash one)
  for (let i = 0; i < p.hand.length; i++) {
    if (!p.skills.has('kapacita') && p.reserve.length >= 3) break;
    const candidate = p.hand.filter((_, idx) => idx !== i);
    const score = scoreHandForTurn(candidate, targets, catThreatNearby);
    if (score > bestScore + EPSILON) {
      bestScore = score;
      bestOp = { op: 'hand_to_reserve', index: i };
    }
  }

  // Candidate: reserve → hand (draw one)
  for (let i = 0; i < p.reserve.length; i++) {
    const lvl = p.reserve[i];
    if (!p.skills.has('kapacita') && p.hand.filter((d) => d === lvl).length >= 2) continue;
    const candidate = [...p.hand, lvl];
    const score = scoreHandForTurn(candidate, targets, catThreatNearby);
    if (score > bestScore + EPSILON) {
      bestScore = score;
      bestOp = { op: 'reserve_to_hand', index: i };
    }
  }

  return bestOp;
}

function readyToFightDevil(state: GameState, p: PlayerState): boolean {
  if (p.hand.length === 0) return false;
  const wounds = state.devilWounds.woundsByPlayer[p.id];
  const woundsTaken = WOUND_TYPES.filter((w) => wounds[w] != null).length;
  const remainingWounds = 4 - woundsTaken;
  const handMax = Math.max(...p.hand);
  const sumPotential = p.hand.reduce((a, lvl) => a + lvl, 0);

  // Opponent-aware: if no opponent looks close to winning, we can be more
  // patient and accumulate a stronger hand. Specifically: if opponent has
  // ≤ 1 wound on their Devil AND a weak hand (max die < 10), we raise our
  // own readiness bar (require bigger sumPotential).
  const opponents = state.players.filter((pp) => pp.id !== p.id);
  const opponentClose = opponents.some((opp) => {
    const oWounds = state.devilWounds.woundsByPlayer[opp.id];
    const oWoundsTaken = WOUND_TYPES.filter((w) => oWounds[w] != null).length;
    const oHandMax = opp.hand.length ? Math.max(...opp.hand) : 0;
    return oWoundsTaken >= 2 || (oWoundsTaken >= 1 && oHandMax >= 10);
  });
  // Reduced from 8 to 4: AI was too conservative — sat next to Devil with
  // 10 dice but didn't attack because sumPotential was ~57 (need 25+24+8=57+).
  const patienceBoost = opponentClose ? 0 : 4;

  // Final blow — all 4 wounds done; we just need to ROLL 25+ in one shot.
  // sumPotential is the MAX possible sum; avg roll is sumPotential/2.
  // Require sumPotential >= 32 (or 40 if opponent is far behind).
  if (woundsTaken === 4) return sumPotential >= 32 + patienceBoost;

  // Capability: must be able to hit each remaining wound type.
  if (wounds['10+'] == null && handMax < 10) return false;
  if (wounds['7+'] == null && handMax < 8) return false;

  // Hand size guard: each wound costs 1 die. Need ≥2 dice left for 25+ check.
  if (p.hand.length < remainingWounds + 2) return false;

  // Sum potential safety: total potential must comfortably exceed 25 + wound cost.
  // Estimate wound dice cost (avg): k4-k8 used for wounds ≈ 6 each. Remaining
  // sum ≈ sumPotential - 6 * remainingWounds. Want remaining >= 25.
  // Plus patience boost when opponent is far behind.
  if (sumPotential < 25 + 6 * remainingWounds + patienceBoost) return false;

  return true;
}

// ----- After roll: pick best action ----------------------------------------

// Recursion guard: while a lookahead simulation runs aiStep internally for
// the OPPONENT, we must avoid recursively calling lookahead on every
// nested choice — that would blow up exponentially.
let lookaheadInProgress = false;

function aiChooseAction(state: GameState): GameState {
  const p = currentPlayer(state);

  // Generate candidate actions with heuristic scores.
  type Candidate = { name: string; heur: number; apply: () => GameState };
  const candidates: Candidate[] = [];

  state.board.forEach((c) => {
    if (!canUseField(state, c.hex)) return;
    candidates.push({
      name: `use ${c.type}`,
      heur: scoreUseField(c, p, state),
      apply: () => useField(state, c.hex),
    });
  });

  for (const v of p.vombats) {
    const targets = legalMoveTargets(state, v.hex);
    for (const t of targets) {
      const target = state.board.get(hexKey(t));
      if (!target) continue;
      candidates.push({
        name: `move ${target.type}`,
        heur: scoreMove(target, p, state),
        apply: () => moveVombat(state, v.id, t),
      });
    }
  }

  candidates.push({ name: 'sleep', heur: 0.5, apply: () => aiSleep(state) });

  if (candidates.length === 0) return aiSleep(state);

  // Fast path: if we're already inside a lookahead simulation, just pick
  // the heuristic top — no recursion.
  if (lookaheadInProgress) {
    candidates.sort((a, b) => b.heur - a.heur);
    let pick: GameState = state;
    for (const c of candidates) {
      const next = c.apply();
      if (next !== state) { pick = next; break; }
    }
    return pick;
  }

  // MONTE-CARLO LOOKAHEAD (own-turns only, opponent ignored):
  //   For each of top-K candidates by heuristic, run MC_SAMPLES simulations,
  //   each with FRESH random rolls (makeRNG() defaults to Math.random for seed).
  //   Average the resulting stateValue. Average reduces variance — single-
  //   sample lookahead was prone to "unlucky-roll dismisses good action" and
  //   "lucky-roll overrates bad action" errors.
  //
  // Per sample:
  //   1. Apply my action (deterministic)
  //   2. Resolve sub-pendingChoice (dirt action, skill pick, …)
  //   3. For next K turns: skip opponent's turn, simulate my turn greedily
  //   4. Score resulting state from MY POV
  //
  // Performance: 10 samples × ~1ms per lookahead ≈ 10ms per AI decision.
  // Invisible in UI (700ms tick); for headless sim, ~3-4× slower (acceptable).
  const K = 6;
  const MY_TURN_LOOKAHEAD = 3; // how many of my own turns to roll forward
  const MC_SAMPLES = 10; // Monte Carlo samples per candidate
  candidates.sort((a, b) => b.heur - a.heur);
  const top = candidates.slice(0, K);

  let bestVal = -Infinity;
  let bestState: GameState = state;
  const myIdx = state.players.findIndex((pp) => pp.id === p.id);

  lookaheadInProgress = true;
  try {
    for (const cand of top) {
      // The deterministic "immediate" state we'd return if we pick this
      // candidate. Computed once; randomness only kicks in during the
      // subsequent simulation of my own turns.
      const firstApply = cand.apply();
      if (firstApply === state) continue;
      const immediate = resolvePendingChoicesForLookahead(firstApply, p.id);

      let totalSimValue = 0;
      let validSamples = 0;

      for (let sample = 0; sample < MC_SAMPLES; sample++) {
        // Re-apply for each sample so any in-place mutations inside the
        // simulation don't bleed across samples. (cloneState in engine
        // calls already ensures functional purity, but this is a belt-
        // and-suspenders guard against subtle bugs.)
        const reapplied = cand.apply();
        if (reapplied === state) continue;
        const sampleImmediate = resolvePendingChoicesForLookahead(reapplied, p.id);

        let simState = sampleImmediate;
        for (let turn = 1; turn < MY_TURN_LOOKAHEAD && simState.phase !== 'game_over'; turn++) {
          simState = skipOpponentToMyTurn(simState, myIdx);
          simState = simulateOneMyTurn(simState, myIdx);
        }
        totalSimValue += stateValue(simState, p.id);
        validSamples++;
      }

      if (validSamples === 0) continue;
      const avgSimValue = totalSimValue / validSamples;
      const v = cand.heur * 1.5 + avgSimValue;
      if (v > bestVal) {
        bestVal = v;
        bestState = immediate;
      }
    }
  } finally {
    lookaheadInProgress = false;
  }

  return bestState;
}

// Force-skip opponents until it's our turn again (idle phase).
// Each opponent gets a no-op sleep-skip — we don't model their decisions.
function skipOpponentToMyTurn(state: GameState, myIdx: number, maxSkips: number = 4): GameState {
  let s = state;
  for (let i = 0; i < maxSkips; i++) {
    if (s.phase === 'game_over') return s;
    if (s.currentPlayerIdx === myIdx && s.phase === 'idle') return s;
    // Try to end opponent's turn cleanly
    try {
      const next = sleep(s, { kind: 'skip' });
      if (next === s) break;
      s = next;
    } catch {
      break;
    }
  }
  return s;
}

// Run one of MY turns greedily (idle → roll → choose action → resolve).
// Uses the fast/heuristic path (lookaheadInProgress is set by caller).
function simulateOneMyTurn(state: GameState, myIdx: number, maxSteps: number = 10): GameState {
  let s = state;
  for (let i = 0; i < maxSteps; i++) {
    if (s.phase === 'game_over') return s;
    if (s.currentPlayerIdx !== myIdx) return s; // we've handed off
    const next = aiStep(s);
    if (!next || next === s) return s;
    s = next;
  }
  return s;
}

// Resolve any cascading pending sub-choices while still our turn.
// Used inside lookahead so we score the FINAL state after sub-decisions
// (e.g. picking dirt action + skill).
function resolvePendingChoicesForLookahead(state: GameState, myId: string): GameState {
  let s = state;
  for (let i = 0; i < 12; i++) {
    if (s.phase === 'game_over') return s;
    if (!s.pendingChoice) return s;
    const pc = s.pendingChoice as any;
    if (pc.playerId && pc.playerId !== myId) return s;
    const next = aiResolvePending(s);
    if (!next || next === s) return s;
    s = next;
  }
  return s;
}

// Score a game state from a player's perspective. Higher = better.
// Used for 1-step lookahead in aiChooseAction.
//
// Calibration philosophy: rewards align with what makes you win, not what
// "looks pretty". Wounds dominate, dice quality matters a lot, skills are
// only valued for their gameplay enablement (small reward).
function stateValue(state: GameState, myId: string): number {
  if (state.winnerId === myId) return 100000;
  if (state.winnerId && state.winnerId !== myId) return -10000;
  const p = state.players.find((pp) => pp.id === myId);
  if (!p) return 0;

  const wounds = state.devilWounds.woundsByPlayer[myId];
  const woundsTaken = WOUND_TYPES.filter((w) => wounds[w] != null).length;

  let v = 0;
  // Wounds dominate — biggest step toward winning.
  v += woundsTaken * 200;
  // Skills: zero in state value. Their benefit shows up through gameplay
  // (canAddDieToHand, devil-fight readiness). Adding bonus causes AI to
  // farm skills instead of progressing.
  // v += p.skills.size * 0;
  v += p.bobekTrack * 4;
  v += p.carrotTrack * 5;
  v += p.potatoes * 0.15;

  const allDice = [...p.hand, ...p.reserve];
  // Sum of die levels — dice are what fight Devil
  v += allDice.reduce((s, d) => s + d, 0) * 3;
  v += p.hand.length * 1;
  // Reserve dice less valuable than Hand (need to swap)
  v += p.reserve.length * 0.5;
  v += p.pendingDice.reduce((s, d) => s + d, 0) * 0.5; // partial credit

  // Position bonus: when combat-ready, being close to Devil is good
  const handMax = p.hand.length ? Math.max(...p.hand) : 0;
  if (woundsTaken < 4 && allDice.length >= 4 && handMax >= 10) {
    const devilHexes: Hex[] = [];
    state.board.forEach((c) => { if (c.type === 'devil') devilHexes.push(c.hex); });
    let minDist = Infinity;
    for (const vh of p.vombats) {
      for (const dh of devilHexes) {
        const d = cubeDistance(vh.hex, dh);
        if (d < minDist) minDist = d;
      }
    }
    if (minDist < Infinity) v += Math.max(0, 30 - minDist * 5);
  }

  return v;
}

// Smarter Sleep choice: useful Sleep actions (Sleep shop byl odstraněn).
function aiSleep(state: GameState): GameState {
  const p = currentPlayer(state);

  const adjDevil = p.vombats.some((v) => canFightDevil(state, v.hex));
  const ready = readyToFightDevil(state, p);

  // Priority 2: EMERGENCY — Hand empty but Reserve has dice. Pull one out.
  // Without this AI can't roll → eternal sleep loop.
  if (p.hand.length === 0 && p.reserve.length > 0) {
    return sleep(state, {
      kind: 'swap',
      ops: [{ op: 'reserve_to_hand', index: 0 }],
    });
  }

  // Priority 3: BOJ PREP — at Devil and need bigger hand → pull big dice
  // from Reserve into Hand.
  if (adjDevil && p.reserve.length > 0) {
    const reserveBigIdx = p.reserve.findIndex((d) => d >= 8);
    if (reserveBigIdx >= 0) {
      const lvl = p.reserve[reserveBigIdx];
      const canAdd = p.skills.has('kapacita') || p.hand.filter((d) => d === lvl).length < 2;
      if (canAdd) {
        return sleep(state, {
          kind: 'swap',
          ops: [{ op: 'reserve_to_hand', index: reserveBigIdx }],
        });
      }
    }
  }

  // Priority 4: ANTI-STALL — stash big dice when Hand is bloated.
  // Bloated = avg level > 4 (mostly k6/k8/k10/k12/k20) → most rolls go
  // out of range for low-activation fields where we'd build resources.
  if (!ready) {
    const stashOps = computeStashBigDice(p);
    if (stashOps.length > 0) {
      return sleep(state, { kind: 'swap', ops: stashOps });
    }
  }

  // Fallback: gain potato
  return sleep(state, { kind: 'gain_potato' });
}

// Stash big-ish dice from Hand to Reserve when Hand is bloated.
//   - "Bloated" = avg level >= 5 (mostly k6/k8/k10+)
//   - We stash dice ≥ 6 (anything big enough to push avg over target)
//   - Keep at least 2 dice in Hand (or stop when avg ≤ 4)
//   - Klystýr allows up to 3 swap ops per Sleep
function computeStashBigDice(p: PlayerState): import('./engine').SwapOp[] {
  if (p.hand.length <= 2) return []; // keep enough dice in hand to roll
  const avgLevel = p.hand.reduce((s, d) => s + d, 0) / p.hand.length;
  if (avgLevel < 5) return [];

  const ops: import('./engine').SwapOp[] = [];
  const maxOps = p.skills.has('klystyr') ? 3 : 1;
  const handSim = [...p.hand];
  let reserveCount = p.reserve.length;

  for (let i = 0; i < maxOps; i++) {
    if (handSim.length <= 2) break; // keep at least 2 in hand
    // Pick the LARGEST die to stash first (preserves variety)
    let bestIdx = -1;
    let bestLvl = 0;
    for (let j = 0; j < handSim.length; j++) {
      if (handSim[j] >= 6 && handSim[j] > bestLvl) {
        bestLvl = handSim[j];
        bestIdx = j;
      }
    }
    if (bestIdx === -1) break;
    if (!p.skills.has('kapacita') && reserveCount >= 3) break;
    ops.push({ op: 'hand_to_reserve', index: bestIdx });
    handSim.splice(bestIdx, 1);
    reserveCount++;
    const remainingAvg = handSim.length ? handSim.reduce((s, d) => s + d, 0) / handSim.length : 0;
    if (remainingAvg <= 4) break;
  }
  return ops;
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
      // Záhon = pure Plant action. Heavy priority while ramping carrots
      // (carrots feed Kakej score). Beyond carrot 5 Kakej caps out.
      return p.carrotTrack < 5 ? 12 : 3;
    }
    case 'dirt': {
      // Adjacency counts ONLY opponent markers — same as engine's dirtPoop.
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker && nb.marker.playerId !== p.id;
      }).length;
      // Engine's Vyformuj kostku formula: carrotTrack + adj opponent markers
      // (+ potatoes, currently not used). Mapping to dice:
      //   1→k2, 2→k4, 3→k6, 4→k8, 5→k10, 6-7→k12, 8+→k20
      const kakejRaw = p.carrotTrack + adj;
      const couldLearn = bestAffordableSkill(p) != null;
      if (couldLearn) return 16; // Learning here is gold

      // Kakej projection (yields a die)
      let kakejScore = 0;
      if (kakejRaw >= 6) kakejScore = 16;     // k12+
      else if (kakejRaw >= 4) kakejScore = 13; // k8/k10
      else if (kakejRaw >= 2) kakejScore = 8;  // k4
      // (kakejRaw < 2 → just k2 / nothing → kakejScore=0)

      // Plant on Hlína: useful early to ramp carrots when Záhon isn't
      // reachable (sum 2-3 with 2× k2 only matches Hlína range)
      const plantScore = p.carrotTrack < 4 ? 8 : 0;
      return Math.max(kakejScore, plantScore);
    }
    case 'desert': {
      if (!p.skills.has('koupel')) return 0;
      // Same as dirt-style scoring — opponent markers only for adjacency bonus.
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker && nb.marker.playerId !== p.id;
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
  const handLimit = p.skills.has('kapacita') || p.hand.filter((d) => d === lvl).length < 2;
  const reserveLimit = p.skills.has('kapacita') || p.reserve.length < 3;
  return handLimit || reserveLimit;
}

function scoreMove(target: BoardCell, p: PlayerState, state: GameState): number {
  let s = 0;
  if (target.type === 'cat' && target.catAlive) {
    // Cat smash now yields 1k8 (not 1k20) plus tunnel. First cat still gives
    // milestone Lázně, so weight it higher when player doesn't have Lázně yet.
    const milestoneBonus = !p.skills.has('koupel') ? 12 : 0;
    return 20 + milestoneBonus;
  }
  if (target.type === 'devil') {
    if (readyToFightDevil(state, p)) return 25;
    return 2; // mild incentive; don't rush Devil
  }
  if (target.type === 'tree' && !target.marker) s += 7;
  if (target.type === 'dirt' && !target.marker) s += 5;
  if (target.type === 'bed' && !target.marker) s += 5;
  if (target.type === 'thorn' && !target.thornDieLevel) s += 2;
  if (target.type === 'desert' && p.skills.has('koupel') && !target.marker) s += 4;
  if (target.isTunnel) s += 1;

  // Distance heuristic — bias direction toward useful Hlína / Záhon /
  // Houští / Cat hexes (excluding the move target itself).
  const usefulHexes: Hex[] = [];
  state.board.forEach((c) => {
    if (c.marker) return;
    if (c.hex.q === target.hex.q && c.hex.r === target.hex.r) return;
    if (c.type === 'dirt') usefulHexes.push(c.hex);
    if (c.type === 'bed') usefulHexes.push(c.hex);
    if (c.type === 'cat' && c.catAlive) usefulHexes.push(c.hex);
    if (c.type === 'thorn' && c.thornDieLevel) usefulHexes.push(c.hex);
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
  // (Dovednosti se na Hlíně už neučí — jen Eukalyptus / úkoly.)

  // 1. Compute Vyformuj kostku projection (engine formula uses opponent markers only)
  const adj = hexNeighbors(hex).filter((h) => {
    const nb = state.board.get(hexKey(h));
    return nb && nb.marker && nb.marker.playerId !== p.id;
  }).length;
  const kakejRaw = p.carrotTrack + adj;

  // 2. Kakej if meaningful die (>= k4) is achievable
  if (kakejRaw >= 2) return useField(state, hex, { dirtAction: 'poop' });

  // 3. Otherwise plant — early carrot ramp
  if (p.carrotTrack < 4) return useField(state, hex, { dirtAction: 'plant' });

  // 5. Fallback: Kakej for whatever it yields
  return useField(state, hex, { dirtAction: 'poop' });
}

// ----- Skill picking --------------------------------------------------------

// Default priority order for AI skill choices (1st affordable wins).
// Po balanc změně 2026-06-01 stojí všechny 1 strom; pořadí je preferenční,
// ne nákladové.
const SKILL_PRIORITY_DEFAULT: SkillId[] = [
  'kapacita',      // removes both Hand+Reserve limits — auto-pick
  'klystyr',       // 3× pre-roll swap = active deck-building per turn
  'koupel',        // opens Poušť — wide map access
  'sprint',        // movement+use combo
  'masaz_strev',   // dice upgrade +2 lvly in Sleep (bývalá Ajurvéda)
];

// Active priority — mutable so research sims can shuffle it per game to
// test "does skill X help when prioritized?" without confounding from the
// default ordering. Reset via resetSkillPriority(); set via setSkillPriority().
let activeSkillPriority: SkillId[] = [...SKILL_PRIORITY_DEFAULT];

/** For research: override priority. Pass a shuffled array. */
export function setSkillPriority(order: SkillId[]): void {
  activeSkillPriority = [...order];
}

/** For research: restore default priority. */
export function resetSkillPriority(): void {
  activeSkillPriority = [...SKILL_PRIORITY_DEFAULT];
}

/** Read-only view of current priority — useful for record-keeping. */
export function getSkillPriority(): SkillId[] {
  return [...activeSkillPriority];
}

// bonusTrees = phantom trees to add to bobekTrack for the check. Used when
// the AI is deciding whether to take the "Obsaď + Uč se" path on a tree
// that hasn't been physically placed yet.
function bestAffordableSkill(p: PlayerState, bonusTrees: number = 0): SkillId | null {
  for (const sid of activeSkillPriority) {
    if (p.skills.has(sid)) continue;
    const req = SKILL_REQUIREMENTS[sid].trees;
    const treesAvail = p.bobekTrack + bonusTrees;
    if (treesAvail >= req) return sid;
    const missing = req - treesAvail;
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
