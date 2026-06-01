// =============================================================================
// Vombat game — core domain types
// =============================================================================

// k10 byla odstraněna 2026-06-01 — v původních pravidlech Vombatu neexistuje.
// Posloupnost kostek je teď k2 → k4 → k6 → k8 → k12 → k20.
export type DiceLevel = 2 | 4 | 6 | 8 | 12 | 20;

export const ALL_DICE_LEVELS: DiceLevel[] = [2, 4, 6, 8, 12, 20];

export const DICE_PRICES: Record<DiceLevel, number> = {
  2: 5,
  4: 6,
  6: 8,
  8: 10,
  12: 10,
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
  | 'masaz_strev' // upgrade die by +2 lvls in Sleep (former Ajurveda effect merged in)
  | 'sprint';
// Note: 'ajurveda' removed 2026-06-01 — its +2 lvl effect was merged into masaz_strev (Žvýkání)

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
  // Tree-learn ("Obsaď + Uč se") is allowed once per game PER TREE per player.
  // The same player can do it on multiple different trees (e.g., 3× during a
  // game if they visit 3 different Eukalypts) but not twice on the same tree.
  // Stored as a set of hex keys (q,r) — opponent taking over the tree later
  // doesn't reset this flag for the original player.
  treeLearnUsedHexes: Set<string>;
  // Dice currently rolled at start of turn (parallel to hand)
  lastRoll: number[] | null; // null = not yet rolled this turn
  // For devil combat tracking (only when fighting this turn)
  fighting: boolean;
  // Cumulative roll adjustment for this turn (from brambor spending).
  // Applied to sum-based checks (Hlína/Záhon/Houští/Eukalyptus move + use,
  // Poušť, Kočka 11-14, Čert 12+ movement). NOT applied in Devil combat
  // (per-die check). Reset to 0 on endTurn.
  rollAdjustment: number;
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

// =============================================================================
// FORMATIONS (úkoly)
// =============================================================================
// Players pursue 3 spatial objectives on the side. Each formation kind awards
// dice based on completion order (1st = 1k20, 2nd = 1k12, 3rd = 1k6, 4th+ = ∅).
// Each player can claim a given formation kind only once.

export type FormationKind = 'primka5' | 'obkliceni' | 'pruzkumnik';

export const FORMATION_LABEL: Record<FormationKind, string> = {
  primka5:    'Přímka 5',
  obkliceni:  'Obklíčení',
  pruzkumnik: 'Průzkumník',
};

export const FORMATION_DESC: Record<FormationKind, string> = {
  primka5:    '5+ tvých značek v rovné hex-linii. Žádná značka soupeře sousedící s těmito hexy.',
  obkliceni:  '4+ tvých značek kolem značky soupeře.',
  pruzkumnik: 'Tvé značky na 6+ různých dílcích mapy.',
};

// Reward by completion rank (1st, 2nd, 3rd, 4th+).
export const FORMATION_REWARDS: (DiceLevel | null)[] = [20, 12, 6, null];

export interface FormationCompletion {
  formation: FormationKind;
  playerId: string;
  turn: number; // turnNumber when claimed
}

// =============================================================================
// ÚKOLY (TASKS) — náhodné přiřazení schopností
// =============================================================================
// Před začátkem hry se každá ze 5 schopností náhodně přiřadí jednomu z 5 úkolů
// (3 formace + rozmačkání 1. Kočky + zranění 1. Čerta). Každý hráč dostane
// přiřazenou schopnost při svém PRVNÍM splnění daného úkolu.
//
// Při formacích je odměna aditivní s původní kostkou (1k20/k12/k6 podle pořadí).
// Při kočce zůstává původní 1k8. Žádné fixní milestone schopnosti (dřív Koupel
// za 1. kočku, Kapacita za 1. čerta) — vše náhodné dle taskRewards.

export type TaskKey = FormationKind | 'devilWound' | 'catSmash';

export const ALL_TASK_KEYS: TaskKey[] = [
  'primka5', 'obkliceni', 'pruzkumnik', 'devilWound', 'catSmash',
];

export const TASK_LABEL: Record<TaskKey, string> = {
  primka5:    'Přímka 5',
  obkliceni:  'Obklíčení',
  pruzkumnik: 'Průzkumník',
  devilWound: 'Zranění Čerta (1.)',
  catSmash:   'Rozmačkání Kočky (1.)',
};

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
  // Formation tracking. Order of entries = order of completion. Used both to
  // determine reward rank and to render the sidebar progress panel.
  completedFormations: FormationCompletion[];
  // Náhodně přiřazené schopnosti k úkolům (3 formace + cat + devil wound).
  // Vygenerováno v createGame ze seedu, viditelné hráčům od začátku hry.
  taskRewards: Record<TaskKey, SkillId>;
  // Per-player tracker: které task-skill rewards už hráč obdržel.
  // Klíč = playerId, hodnota = sada task keys.
  taskRewardsGranted: Record<string, TaskKey[]>;
  // Transient UI/turn state
  pendingAttack?: { playerId: string; from: 'cat' | 'devil' }; // need to surrender potato/die
  pendingChoice?: PendingChoice | null;
  // When a die acquisition is paused for human choice, this records what to
  // do after the choice resolves (typically: end the turn).
  pendingPostAcquisition?: 'end_turn' | null;
  movedThisTurn?: boolean; // tracks Sprint skill usage
  usedFieldThisTurn?: boolean;
  fightingDevil?: { playerId: string; deviceHex: Hex } | null;
  // Pre-roll swap counter (Třídění skill): up to 3× per turn before rolling.
  // Reset to 0 on endTurn. 0/missing = no swaps used yet this turn.
  preRollSwapsUsed?: number;
  // Roll-adjustment counter for this turn (max 2 per turn — capped by limit).
  // Each ±1 costs 1 brambor. Reset on endTurn.
  rollAdjustmentsUsed?: number;
}

// Detailed line in a die-acquisition modal explaining how the offered die
// size was reached (e.g. for Vyformuj kostku: carrots + neighbors + potatoes).
export interface DieAcquisitionBreakdownLine {
  label: string;
  value: number;
}

export type PendingChoice =
  | { kind: 'attack_surrender'; playerId: string; from: 'cat' | 'devil' }
  | { kind: 'pick_dice_for_action'; hex: Hex; reason: string }
  | { kind: 'pick_skill'; hex: Hex; potatoesUsed?: number; diceForTrees?: DiceLevel[]; source?: 'dirt' | 'tree' }
  | { kind: 'select_dirt_action'; hex: Hex }
  | { kind: 'select_tree_action'; hex: Hex }
  | { kind: 'shop_choose_die'; hex: Hex; maxLevel: DiceLevel } // after Kakej success
  | { kind: 'pick_die_acquisition'; offered: DiceLevel; source: string; breakdown?: DieAcquisitionBreakdownLine[]; totalScore?: number }
  | { kind: 'sleep_options' }
  | { kind: 'defend_with_die'; hex: Hex; fieldKind: 'zahon' | 'tree' };
