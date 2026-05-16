import type {
  BoardCell, DiceLevel, FormationKind, GameConfig, GameState, Hex, PlayerState, SkillId, WoundType,
} from './types';
import {
  hexKey, hexEq, ALL_DICE_LEVELS, WOUND_TYPES,
  FORMATION_LABEL, FORMATION_REWARDS,
} from './types';
import { hexNeighbors } from './hex';
import { generateMap } from './map';
import type { RNG } from './rng';
import { makeRNG } from './rng';

// =============================================================================
// SETUP
// =============================================================================

const PLAYER_COLORS = ['#d94a4a', '#4a7fd9', '#5fb04a', '#d9a14a'];

export interface SetupPlayer {
  name: string;
  kind?: 'human' | 'ai';
}

export function createGame(setupPlayers: SetupPlayer[], seed?: number): GameState {
  const rng = makeRNG(seed);
  const numPlayers = setupPlayers.length;
  if (numPlayers < 2 || numPlayers > 2) {
    // MVP supports exactly 2; can later extend (3,10), (4,13)
    if (numPlayers !== 2) throw new Error('MVP supports only 2 players');
  }
  const config: GameConfig = {
    numPlayers,
    numTiles: 7,
    blueTiles: 5,
    blackTiles: 2,
  };
  const board = generateMap(config, rng);

  // Determine random starting player order
  // Turn order: in vs-AI mode (where exactly one of the players is AI),
  // the AI always starts (gives the human a chance to observe a turn first
  // and avoids the awkward "AI took 5 swift turns while I was reading rules"
  // problem). In hot-seat (all human), randomize.
  const aiCount = setupPlayers.filter((sp) => sp.kind === 'ai').length;
  let order: number[];
  if (aiCount > 0 && aiCount < setupPlayers.length) {
    // Mixed: place AIs first, then humans
    const aiIdx: number[] = [];
    const humanIdx: number[] = [];
    setupPlayers.forEach((sp, i) => (sp.kind === 'ai' ? aiIdx : humanIdx).push(i));
    order = [...aiIdx, ...humanIdx];
  } else {
    order = rng.shuffle(setupPlayers.map((_, i) => i));
  }

  const players: PlayerState[] = order.map((origIdx, posIdx) => {
    const sp = setupPlayers[origIdx];
    return {
      id: `p${posIdx}`,
      name: sp.name || `Hráč ${posIdx + 1}`,
      color: PLAYER_COLORS[posIdx],
      kind: sp.kind ?? 'human',
      hand: [],
      reserve: [],
      pendingDice: [],
      potatoes: 10, // starting potatoes for shop
      carrotTrack: 0,
      bobekTrack: 0,
      markersPlaced: { bobek: 0, mrkev: 0 },
      vombats: [], // placed during setup
      skills: new Set<SkillId>(),
      usedTreeLearnOnce: false,
      lastRoll: null,
      fighting: false,
    };
  });

  const devilWounds = {
    woundsByPlayer: Object.fromEntries(
      players.map((p) => [p.id, Object.fromEntries(WOUND_TYPES.map((w) => [w, null])) as Record<WoundType, DiceLevel | null>])
    ),
  };

  return {
    config,
    board,
    players,
    currentPlayerIdx: 0,
    turnNumber: 1,
    phase: 'setup',
    log: ['Hra připravena. Každý hráč nyní zvolí startovní pole.'],
    winnerId: null,
    devilWounds,
    completedFormations: [],
    pendingChoice: null,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

export function getCell(state: GameState, hex: Hex): BoardCell | undefined {
  return state.board.get(hexKey(hex));
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayerIdx];
}

function cloneState(state: GameState): GameState {
  // shallow clone enough for React re-render since we never mutate sub-objects in place
  const newBoard = new Map<string, BoardCell>();
  state.board.forEach((c, k) => newBoard.set(k, { ...c }));
  const newPlayers = state.players.map((p) => ({
    ...p,
    hand: [...p.hand],
    reserve: [...p.reserve],
    pendingDice: [...p.pendingDice],
    vombats: p.vombats.map((v) => ({ ...v })),
    skills: new Set(p.skills),
    markersPlaced: { ...p.markersPlaced },
  }));
  const newDevil = {
    woundsByPlayer: Object.fromEntries(
      Object.entries(state.devilWounds.woundsByPlayer).map(([pid, w]) => [pid, { ...w }])
    ),
  };
  return {
    ...state,
    board: newBoard,
    players: newPlayers,
    log: [...state.log],
    devilWounds: newDevil,
    completedFormations: [...(state.completedFormations ?? [])],
  };
}

function logEntry(state: GameState, msg: string): void {
  state.log.unshift(msg); // newest first
  if (state.log.length > 200) state.log.length = 200;
}

export function vombatsOf(state: GameState, playerId: string): Hex[] {
  const p = state.players.find((p) => p.id === playerId);
  return p ? p.vombats.map((v) => v.hex) : [];
}

export function allVombatsHexes(state: GameState): Hex[] {
  return state.players.flatMap((p) => p.vombats.map((v) => v.hex));
}

export function isHexOccupiedByVombat(state: GameState, hex: Hex): boolean {
  return allVombatsHexes(state).some((h) => hexEq(h, hex));
}

export function adjacentTo(state: GameState, hex: Hex): BoardCell[] {
  return hexNeighbors(hex)
    .map((h) => state.board.get(hexKey(h)))
    .filter((c): c is BoardCell => !!c);
}

export function playerVombatHexes(p: PlayerState): Hex[] {
  return p.vombats.map((v) => v.hex);
}

export function isAdjacentToOwnVombat(p: PlayerState, hex: Hex): boolean {
  return p.vombats.some((v) => hexNeighbors(v.hex).some((h) => hexEq(h, hex)));
}

export function isOnOwnVombat(p: PlayerState, hex: Hex): boolean {
  return p.vombats.some((v) => hexEq(v.hex, hex));
}

export function isAccessibleByPlayer(p: PlayerState, hex: Hex): boolean {
  return isOnOwnVombat(p, hex) || isAdjacentToOwnVombat(p, hex);
}

// =============================================================================
// SETUP ACTIONS — placing vombats, buying dice
// =============================================================================

export function placeStartingVombat(state: GameState, playerId: string, hex: Hex): GameState {
  const s = cloneState(state);
  const p = s.players.find((p) => p.id === playerId)!;
  if (p.vombats.length > 0) return state;
  // Cannot start on cells with cat or devil (per "Tip" not strictly forbidden,
  // but kočky/čerti are occupied tiles — we forbid placing on them)
  const cell = getCell(s, hex);
  if (!cell) return state;
  if (cell.type === 'cat' || cell.type === 'devil') return state;
  if (isHexOccupiedByVombat(s, hex)) return state;
  p.vombats.push({ id: `${p.id}-v0`, hex });
  logEntry(s, `${p.name} umístil Vombata na ${hex.q},${hex.r} (${cell.type}).`);
  return s;
}

export function buyDie(state: GameState, playerId: string, level: DiceLevel): GameState {
  const s = cloneState(state);
  const p = s.players.find((p) => p.id === playerId)!;
  const prices: Record<DiceLevel, number> = { 2: 5, 4: 7, 6: 9, 8: 10, 10: 10, 12: 12, 20: 99 };
  const cost = prices[level];
  if (level === 20) return state;
  if (p.potatoes < cost) return state;
  if (!canAddDieToHand(p, level)) return state;
  p.potatoes -= cost;
  p.hand.push(level);
  logEntry(s, `${p.name} koupil 1k${level} za ${cost} brambor.`);
  return s;
}

export function finishSetup(state: GameState): GameState {
  // Verify each player has at least 1 vombat and at least 1 die
  if (state.players.some((p) => p.vombats.length === 0 || p.hand.length === 0)) return state;
  const s = cloneState(state);
  s.phase = 'idle';
  logEntry(s, `Hra začíná! Začíná ${s.players[0].name}.`);
  return s;
}

// =============================================================================
// HAND/RESERVE LIMITS
// =============================================================================

export function canAddDieToHand(p: PlayerState, level: DiceLevel): boolean {
  if (p.skills.has('kapacita')) return true;
  // Max 2 of same level
  const count = p.hand.filter((d) => d === level).length;
  return count < 2;
}

export function canAddDieToReserve(p: PlayerState): boolean {
  if (p.skills.has('kapacita')) return true;
  return p.reserve.length < 3;
}

// Gain a die in-game. For HUMAN players: sets pendingChoice =
// pick_die_acquisition so the player picks the size and placement.
// For AI/no-kind: auto-places (Hand → Reserve → Pending).
// Returns true when the caller should PAUSE (defer endTurn) because a
// human choice is now pending.
//
// `breakdown` is an optional list of (label, value) pairs the modal renders
// to show *why* the offered die has the size it does (e.g. Vyformuj kostku:
// 🥕 mrkve + 🔗 sousední značky + 🥔 brambory).
function addDieOrPending(
  s: GameState,
  p: PlayerState,
  lvl: DiceLevel,
  source: string,
  breakdown?: import('./types').DieAcquisitionBreakdownLine[],
  totalScore?: number,
): boolean {
  if (p.kind === 'human') {
    s.pendingChoice = { kind: 'pick_die_acquisition', offered: lvl, source, breakdown, totalScore };
    return true;
  }
  // AI / fallback: auto-place
  if (canAddDieToHand(p, lvl)) {
    p.hand.push(lvl);
    return false;
  }
  if (canAddDieToReserve(p)) {
    p.reserve.push(lvl);
    return false;
  }
  p.pendingDice.push(lvl);
  logEntry(
    s,
    `📥 ${p.name} získal 1k${lvl}, ale Ruka i Zásoba jsou plné - kostka čeká na dovednost Kapacita.`
  );
  return false;
}

// Player resolved their die-acquisition choice: place at chosen size + location.
export function resolveDieAcquisition(
  state: GameState,
  level: DiceLevel,
  location: 'hand' | 'reserve' | 'pending'
): GameState {
  if (state.pendingChoice?.kind !== 'pick_die_acquisition') return state;
  const offered = state.pendingChoice.offered;
  if (level > offered) return state; // can only take same-or-smaller
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (location === 'hand') p.hand.push(level);
  else if (location === 'reserve') p.reserve.push(level);
  else p.pendingDice.push(level);
  logEntry(
    s,
    `${p.name} si vzal 1k${level} ${level < offered ? `(místo 1k${offered}) ` : ''}` +
      `→ ${location === 'hand' ? 'Ruka' : location === 'reserve' ? 'Zásoba' : 'Čekající'}.`
  );
  s.pendingChoice = null;
  // After a die is placed, check pending formations (a previously placed
  // marker may have completed one whose reward was queued behind this
  // acquisition). If that opens ANOTHER pick_die_acquisition, keep
  // pendingPostAcquisition set so we still end the turn afterwards.
  const paused = processPendingFormations(s, p.id);
  if (paused) return s;
  // Continue with any deferred end-of-turn step
  if (s.pendingPostAcquisition === 'end_turn') {
    s.pendingPostAcquisition = null;
    endTurn(s);
  }
  return s;
}

// =============================================================================
// FORMATIONS (úkoly) — detection + reward
// =============================================================================
// After each marker placement, call processPendingFormations(s, playerId).
// For every formation kind the player has NOT yet claimed, check whether
// their current marker set satisfies it. If yes, push to completedFormations
// and award a die based on rank (1st=1k20, 2nd=1k12, 3rd=1k6, 4th+=∅).
// Returns true if a human die-acquisition is now pending → caller should
// defer endTurn via pendingPostAcquisition.

const ALL_FORMATIONS: FormationKind[] = ['primka5', 'obkliceni', 'pruzkumnik'];

function playerMarkerHexes(state: GameState, playerId: string): Hex[] {
  const out: Hex[] = [];
  state.board.forEach((c) => {
    if (c.marker && c.marker.playerId === playerId) out.push(c.hex);
  });
  return out;
}

// All hexes that hold ANY opponent's marker.
function opponentMarkerHexSet(state: GameState, playerId: string): Set<string> {
  const set = new Set<string>();
  state.board.forEach((c) => {
    if (c.marker && c.marker.playerId !== playerId) set.add(hexKey(c.hex));
  });
  return set;
}

// Přímka 5: 5+ player markers along one of 3 hex axes, consecutive (no gap),
// with NO opponent marker adjacent to any hex in the run.
function checkPrimka5(state: GameState, playerId: string): boolean {
  const markerHexes = playerMarkerHexes(state, playerId);
  if (markerHexes.length < 5) return false;
  const markerSet = new Set(markerHexes.map((h) => hexKey(h)));
  const oppAdj = opponentMarkerHexSet(state, playerId);
  // Three axes in axial coords; we identify a hex's "line id" along each
  // axis by the coordinate that's constant. Position along the line is the
  // other (sortable) coordinate.
  //   axis 'q': constant q, position = r        (column ↕)
  //   axis 'r': constant r, position = q        (row ↔ ish)
  //   axis 's': constant s=-q-r, position = q   (diagonal)
  const axes: { keyFn: (h: Hex) => string; posFn: (h: Hex) => number }[] = [
    { keyFn: (h) => `q=${h.q}`,            posFn: (h) => h.r },
    { keyFn: (h) => `r=${h.r}`,            posFn: (h) => h.q },
    { keyFn: (h) => `s=${-h.q - h.r}`,     posFn: (h) => h.q },
  ];
  for (const axis of axes) {
    // Group by line key
    const byLine = new Map<string, { hex: Hex; pos: number }[]>();
    for (const h of markerHexes) {
      const k = axis.keyFn(h);
      if (!byLine.has(k)) byLine.set(k, []);
      byLine.get(k)!.push({ hex: h, pos: axis.posFn(h) });
    }
    for (const positions of byLine.values()) {
      if (positions.length < 5) continue;
      positions.sort((a, b) => a.pos - b.pos);
      // Slide a window: find any consecutive run of 5 with pos[i+4]-pos[i]===4
      for (let i = 0; i + 4 < positions.length; i++) {
        if (positions[i + 4].pos - positions[i].pos !== 4) continue;
        // All 5 positions present? (no gaps)
        let consecutive = true;
        for (let j = 1; j < 5; j++) {
          if (positions[i + j].pos !== positions[i].pos + j) { consecutive = false; break; }
        }
        if (!consecutive) continue;
        // No opponent marker adjacent to any of these 5 hexes?
        const run = positions.slice(i, i + 5);
        let blocked = false;
        for (const r of run) {
          for (const nb of hexNeighbors(r.hex)) {
            if (oppAdj.has(hexKey(nb))) { blocked = true; break; }
          }
          if (blocked) break;
        }
        if (!blocked) return true;
      }
    }
  }
  return false;
}

// Obklíčení: any opponent marker has ≥ 4 adjacent hexes containing the
// player's markers (a hex has up to 6 neighbors).
function checkObkliceni(state: GameState, playerId: string): boolean {
  const myMarkers = new Set(playerMarkerHexes(state, playerId).map((h) => hexKey(h)));
  let found = false;
  state.board.forEach((c) => {
    if (found) return;
    if (!c.marker || c.marker.playerId === playerId) return;
    let count = 0;
    for (const nb of hexNeighbors(c.hex)) {
      if (myMarkers.has(hexKey(nb))) count++;
    }
    if (count >= 4) found = true;
  });
  return found;
}

// Průzkumník: player's markers cover ≥ 6 distinct tileIds.
function checkPruzkumnik(state: GameState, playerId: string): boolean {
  const tiles = new Set<number>();
  state.board.forEach((c) => {
    if (c.marker && c.marker.playerId === playerId) tiles.add(c.tileId);
  });
  return tiles.size >= 6;
}

function isFormationCompleted(state: GameState, playerId: string, f: FormationKind): boolean {
  switch (f) {
    case 'primka5':    return checkPrimka5(state, playerId);
    case 'obkliceni':  return checkObkliceni(state, playerId);
    case 'pruzkumnik': return checkPruzkumnik(state, playerId);
  }
}

// Detect formations the given player has newly completed and award dice.
// Multiple formations completed in one placement are processed sequentially;
// the FIRST one that triggers a human pick_die_acquisition pauses processing
// (the rest are picked up after resolveDieAcquisition via this same fn).
// Returns true if a pending choice is now active.
function processPendingFormations(s: GameState, playerId: string): boolean {
  const p = s.players.find((pp) => pp.id === playerId);
  if (!p) return false;
  for (const f of ALL_FORMATIONS) {
    const alreadyDone = s.completedFormations.some(
      (c) => c.playerId === playerId && c.formation === f
    );
    if (alreadyDone) continue;
    if (!isFormationCompleted(s, playerId, f)) continue;
    // Determine reward rank: how many players already completed THIS kind?
    const rank = s.completedFormations.filter((c) => c.formation === f).length;
    const reward = FORMATION_REWARDS[Math.min(rank, FORMATION_REWARDS.length - 1)];
    s.completedFormations.push({ formation: f, playerId, turn: s.turnNumber });
    const rankLabel = ['1.', '2.', '3.', '4.+'][Math.min(rank, 3)];
    if (reward != null) {
      logEntry(
        s,
        `🏅 ${p.name} splnil úkol "${FORMATION_LABEL[f]}" (${rankLabel} v pořadí) → odměna 1k${reward}.`
      );
      const paused = addDieOrPending(s, p, reward, `úkol ${FORMATION_LABEL[f]}`);
      if (paused) return true;
    } else {
      logEntry(
        s,
        `🏅 ${p.name} splnil úkol "${FORMATION_LABEL[f]}" (${rankLabel} v pořadí) — bez odměny (pozdě).`
      );
    }
  }
  return false;
}

// Finalize an action that placed a marker: run formation detection, then
// either pause for human die choice or call endTurn.
function finishMarkerAction(s: GameState): void {
  const p = currentPlayer(s);
  const paused = processPendingFormations(s, p.id);
  if (paused) {
    s.pendingPostAcquisition = 'end_turn';
    return;
  }
  endTurn(s);
}

// Move all pendingDice into Hand. Called whenever Kapacita is granted.
// (Kapacita removes both hand and reserve limits, so Hand is fine.)
function releasePendingDice(s: GameState, p: PlayerState): void {
  if (p.pendingDice.length === 0) return;
  const released = [...p.pendingDice];
  p.pendingDice = [];
  for (const lvl of released) p.hand.push(lvl);
  logEntry(
    s,
    `🔓 ${p.name} díky Kapacitě uvolnil čekající kostky: ${released.map((d) => `1k${d}`).join(', ')}.`
  );
}

// Grant a skill (idempotent). Handles side-effects like releasing pending dice.
function grantSkill(s: GameState, p: PlayerState, skill: SkillId): void {
  if (p.skills.has(skill)) return;
  p.skills.add(skill);
  if (skill === 'kapacita') releasePendingDice(s, p);
}

// =============================================================================
// TURN: ROLL
// =============================================================================

export function rollDice(state: GameState, rng?: RNG): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (p.hand.length === 0) {
    p.lastRoll = [];
  } else {
    const r = rng ?? makeRNG();
    p.lastRoll = p.hand.map((lvl) => 1 + r.int(lvl));
  }
  s.phase = 'rolled';
  s.movedThisTurn = false;
  s.usedFieldThisTurn = false;
  logEntry(s, `${p.name} hodil kostkami: [${p.lastRoll.join(', ')}] (součet ${sumRoll(p.lastRoll)}).`);
  checkCatThreat(s);
  return s;
}

