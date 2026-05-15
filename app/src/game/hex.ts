import type { Hex } from './types';

// Pointy-top axial neighbor offsets (canonical order)
export const HEX_DIRS: Hex[] = [
  { q: +1, r:  0 },   // 0 = E
  { q: +1, r: -1 },   // 1 = NE
  { q:  0, r: -1 },   // 2 = NW
  { q: -1, r:  0 },   // 3 = W
  { q: -1, r: +1 },   // 4 = SW
  { q:  0, r: +1 },   // 5 = SE
];

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRS.map((d) => hexAdd(h, d));
}

// Pixel position for a pointy-top hex of given "size" (center-to-corner)
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  const x = size * Math.sqrt(3) * (h.q + h.r / 2);
  const y = size * 1.5 * h.r;
  return { x, y };
}

// Six corner points (relative to hex center) for a pointy-top hex
export function hexCorners(size: number): { x: number; y: number }[] {
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return corners;
}

export function cubeDistance(a: Hex, b: Hex): number {
  const ax = a.q, az = a.r, ay = -ax - az;
  const bx = b.q, bz = b.r, by = -bx - bz;
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}
