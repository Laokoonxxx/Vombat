// =============================================================================
// Game state persistence — localStorage save/restore
// =============================================================================
// GameState contains Map<string, BoardCell> and Set<SkillId>, neither of which
// JSON.stringify handles directly. We convert them to arrays for storage and
// reconstruct on load.
//
// Bump SAVE_VERSION whenever the GameState shape changes incompatibly so old
// saves are dropped instead of crashing the app.
// =============================================================================

import type { GameState, BoardCell, SkillId } from './types';

const STORAGE_KEY = 'vombat:gameState';
const SAVE_VERSION = 14; // bump when GameState shape changes or map balance shifts

interface SerializedState {
  version: number;
  // Stored fields below mirror GameState but with Map/Set turned into arrays.
  state: Omit<GameState, 'board' | 'players' | 'devilWounds'> & {
    board: [string, BoardCell][];
    players: any[];
    devilWounds: any;
  };
  savedAt: number;
}

export function serializeState(state: GameState): string {
  const serializable: SerializedState = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state: {
      ...state,
      board: Array.from(state.board.entries()),
      players: state.players.map((p) => ({
        ...p,
        skills: Array.from(p.skills),
        treeLearnUsedHexes: Array.from(p.treeLearnUsedHexes ?? []),
      })),
      // devilWounds is plain objects; safe as-is
      devilWounds: state.devilWounds,
    },
  };
  return JSON.stringify(serializable);
}

export function deserializeState(json: string): GameState | null {
  try {
    const obj = JSON.parse(json) as SerializedState;
    if (obj.version !== SAVE_VERSION) return null;
    const s = obj.state;
    return {
      ...s,
      board: new Map<string, BoardCell>(s.board),
      players: s.players.map((p: any) => ({
        ...p,
        skills: new Set<SkillId>(p.skills),
        treeLearnUsedHexes: new Set<string>(p.treeLearnUsedHexes ?? []),
      })),
    } as GameState;
  } catch {
    return null;
  }
}

export function saveToStorage(state: GameState | null): void {
  try {
    if (state == null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, serializeState(state));
    }
  } catch (e) {
    console.warn('Vombat: could not save game state', e);
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return deserializeState(raw);
  } catch {
    return null;
  }
}

export function getSaveMeta(): { savedAt: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as SerializedState;
    if (obj.version !== SAVE_VERSION) return null;
    return { savedAt: obj.savedAt };
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