// =============================================================================
// PRE-ROLL SWAP (Třídění)
// =============================================================================
// With Třídění, the player can perform up to 3 swap ops BEFORE rolling dice
// each turn. Each op is one of:
//   - hand_to_reserve (move 1 die from Hand to Reserve)
//   - reserve_to_hand (move 1 die from Reserve to Hand)
//   - swap (exchange one Hand die with one Reserve die)
// The counter resets on endTurn. This is the "deck-building" knob — every
// turn you can tune your Hand for the opportunities you see.

export const PRE_ROLL_SWAP_LIMIT = 3;

export function preRollSwapsRemaining(state: GameState): number {
  const p = currentPlayer(state);
  if (!p.skills.has('klystyr')) return 0;
  return Math.max(0, PRE_ROLL_SWAP_LIMIT - (state.preRollSwapsUsed ?? 0));
}

export function preRollSwap(state: GameState, op: SwapOp): GameState {
  // Only legal in 'idle' phase (before rolling) and only with Třídění.
  if (state.phase !== 'idle') return state;
  const p0 = currentPlayer(state);
  if (!p0.skills.has('klystyr')) return state;
  if (preRollSwapsRemaining(state) <= 0) return state;
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (op.op === 'hand_to_reserve') {
    const lvl = p.hand[op.index];
    if (lvl == null) return state;
    if (!canAddDieToReserve(p)) return state;
    p.hand.splice(op.index, 1);
    p.reserve.push(lvl);
    logEntry(s, `${p.name} přesunul 1k${lvl} z Ruky do Zásoby (Třídění).`);
  } else if (op.op === 'reserve_to_hand') {
    const lvl = p.reserve[op.index];
    if (lvl == null) return state;
    if (!canAddDieToHand(p, lvl)) return state;
    p.reserve.splice(op.index, 1);
    p.hand.push(lvl);
    logEntry(s, `${p.name} přesunul 1k${lvl} ze Zásoby do Ruky (Třídění).`);
  } else if (op.op === 'swap') {
    const h = p.hand[op.handIndex];
    const r = p.reserve[op.reserveIndex];
    if (h == null || r == null) return state;
    p.hand[op.handIndex] = r;
    p.reserve[op.reserveIndex] = h;
    logEntry(s, `${p.name} vyměnil 1k${h} (Ruka) ↔ 1k${r} (Zásoba) — Třídění.`);
  }
  s.preRollSwapsUsed = (s.preRollSwapsUsed ?? 0) + 1;
  return s;
}

