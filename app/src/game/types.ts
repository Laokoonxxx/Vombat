// =============================================================================
// Vombat game — core domain types
// =============================================================================

export type DiceLevel = 2 | 4 | 6 | 8 | 10 | 12 | 20;

export const ALL_DICE_LEVELS: DiceLevel[] = [2, 4, 6, 8, 10, 12, 20];

export const DICE_PRICES: Record<DiceLevel, number> = {
  2: 5,
  4: 7,
  6: 9,
  8: 10,
  10: 10,
  12: 12, // pravidla neuvádějí — používám rozumný default vyšší než k10
  20: 99  // k20 nelze koupit přímo, jen získat
};

export type HexType =
  | 'dirt'      // Hlína (oranžová) — aktivace 2-4
  | 'bed'       // Záhon (šedá) — aktivace 4-6
  | 'desert'    // Poušť (písková) — aktivace 7+
  | 'tree'      // Eukalyptus (modrá) — aktivace 7-8
  | 'thorn'     // Houští (zelená) — aktivace 5-9 pro pohyb, 5+/7+/9+ Využití pole
  | 'cat'       // Kočka (hnědá)
  | 'devil';    // Tasmánský Čert (černá)

// Axial hex coordinates (pointy-top)
export interface Hex {
  q: number;
  r: number;
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function hexEq(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

export interface BoardCell {
  hex: Hex;
  type: HexType;
  tileId: number;
  // dynamic state:
  thornDieLevel?: 2 | 4 | 6 | 8;    // kostka ležící na zeleném poli (default k4/k6/k8)
  catAlive?: boolean;                // true while kočka stojí na poli
  isTunnel?: boolean;                // true pro devil + porazené kočky
  // Owner tokens placed by 'Využij pole'. Once placed, the field is occupied.
  marker?: { playerId: string; kind: 'bobek' | 'mrkev' };
  // Optional die left on field as Obrana (záhon, strom)
  defenseDie?: { playerId: string; level: DiceLevel };
}

export type SkillId =
  | 'kapacita'    // merged Žonglování + Zácpa — removes both hand & reserve limits
  | 'koupel'
  | 'klystyr'
  | 'masaz_strev'
  | 'ajurveda'
  | 'sprint';

export interface PlayerState {
  id: string;
  name: string;
  color: string;             // hex color
  kind: 'human' | 'ai';      // controls who decides this player's actions
  hand: DiceLevel[];         // kostky v Ruce
  reserve: DiceLevel[];      // kostky v Zásobě
  pendingDice: DiceLevel[];  // kostky čekající na uvolnění Kapacitou (overflow)
  potatoes: number;
  carrotTrack: number;       // ukazatel mrkve (počet mrkví na desce)
  bobekTrack: number;        // ukazatel bobků (počet eukalyptů)
  markersPlaced: { bobek: number; mrkev: number }; // celkové počty
  vombats: { id: string; hex: Hex }[];
  skills: Set<SkillId>;
  // Tree learning is allowed once per game per player (combined Obsaď + Uč se
  // on a Eukalyptus). Persists even if opponent takes over the tree later.
  usedTreeLearnOnce: boolean;
  // Dice currently rolled at start of turn (parallel to hand)
  lastRoll: number[] | null; // null = not yet rolled this turn
  // For devil combat tracking (only when fighting this turn)
  fighting: boolean;
  // Discard pile of dice spent at devil (per wound type)
}

export type WoundType = '1' | '2' | '7+' | '10+';
export const WOUND_TYPES: WoundType[] = ['1', '2', '7+', '10+'];

// Each player has own devil wound state because each player fights "their own"
// Tasmanian Devil (rules state this for 3-4 player games; we apply consistently).
export interface DevilWounds {
  // For each wound type, which players have placed dice
  // and which dice (visualization). Each player can have at most 1 die per wound.
  woundsByPlayer: Record<string, Record<WoundType, DiceLevel | null>>;
}

export interface GameConfig {
  numPlayers: number;
  numTiles: number; // 7 for 2 players (5 blue + 2 black)
  blueTiles: number;
  blackTiles: number;
}

export type Phase =
  | 'setup'             // before game starts
  | 'idle'              // player turn start — needs to roll or skip (skip = sleep)
  | 'rolled'            // dice rolled, awaiting action selection
  | 'choose_action'     // alias when rolled (same step)
  | 'moving'            // selecting target hex for move
  | 'using_field'       // selecting field to use
  | 'sleeping'          // sleep action options
  | 'devil_combat'      // mid-combat hitting wounds
  | 'game_over';

export interface GameState {
  config: GameConfig;
  board: Map<string, BoardCell>; // key = hexKey
  players: PlayerState[];
  currentPlayerIdx: number;
  turnNumber: number;            // 1-indexed; increments on each turn change
  phase: Phase;
  log: string[];
  winnerId: string | null;
  devilWounds: DevilWounds;
  // Transient UI/turn state
  pendingAttack?: { playerId: string; from: 'cat' | 'devil' }; // need to surrender potato/die
  pendingChoice?: PendingChoice | null;
  // When a die acquisition is paused for human choice, this records what to
  // do after the choice resolves (typically: end the turn).
  pendingPostAcquisition?: 'end_turn' | null;
  movedThisTurn?: boolean; // tracks Sprint skill usage
  usedFieldThisTurn?: boolean;
  fightingDevil?: { playerId: string; deviceHex: Hex } | null;
}

export type PendingChoice =
  | { kind: 'attack_surrender'; playerId: string; from: 'cat' | 'devil' }
  | { kind: 'pick_dice_for_action'; hex: Hex; reason: string }
  | { kind: 'pick_skill'; hex: Hex; potatoesUsed?: number; diceForTrees?: DiceLevel[]; source?: 'dirt' | 'tree' }
  | { kind: 'select_dirt_action'; hex: Hex }
  | { kind: 'select_tree_action'; hex: Hex }
  | { kind: 'shop_choose_die'; hex: Hex; maxLevel: DiceLevel } // after Kakej success
  | { kind: 'pick_die_acquisition'; offered: DiceLevel; source: string }
  | { kind: 'sleep_options' }
  | { kind: 'defend_with_die'; hex: Hex; fieldKind: 'zahon' | 'tree' };
