// =============================================================================
// ACTION LOG — typovaný popis každé herní akce.
// =============================================================================
// applyAction(state, action) je jediný způsob, jak hrát tah: vrátí nový stav
// a NIC navíc. Žádná globální náhoda — akce s náhodou (hod kostkami) nesou
// svůj výsledek přímo v payloadu (`rolls`), aby šel průběh hry deterministicky
// přehrát ze seedu + akcí.
//
// Klient/server kontrakt:
//   - server ukládá akce do tabulky vombat_moves (action_json),
//   - po načtení hry klient zavolá replayGame(seed, actions) → GameState,
//   - hraje-li lokální hráč, generuje rolls externě (makeRNG()) a vloží je do akce.
//
// Tento soubor NEDUPLIKUJE engine logiku — pouze obaluje existující funkce.
// =============================================================================

import type { DiceLevel, GameState, Hex, SkillId, WoundType } from './types';
import type { SleepAction, SwapOp } from './engine';
import {
  placeStartingVombat,
  buyDie,
  finishSetup,
  rollDice,
  skipRollForPotatoes,
  preRollSwap,
  adjustRoll,
  resolveAttackWithPotato,
  resolveAttackWithDie,
  moveVombat,
  useField,
  cancelPendingChoice,
  endTurnNow,
  resolveDieAcquisition,
  learnSkill,
  sleep,
  beginDevilCombat,
  applyDevilWound,
  devilContinueRoll,
  devilStop,
  createGame as engineCreateGame,
  currentPlayer,
} from './engine';
import type { SetupPlayer } from './engine';
import type { RNG } from './rng';
import { makeRNG } from './rng';

// -----------------------------------------------------------------------------
// Action union
// -----------------------------------------------------------------------------

export type Action =
  // --- setup ---
  | { type: 'placeStartingVombat'; playerId: string; hex: Hex }
  | { type: 'buyDie'; playerId: string; level: DiceLevel }
  | { type: 'finishSetup' }

  // --- turn start ---
  | { type: 'rollDice'; rolls: number[] }
  | { type: 'skipRollForPotatoes' }
  | { type: 'preRollSwap'; op: SwapOp }

  // --- mid-turn ---
  | { type: 'adjustRoll'; delta: 1 | -1 }
  | { type: 'resolveAttackWithPotato' }
  | { type: 'resolveAttackWithDie'; location: 'hand' | 'reserve'; index: number }
  | { type: 'moveVombat'; vombatId: string; targetHex: Hex }
  | {
      type: 'useField';
      hex: Hex;
      dirtAction?: 'plant' | 'poop';
      treeAction?: 'occupy' | 'occupy_and_learn';
    }
  | { type: 'cancelPendingChoice' }
  | { type: 'endTurnNow' }

  // --- pending-choice resolutions ---
  | { type: 'resolveDieAcquisition'; level: DiceLevel; location: 'hand' | 'reserve' | 'pending' }
  | {
      type: 'learnSkill';
      skill: SkillId;
      treesUsed: number;
      potatoesUsed: number;
      diceUsed: DiceLevel[];
    }

  // --- sleep (multi-variant) ---
  | { type: 'sleep'; sleepAction: SleepAction }

  // --- devil combat ---
  | { type: 'beginDevilCombat'; rolls: number[] }
  | { type: 'applyDevilWound'; diceIndex: number; wound: WoundType }
  | { type: 'devilContinueRoll'; rolls: number[] }
  | { type: 'devilStop' };

export type ActionType = Action['type'];

// -----------------------------------------------------------------------------
// Deterministic RNG ze záznamu hodů
// -----------------------------------------------------------------------------
// rollDice / beginDevilCombat / devilContinueRoll v engine.ts používají
// `1 + rng.int(lvl)` na každou kostku v ruce. Když si chceme "přehrát" hod
// z dříve uložené akce, vyrobíme RNG, který vrací předem dané hodnoty.
//
// Pre-rolled hodnoty jsou v rozsahu 1..lvl (skutečný výsledek na kostce).
// rng.int(lvl) má kontrakt 0..lvl-1, takže vracíme `roll - 1`.