function sumRoll(roll: number[] | null): number {
  return (roll || []).reduce((a, b) => a + b, 0);
}

function isAdjacentToLiveCat(state: GameState, vombatHex: Hex): boolean {
  return hexNeighbors(vombatHex)
    .map((h) => state.board.get(hexKey(h)))
    .some((c) => !!c && c.type === 'cat' && c.catAlive);
}

function anyVombatAdjacentToCat(state: GameState, p: PlayerState): boolean {
  return p.vombats.some((v) => isAdjacentToLiveCat(state, v.hex));
}

function checkCatThreat(state: GameState): void {
  const p = currentPlayer(state);
  if (!p.lastRoll) return;
  if (sumRoll(p.lastRoll) < 5 && anyVombatAdjacentToCat(state, p)) {
    state.pendingChoice = { kind: 'attack_surrender', playerId: p.id, from: 'cat' };
    logEntry(state, `⚠️ ${p.name} je vedle Kočky a hodil pouze ${sumRoll(p.lastRoll)} - musí odevzdat bramboru nebo kostku!`);
  }
}

// Resolve attack: player picks 'potato' or a die in hand/reserve to surrender/downgrade
export function resolveAttackWithPotato(state: GameState): GameState {
  const s = cloneState(state);
  const pc = s.pendingChoice;
  if (!pc || pc.kind !== 'attack_surrender') return state;
  const p = s.players.find((pp) => pp.id === pc.playerId)!;
  if (p.potatoes <= 0) return state;
  p.potatoes -= 1;
  logEntry(s, `${p.name} odevzdal bramboru jako obranu před ${pc.from === 'cat' ? 'Kočkou' : 'Čertem'}.`);
  s.pendingChoice = null;
  // If this attack came from failed devil combat, the turn ends now.
  if (pc.from === 'devil') endTurn(s);
  return s;
}

