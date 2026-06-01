import type { BoardCell, GameConfig, Hex } from './types';
import { hexKey } from './types';
import {
  BLUE_TEMPLATES,
  BLACK_TEMPLATES,
  TILE_CENTERS_FOR_7,
  TILE_CENTERS_FOR_10,
  TILE_CENTERS_FOR_13,
  buildTileHexes,
} from './tiles';
import type { RNG } from './rng';

function tileCentersForCount(count: number): Hex[] {
  if (count === 7) return TILE_CENTERS_FOR_7;
  if (count === 10) return TILE_CENTERS_FOR_10;
  if (count === 13) return TILE_CENTERS_FOR_13;
  throw new Error(`Tile count ${count} not supported (allowed: 7, 10, 13)`);
}

export function generateMap(cfg: GameConfig, rng: RNG): Map<string, BoardCell> {
  const board = new Map<string, BoardCell>();

  const centers = tileCentersForCount(cfg.numTiles);

  // Choose which positions get blue vs black tile.
  // We force the central position (index 0) to be a BLUE tile to keep a calm
  // center and put black devils on the outer ring; this matches typical layout.
  const positions = centers.map((_, i) => i);
  const innerIdx = 0;
  const outerIdx = positions.filter((i) => i !== innerIdx);
  const shuffledOuter = rng.shuffle(outerIdx);

  // For 7 tiles: 5 blue + 2 black.
  const blackPositions = new Set<number>(shuffledOuter.slice(0, cfg.blackTiles));

  // Pick templates with replacement
  const blueTpls = rng.shuffle(BLUE_TEMPLATES);
  const blackTpls = rng.shuffle(BLACK_TEMPLATES);
  let blueCursor = 0;
  let blackCursor = 0;

  // For thorn dice distribution we need a global pool 2:2:1 (k4:k6:k8).
  // Count thorn cells later then assign.
  type Pending = { hex: Hex; type: BoardCell['type']; tileId: number };
  const pending: Pending[] = [];

  centers.forEach((c, idx) => {
    const isBlack = blackPositions.has(idx);
    const tpl = isBlack
      ? blackTpls[blackCursor++ % blackTpls.length]
      : blueTpls[blueCursor++ % blueTpls.length];
    const rotation = rng.int(6);
    const { center, ring } = buildTileHexes(c, tpl.ring, rotation);

    pending.push({ hex: center, type: tpl.center, tileId: idx });
    ring.forEach((r) => pending.push({ hex: r.hex, type: r.type, tileId: idx }));
  });

  // Build cells, init dynamic state
  const thornHexes: Hex[] = [];
  pending.forEach((p) => {
    const cell: BoardCell = {
      hex: p.hex,
      type: p.type,
      tileId: p.tileId,
    };
    if (p.type === 'cat') cell.catAlive = true;
    if (p.type === 'devil') cell.isTunnel = true;
    if (p.type === 'thorn') thornHexes.push(p.hex);
    board.set(hexKey(p.hex), cell);
  });

  // Assign thorn dice in ratio 2:2:1 (k4 : k6 : k8)
  const n = thornHexes.length;
  const k4Count = Math.round((n * 2) / 5);
  const k6Count = Math.round((n * 2) / 5);
  const k8Count = Math.max(0, n - k4Count - k6Count);
  const levels: (2 | 4 | 6 | 8)[] = [
    ...Array(k4Count).fill(4),
    ...Array(k6Count).fill(6),
    ...Array(k8Count).fill(8),
  ];
  const shuffledLevels = rng.shuffle(levels);
  thornHexes.forEach((h, i) => {
    const c = board.get(hexKey(h));
    if (c) c.thornDieLevel = shuffledLevels[i] as 2 | 4 | 6 | 8;
  });

  return board;
}