export function rngFromRolls(rolls: number[]): RNG {
  let i = 0;
  return {
    next: () => 0,
    int: (max: number) => {
      const v = rolls[i++];
      if (v === undefined) {
        throw new Error('rngFromRolls: došly hodnoty (více volání rng.int než předem připravených hodů)');
      }
      if (v < 1 || v > max) {
        throw new Error(`rngFromRolls: hodnota ${v} mimo rozsah 1..${max}`);
      }
      return v - 1;
    },
    pick: <T>(arr: T[]) => arr[0],
    shuffle: <T>(arr: T[]) => arr,
  };
}

// -----------------------------------------------------------------------------
// applyAction — jediný vstupní bod pro změnu stavu z akce
// -----------------------------------------------------------------------------

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'placeStartingVombat':
      return placeStartingVombat(state, action.playerId, action.hex);
    case 'buyDie':
      return buyDie(state, action.playerId, action.level);
    case 'finishSetup':
      return finishSetup(state);

    case 'rollDice':
      return rollDice(state, rngFromRolls(action.rolls));
    case 'skipRollForPotatoes':
      return skipRollForPotatoes(state);
    case 'preRollSwap':
      return preRollSwap(state, action.op);

    case 'adjustRoll':
      return adjustRoll(state, action.delta);
    case 'resolveAttackWithPotato':
      return resolveAttackWithPotato(state);
    case 'resolveAttackWithDie':
      return resolveAttackWithDie(state, action.location, action.index);
    case 'moveVombat':
      return moveVombat(state, action.vombatId, action.targetHex);
    case 'useField':
      return useField(state, action.hex, {
        dirtAction: action.dirtAction,
        treeAction: action.treeAction,
      });
    case 'cancelPendingChoice':
      return cancelPendingChoice(state);
    case 'endTurnNow':
      return endTurnNow(state);

    case 'resolveDieAcquisition':
      return resolveDieAcquisition(state, action.level, action.location);
    case 'learnSkill':
      return learnSkill(state, action.skill, action.treesUsed, action.potatoesUsed, action.diceUsed);

    case 'sleep':
      return sleep(state, action.sleepAction);

    case 'beginDevilCombat':
      return beginDevilCombat(state, rngFromRolls(action.rolls));
    case 'applyDevilWound':
      return applyDevilWound(state, action.diceIndex, action.wound);
    case 'devilContinueRoll':
      return devilContinueRoll(state, rngFromRolls(action.rolls));
    case 'devilStop':
      return devilStop(state);
  }
}

// -----------------------------------------------------------------------------
// Pomocníci pro UI: generování `rolls` PŘED dispatchem
// -----------------------------------------------------------------------------
// V hot-seatu i v online módu lokální klient potřebuje vyrobit hod kostkami
// PŘED odesláním akce. Aby UI nemuselo znát detaily kostek, exportujeme
// jednoduché helpery, které pomocí makeRNG() vygenerují hodnoty pro aktuálního
// hráče.

export function rollForCurrentPlayer(state: GameState, rng?: RNG): number[] {
  const p = currentPlayer(state);
  const r = rng ?? makeRNG();
  return p.hand.map((lvl) => 1 + r.int(lvl));
}

// -----------------------------------------------------------------------------
// Replay: ze seedu + uspořádaného logu akcí postavit aktuální GameState
// -----------------------------------------------------------------------------

export interface ReplayInput {
  seed: number;
  setupPlayers: SetupPlayer[];
  actions: Action[];
}

export function replayGame(input: ReplayInput): GameState {
  let state = engineCreateGame(input.setupPlayers, input.seed);
  for (const action of input.actions) {
    state = applyAction(state, action);
  }
  return state;
}