export function resolveAttackWithDie(state: GameState, location: 'hand' | 'reserve', index: number): GameState {
  const s = cloneState(state);
  const pc = s.pendingChoice;
  if (!pc || pc.kind !== 'attack_surrender') return state;
  const p = s.players.find((pp) => pp.id === pc.playerId)!;
  // If only one die total and no potatoes, downgrade required instead of losing it
  const totalDice = p.hand.length + p.reserve.length;
  if (p.potatoes === 0 && totalDice === 1) {
    // Downgrade the only die
    const arr = p.hand.length ? p.hand : p.reserve;
    const lvl = arr[0];
    if (lvl === 2) {
      logEntry(s, `${p.name} má jen 1k2 - útok je ignorován.`);
    } else {
      arr[0] = downgradeDie(lvl);
      logEntry(s, `${p.name} downgradnul jedinou kostku: 1k${lvl} → 1k${arr[0]}.`);
    }
  } else {
    const arr = location === 'hand' ? p.hand : p.reserve;
    if (index < 0 || index >= arr.length) return state;
    const lvl = arr[index];
    arr.splice(index, 1);
    logEntry(s, `${p.name} odevzdal kostku 1k${lvl} jako obranu před ${pc.from === 'cat' ? 'Kočkou' : 'Čertem'}.`);
  }
  s.pendingChoice = null;
  // If this attack came from failed devil combat, the turn ends now.
  if (pc.from === 'devil') endTurn(s);
  return s;
}

function downgradeDie(lvl: DiceLevel): DiceLevel {
  const order: DiceLevel[] = [2, 4, 6, 8, 10, 12, 20];
  const i = order.indexOf(lvl);
  if (i <= 0) return 2;
  return order[i - 1];
}

function upgradeDie(lvl: DiceLevel): DiceLevel {
  const order: DiceLevel[] = [2, 4, 6, 8, 10, 12, 20];
  const i = order.indexOf(lvl);
  if (i === order.length - 1) return 20;
  return order[i + 1];
}

// =============================================================================
// MOVE
// =============================================================================

// Returns list of hexes the current player can move to with the given roll sum.
export function legalMoveTargets(state: GameState, vombatHex: Hex): Hex[] {
  const p = currentPlayer(state);
  if (!p.lastRoll) return [];
  const sum = sumRoll(p.lastRoll);
  const targets: Hex[] = [];
  // Direct neighbors satisfying value
  hexNeighbors(vombatHex).forEach((h) => {
    const c = state.board.get(hexKey(h));
    if (!c) return;
    if (matchesMoveValue(c, sum)) targets.push(h);
  });
  // Tunnel: if we ALREADY stand on a tunnel, or we are adjacent to a tunnel
  // that we could ENTER with the current roll, we may redirect into any tunnel
  // on the board. (Rule: "místo vstupu na toto pole můžeš vstoupit na
  // jakékoliv jiné pole s tunelem" — entry into the source tunnel must be
  // valid per normal movement rules; only the destination is unrestricted.)
  const standingOn = state.board.get(hexKey(vombatHex));
  const enterableAdjTunnels = adjacentTo(state, vombatHex)
    .filter((c) => c.isTunnel && matchesMoveValue(c, sum));
  if (standingOn?.isTunnel || enterableAdjTunnels.length > 0) {
    state.board.forEach((c) => {
      if (c.isTunnel && !hexEq(c.hex, vombatHex)) {
        if (!targets.some((t) => hexEq(t, c.hex))) targets.push(c.hex);
      }
    });
  }
  // Filter: cannot land on cell occupied by another vombat.
  // (Live cats with sum 11-14 are allowed — that's the smashing move,
  //  handled in moveVombat. matchesMoveValue already gated the sum range.)
  return targets.filter((h) => {
    const c = state.board.get(hexKey(h));
    if (!c) return false;
    if (isHexOccupiedByVombat(state, h)) return false;
    // Cannot enter green field that holds a die
    if (c.type === 'thorn' && c.thornDieLevel != null && !c.marker) return false;
    return true;
  });
}

function matchesMoveValue(c: BoardCell, sum: number): boolean {
  switch (c.type) {
    case 'dirt':   return sum >= 2 && sum <= 4;
    case 'bed':    return sum >= 4 && sum <= 6;
    case 'desert': return sum >= 7;
    case 'tree':   return sum >= 7 && sum <= 8;
    case 'thorn':  return sum >= 5 && sum <= 9;
    case 'cat':
      // Live cat: smashing roll 11-14. Dead cat (tunnel): any roll allowed
      // as direct neighbor (tunnel teleport also works from any other tunnel).
      return c.catAlive ? (sum >= 11 && sum <= 14) : true;
    case 'devil':  return sum >= 12;
  }
}

export function moveVombat(state: GameState, vombatId: string, targetHex: Hex): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  const v = p.vombats.find((v) => v.id === vombatId);
  if (!v) return state;
  const targets = legalMoveTargets(s, v.hex);
  if (!targets.some((t) => hexEq(t, targetHex))) return state;
  const targetCell = s.board.get(hexKey(targetHex))!;
  const smashedCat = targetCell.type === 'cat' && targetCell.catAlive;
  let dieAcquisitionPaused = false;
  if (smashedCat) {
    targetCell.catAlive = false;
    targetCell.isTunnel = true;
    dieAcquisitionPaused = addDieOrPending(s, p, 8, 'rozmačkaná Kočka');
    logEntry(s, `🎉 ${p.name} chrupavčitým zadkem rozdrtil Kočku! Získává 1k8 a vzniká tunel.`);
    // Milestone: first cat smash → grant Koupel
    if (!p.skills.has('koupel')) {
      grantSkill(s, p, 'koupel');
      logEntry(s, `✨ ${p.name} získává dovednost Lázně zdarma (1. rozdrcená Kočka)!`);
    }
  } else {
    logEntry(s, `${p.name} přesunul Vombata na ${targetCell.type} (${targetHex.q},${targetHex.r}).`);
  }
  v.hex = { ...targetHex };
  s.movedThisTurn = true;
  // After moving, by default the turn ends. Sprint lets the player ALSO use
  // the destination field — but skip Sprint if we just smashed a cat (the
  // hex is now a tunnel, no field-action available there).
  if (p.skills.has('sprint') && !smashedCat) {
    s.phase = 'using_field';
    logEntry(s, `${p.name} přesunul Vombata. Díky Sprintu může okamžitě využít toto pole.`);
  } else if (dieAcquisitionPaused) {
    // Cat smash: 1k20 needs human placement first; defer endTurn.
    s.pendingPostAcquisition = 'end_turn';
  } else {
    endTurn(s);
  }
  return s;
}

