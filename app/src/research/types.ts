// =============================================================================
// Research analytics — slim per-game records & insight types
// =============================================================================
// Goal: capture enough per-game data to find game-design insights without
// blowing up the file size. One game ≈ 1-2 KB → 10k games ≈ 20 MB.
//
// The full GameState/log is NOT stored — only derived features (opening
// action sequence, milestone turns, final state, action counts, etc.).
// =============================================================================

import type { DiceLevel, FormationKind, HexType, SkillId } from '../game/types';

// Coarse action category — used for opening analysis & dead-action detection.
// Less granular than the full engine log; categories chosen to map cleanly
// to player decisions you'd describe in plain Czech.
export type ActionCategory =
  | 'plant_dirt'         // 🥕 mrkev na Hlíně
  | 'plant_bed'          // 🥕 mrkev na Záhonu
  | 'vyformuj'           // 💩 Vyformuj kostku na Hlíně
  | 'learn_dirt'         // 🧠 Uč se na Hlíně
  | 'occupy_tree'        // 🌳 Obsaď strom
  | 'tree_learn'         // 🌳🧠 Obsaď + Uč se
  | 'thorn_pickup'       // 🌵 Získej kostku z Houští
  | 'cat_smash'          // 🎉 Rozdrcení Kočky
  | 'move'               // 🐾 Plain pohyb bez akce
  | 'devil_combat'       // ⚔️ Začátek souboje
  | 'desert_use'         // 🏜️ Akce na Poušti (vyžaduje Lázně)
  | 'sleep_potato'       // 💤 Získej bramboru
  | 'sleep_buy_skill'    // 💤🛒 Koupil dovednost
  | 'sleep_teleport'     // 💤🌀 Teleport
  | 'sleep_swap'         // 💤🔄 Výměna
  | 'sleep_upgrade'      // 💤⬆️ Upgrade kostky
  | 'sleep_skip'         // 💤✖️ Skip
  | 'attack_lost'        // 💔 Zaplatil za útok (kočka/čert)
  | 'other';

export interface SkillPurchaseRecord {
  skill: SkillId;
  turn: number;
  method: 'milestone' | 'learn_hlina' | 'tree_learn' | 'sleep_shop';
}

export interface FormationRecord {
  formation: FormationKind;
  turn: number;
  reward: DiceLevel | null; // null if 4th+ (no reward)
}

export interface PlayerResearchRecord {
  id: 'p0' | 'p1';
  name: string;

  // Setup
  startHexType: HexType;
  // Whether the start tile's center is blue (eukalyptus) or black (devil)
  startTileCenterType: 'tree' | 'devil';
  // First die bought in setup
  startDieLevel: DiceLevel | null;

  // Opening actions (first N action categories, in chronological order)
  opening: ActionCategory[];

  // Action counts across the game
  actionCounts: Partial<Record<ActionCategory, number>>;

  // Milestones: turn at which X first happened (null = never)
  firstSkillTurn: number | null;
  firstSkill: SkillId | null;
  firstCatSmashTurn: number | null;
  firstDevilCombatTurn: number | null;
  firstDevilWoundTurn: number | null;
  firstFormationTurn: number | null;
  firstFormation: FormationKind | null;

  // Skill purchases in chronological order
  skillPurchases: SkillPurchaseRecord[];

  // Formations completed in chronological order
  formationsCompleted: FormationRecord[];

  // Devil combat: how many separate combat attempts; how many wounds total
  devilCombatAttempts: number;
  devilWoundsLanded: number;

  // Final state snapshot (relevant for end-game analysis)
  finalHand: DiceLevel[];
  finalReserve: DiceLevel[];
  finalPotatoes: number;
  finalCarrotTrack: number;
  finalBobekTrack: number;
  finalSkills: SkillId[];
  // Did this player win?
  won: boolean;
}

export interface ResearchGameRecord {
  seed: number;
  totalTurns: number;
  decisive: boolean;            // false = stalled (hit max turns)
  winnerId: 'p0' | 'p1' | null;
  players: PlayerResearchRecord[];
  // Engine timing — wall-clock ms for the whole game (for performance tracking)
  durationMs: number;
}

// =============================================================================
// Run metadata — written to disk alongside the JSONL
// =============================================================================

export interface ResearchRunMeta {
  generatedAt: string;          // ISO timestamp
  numGames: number;
  maxTurns: number;
  seedBase: number;
  saveVersion: number;          // mirrors persistence.SAVE_VERSION
  // Total wall-clock time in seconds for the whole run
  totalDurationSec: number;
  // Per-run summary (computed once, also recomputed by analyzer)
  decisive: number;
  stalled: number;
}

// =============================================================================
// Published aggregate JSON — consumed by in-app StatsViewer
// =============================================================================
// Written by analyze.ts to app/public/sim/research.json. Keep small (<200 KB)
// so the page loads instantly. Contains pre-computed win-rate correlations
// the UI just renders as tables/bars.

export interface BucketStat {
  bucket: string;       // e.g. "0", "1-2", "3-4", "9+"
  players: number;      // player-games in this bucket
  wins: number;
  winRate: number;      // 0..1
}

export interface SkillWinRate {
  skillId: SkillId;
  label: string;
  treesCost: number;
  learned: number;            // player-games where this skill was learned
  pctLearned: number;         // 0..1, vs totalPlayerGames
  winRateWhenLearned: number; // among learners
  winRateWhenNot: number;     // among non-learners
  avgTurnLearned: number | null;
}

export interface SkillComboStat {
  skills: SkillId[];          // sorted, canonical form
  labels: string[];           // human-readable in same order
  players: number;
  wins: number;
  winRate: number;
}

export interface ActionWinCorrelation {
  category: string;           // ActionCategory value
  label: string;              // Czech label
  buckets: BucketStat[];
}

export interface ResearchPublished {
  generatedAt: string;
  numGames: number;
  decisive: number;
  totalPlayerGames: number;   // = decisive * 2
  // Average final values among winners vs losers (resource curve summary)
  winnerAverages: {
    carrots: number;
    trees: number;
    potatoes: number;
    handSize: number;
    reserveSize: number;
    skillsLearned: number;
    diceOwnedPeak: number;     // hand + reserve + devilWoundsLanded
  };
  loserAverages: {
    carrots: number;
    trees: number;
    potatoes: number;
    handSize: number;
    reserveSize: number;
    skillsLearned: number;
    diceOwnedPeak: number;
  };
  // Skill analysis
  skillStats: {
    perSkill: SkillWinRate[];
    byCount: BucketStat[];           // bucket = "0", "1", "2", ..., "5+"
    topCombos: SkillComboStat[];     // top 10 most common skill SETS
  };
  // Resource → win rate
  resourceStats: {
    carrots: BucketStat[];      // bucketed final carrotTrack
    trees: BucketStat[];        // bucketed final bobekTrack
    diceOwnedPeak: BucketStat[]; // total dice the player owned (incl. spent on devil)
    potatoes: BucketStat[];
  };
  // Action count → win rate (for actions where this correlation is interesting)
  actionStats: ActionWinCorrelation[];
}
