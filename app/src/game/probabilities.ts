// =============================================================================
// Probability math for dice hands
// =============================================================================
// Pure-function module: given a hand (multiset of dice levels), compute the
// probability that their sum lands in a given range.
//
// Used by AI for pre-roll swap decisions ("should I swap k10 for k4 to hit
// Hlína 2-4?") and could power an in-app probability calculator.
//
// All distributions are PMF arrays where pmf[s] = P(sum = s). Convolution is
// straightforward; for our hand sizes (1-6 dice, max k20) arrays are <120
// entries — trivial cost even when called dozens of times per turn.
// =============================================================================

import type { DiceLevel } from './types';

// =============================================================================
// Core PMF computation
// =============================================================================

// Returns pmf[v] = P(sum = v) for the given hand of dice.
// Empty hand: pmf[0] = 1 (sum=0 with certainty).
// For a single die kN, pmf[v] = 1/N for v ∈ {1, …, N}.
// For multiple dice, distributions convolve.
export function sumDistribution(hand: DiceLevel[]): number[] {
  if (hand.length === 0) return [1.0];

  // Start with the first die
  const first = hand[0];
  let pmf: number[] = new Array(first + 1).fill(0);
  for (let v = 1; v <= first; v++) pmf[v] = 1 / first;

  // Convolve in each subsequent die
  for (let i = 1; i < hand.length; i++) {
    const die = hand[i];
    const newLen = pmf.length + die; // max sum so far + die max
    const newPmf = new Array(newLen).fill(0);
    const invDie = 1 / die;
    for (let s = 0; s < pmf.length; s++) {
      const ps = pmf[s];
      if (ps === 0) continue;
      for (let v = 1; v <= die; v++) {
        newPmf[s + v] += ps * invDie;
      }
    }
    pmf = newPmf;
  }
  return pmf;
}

// P(min ≤ sum ≤ max) for the given hand. max=Infinity is allowed and means "≥ min".
export function pSumInRange(hand: DiceLevel[], min: number, max: number): number {
  if (hand.length === 0) return min <= 0 && max >= 0 ? 1 : 0;
  const pmf = sumDistribution(hand);
  let p = 0;
  const hi = Math.min(max, pmf.length - 1);
  for (let v = Math.max(min, 0); v <= hi; v++) p += pmf[v];
  return p;
}

// Expected sum value (mean) — convenience.
export function expectedSum(hand: DiceLevel[]): number {
  return hand.reduce((s, lvl) => s + (lvl + 1) / 2, 0);
}

// =============================================================================
// Field-specific helpers
// =============================================================================
// Standard activation ranges per hex type (for movement). Several fields share
// the same range for use-field action; thorn use depends on the die on it.

export interface ActivationRange {
  label: string;
  min: number;
  max: number;
}

export const FIELD_RANGES = {
  dirt:   { label: '🟫 Hlína',      min: 2,  max: 4   },
  bed:    { label: '🌱 Záhon',      min: 4,  max: 6   },
  desert: { label: '🏜️ Poušť',      min: 7,  max: 99  },
  tree:   { label: '🌳 Eukalyptus', min: 7,  max: 8   },
  thorn:  { label: '🌵 Houští',     min: 5,  max: 9   }, // movement range
  cat:    { label: '🐱 Kočka',      min: 11, max: 14  }, // rozdrcení
  devil:  { label: '👹 Čert',       min: 12, max: 99  },
} satisfies Record<string, ActivationRange>;

// Thorn USE thresholds (per die present on the hex):
//   k4 → 5+, k6 → 7+, k8 → 9+
export const THORN_USE_THRESHOLD: Record<2 | 4 | 6 | 8, number> = {
  2: 99, // k2 doesn't appear on thorn but keep type-complete
  4: 5,
  6: 7,
  8: 9,
};

// Returns the probability distribution table for a hand vs. all standard field
// ranges. Useful for in-app probability calculator or AI scoring.
export function fieldProbabilities(hand: DiceLevel[]): Record<keyof typeof FIELD_RANGES, number> {
  const pmf = sumDistribution(hand);
  // Inline pSumInRange to avoid re-computing pmf for each key
  function rangeProb(min: number, max: number): number {
    let p = 0;
    const hi = Math.min(max, pmf.length - 1);
    for (let v = Math.max(min, 0); v <= hi; v++) p += pmf[v];
    return p;
  }
  return {
    dirt:   rangeProb(FIELD_RANGES.dirt.min,   FIELD_RANGES.dirt.max),
    bed:    rangeProb(FIELD_RANGES.bed.min,    FIELD_RANGES.bed.max),
    desert: rangeProb(FIELD_RANGES.desert.min, FIELD_RANGES.desert.max),
    tree:   rangeProb(FIELD_RANGES.tree.min,   FIELD_RANGES.tree.max),
    thorn:  rangeProb(FIELD_RANGES.thorn.min,  FIELD_RANGES.thorn.max),
    cat:    rangeProb(FIELD_RANGES.cat.min,    FIELD_RANGES.cat.max),
    devil:  rangeProb(FIELD_RANGES.devil.min,  FIELD_RANGES.devil.max),
  };
}

// =============================================================================
// Cat-threat probability — useful for AI risk assessment
// =============================================================================
// "I will roll <5 with this hand" is the cat-attack trigger when adjacent to a
// live cat. AI should avoid hands with high P(sum<5) when in cat range.

export function pSumLessThan(hand: DiceLevel[], threshold: number): number {
  if (hand.length === 0) return threshold > 0 ? 1 : 0;
  const pmf = sumDistribution(hand);
  let p = 0;
  for (let v = 0; v < Math.min(threshold, pmf.length); v++) p += pmf[v];
  return p;
}