// =============================================================================
// END TURN
// =============================================================================

export function endTurn(state: GameState): void {
  const p = currentPlayer(state);
  p.lastRoll = null;
  p.fighting = false;
  state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
  state.turnNumber = (state.turnNumber ?? 1) + 1;
  state.phase = 'idle';
  state.pendingChoice = null;
  state.movedThisTurn = false;
  state.usedFieldThisTurn = false;
  state.preRollSwapsUsed = 0;
  const next = currentPlayer(state);
  logEntry(state, `--- Tah ${state.turnNumber} · hráč ${next.name} ---`);
}

export function endTurnNow(state: GameState): GameState {
  const s = cloneState(state);
  endTurn(s);
  return s;
}

// Cancel a pending sub-choice (e.g. mid-Hlína action) without using the
// field. Returns state to 'rolled' phase so the player can pick again.
// Does NOT mark the field, refund anything, or end the turn.
export function cancelPendingChoice(state: GameState): GameState {
  if (!state.pendingChoice) return state;
  // Only allow cancellation of dirt/skill sub-choices that haven't yet
  // committed a marker. Attack-surrender is non-cancellable.
  const pc = state.pendingChoice;
  if (pc.kind !== 'select_dirt_action' && pc.kind !== 'pick_skill') return state;
  const s = cloneState(state);
  s.pendingChoice = null;
  logEntry(s, `${currentPlayer(s).name} stornoval volbu.`);
  return s;
}

// =============================================================================
// FIELD ACTIONS
// =============================================================================

export function canUseField(state: GameState, hex: Hex): boolean {
  const p = currentPlayer(state);
  if (!p.lastRoll) return false;
  const cell = state.board.get(hexKey(hex));
  if (!cell) return false;
  if (!isAccessibleByPlayer(p, hex)) return false;
  const sum = sumRoll(p.lastRoll);
  // Check value range
  switch (cell.type) {
    case 'dirt':   if (sum < 2 || sum > 4) return false; break;
    case 'bed':    if (sum < 4 || sum > 6) return false; break;
    case 'desert': if (sum < 7) return false; if (!p.skills.has('koupel')) return false; break;
    case 'tree':   if (sum < 7 || sum > 8) return false; break;
    case 'thorn': {
      // Need actual threshold for the die present: k4→5, k6→7, k8→9
      if (!cell.thornDieLevel) return false; // already cleared, no use
      const need = cell.thornDieLevel === 4 ? 5 : cell.thornDieLevel === 6 ? 7 : 9;
      if (sum < need) return false;
      break;
    }
    case 'cat':    return false; // can't "use" a cat field for placement; smashing is via move
    case 'devil':  return false; // devil uses per-die logic, handled separately
  }
  // Cannot reuse a marked field (except taken-over via opponent rules — handled per-action)
  if (cell.marker && cell.marker.playerId === p.id) return false;
  if (cell.marker && cell.type !== 'bed' && cell.type !== 'tree') return false; // others = single use
  return true;
}

// Use a field: dispatch by type
export function useField(
  state: GameState,
  hex: Hex,
  opts?: { dirtAction?: 'plant' | 'poop' | 'learn'; treeAction?: 'occupy' | 'occupy_and_learn' }
): GameState {
  const cell = state.board.get(hexKey(hex));
  if (!cell) return state;
  switch (cell.type) {
    case 'bed':    return useBed(state, hex);
    case 'tree':   return useTree(state, hex, opts?.treeAction);
    case 'thorn':  return useThorn(state, hex);
    case 'desert':
      // Acts like dirt — same submenu
      return useDirt(state, hex, opts?.dirtAction);
    case 'dirt':   return useDirt(state, hex, opts?.dirtAction);
    default:       return state;
  }
}

// --- BED (Záhon) ---
function useBed(state: GameState, hex: Hex): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  const cell = s.board.get(hexKey(hex))!;
  // Convention: 'Zasaď' is the only action. If field already has opponent marker, take it over (carrot).
  if (cell.marker && cell.marker.playerId !== p.id) {
    // Takeover: must beat defense die (we ignore for MVP basic; minimal check)
    if (cell.defenseDie) {
      // For MVP: require player to leave a higher-level die. Not enforced rigorously here.
      logEntry(s, `${p.name} přebírá Záhon (poznámka: obrana není v MVP plně řešena).`);
      cell.defenseDie = undefined;
    }
    const oppId = cell.marker.playerId;
    const opp = s.players.find((p) => p.id === oppId);
    if (opp) {
      opp.carrotTrack = Math.max(0, opp.carrotTrack - 1);
      opp.markersPlaced.mrkev = Math.max(0, opp.markersPlaced.mrkev - 1);
      logEntry(s, `${p.name} přebral Záhon od ${opp.name}.`);
    }
  }
  cell.marker = { playerId: p.id, kind: 'mrkev' };
  p.carrotTrack += 1;
  p.markersPlaced.mrkev += 1;
  s.usedFieldThisTurn = true;
  logEntry(s, `${p.name} zasadil mrkev na Záhon (celkem ${p.carrotTrack}).`);
  // Optional defense step skipped in MVP UI flow.
  finishMarkerAction(s);
  return s;
}

// --- TREE (Eukalyptus) ---
function useTree(state: GameState, hex: Hex, action?: 'occupy' | 'occupy_and_learn'): GameState {
  const p0 = currentPlayer(state);
  // If no sub-action specified AND the tree-learn option is available
  // (1× per game per player + at least one skill affordable AFTER the
  // upcoming +1 tree bobekTrack), ask the player to pick.
  if (!action) {
    const couldLearn = !p0.usedTreeLearnOnce && canAffordSomeSkill(p0, +1);
    if (couldLearn) {
      const s = cloneState(state);
      s.pendingChoice = { kind: 'select_tree_action', hex };
      return s;
    }
    // No learn option — go straight to occupy.
    action = 'occupy';
  }

  const s = cloneState(state);
  const p = currentPlayer(s);
  const cell = s.board.get(hexKey(hex))!;
  if (cell.marker && cell.marker.playerId !== p.id) {
    if (cell.defenseDie) {
      logEntry(s, `${p.name} přebírá Eukalyptový strom (obrana zjednodušeně v MVP).`);
      cell.defenseDie = undefined;
    }
    const oppId = cell.marker.playerId;
    const opp = s.players.find((p) => p.id === oppId);
    if (opp) {
      opp.bobekTrack = Math.max(0, opp.bobekTrack - 1);
      opp.markersPlaced.bobek = Math.max(0, opp.markersPlaced.bobek - 1);
      logEntry(s, `${p.name} přebral Eukalyptus od ${opp.name}.`);
    }
  }
  cell.marker = { playerId: p.id, kind: 'bobek' };
  p.bobekTrack += 1;
  p.markersPlaced.bobek += 1;
  s.usedFieldThisTurn = true;
  logEntry(s, `${p.name} obsadil Eukalyptový strom (celkem ${p.bobekTrack}).`);

  if (action === 'occupy_and_learn') {
    // Open the skill picker with source='tree'. The tree-learn flag is set
    // when learnSkill actually succeeds (not here, so canceling doesn't
    // burn the once-per-game allowance).
    s.pendingChoice = { kind: 'pick_skill', hex, source: 'tree' };
    return s;
  }
  finishMarkerAction(s);
  return s;
}

