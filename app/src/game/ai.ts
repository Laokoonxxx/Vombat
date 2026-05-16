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
  skillBuyCost,
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
  return rollDice(state);
}

function readyToFightDevil(state: GameState, p: PlayerState): boolean {
  if (p.hand.length === 0) return false;
  const wounds = state.devilWounds.woundsByPlayer[p.id];
  const woundsTaken = WOUND_TYPES.filter((w) => wounds[w] != null).length;
  const remainingWounds = 4 - woundsTaken;
  const handMax = Math.max(...p.hand);
  const sumPotential = p.hand.reduce((a, lvl) => a + lvl, 0);

  // Final blow — all 4 wounds done; we just need to ROLL 25+ in one shot.
  // sumPotential is the MAX possible sum; avg roll is sumPotential/2.
  // Require sumPotential >= 32 to have reasonable chance — otherwise we'd
  // loop forever trying & failing (verified in self-play).
  if (woundsTaken === 4) return sumPotential >= 32;

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

  // LOOKAHEAD (own-turns only, opponent ignored per user request):
  //   For each of top-K candidates by heuristic:
  //     1. Apply my action
  //     2. Resolve my sub-pendingChoice (dirt action, skill pick, …)
  //     3. SKIP opponent's turn (force their Sleep-skip, no resource impact)
  //     4. Simulate my NEXT turn greedily (roll + heuristic best action)
  //     5. Score resulting state from MY POV
  //
  // This gives "2 of my turns deep" without spending compute on opponent
  // moves whose outcomes we can't reliably predict anyway.
  const K = 6;
  const MY_TURN_LOOKAHEAD = 3; // how many of my own turns to roll forward (sweet spot per sim)
  candidates.sort((a, b) => b.heur - a.heur);
  const top = candidates.slice(0, K);

  let bestVal = -Infinity;
  let bestState: GameState = state;
  const myIdx = state.players.findIndex((pp) => pp.id === p.id);

  lookaheadInProgress = true;
  try {
    for (const cand of top) {
      let next = cand.apply();
      if (next === state) continue;
      // State that we actually return to engine — after my action+pending.
      const immediate = resolvePendingChoicesForLookahead(next, p.id);
      // Continue simulating extra of MY OWN turns to estimate state value.
      let simState = immediate;
      for (let turn = 1; turn < MY_TURN_LOOKAHEAD && simState.phase !== 'game_over'; turn++) {
        simState = skipOpponentToMyTurn(simState, myIdx);
        simState = simulateOneMyTurn(simState, myIdx);
      }
      const v = cand.heur * 1.5 + stateValue(simState, p.id);
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

// Smarter Sleep choice: buy a skill if affordable, else gain potato.
function aiSleep(state: GameState): GameState {
  const p = currentPlayer(state);

  // Priority 1: buy a skill if affordable
  for (const sid of SKILL_PRIORITY) {
    if (p.skills.has(sid)) continue;
    const cost = skillBuyCost(sid);
    if (p.potatoes >= cost) {
      return sleep(state, { kind: 'buy_skill', skill: sid });
    }
  }

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
      const adj = hexNeighbors(c.hex).filter((h) => {
        const nb = state.board.get(hexKey(h));
        return nb && nb.marker;
      }).length;
      // Engine's Kakej formula: carrotTrack + adj markers (+ potatoes,
      // currently not used). Mapping to dice:
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
  const handLimit = p.skills.has('kapacita') || p.hand.filter((d) => d === lvl).length < 2;
  const reserveLimit = p.skills.has('kapacita') || p.reserve.length < 3;
  return handLimit || reserveLimit;
}

function scoreMove(target: BoardCell, p: PlayerState, state: GameState): number {
  let s = 0;
  if (target.type === 'cat' && target.catAlive) return 40; // jackpot
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
  // 1. Learn if affordable
  const skill = bestAffordableSkill(p);
  if (skill) return useField(state, hex, { dirtAction: 'learn' });

  // 2. Compute Kakej projection
  const adj = hexNeighbors(hex).filter((h) => {
    const nb = state.board.get(hexKey(h));
    return nb && nb.marker;
  }).length;
  const kakejRaw = p.carrotTrack + adj;

  // 3. Kakej if meaningful die (>= k4) is achievable
  if (kakejRaw >= 2) return useField(state, hex, { dirtAction: 'poop' });

  // 4. Otherwise plant — early carrot ramp
  if (p.carrotTrack < 4) return useField(state, hex, { dirtAction: 'plant' });

  // 5. Fallback: Kakej for whatever it yields
  return useField(state, hex, { dirtAction: 'poop' });
}

// ----- Skill picking --------------------------------------------------------

const SKILL_PRIORITY: SkillId[] = [
  'kapacita',      // 1 tree, easy first pick (capacity unlock)
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
