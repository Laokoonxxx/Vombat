import type { Hex, HexType } from './types';
import { HEX_DIRS, hexAdd } from './hex';

// A "tile" (dílek) = 1 central hex + 6 neighbors (= 7 hexes).
// Center is either 'tree' (modrá) or 'devil' (černá).
// The 6 surrounding hexes are defined in canonical order (E, NE, NW, W, SW, SE)
// and the whole tile is rotated 0..5 times when placed.

export type TileRingType = Exclude<HexType, 'tree' | 'devil'>;

export interface TileTemplate {
  id: string;
  center: 'tree' | 'devil';
  ring: TileRingType[]; // length 6
}

// --- BLUE TILES (center = eukalyptus) — dirt-heavy, peaceful ---
// All 5 blue templates are used in 2-player setup.
// Total contribution: 2 cats, 14 dirt, 6 bed, 3 thorn, 5 desert across 30 slots.
export const BLUE_TEMPLATES: TileTemplate[] = [
  { id: 'B1', center: 'tree', ring: ['dirt', 'bed',  'desert', 'dirt',  'cat',   'dirt'] },
  { id: 'B2', center: 'tree', ring: ['dirt', 'dirt', 'thorn',  'desert','desert','bed'] },
  { id: 'B3', center: 'tree', ring: ['bed',  'dirt', 'thorn',  'desert','cat',   'dirt'] },
  { id: 'B4', center: 'tree', ring: ['dirt', 'bed',  'desert', 'dirt',  'dirt',  'thorn'] },
  { id: 'B5', center: 'tree', ring: ['bed',  'desert','dirt',  'dirt',  'dirt',  'bed'] },
];

// --- BLACK TILES (center = čert) — slightly hostile, each has exactly 1 cat + 1 thorn ---
// 2 of 3 templates used in 2-player setup. Desert-heavy.
// Two-black contribution: 2 cats, 2 thorn, ~5 desert, ~3 dirt.
export const BLACK_TEMPLATES: TileTemplate[] = [
  { id: 'K1', center: 'devil', ring: ['desert', 'cat',   'thorn',  'desert', 'dirt',  'desert'] },
  { id: 'K2', center: 'devil', ring: ['desert', 'thorn', 'dirt',   'cat',    'desert','dirt'] },
  { id: 'K3', center: 'devil', ring: ['desert', 'dirt',  'cat',    'thorn',  'desert','bed'] },
];

// The 7 tile positions ("flower of flowers"): center + 6 around.
// Each entry is the (q,r) offset of the *center hex* of that flower-tile.
// Derived from flower-of-7 packing: flower_dirs[i] = 2*dir[i] + dir[(i+1)%6].
export const TILE_CENTERS_FOR_7: Hex[] = [
  { q: 0, r: 0 },
  { q: 3, r: -1 },
  { q: 2, r: -3 },
  { q: -1, r: -2 },
  { q: -3, r: 1 },
  { q: -2, r: 3 },
  { q: 1, r: 2 },
];

// 10 dílků (3 hráči): 7 vnitřních + 3 vnější rohy v trojúhelníkové symetrii.
// Druhý prstenec má 12 možných pozic; pro 3 hráče vybíráme 3 každý druhý roh.
export const TILE_CENTERS_FOR_10: Hex[] = [
  ...TILE_CENTERS_FOR_7,
  { q: 6, r: -2 },   // 2× E
  { q: -2, r: -4 },  // 2× NW
  { q: -4, r: 6 },   // 2× SW
];

// 13 dílků (4 hráči): 7 vnitřních + všech 6 vnějších rohů (snowflake tvar).
export const TILE_CENTERS_FOR_13: Hex[] = [
  ...TILE_CENTERS_FOR_7,
  { q: 6, r: -2 },   // 2× E
  { q: 4, r: -6 },   // 2× NE
  { q: -2, r: -4 },  // 2× NW
  { q: -6, r: 2 },   // 2× W
  { q: -4, r: 6 },   // 2× SW
  { q: 2, r: 4 },    // 2× SE
];

// Build the 7 hexes of a flower-tile centered at `c`, rotated by `rotation` steps.
export function buildTileHexes(c: Hex, ringTypes: TileRingType[], rotation: number): {
  center: Hex;
  ring: { hex: Hex; type: TileRingType }[];
} {
  const ring: { hex: Hex; type: TileRingType }[] = [];
  for (let i = 0; i < 6; i++) {
    const dirIdx = (i + rotation) % 6;
    const offset = HEX_DIRS[i];
    const hex = hexAdd(c, offset);
    ring.push({ hex, type: ringTypes[dirIdx] });
  }
  return { center: c, ring };
}