// Used by useTree gating: with +bonus extra trees, is any unlearned
// skill affordable? Used to decide whether to even offer the
// "Obsaď + Uč se" option.
function canAffordSomeSkill(p: PlayerState, bonusTrees: number): boolean {
  for (const sid of Object.keys(SKILL_REQUIREMENTS) as SkillId[]) {
    if (p.skills.has(sid)) continue;
    const req = SKILL_REQUIREMENTS[sid];
    const trees = p.bobekTrack + bonusTrees;
    if (trees >= req.trees) return true;
    const missing = req.trees - trees;
    if (missing > 0 && p.potatoes >= missing * 3) return true;
  }
  return false;
}

// --- THORN (Houští) ---
function useThorn(state: GameState, hex: Hex): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  const cell = s.board.get(hexKey(hex))!;
  const sum = sumRoll(p.lastRoll);
  if (!cell.thornDieLevel) return state;
  const required = thornThreshold(cell.thornDieLevel);
  if (sum < required) {
    logEntry(s, `${p.name} nehodil dost (${sum}) - na 1k${cell.thornDieLevel} v Houští je třeba ${required}+`);
    return state;
  }
  const lvl = cell.thornDieLevel as DiceLevel;
  const paused = addDieOrPending(s, p, lvl, 'Houští');
  cell.thornDieLevel = undefined;
  cell.marker = { playerId: p.id, kind: 'bobek' };
  p.markersPlaced.bobek += 1;
  s.usedFieldThisTurn = true;
  logEntry(s, `${p.name} získal 1k${lvl} z Houští.`);
  if (paused) {
    s.pendingPostAcquisition = 'end_turn';
  } else {
    finishMarkerAction(s);
  }
  return s;
}

function thornThreshold(lvl: 2 | 4 | 6 | 8): number {
  if (lvl === 4) return 5;
  if (lvl === 6) return 7;
  if (lvl === 8) return 9;
  return 99;
}

// --- DIRT (Hlína) / DESERT (Poušť with Koupel) ---
function useDirt(state: GameState, hex: Hex, action?: 'plant' | 'poop' | 'learn'): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  const cell = s.board.get(hexKey(hex))!;
  if (!action) {
    // request a choice from the UI
    s.pendingChoice = { kind: 'select_dirt_action', hex };
    return s;
  }
  if (cell.marker && cell.marker.playerId !== p.id && action !== 'plant') {
    // Soupeřova mrkev na Hlíně: dle pravidel lze odstranit a Hlínu znovu využít pro jinou akci.
    const oppId = cell.marker.playerId;
    const opp = s.players.find((p) => p.id === oppId);
    if (cell.marker.kind === 'mrkev' && opp) {
      opp.carrotTrack = Math.max(0, opp.carrotTrack - 1);
      opp.markersPlaced.mrkev = Math.max(0, opp.markersPlaced.mrkev - 1);
      cell.marker = undefined;
      logEntry(s, `${p.name} odstranil mrkev ${opp.name} z Hlíny.`);
    } else if (cell.marker.kind === 'bobek') {
      // Značka = pole trvale obsazeno (Vyformovat, Uč se). Nelze přebrat.
      logEntry(s, `Pole je obsazeno bobkem - nelze využít.`);
      s.pendingChoice = null;
      return state;
    }
  }
  switch (action) {
    case 'plant':  return dirtPlant(s, p, cell);
    case 'poop':   return dirtPoop(s, p, cell);
    case 'learn':  s.pendingChoice = { kind: 'pick_skill', hex }; return s;
  }
}

function dirtPlant(s: GameState, p: PlayerState, cell: BoardCell): GameState {
  if (cell.marker) {
    logEntry(s, `Hlína je již obsazena.`);
    return s;
  }
  cell.marker = { playerId: p.id, kind: 'mrkev' };
  p.carrotTrack += 1;
  p.markersPlaced.mrkev += 1;
  s.usedFieldThisTurn = true;
  s.pendingChoice = null;
  logEntry(s, `${p.name} zasadil mrkev na Hlíně.`);
  finishMarkerAction(s);
  return s;
}

function dirtPoop(s: GameState, p: PlayerState, cell: BoardCell): GameState {
  // Per rules: score = carrotTrack (your ukazatel mrkve)
  //                  + potatoes invested (UI not yet wired — skipped)
  //                  + adjacent hexes occupied by SOUPEŘOVY značky
  // Score 0=nothing, 1=k2, 2=k4, 3=k6, 4=k8, 5=k10, 6-7=k12, 8+=k20
  //
  // Design intent: opponent-only adjacency rewards aggressive play
  // (be near your opponent) and prevents the player from clustering
  // their own markers for a free die bonus.
  const adj = adjacentTo(s, cell.hex).filter(
    (c) => !!c.marker && c.marker.playerId !== p.id,
  ).length;
  const result = p.carrotTrack + adj;
  const dieLevel = poopResult(result);
  cell.marker = { playerId: p.id, kind: 'bobek' };
  p.markersPlaced.bobek += 1;
  s.usedFieldThisTurn = true;
  s.pendingChoice = null;
  const breakdownStr = `🥕${p.carrotTrack} + sousedi-soupeře ${adj} = ${result}`;
  // Detailed breakdown for the human modal — keeps UI explanation explicit.
  const breakdown: import('./types').DieAcquisitionBreakdownLine[] = [
    { label: '🥕 Tvé mrkve (ukazatel)', value: p.carrotTrack },
    { label: '🔗 Sousední značky SOUPEŘE', value: adj },
    // Brambory: not yet wired into the action (UI doesn't ask). Shown as
    // 0 so the modal explicitly tells the player that path exists.
    { label: '🥔 Investované brambory', value: 0 },
  ];
  let paused = false;
  if (dieLevel === null) {
    logEntry(s, `${p.name} vyformoval kostku (${breakdownStr}) - nic nezískává.`);
  } else {
    paused = addDieOrPending(s, p, dieLevel, 'Vyformování kostky', breakdown, result);
    logEntry(s, `${p.name} vyformoval kostku (${breakdownStr}) → 1k${dieLevel}!`);
  }
  if (paused) {
    s.pendingPostAcquisition = 'end_turn';
  } else {
    finishMarkerAction(s);
  }
  return s;
}

function poopResult(score: number): DiceLevel | null {
  if (score <= 0) return null;
  if (score === 1) return 2;
  if (score === 2) return 4;
  if (score === 3) return 6;
  if (score === 4) return 8;
  if (score === 5) return 10;
  if (score <= 7) return 12;
  return 20;
}

