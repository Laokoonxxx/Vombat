import { useMemo, useState } from 'react';
import type { DiceLevel } from '../game/types';
import { fieldProbabilities, expectedSum, FIELD_RANGES } from '../game/probabilities';

// =============================================================================
// DiceProbabilityViewer — full-screen reference table
// =============================================================================
// Shows P(sum ∈ rozsah pole) for every valid Hand composition (1-6 dice with
// max 2 of each level). Same math the AI uses for pre-roll swap decisions.
//
// Hands are canonical multisets in non-decreasing level order. With 7 levels
// (k2/k4/k6/k8/k10/k12/k20) and max-2 constraint, totals are:
//   size 1 → 7    size 4 → 161
//   size 2 → 28   size 5 → 266
//   size 3 → 77   size 6 → 357
// Total 896 rows. Precomputed once via useMemo.
// =============================================================================

const ALL_DICE: DiceLevel[] = [2, 4, 6, 8, 10, 12, 20];
const MAX_OF_SAME = 2;

type FieldKey = keyof typeof FIELD_RANGES;
const FIELD_KEYS: FieldKey[] = ['dirt', 'bed', 'tree', 'thorn', 'desert', 'cat', 'devil'];

// Enumerate all canonical multisets of given size with max 2 of each level.
// Returns sorted-by-level arrays (e.g. [2,4,4,8]).
function* enumerateHands(size: number, startIdx = 0, current: DiceLevel[] = []): Generator<DiceLevel[]> {
  if (current.length === size) {
    yield [...current];
    return;
  }
  for (let i = startIdx; i < ALL_DICE.length; i++) {
    const lvl = ALL_DICE[i];
    let count = 0;
    for (const d of current) if (d === lvl) count++;
    if (count >= MAX_OF_SAME) continue;
    current.push(lvl);
    yield* enumerateHands(size, i, current);
    current.pop();
  }
}

interface Row {
  hand: DiceLevel[];
  label: string;
  expected: number;
  // Probability per field (0..1)
  p: Record<FieldKey, number>;
}

function buildRows(size: number): Row[] {
  const rows: Row[] = [];
  for (const hand of enumerateHands(size)) {
    const p = fieldProbabilities(hand);
    rows.push({
      hand,
      label: hand.map((d) => `k${d}`).join(' + '),
      expected: expectedSum(hand),
      p,
    });
  }
  return rows;
}

type SortKey = 'hand' | 'expected' | FieldKey;
type SortDir = 'asc' | 'desc';

export function DiceProbabilityViewer({ onClose }: { onClose: () => void }) {
  const [size, setSize] = useState<number>(2);
  const [sortKey, setSortKey] = useState<SortKey>('hand');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Precompute rows for each hand size once and cache.
  const allSizeRows = useMemo(() => {
    const out: Record<number, Row[]> = {};
    for (let n = 1; n <= 6; n++) out[n] = buildRows(n);
    return out;
  }, []);

  const rows = allSizeRows[size];

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'hand') {
        // Lexicographic on dice arrays (smallest die first)
        const len = Math.max(a.hand.length, b.hand.length);
        for (let i = 0; i < len; i++) {
          cmp = (a.hand[i] ?? 0) - (b.hand[i] ?? 0);
          if (cmp !== 0) break;
        }
      } else if (sortKey === 'expected') {
        cmp = a.expected - b.expected;
      } else {
        cmp = a.p[sortKey] - b.p[sortKey];
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      // For numerical columns, default to descending (largest probability first)
      setSortDir(key === 'hand' ? 'asc' : 'desc');
    }
  }

  function arrow(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0 }}>🎲 Pravděpodobnosti kostek</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
            Pro každou kombinaci kostek v Ruce (až 6, max 2 stejné velikosti):
            pravděpodobnost, že součet trefí aktivační rozsah daného pole.
            Stejný výpočet používá AI při pre-roll swapu.
          </p>
        </div>
        <button onClick={onClose}>↩ Zpět</button>
      </div>

      {/* Hand size tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            onClick={() => setSize(n)}
            className={size === n ? 'primary' : ''}
            style={{ minWidth: 80 }}
          >
            {n} {n === 1 ? 'kostka' : n < 5 ? 'kostky' : 'kostek'} ({allSizeRows[n].length})
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
        💡 Klikni na záhlaví sloupce pro řazení. Barvy: 🟢 ≥ 50 % · 🟡 20–50 % · 🔴 1–20 % · — 0 %.
        <br />
        Aktivační rozsahy:&nbsp;
        🟫&nbsp;Hlína 2–4 · 🌱&nbsp;Záhon 4–6 · 🌳&nbsp;Strom 7–8 · 🌵&nbsp;Houští 5–9 ·
        🏜️&nbsp;Poušť 7+ · 🐱&nbsp;Kočka 11–14 · 👹&nbsp;Čert 12+.
      </p>

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f5efe0' }}>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <Th onClick={() => toggleSort('hand')}>Ruka{arrow('hand')}</Th>
              <Th onClick={() => toggleSort('expected')} align="right">E[Σ]{arrow('expected')}</Th>
              {FIELD_KEYS.map((fk) => (
                <Th key={fk} onClick={() => toggleSort(fk)} align="right" title={`${FIELD_RANGES[fk].label} (${FIELD_RANGES[fk].min}-${FIELD_RANGES[fk].max === 99 ? '+' : FIELD_RANGES[fk].max})`}>
                  {FIELD_RANGES[fk].label.split(' ')[0]}{arrow(fk)}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{r.label}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--muted)' }}>
                  {r.expected.toFixed(1)}
                </td>
                {FIELD_KEYS.map((fk) => (
                  <ProbCell key={fk} prob={r.p[fk]} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
        Vygenerováno z <code>src/game/probabilities.ts</code>. Pro Houští platí, že 5–9 je rozsah
        pro <strong>pohyb</strong>; pro <strong>využití pole</strong> (zisk kostky z Houští) je práh
        vyšší podle kostky na hexu: k4 → 5+, k6 → 7+, k8 → 9+. Pro Poušť: rozsah pro pohyb i akci je
        stejný (7+), ale vyžaduje dovednost Lázně.
      </div>
    </div>
  );
}

function Th({
  children, onClick, align = 'left', title,
}: { children: React.ReactNode; onClick?: () => void; align?: 'left' | 'right'; title?: string }) {
  return (
    <th
      onClick={onClick}
      title={title}
      style={{
        padding: '8px',
        cursor: onClick ? 'pointer' : 'default',
        textAlign: align,
        userSelect: 'none',
        fontWeight: 600,
        color: 'var(--muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function ProbCell({ prob }: { prob: number }) {
  // Color coding: green ≥50 %, yellow 20-50 %, red 1-20 %, gray 0 %.
  const pct = prob * 100;
  let bg = 'transparent';
  let color = 'var(--muted)';
  if (pct >= 50) {
    bg = '#c6e9b8';
    color = '#2d4f1a';
  } else if (pct >= 20) {
    bg = '#fff5cf';
    color = '#7a5a14';
  } else if (pct >= 1) {
    bg = '#fadcd2';
    color = '#7a2b1a';
  }
  return (
    <td
      style={{
        padding: '4px 8px',
        textAlign: 'right',
        background: bg,
        color,
        fontWeight: pct >= 1 ? 600 : 400,
      }}
    >
      {pct === 0 ? '—' : pct < 1 ? '<1%' : `${pct.toFixed(0)}%`}
    </td>
  );
}