// --- LEARN SKILL ---
export const SKILL_REQUIREMENTS: Record<SkillId, { trees: number; label: string; desc: string }> = {
  kapacita:     { trees: 1, label: 'Kapacita',           desc: 'Vombat má roztaženou kapsičku. Žádné limity na kostky (Ruka i Zásoba neomezené).' },
  koupel:       { trees: 1, label: 'Lázně',              desc: 'Vombat se ochladí v poušti, zvládne písek. Můžeš využívat Poušť jako Hlínu (hod 7+).' },
  klystyr:      { trees: 1, label: 'Třídění',            desc: 'Vombat pečlivě rovná kostky. PŘED hodem: až 3× zadarmo přesun Ruka ↔ Zásoba. (Tvar tvé Ruky můžeš ladit každý tah.)' },
  masaz_strev:  { trees: 2, label: 'Žvýkání',            desc: 'Vombat žvýká důkladněji = větší výstup. Při Spánku: Upgrade 1 kostky o 1 lvl.' },
  ajurveda:     { trees: 3, label: 'Bylinkový elixír',   desc: 'Eukalyptus + bylinky = mocná medicína. Při Spánku: Upgrade 1 kostky o 2 lvly (nebo 2 kostky o 1).' },
  sprint:       { trees: 2, label: 'Sprint',             desc: 'Vombat běží jak vítr. Po Pohybu rovnou Využij pole, na které jsi se přesunul.' },
};

export function learnSkill(state: GameState, skill: SkillId, treesUsed: number, potatoesUsed: number, diceUsed: DiceLevel[]): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (p.skills.has(skill)) return state;
  const req = SKILL_REQUIREMENTS[skill];
  // Each tree-requirement satisfied by either bobekTrack OR by 3 potatoes OR by discarding a die
  const potatoesAsTrees = Math.floor(potatoesUsed / 3);
  if (treesUsed + potatoesAsTrees + diceUsed.length < req.trees) return state;
  if (treesUsed > p.bobekTrack) return state;
  if (potatoesUsed > p.potatoes) return state;
  // Verify dice available
  const handCopy = [...p.hand];
  const reserveCopy = [...p.reserve];
  for (const d of diceUsed) {
    const hIdx = handCopy.indexOf(d);
    if (hIdx !== -1) { handCopy.splice(hIdx, 1); continue; }
    const rIdx = reserveCopy.indexOf(d);
    if (rIdx !== -1) { reserveCopy.splice(rIdx, 1); continue; }
    return state; // die not available
  }
  p.hand = handCopy;
  p.reserve = reserveCopy;
  p.potatoes -= potatoesUsed;
  grantSkill(s, p, skill);
  // Tree-source learn: mark the once-per-game flag now (only after success).
  const pc = s.pendingChoice as any;
  const source: 'dirt' | 'tree' = pc?.source ?? 'dirt';
  if (source === 'tree') {
    p.usedTreeLearnOnce = true;
  } else {
    // Dirt-source: mark the dirt cell with bobek as the learning marker.
    // (Tree cells are already marked by useTree before this runs.)
    const cell = s.board.get(hexKey(pc.hex));
    if (cell) cell.marker = { playerId: p.id, kind: 'bobek' };
  }
  s.usedFieldThisTurn = true;
  s.pendingChoice = null;
  logEntry(s, `${p.name} se naučil "${req.label}"!`);
  finishMarkerAction(s);
  return s;
}

// =============================================================================
// SLEEP
// =============================================================================

export type SleepAction =
  | { kind: 'gain_potato' }
  | { kind: 'downgrade_dice'; targets: { location: 'hand' | 'reserve'; index: number }[] }
  | { kind: 'swap'; ops: SwapOp[] }
  | { kind: 'upgrade_die'; location: 'hand' | 'reserve'; index: number }
  | { kind: 'upgrade_die_2x'; location: 'hand' | 'reserve'; index: number }
  | { kind: 'teleport'; vombatId: string; targetHex: Hex }
  | { kind: 'buy_skill'; skill: SkillId }
  | { kind: 'skip' };

export const TELEPORT_COST = 8;
export const SKILL_BUY_COST_PER_TREE = 5;
export function skillBuyCost(skill: SkillId): number {
  return SKILL_REQUIREMENTS[skill].trees * SKILL_BUY_COST_PER_TREE;
}

export type SwapOp =
  | { op: 'hand_to_reserve'; index: number }
  | { op: 'reserve_to_hand'; index: number }
  | { op: 'swap'; handIndex: number; reserveIndex: number };

export function sleep(state: GameState, action: SleepAction): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  switch (action.kind) {
    case 'gain_potato':
      p.potatoes += 1;
      logEntry(s, `${p.name} spí a získává 1 bramboru.`);
      break;
    case 'downgrade_dice':
      action.targets.forEach((t) => {
        const arr = t.location === 'hand' ? p.hand : p.reserve;
        if (t.index < 0 || t.index >= arr.length) return;
        arr[t.index] = downgradeDie(arr[t.index]);
      });
      logEntry(s, `${p.name} downgradnul kostky.`);
      break;
    case 'swap': {
      // Klystýr (purgative skill) removes the cap on swap operations entirely.
      // Without it, only 1 swap per Sleep.
      const maxSwaps = p.skills.has('klystyr') ? Infinity : 1;
      if (action.ops.length > maxSwaps) return state;
      action.ops.forEach((op) => {
        if (op.op === 'hand_to_reserve') {
          const lvl = p.hand[op.index];
          if (lvl == null) return;
          if (!canAddDieToReserve(p)) return;
          p.hand.splice(op.index, 1);
          p.reserve.push(lvl);
        } else if (op.op === 'reserve_to_hand') {
          const lvl = p.reserve[op.index];
          if (lvl == null) return;
          if (!canAddDieToHand(p, lvl)) return;
          p.reserve.splice(op.index, 1);
          p.hand.push(lvl);
        } else {
          const h = p.hand[op.handIndex];
          const r = p.reserve[op.reserveIndex];
          if (h == null || r == null) return;
          p.hand[op.handIndex] = r;
          p.reserve[op.reserveIndex] = h;
        }
      });
      logEntry(s, `${p.name} provedl výměnu kostek.`);
      break;
    }
    case 'upgrade_die': {
      if (!p.skills.has('masaz_strev') && !p.skills.has('ajurveda')) return state;
      const arr = action.location === 'hand' ? p.hand : p.reserve;
      if (action.index < 0 || action.index >= arr.length) return state;
      const old = arr[action.index];
      const nu = upgradeDie(old);
      if (old === 12 && nu === 20) {
        // Cannot single-upgrade k12 → k20
        return state;
      }
      arr[action.index] = nu;
      logEntry(s, `${p.name} upgradnul 1k${old} → 1k${nu}.`);
      break;
    }
    case 'upgrade_die_2x': {
      if (!p.skills.has('ajurveda')) return state;
      const arr = action.location === 'hand' ? p.hand : p.reserve;
      if (action.index < 0 || action.index >= arr.length) return state;
      const old = arr[action.index];
      let nu = upgradeDie(old);
      if (old === 12) {
        nu = 20;
      } else {
        nu = upgradeDie(nu);
      }
      arr[action.index] = nu;
      logEntry(s, `${p.name} upgradnul 1k${old} → 1k${nu} (Ajurvéda).`);
      break;
    }
    case 'buy_skill': {
      if (p.skills.has(action.skill)) return state;
      const cost = skillBuyCost(action.skill);
      if (p.potatoes < cost) return state;
      p.potatoes -= cost;
      grantSkill(s, p, action.skill);
      logEntry(s, `${p.name} koupil dovednost "${SKILL_REQUIREMENTS[action.skill].label}" za ${cost} 🥔.`);
      break;
    }
    case 'teleport': {
      if (p.potatoes < TELEPORT_COST) return state;
      const targetCell = s.board.get(hexKey(action.targetHex));
      if (!targetCell) return state;
      // Cannot teleport onto a live cat, a devil, or another vombat
      if (targetCell.type === 'cat' && targetCell.catAlive) return state;
      if (targetCell.type === 'devil') return state;
      if (isHexOccupiedByVombat(s, action.targetHex)) return state;
      const v = p.vombats.find((vv) => vv.id === action.vombatId);
      if (!v) return state;
      p.potatoes -= TELEPORT_COST;
      v.hex = { ...action.targetHex };
      logEntry(
        s,
        `${p.name} teleportoval Vombata na ${targetCell.type} (${action.targetHex.q},${action.targetHex.r}) za ${TELEPORT_COST} brambor.`
      );
      break;
    }
    case 'skip':
      logEntry(s, `${p.name} prospal tah bez akce.`);
      break;
  }
  endTurn(s);
  return s;
}

// =============================================================================
// DEVIL COMBAT
// =============================================================================

export function canFightDevil(state: GameState, vombatHex: Hex): boolean {
  const adjDevils = adjacentTo(state, vombatHex).filter((c) => c.type === 'devil');
  const onDevil = state.board.get(hexKey(vombatHex))?.type === 'devil';
  return adjDevils.length > 0 || onDevil;
}

// Begin combat: roll dice and check for wounds. Each player has their OWN wounds.
export function beginDevilCombat(state: GameState, rng?: RNG): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (p.hand.length === 0) {
    logEntry(s, `${p.name} nemá žádné kostky - nelze bojovat.`);
    return state;
  }
  const r = rng ?? makeRNG();
  p.lastRoll = p.hand.map((lvl) => 1 + r.int(lvl));
  p.fighting = true;
  s.phase = 'devil_combat';
  logEntry(s, `⚔️ ${p.name} bojuje s Čertem! Hod: [${p.lastRoll.join(', ')}]`);
  // Instant win check: when the player ALREADY has all 4 wounds from prior
  // turns and this opening roll sums to ≥25, no need to apply any wound or
  // re-roll — the killing blow is delivered immediately. This avoids forcing
  // the player to click "Hoď znovu" with dice that already sum to 25+.
  if (allWoundsTaken(s, p.id)) {
    const sum = p.lastRoll.reduce((a, b) => a + b, 0);
    if (sum >= 25) {
      s.winnerId = p.id;
      s.phase = 'game_over';
      p.fighting = false;
      logEntry(
        s,
        `🏆 ${p.name} ZABIL TASMÁNSKÉHO ČERTA! Otevírací hod ${sum} (≥25) je smrtelná rána.`
      );
    }
  }
  return s;
}

// Apply a die to a wound slot.
export function applyDevilWound(state: GameState, diceIndex: number, wound: WoundType): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (!p.lastRoll) return state;
  const val = p.lastRoll[diceIndex];
  if (val == null) return state;
  // Validate value matches wound requirement
  const ok =
    (wound === '1' && val === 1) ||
    (wound === '2' && val === 2) ||
    (wound === '7+' && val >= 7) ||
    (wound === '10+' && val >= 10);
  if (!ok) return state;
  // Slot must be free for this player
  if (s.devilWounds.woundsByPlayer[p.id][wound] != null) return state;
  // Consume the die from hand (lose it forever)
  const dieLvl = p.hand[diceIndex];
  if (dieLvl == null) return state;
  p.hand.splice(diceIndex, 1);
  p.lastRoll.splice(diceIndex, 1);
  s.devilWounds.woundsByPlayer[p.id][wound] = dieLvl;
  logEntry(s, `${p.name} zranil Čerta na ${wound} (kostka 1k${dieLvl}, hod ${val}).`);
  // Milestone: first wound applied → grant Kapacita
  if (!p.skills.has('kapacita')) {
    grantSkill(s, p, 'kapacita');
    logEntry(s, `✨ ${p.name} získává dovednost Kapacita zdarma (1. zranění Čerta)!`);
  }
  // Killing-blow check: if all 4 wounds are now taken AND the dice that
  // remain in THIS roll already sum to >=25, the player has effectively
  // delivered the final blow in one go — no need to re-roll.
  if (allWoundsTaken(s, p.id)) {
    const sum = (p.lastRoll || []).reduce((a, b) => a + b, 0);
    if (sum >= 25) {
      s.winnerId = p.id;
      s.phase = 'game_over';
      p.fighting = false;
      logEntry(s, `🏆 ${p.name} ZABIL TASMÁNSKÉHO ČERTA! Zbylé kostky dávají ${sum} (≥25). Vítězí!`);
    }
  }
  return s;
}

export function allWoundsTaken(state: GameState, playerId: string): boolean {
  const w = state.devilWounds.woundsByPlayer[playerId];
  return WOUND_TYPES.every((wt) => w[wt] != null);
}

// Continue combat: roll remaining hand again
export function devilContinueRoll(state: GameState, rng?: RNG): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (!p.fighting) return state;
  // Pre-check: if all wounds are already taken AND the current roll's
  // remaining dice already sum to >=25, the killing blow is in — no need
  // to roll again.
  if (allWoundsTaken(s, p.id) && p.lastRoll) {
    const sum = p.lastRoll.reduce((a, b) => a + b, 0);
    if (sum >= 25) {
      s.winnerId = p.id;
      s.phase = 'game_over';
      p.fighting = false;
      logEntry(s, `🏆 ${p.name} ZABIL TASMÁNSKÉHO ČERTA! Zbylé kostky dávají ${sum} (≥25).`);
      return s;
    }
  }
  if (p.hand.length === 0) {
    // Cannot continue — counts as failed attack
    devilFailAttack(s);
    return s;
  }
  const r = rng ?? makeRNG();
  p.lastRoll = p.hand.map((lvl) => 1 + r.int(lvl));
  logEntry(s, `${p.name} hází znovu v boji s Čertem: [${p.lastRoll.join(', ')}]`);
  // If all wounds taken and any die shows 25+ — impossible from single die, only sum.
  if (allWoundsTaken(s, p.id)) {
    const sum = p.lastRoll.reduce((a, b) => a + b, 0);
    if (sum >= 25) {
      s.winnerId = p.id;
      s.phase = 'game_over';
      logEntry(s, `🏆 ${p.name} ZABIL TASMÁNSKÉHO ČERTA! Vítězí!`);
      return s;
    } else {
      // Failed final blow
      devilFailAttack(s);
      return s;
    }
  }
  // If no die can produce any of the remaining wounds, fail
  if (!canHitAnyRemainingWound(s, p.id)) {
    devilFailAttack(s);
  }
  return s;
}

function canHitAnyRemainingWound(state: GameState, playerId: string): boolean {
  const p = state.players.find((pp) => pp.id === playerId)!;
  const w = state.devilWounds.woundsByPlayer[playerId];
  if (!p.lastRoll) return false;
  return p.lastRoll.some((val) => {
    if (w['1'] == null && val === 1) return true;
    if (w['2'] == null && val === 2) return true;
    if (w['7+'] == null && val >= 7) return true;
    if (w['10+'] == null && val >= 10) return true;
    return false;
  });
}

function devilFailAttack(state: GameState): void {
  const p = currentPlayer(state);
  p.fighting = false;
  logEntry(state, `❌ ${p.name} neuspěl v boji s Čertem - útok Čerta!`);
  state.pendingChoice = { kind: 'attack_surrender', playerId: p.id, from: 'devil' };
}

export function devilStop(state: GameState): GameState {
  const s = cloneState(state);
  const p = currentPlayer(s);
  if (!p.fighting) return state;
  p.fighting = false;
  logEntry(s, `${p.name} ukončil boj s Čertem dobrovolně.`);
  endTurn(s);
  return s;
}
