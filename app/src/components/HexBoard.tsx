import { useMemo, type MouseEvent } from 'react';
import type { BoardCell, GameState, Hex } from '../game/types';
import { hexKey } from '../game/types';
import { hexCorners, hexToPixel } from '../game/hex';

const HEX_SIZE = 58;

// =============================================================================
// PER-BIOME RICH TERRAIN ART
// =============================================================================
// Each renderXxxArt(cx, cy, c) returns SVG sub-elements that draw the biome's
// signature landmarks/textures CENTERED inside a hex of size HEX_SIZE.
// They are clipped to the hex shape via clipPath.
//
// Visual vocabulary mirrors Mage Knight / Scythe:
//   - Heavy painterly gradients
//   - Silhouetted landmarks (barns, ruins, trees, towers)
//   - Atmospheric color tinting
//   - Clean foreground reads under markers/vombats overlay
// =============================================================================

function renderDirtArt(cx: number, cy: number): JSX.Element {
  // Pure dirt — bez doupěte, bez staveb. Jen jemné hliněné motivy:
  // hroudy, drobné kameny, lehké stínování pro texture.
  return (
    <g>
      {/* Soft earth bands (subtle lighter/darker patches) */}
      <ellipse cx={cx - 8} cy={cy - 4} rx={26} ry={8} fill="#d68a3d" opacity="0.18" />
      <ellipse cx={cx + 10} cy={cy + 10} rx={22} ry={6} fill="#7a4710" opacity="0.22" />

      {/* Small dirt clumps scattered (low-contrast tečky/grudky) */}
      <g opacity="0.55">
        <ellipse cx={cx - 18} cy={cy - 6} rx={3} ry={1.6} fill="#5a2e08" />
        <ellipse cx={cx + 4} cy={cy - 10} rx={2.4} ry={1.3} fill="#5a2e08" />
        <ellipse cx={cx + 16} cy={cy - 2} rx={3.2} ry={1.5} fill="#5a2e08" />
        <ellipse cx={cx - 6} cy={cy + 4} rx={2.6} ry={1.3} fill="#5a2e08" />
        <ellipse cx={cx + 22} cy={cy + 10} rx={2.8} ry={1.4} fill="#5a2e08" />
        <ellipse cx={cx - 22} cy={cy + 14} rx={3.4} ry={1.6} fill="#5a2e08" />
        <ellipse cx={cx - 10} cy={cy + 18} rx={2.4} ry={1.3} fill="#5a2e08" />
        <ellipse cx={cx + 10} cy={cy + 20} rx={3.2} ry={1.5} fill="#5a2e08" />
      </g>

      {/* Pár drobných oblázků s outlinem (žádná masivnost) */}
      <g style={{ filter: 'drop-shadow(0 0.5px 0.8px rgba(0,0,0,0.4))' }}>
        <ellipse cx={cx + 14} cy={cy + 12} rx={3} ry={1.8} fill="#8a5e2a" stroke="#3a2010" strokeWidth="0.35" />
        <ellipse cx={cx - 14} cy={cy - 12} rx={2.2} ry={1.4} fill="#7a5028" stroke="#3a2010" strokeWidth="0.35" />
      </g>
    </g>
  );
}

function renderBedArt(cx: number, cy: number): JSX.Element {
  // Lush meadow patch with wild carrots growing — natural clearing where
  // zvířata pasou. Žádné lidské zahrady.
  return (
    <g>
      {/* Grass tufts scattered across hex */}
      <g opacity="0.75">
        {[
          [cx - 24, cy + 14],
          [cx - 14, cy + 18],
          [cx + 18, cy + 16],
          [cx + 26, cy + 8],
          [cx - 26, cy - 2],
          [cx + 4, cy + 22],
        ].map(([gx, gy], i) => (
          <path
            key={i}
            d={`M ${gx} ${gy} l -3 -7 m 3 7 l 0 -9 m 0 9 l 3 -7`}
            stroke="#2a5018" strokeWidth="1.3" fill="none"
          />
        ))}
      </g>

      {/* Cluster of wild carrots — orange roots with green leafy tops */}
      <g style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))' }}>
        {[
          [cx - 6, cy - 8, 1.0],
          [cx + 4, cy - 10, 0.85],
          [cx + 12, cy - 4, 0.95],
          [cx - 14, cy - 2, 0.9],
        ].map(([rx, ry, scale], i) => (
          <g key={i} transform={`translate(${rx} ${ry}) scale(${scale})`}>
            {/* Carrot root (tapered orange triangle) */}
            <path d="M -3 0 L 3 0 L 0 10 Z" fill="#e07820" stroke="#5a2e08" strokeWidth="0.5" />
            {/* Leafy top — feathery green fronds */}
            <path d="M -4 0 l 1 -6 M -2 0 l 0 -8 M 0 0 l 1 -7 M 2 0 l -1 -7 M 4 0 l -1 -6"
              stroke="#2a8a32" strokeWidth="1.4" fill="none" strokeLinecap="round" />
          </g>
        ))}
      </g>

      {/* Tiny yellow wildflowers */}
      <g opacity="0.85">
        <circle cx={cx + 22} cy={cy + 22} r={1.5} fill="#f5d040" />
        <circle cx={cx - 22} cy={cy + 22} r={1.5} fill="#f5d040" />
        <circle cx={cx + 10} cy={cy + 24} r={1.2} fill="#f5d040" />
      </g>
    </g>
  );
}

function renderDesertArt(cx: number, cy: number): JSX.Element {
  // Pouze poušť — duny, písek, drobné kameny a praskliny. Bez masivní skály
  // co by odváděla pozornost.
  return (
    <g>
      {/* 3 dune curves přes celý hex — vlna písku */}
      <path d={`M ${cx - 40} ${cy - 8} Q ${cx - 14} ${cy - 14}, ${cx + 8} ${cy - 10} Q ${cx + 28} ${cy - 6}, ${cx + 40} ${cy - 8}`}
        stroke="#b88a3a" strokeWidth="1.4" fill="none" opacity="0.55" />
      <path d={`M ${cx - 38} ${cy + 4} Q ${cx - 12} ${cy - 2}, ${cx + 10} ${cy + 4} Q ${cx + 30} ${cy + 8}, ${cx + 40} ${cy + 4}`}
        stroke="#a87a30" strokeWidth="1.3" fill="none" opacity="0.55" />
      <path d={`M ${cx - 40} ${cy + 18} Q ${cx - 14} ${cy + 12}, ${cx + 8} ${cy + 18} Q ${cx + 28} ${cy + 22}, ${cx + 40} ${cy + 18}`}
        stroke="#a87a30" strokeWidth="1.2" fill="none" opacity="0.5" />
      <path d={`M ${cx - 36} ${cy + 28} Q ${cx - 8} ${cy + 22}, ${cx + 14} ${cy + 28} Q ${cx + 30} ${cy + 32}, ${cx + 38} ${cy + 26}`}
        stroke="#a87a30" strokeWidth="1" fill="none" opacity="0.45" />

      {/* Drobné rozpukané praskliny — sun-baked earth (suchá podlaha) */}
      <g opacity="0.55">
        <path d={`M ${cx - 14} ${cy + 8} l 5 4 l -2 5 l 4 3`} stroke="#5a3a10" strokeWidth="0.7" fill="none" />
        <path d={`M ${cx + 12} ${cy - 6} l 3 5 l -4 3 l 5 4`} stroke="#5a3a10" strokeWidth="0.7" fill="none" />
        <path d={`M ${cx - 6} ${cy - 14} l 2 5 l -3 2`} stroke="#5a3a10" strokeWidth="0.6" fill="none" />
      </g>

      {/* Pár malých kamínků/oblázků (žádné masivní skály) */}
      <g style={{ filter: 'drop-shadow(0 0.5px 0.8px rgba(0,0,0,0.4))' }}>
        <ellipse cx={cx - 22} cy={cy + 4} rx={2.4} ry={1.4} fill="#a07440" stroke="#5a3a18" strokeWidth="0.35" />
        <ellipse cx={cx + 8} cy={cy + 14} rx={1.8} ry={1.1} fill="#b08850" stroke="#5a3a18" strokeWidth="0.35" />
        <ellipse cx={cx + 18} cy={cy - 8} rx={2} ry={1.2} fill="#a07440" stroke="#5a3a18" strokeWidth="0.35" />
      </g>

      {/* Subtle sun glare / heat shimmer (subtle warm circle highlight) */}
      <circle cx={cx - 6} cy={cy - 14} r={6} fill="#fcefb0" opacity="0.15" />
    </g>
  );
}

function renderTreeArt(cx: number, cy: number): JSX.Element {
  // Eucalyptus tree with KOALA sitting on a branch.
  // Stěžejní postava = koala (proto se mu říká hex Eukalyptus — habitat koaly).
  return (
    <g>
      {/* Eucalyptus tree trunk (single, tall, curved) */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,30,60,0.65))' }}>
        <path d={`M ${cx - 4} ${cy + 22}
                  Q ${cx - 6} ${cy + 4}, ${cx - 8} ${cy - 8}
                  L ${cx - 4} ${cy - 14}
                  L ${cx - 2} ${cy - 8}
                  Q ${cx} ${cy + 4}, ${cx} ${cy + 22} Z`}
          fill="#3a2818"
          stroke="#1a0e02"
          strokeWidth="0.7"
        />
        {/* Side branch (where koala sits) */}
        <path d={`M ${cx - 6} ${cy - 4}
                  Q ${cx + 4} ${cy - 8}, ${cx + 14} ${cy - 4}`}
          stroke="#3a2818" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      </g>

      {/* Eucalyptus leaves — clusters of long narrow leaves */}
      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,30,60,0.5))' }}>
        {/* Upper foliage cluster */}
        <ellipse cx={cx - 3} cy={cy - 18} rx={14} ry={8} fill="#3a6e5a" />
        <ellipse cx={cx - 3} cy={cy - 18} rx={10} ry={5} fill="#5a9078" opacity="0.65" />
        {/* Individual leaf hints */}
        <path d={`M ${cx - 10} ${cy - 20} q 2 -3, 0 -6 q -2 3, 0 6 Z`} fill="#7aab90" opacity="0.7" />
        <path d={`M ${cx + 4} ${cy - 22} q 2 -3, 0 -6 q -2 3, 0 6 Z`} fill="#7aab90" opacity="0.7" />
        <path d={`M ${cx + 8} ${cy - 18} q 2 -3, 0 -6 q -2 3, 0 6 Z`} fill="#7aab90" opacity="0.6" />
      </g>

      {/* KOALA on the branch — grey furry body with big round ears */}
      <g style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.7))' }}>
        {/* Body (round grey blob hugging branch) */}
        <ellipse cx={cx + 6} cy={cy - 2} rx={9} ry={8} fill="#9a9a98" stroke="#3a3a38" strokeWidth="0.8" />
        {/* Belly highlight */}
        <ellipse cx={cx + 6} cy={cy + 1} rx={6} ry={4} fill="#c8c4be" opacity="0.7" />
        {/* Head (slightly above body) */}
        <circle cx={cx + 6} cy={cy - 9} r={6.5} fill="#9a9a98" stroke="#3a3a38" strokeWidth="0.8" />
        {/* Ears — big round fluffy on either side */}
        <ellipse cx={cx + 1} cy={cy - 12} rx={3.5} ry={4} fill="#9a9a98" stroke="#3a3a38" strokeWidth="0.6" />
        <ellipse cx={cx + 11} cy={cy - 12} rx={3.5} ry={4} fill="#9a9a98" stroke="#3a3a38" strokeWidth="0.6" />
        {/* Inner ear pink */}
        <ellipse cx={cx + 1} cy={cy - 11.5} rx={1.8} ry={2.5} fill="#e0a8a0" />
        <ellipse cx={cx + 11} cy={cy - 11.5} rx={1.8} ry={2.5} fill="#e0a8a0" />
        {/* Eyes */}
        <circle cx={cx + 4} cy={cy - 9} r={1.2} fill="#1a0e02" />
        <circle cx={cx + 8} cy={cy - 9} r={1.2} fill="#1a0e02" />
        {/* Eye highlights */}
        <circle cx={cx + 4.3} cy={cy - 9.3} r={0.4} fill="#fff" />
        <circle cx={cx + 8.3} cy={cy - 9.3} r={0.4} fill="#fff" />
        {/* Nose (big black oval) */}
        <ellipse cx={cx + 6} cy={cy - 6.5} rx={2.2} ry={1.6} fill="#1a0e02" />
        {/* Nose highlight */}
        <ellipse cx={cx + 5.4} cy={cy - 7} rx={0.5} ry={0.3} fill="#fff" opacity="0.8" />
      </g>
    </g>
  );
}

function renderThornArt(cx: number, cy: number): JSX.Element {
  // Thorny wilderness: jagged bushes + spiky shrubs
  return (
    <g>
      {/* Multiple thorny bush silhouettes */}
      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,30,0,0.55))' }}>
        {/* Bush 1 left — star-shape thorny */}
        <path d={`M ${cx - 20} ${cy + 4}
                  l -2 -8 l 4 2 l 2 -7 l 3 7 l 5 -3 l -2 8 l 7 -1 l -5 5 l 5 5 l -8 0 l 0 7 l -5 -5 l -6 4 l 2 -7 l -7 -2 z`}
          fill="#3e7a22" stroke="#1c3e10" strokeWidth="0.8" />
        {/* Tiny berries */}
        <circle cx={cx - 20} cy={cy + 4} r={1.5} fill="#b82a2a" />
        <circle cx={cx - 16} cy={cy} r={1.5} fill="#b82a2a" />
      </g>

      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,30,0,0.55))' }}>
        {/* Bush 2 right */}
        <path d={`M ${cx + 16} ${cy - 4}
                  l -1 -6 l 3 1 l 2 -5 l 2 5 l 4 -2 l -1 6 l 5 -1 l -4 4 l 4 4 l -6 0 l 0 5 l -4 -4 l -4 3 l 1 -5 l -5 -1 z`}
          fill="#356a1c" stroke="#1c3e10" strokeWidth="0.8" />
      </g>

      {/* Long jagged grass tufts scattered */}
      <g opacity="0.7">
        {[
          [cx - 30, cy + 14],
          [cx + 22, cy + 18],
          [cx - 4, cy + 20],
          [cx + 30, cy - 4],
        ].map(([gx, gy], i) => (
          <path
            key={i}
            d={`M ${gx} ${gy} l -3 -6 m 3 6 l 0 -8 m 0 8 l 3 -6`}
            stroke="#2a5a18" strokeWidth="1.4" fill="none"
          />
        ))}
      </g>
    </g>
  );
}

function renderCatArt(cx: number, cy: number, alive: boolean): JSX.Element {
  if (!alive) {
    return renderTunnelArt(cx, cy);
  }
  // Hrozivý predátor: temná jeskyně, ZE STÍNU vyčnívá kočičí hlava
  // s vyceněnými zuby a žhnoucíma červenýma očima, kolem hexu drápance
  // a roztroušené kosti kořisti. Cítí se to jako "TADY POZOR".
  return (
    <g>
      {/* Subtle red danger atmosphere — naznačení nebezpečí */}
      <circle cx={cx} cy={cy + 2} r={32} fill="#c4201a" opacity="0.10" />
      <circle cx={cx} cy={cy + 2} r={20} fill="#c4201a" opacity="0.14" />

      {/* Drápance — 3 paralelní oblouky napříč hexem (čerstvé claw marks) */}
      <g style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.55))' }}>
        <path d={`M ${cx - 32} ${cy - 10} Q ${cx - 18} ${cy - 4}, ${cx - 4} ${cy - 12}`}
          stroke="#2a0a04" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.75" />
        <path d={`M ${cx - 30} ${cy - 4} Q ${cx - 16} ${cy + 2}, ${cx - 2} ${cy - 6}`}
          stroke="#2a0a04" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.75" />
        <path d={`M ${cx - 28} ${cy + 2} Q ${cx - 14} ${cy + 8}, ${cx} ${cy}`}
          stroke="#2a0a04" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity="0.7" />
      </g>

      {/* Skalnatá ústa jeskyně — tmavá silueta */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.85))' }}>
        <path d={`M ${cx - 22} ${cy + 22}
                  L ${cx - 24} ${cy + 6}
                  Q ${cx - 14} ${cy - 6}, ${cx - 2} ${cy - 10}
                  Q ${cx + 16} ${cy - 8}, ${cx + 22} ${cy + 4}
                  L ${cx + 24} ${cy + 22} Z`}
          fill="#1a0a04" stroke="#000" strokeWidth="1.2" />
        {/* Vnitřní temnota (ještě tmavší než silueta) */}
        <ellipse cx={cx} cy={cy + 8} rx={16} ry={12} fill="#000" />
      </g>

      {/* KOČIČÍ HLAVA — vyčnívá ze stínu, jen částečně viditelná */}
      <g style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.85))' }}>
        {/* Špičaté uši */}
        <path d={`M ${cx - 10} ${cy - 2} L ${cx - 12} ${cy - 12} L ${cx - 4} ${cy - 6} Z`}
          fill="#3a2410" stroke="#000" strokeWidth="0.7" />
        <path d={`M ${cx + 10} ${cy - 2} L ${cx + 12} ${cy - 12} L ${cx + 4} ${cy - 6} Z`}
          fill="#3a2410" stroke="#000" strokeWidth="0.7" />
        {/* Vnitřní růžová uší */}
        <path d={`M ${cx - 9} ${cy - 4} L ${cx - 10} ${cy - 10} L ${cx - 6} ${cy - 6} Z`}
          fill="#7a3a30" opacity="0.85" />
        <path d={`M ${cx + 9} ${cy - 4} L ${cx + 10} ${cy - 10} L ${cx + 6} ${cy - 6} Z`}
          fill="#7a3a30" opacity="0.85" />
        {/* Vlastní hlava — vystupující z temnoty */}
        <path d={`M ${cx - 12} ${cy - 2}
                  Q ${cx - 14} ${cy + 8}, ${cx - 8} ${cy + 12}
                  Q ${cx} ${cy + 16}, ${cx + 8} ${cy + 12}
                  Q ${cx + 14} ${cy + 8}, ${cx + 12} ${cy - 2}
                  Q ${cx + 10} ${cy - 6}, ${cx} ${cy - 6}
                  Q ${cx - 10} ${cy - 6}, ${cx - 12} ${cy - 2} Z`}
          fill="#3a2410" stroke="#000" strokeWidth="0.9" />
        {/* Subtle highlight pro definici tvaru */}
        <path d={`M ${cx - 8} ${cy + 2} Q ${cx} ${cy - 2}, ${cx + 8} ${cy + 2}`}
          stroke="#5a3a20" strokeWidth="0.6" fill="none" opacity="0.6" />
      </g>

      {/* ŽHNOUCÍ ČERVENÉ OČI — slit pupils, glowy */}
      <g style={{ filter: 'drop-shadow(0 0 4px #ff2010)' }}>
        <ellipse cx={cx - 5} cy={cy + 3} rx={2.6} ry={3.4} fill="#ffaa20" />
        <ellipse cx={cx + 5} cy={cy + 3} rx={2.6} ry={3.4} fill="#ffaa20" />
        {/* Vertical slit pupily — predator look */}
        <rect x={cx - 5.6} y={cy + 0.5} width={1.2} height={5} fill="#000" rx={0.4} />
        <rect x={cx + 4.4} y={cy + 0.5} width={1.2} height={5} fill="#000" rx={0.4} />
        {/* Tiny white catchlight */}
        <circle cx={cx - 4.2} cy={cy + 1.8} r={0.5} fill="#fff" opacity="0.9" />
        <circle cx={cx + 5.8} cy={cy + 1.8} r={0.5} fill="#fff" opacity="0.9" />
      </g>

      {/* OTEVŘENÁ TLAMA — vycenené zuby */}
      <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.7))' }}>
        {/* Dark mouth interior */}
        <path d={`M ${cx - 5} ${cy + 9}
                  Q ${cx} ${cy + 13}, ${cx + 5} ${cy + 9}
                  L ${cx + 4} ${cy + 11}
                  Q ${cx} ${cy + 14}, ${cx - 4} ${cy + 11} Z`}
          fill="#3a0000" />
        {/* Horní zuby (fangs visible) */}
        <path d={`M ${cx - 4} ${cy + 9.5} L ${cx - 3} ${cy + 12} L ${cx - 2} ${cy + 9.5} Z`}
          fill="#f5ebd6" stroke="#3a2a18" strokeWidth="0.3" />
        <path d={`M ${cx + 2} ${cy + 9.5} L ${cx + 3} ${cy + 12} L ${cx + 4} ${cy + 9.5} Z`}
          fill="#f5ebd6" stroke="#3a2a18" strokeWidth="0.3" />
      </g>

      {/* Roztroušené kosti kořisti (drobné, v rohu) */}
      <g style={{ filter: 'drop-shadow(0 0.5px 0.8px rgba(0,0,0,0.5))' }} opacity="0.85">
        {/* Bone 1 — small humerus shape */}
        <g transform={`translate(${cx + 18} ${cy + 22}) rotate(-25)`}>
          <ellipse cx={-4} cy={0} rx={1.6} ry={1.2} fill="#f0e4c4" />
          <ellipse cx={4} cy={0} rx={1.6} ry={1.2} fill="#f0e4c4" />
          <rect x={-3} y={-0.7} width={6} height={1.4} fill="#f0e4c4" />
        </g>
        {/* Bone 2 — even smaller */}
        <g transform={`translate(${cx - 22} ${cy + 24}) rotate(45)`}>
          <ellipse cx={-2.5} cy={0} rx={1.1} ry={0.9} fill="#e0d4b4" />
          <ellipse cx={2.5} cy={0} rx={1.1} ry={0.9} fill="#e0d4b4" />
          <rect x={-2} y={-0.5} width={4} height={1} fill="#e0d4b4" />
        </g>
      </g>
    </g>
  );
}

function renderDevilArt(cx: number, cy: number): JSX.Element {
  // TASMÁNSKÝ ČERT (Sarcophilus harrisii) — skutečné australské zvíře.
  // Černá srst, bílý pruh na hrudi a krku, růžové uši, ostré zuby.
  // Pozadí zůstává tmavě červené (gameplay = nepřátelské černé pole).
  return (
    <g>
      {/* Subtle aggressive aura — naznačení nebezpečí */}
      <circle cx={cx} cy={cy + 2} r={28} fill="#c44020" opacity="0.12" />

      {/* TĚLO — squat black furry mass, low to ground */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.85))' }}>
        {/* Hind quarters (vyšší kupole vzadu) */}
        <ellipse cx={cx + 12} cy={cy + 6} rx={12} ry={9} fill="#1a0e0e" stroke="#000" strokeWidth="0.8" />
        {/* Shoulders + chest (přední část těla) */}
        <ellipse cx={cx - 4} cy={cy + 4} rx={12} ry={10} fill="#1a0e0e" stroke="#000" strokeWidth="0.8" />
        {/* White chest stripe (signature znak tasmánského čerta) */}
        <path d={`M ${cx - 10} ${cy + 4}
                  Q ${cx - 4} ${cy + 8}, ${cx + 4} ${cy + 6}
                  L ${cx + 4} ${cy + 10}
                  Q ${cx - 4} ${cy + 12}, ${cx - 10} ${cy + 8} Z`}
          fill="#f5ebd6" opacity="0.95" />
        {/* White stripe on hindquarter (zadek) */}
        <path d={`M ${cx + 16} ${cy + 12}
                  Q ${cx + 22} ${cy + 8}, ${cx + 22} ${cy + 4}
                  L ${cx + 24} ${cy + 4}
                  Q ${cx + 24} ${cy + 10}, ${cx + 18} ${cy + 14} Z`}
          fill="#f5ebd6" opacity="0.85" />
        {/* Tail (krátký a tlustý, low-pointing) */}
        <path d={`M ${cx + 22} ${cy + 8}
                  Q ${cx + 28} ${cy + 14}, ${cx + 30} ${cy + 20}
                  L ${cx + 26} ${cy + 20}
                  Q ${cx + 22} ${cy + 14}, ${cx + 18} ${cy + 12} Z`}
          fill="#1a0e0e" stroke="#000" strokeWidth="0.6" />
        {/* Legs (4 short stubby) */}
        <ellipse cx={cx - 10} cy={cy + 16} rx={3} ry={4} fill="#1a0e0e" />
        <ellipse cx={cx - 2} cy={cy + 17} rx={3} ry={4} fill="#1a0e0e" />
        <ellipse cx={cx + 8} cy={cy + 17} rx={3} ry={4} fill="#1a0e0e" />
        <ellipse cx={cx + 18} cy={cy + 17} rx={3} ry={4} fill="#1a0e0e" />
      </g>

      {/* HLAVA — big stocky head with pink ears */}
      <g style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.85))' }}>
        {/* Ears — triangle s pink inside */}
        <path d={`M ${cx - 14} ${cy - 8} L ${cx - 18} ${cy - 18} L ${cx - 10} ${cy - 14} Z`}
          fill="#1a0e0e" stroke="#000" strokeWidth="0.6" />
        <path d={`M ${cx - 13} ${cy - 9} L ${cx - 15} ${cy - 15} L ${cx - 11} ${cy - 13} Z`}
          fill="#d27a78" />
        <path d={`M ${cx - 4} ${cy - 12} L ${cx - 6} ${cy - 22} L ${cx + 2} ${cy - 16} Z`}
          fill="#1a0e0e" stroke="#000" strokeWidth="0.6" />
        <path d={`M ${cx - 3} ${cy - 13} L ${cx - 4} ${cy - 19} L ${cx} ${cy - 15} Z`}
          fill="#d27a78" />
        {/* Head main mass */}
        <ellipse cx={cx - 10} cy={cy - 6} rx={10} ry={8} fill="#1a0e0e" stroke="#000" strokeWidth="0.9" />
        {/* Snout (slightly lighter, protruding) */}
        <ellipse cx={cx - 18} cy={cy - 4} rx={6} ry={4.5} fill="#2a1a1a" stroke="#000" strokeWidth="0.6" />
        {/* Nose tip */}
        <ellipse cx={cx - 22} cy={cy - 3} rx={1.4} ry={1.2} fill="#000" />
        {/* Eyes — red glowing (mírně agresivní vibe) */}
        <circle cx={cx - 13} cy={cy - 8} r={1.6} fill="#ff3a20" style={{ filter: 'drop-shadow(0 0 2px #ff3a20)' }} />
        <circle cx={cx - 7} cy={cy - 7} r={1.6} fill="#ff3a20" style={{ filter: 'drop-shadow(0 0 2px #ff3a20)' }} />
        {/* Open mouth showing teeth */}
        <path d={`M ${cx - 22} ${cy - 1}
                  Q ${cx - 18} ${cy + 2}, ${cx - 12} ${cy + 1}
                  L ${cx - 12} ${cy + 2}
                  Q ${cx - 18} ${cy + 4}, ${cx - 22} ${cy + 1} Z`}
          fill="#1a0000" />
        {/* Small white fangs */}
        <path d={`M ${cx - 20} ${cy + 1} l 0.5 1.5 l 1 -1.5 Z`} fill="#f5ebd6" />
        <path d={`M ${cx - 16} ${cy + 1} l 0.5 1.5 l 1 -1.5 Z`} fill="#f5ebd6" />
        <path d={`M ${cx - 14} ${cy + 1.5} l 0.5 1.5 l 1 -1.5 Z`} fill="#f5ebd6" />
      </g>

      {/* Drobné ember particles — náznak agresivity / nebezpečí */}
      <g style={{ filter: 'drop-shadow(0 0 2px #ffaa30)' }}>
        <circle cx={cx - 28} cy={cy + 14} r={1} fill="#ffaa30" opacity="0.7" />
        <circle cx={cx + 22} cy={cy - 8} r={0.8} fill="#ff7a20" opacity="0.65" />
        <circle cx={cx + 24} cy={cy + 22} r={1.1} fill="#ff8a20" opacity="0.75" />
      </g>
    </g>
  );
}

// Vykreslí kostku na Houští — tvarem i barvou rozlišený podle úrovně.
//   k4 → trojúhelník (tetrahedron), žlutá — nejlehčí
//   k6 → krychle, modrá — střední
//   k8 → kosočtverec (octahedron), červená — největší zisk
function renderThornDie(cx: number, cy: number, level: 2 | 4 | 6 | 8): JSX.Element {
  const dx = cx;
  const dy = cy + HEX_SIZE * 0.5;

  if (level === 4) {
    const fill = '#f7d758';
    const stroke = '#7a5810';
    return (
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.65))' }}>
        {/* Tetrahedron silhouette */}
        <path
          d={`M ${dx} ${dy - 13} L ${dx + 14} ${dy + 10} L ${dx - 14} ${dy + 10} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Inner edges suggesting 3D faces */}
        <path
          d={`M ${dx} ${dy - 13} L ${dx} ${dy + 10}`}
          stroke={stroke}
          strokeWidth="0.7"
          opacity="0.55"
        />
        {/* Top highlight */}
        <path
          d={`M ${dx - 5} ${dy + 4} L ${dx} ${dy - 10}`}
          stroke="#fff8c0"
          strokeWidth="1.2"
          opacity="0.55"
          strokeLinecap="round"
        />
        <text x={dx} y={dy + 5} className="hex-label" fontSize={9} fill="#3a2a08" fontWeight={800}>4</text>
      </g>
    );
  }

  if (level === 6) {
    const fill = '#4a8fcc';
    const stroke = '#163d6e';
    return (
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.65))' }}>
        {/* Cube — rounded square */}
        <rect
          x={dx - 12}
          y={dy - 12}
          width={24}
          height={24}
          rx={3.5}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
        />
        {/* Subtle bevel — light top edge */}
        <path
          d={`M ${dx - 9} ${dy - 9} L ${dx + 9} ${dy - 9}`}
          stroke="#9bc8ef"
          strokeWidth="1.5"
          opacity="0.7"
          strokeLinecap="round"
        />
        {/* Subtle bevel — darker bottom edge */}
        <path
          d={`M ${dx - 9} ${dy + 9} L ${dx + 9} ${dy + 9}`}
          stroke="#0e2a52"
          strokeWidth="0.8"
          opacity="0.5"
          strokeLinecap="round"
        />
        <text x={dx} y={dy + 1} className="hex-label" fontSize={11} fill="#fff" fontWeight={800}>6</text>
      </g>
    );
  }

  if (level === 8) {
    const fill = '#c84030';
    const stroke = '#5a0e08';
    return (
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.65))' }}>
        {/* Octahedron — diamond */}
        <path
          d={`M ${dx} ${dy - 14} L ${dx + 13} ${dy} L ${dx} ${dy + 14} L ${dx - 13} ${dy} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        {/* Equator line dividing upper/lower pyramid */}
        <path
          d={`M ${dx - 13} ${dy} L ${dx + 13} ${dy}`}
          stroke={stroke}
          strokeWidth="0.8"
          opacity="0.65"
        />
        {/* Top edge highlight */}
        <path
          d={`M ${dx} ${dy - 14} L ${dx + 7} ${dy - 7}`}
          stroke="#ff9080"
          strokeWidth="1.3"
          opacity="0.65"
          strokeLinecap="round"
        />
        <text x={dx} y={dy + 3} className="hex-label" fontSize={11} fill="#fff" fontWeight={800}>8</text>
      </g>
    );
  }

  // Fallback (k2 — neměl by se na houští vyskytovat, ale defenzivně)
  return (
    <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>
      <rect x={dx - 10} y={dy - 10} width={20} height={20} rx={3}
        fill="#fff8e0" stroke="#1a0e02" strokeWidth="1.5" />
      <text x={dx} y={dy + 2} className="hex-label" fontSize={10} fill="#1a0e02" fontWeight={700}>{level}</text>
    </g>
  );
}

function renderTunnelArt(cx: number, cy: number): JSX.Element {
  // Cave entrance with mystic glow
  return (
    <g>
      {/* Rocky archway */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.8))' }}>
        <path d={`M ${cx - 18} ${cy + 18}
                  L ${cx - 18} ${cy - 2}
                  Q ${cx - 18} ${cy - 18}, ${cx} ${cy - 18}
                  Q ${cx + 18} ${cy - 18}, ${cx + 18} ${cy - 2}
                  L ${cx + 18} ${cy + 18}
                  L ${cx - 18} ${cy + 18} Z`}
          fill="#1a0e1a" stroke="#000" strokeWidth="1.2" />
        {/* Inner cave (slightly smaller, darker) */}
        <path d={`M ${cx - 13} ${cy + 16}
                  L ${cx - 13} ${cy - 2}
                  Q ${cx - 13} ${cy - 14}, ${cx} ${cy - 14}
                  Q ${cx + 13} ${cy - 14}, ${cx + 13} ${cy - 2}
                  L ${cx + 13} ${cy + 16} Z`}
          fill="#000" />
      </g>
      {/* Mystic blue-purple glow inside */}
      <circle cx={cx} cy={cy + 4} r={9} fill="#5a3aa0" opacity="0.35" />
      <circle cx={cx} cy={cy + 4} r={5} fill="#a080ff" opacity="0.4" />
      {/* Sparkle dots */}
      <circle cx={cx - 4} cy={cy + 2} r={0.8} fill="#fff" opacity="0.9" />
      <circle cx={cx + 5} cy={cy + 8} r={0.6} fill="#fff" opacity="0.7" />
      <circle cx={cx + 3} cy={cy - 4} r={0.7} fill="#fff" opacity="0.8" />
    </g>
  );
}

function renderTerrainArt(c: BoardCell, cx: number, cy: number): JSX.Element {
  const isTunnelOnly = c.type !== 'devil' && c.type !== 'cat' && c.isTunnel;
  if (isTunnelOnly) return renderTunnelArt(cx, cy);
  switch (c.type) {
    case 'dirt':   return renderDirtArt(cx, cy);
    case 'bed':    return renderBedArt(cx, cy);
    case 'desert': return renderDesertArt(cx, cy);
    case 'tree':   return renderTreeArt(cx, cy);
    case 'thorn':  return renderThornArt(cx, cy);
    case 'cat':    return renderCatArt(cx, cy, !!c.catAlive);
    case 'devil':  return renderDevilArt(cx, cy);
  }
}

// =============================================================================
// GAMEPLAY OVERLAYS
// =============================================================================

const ACTIVATION_LABEL: Record<BoardCell['type'], string> = {
  dirt:   '2-4',
  bed:    '4-6',
  desert: '7+',
  tree:   '7-8',
  thorn:  '5-9',
  cat:    '11-14',
  devil:  '12+',
};

const TYPE_NAME: Record<BoardCell['type'], string> = {
  dirt:   'Hlína (farma)',
  bed:    'Záhon (sad)',
  desert: 'Poušť (badlands)',
  tree:   'Eukalyptus (les)',
  thorn:  'Houští',
  cat:    'Kočka (lair)',
  devil:  'Tasmánský Čert',
};

function buildTooltip(c: BoardCell, isBlockedThorn: boolean): string {
  const parts: string[] = [TYPE_NAME[c.type]];
  switch (c.type) {
    case 'dirt':
      parts.push('Aktivace 2-4. Akce: Zasaď mrkev / Vyformuj kostku / Uč se.');
      break;
    case 'bed':
      parts.push('Aktivace 4-6. Akce: Zasaď mrkev (zvyšuje skóre Vyformování).');
      break;
    case 'desert':
      parts.push('Aktivace 7+. Akce jako Hlína - vyžaduje dovednost Koupel.');
      break;
    case 'tree':
      parts.push('Aktivace 7-8. Obsaď - kapitál pro učení dovedností.');
      break;
    case 'thorn':
      if (isBlockedThorn) {
        parts.push(`🚫 Blokováno kostkou 1k${c.thornDieLevel}. Nelze projít, dokud kostka leží na poli.`);
        const thresh = c.thornDieLevel === 4 ? 5 : c.thornDieLevel === 6 ? 7 : 9;
        parts.push(`Pro získání kostky: hodem ${thresh}+ na Využití pole.`);
      } else {
        parts.push('Aktivace 5-9 (pohyb). Volný - lze projít.');
      }
      break;
    case 'cat':
      if (c.catAlive) {
        parts.push('Aktivace 11-14 (rozdrcení zadkem → 1k8 + tunel). Pozor: útok při hodu <5 v sousedství.');
      } else {
        parts.push('Mrtvá kočka - tunel.');
      }
      break;
    case 'devil':
      parts.push('Aktivace 12+ (pohyb). Boj se vyhlašuje PŘED hodem.');
      break;
  }
  if (c.isTunnel) {
    parts.push('🕳️ Tunel: pokud STOJÍŠ na tunelu, můžeš teleportovat na libovolný jiný tunel. Sousedství nestačí.');
  }
  if (c.marker) {
    parts.push(`Obsazeno ${c.marker.kind === 'bobek' ? 'bobkem 💩' : 'mrkví 🥕'}.`);
  }
  return parts.join('\n');
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export interface HexBoardProps {
  state: GameState;
  clickableHexes?: Hex[];
  actionableHexes?: Hex[];
  selectedHex?: Hex | null;
  onHexClick?: (hex: Hex, event?: MouseEvent) => void;
}

const TYPE_BASE_GRAD: Record<BoardCell['type'], string> = {
  dirt:   'url(#grad-dirt)',
  bed:    'url(#grad-bed)',
  desert: 'url(#grad-desert)',
  tree:   'url(#grad-tree)',
  thorn:  'url(#grad-thorn)',
  cat:    'url(#grad-cat)',
  devil:  'url(#grad-devil)',
};

export function HexBoard({ state, clickableHexes, actionableHexes, selectedHex, onHexClick }: HexBoardProps) {
  const cells = useMemo(() => Array.from(state.board.values()), [state.board]);

  const clickableSet = useMemo(() => {
    const s = new Set<string>();
    clickableHexes?.forEach((h) => s.add(hexKey(h)));
    return s;
  }, [clickableHexes]);

  const actionableSet = useMemo(() => {
    const s = new Set<string>();
    actionableHexes?.forEach((h) => s.add(hexKey(h)));
    return s;
  }, [actionableHexes]);

  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    cells.forEach((c) => {
      const { x, y } = hexToPixel(c.hex, HEX_SIZE);
      minX = Math.min(minX, x - HEX_SIZE);
      maxX = Math.max(maxX, x + HEX_SIZE);
      minY = Math.min(minY, y - HEX_SIZE);
      maxY = Math.max(maxY, y + HEX_SIZE);
    });
    const pad = 36;
    return {
      minX: minX - pad,
      minY: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
    };
  }, [cells]);

  const corners = useMemo(() => hexCorners(HEX_SIZE), []);

  return (
    <svg
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      style={{
        maxWidth: '100%',
        maxHeight: '88vh',
        display: 'block',
        filter: 'drop-shadow(0 8px 20px rgba(15, 8, 0, 0.6))',
      }}
    >
      <defs>
        {/* Drop shadow for hexes */}
        <filter id="hex-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.5" dy="3" stdDeviation="2.2" floodOpacity="0.55" floodColor="#0a0500" />
        </filter>

        {/* Per-biome base gradients — painterly, multi-stop */}
        <linearGradient id="grad-dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e5a05c" />
          <stop offset="40%" stopColor="#c47820" />
          <stop offset="100%" stopColor="#6a3a0a" />
        </linearGradient>
        <linearGradient id="grad-bed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8b48a" />
          <stop offset="50%" stopColor="#7a8a5a" />
          <stop offset="100%" stopColor="#4a5a30" />
        </linearGradient>
        <linearGradient id="grad-desert" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fce5a8" />
          <stop offset="50%" stopColor="#dcb568" />
          <stop offset="100%" stopColor="#947030" />
        </linearGradient>
        <linearGradient id="grad-tree" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9bd0e8" />
          <stop offset="40%" stopColor="#3a82b3" />
          <stop offset="100%" stopColor="#103658" />
        </linearGradient>
        <linearGradient id="grad-thorn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9cd070" />
          <stop offset="50%" stopColor="#4a8a30" />
          <stop offset="100%" stopColor="#1c4a10" />
        </linearGradient>
        <radialGradient id="grad-cat" cx="50%" cy="45%" r="65%">
          <stop offset="0%" stopColor="#a06a3a" />
          <stop offset="60%" stopColor="#5a3a1c" />
          <stop offset="100%" stopColor="#1c0e08" />
        </radialGradient>
        <radialGradient id="grad-devil" cx="50%" cy="40%" r="72%">
          <stop offset="0%" stopColor="#9a2820" />
          <stop offset="40%" stopColor="#4a0e10" />
          <stop offset="100%" stopColor="#040000" />
        </radialGradient>

        {/* Highlight (top) + bottom darkening */}
        <linearGradient id="hex-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.35" />
        </linearGradient>

        {/* Actionable golden glow overlay */}
        <radialGradient id="actionable-glow">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
        </radialGradient>

        {/* Blocked thorn diagonal hatching */}
        <pattern id="thorn-block-hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
          <rect width="9" height="9" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(0,0,0,0.4)" strokeWidth="2.5" />
        </pattern>
      </defs>

      {cells.map((c) => {
        const { x, y } = hexToPixel(c.hex, HEX_SIZE);
        const points = corners.map((p) => `${x + p.x},${y + p.y}`).join(' ');
        const k = hexKey(c.hex);
        const clickable = clickableSet.has(k);
        const actionable = actionableSet.has(k);
        const isSelected = selectedHex && c.hex.q === selectedHex.q && c.hex.r === selectedHex.r;

        const isTunnelOnly = c.type !== 'devil' && c.type !== 'cat' && c.isTunnel;
        const isDeadCat = c.type === 'cat' && !c.catAlive;

        let fillGrad = TYPE_BASE_GRAD[c.type];
        // Tunnel & dead cat get a unified dark mystic base
        if (isDeadCat || isTunnelOnly) {
          fillGrad = 'url(#grad-devil)'; // reuse dark gradient as base; art on top draws cave
        }

        const isBlockedThorn = c.type === 'thorn' && c.thornDieLevel != null && !c.marker;
        const tooltip = buildTooltip(c, isBlockedThorn);

        const strokeColor = isSelected ? '#ffc845' : actionable ? '#f59820' : '#1a0e02';
        const strokeWidth = isSelected ? 4 : actionable ? 3 : 2.4;

        // Per-hex clipPath ID so terrain art doesn't bleed outside hex boundary
        const clipId = `hex-clip-${k.replace(',', '_')}`;

        return (
          <g
            key={k}
            className={`hex-cell ${clickable ? 'clickable' : ''} ${actionable ? 'actionable' : ''} ${isSelected ? 'highlighted' : ''}`}
            onClick={(e) => clickable && onHexClick && onHexClick(c.hex, e)}
          >
            <title>{tooltip}</title>

            {/* Per-hex clip path */}
            <defs>
              <clipPath id={clipId}>
                <polygon points={points} />
              </clipPath>
            </defs>

            {/* 1. Base gradient + drop shadow */}
            <polygon
              points={points}
              fill={fillGrad}
              filter="url(#hex-shadow)"
            />

            {/* 2. Painted terrain art (clipped to hex) */}
            <g clipPath={`url(#${clipId})`}>
              {renderTerrainArt(c, x, y)}
            </g>

            {/* 3. Top shine + bottom darkening (subtle) */}
            <polygon
              points={points}
              fill="url(#hex-shine)"
              pointerEvents="none"
            />

            {/* 4. Actionable golden glow */}
            {actionable && !isSelected && (
              <polygon
                points={points}
                fill="url(#actionable-glow)"
                pointerEvents="none"
              />
            )}

            {/* 6. Blocked thorn diagonal hatch */}
            {isBlockedThorn && (
              <polygon
                points={points}
                fill="url(#thorn-block-hatch)"
                pointerEvents="none"
              />
            )}

            {/* 7. Outer border (on top, sharp) */}
            <polygon
              points={points}
              fill="none"
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              pointerEvents="none"
            />

            {/* 8. Activation number — subtle light text, no background */}
            {!isTunnelOnly && !isDeadCat && (
              <text
                x={x}
                y={y - HEX_SIZE * 0.72}
                className="hex-label"
                fontSize={11}
                fill="#fdf3d3"
                fontWeight={300}
                opacity={0.85}
                style={{
                  letterSpacing: '0.05em',
                  paintOrder: 'stroke',
                  stroke: 'rgba(0,0,0,0.55)',
                  strokeWidth: '2px',
                  strokeLinejoin: 'round',
                }}
              >
                {ACTIVATION_LABEL[c.type]}
              </text>
            )}

            {/* 9. Thorn die — shape + color per level (k4/k6/k8) */}
            {c.type === 'thorn' && c.thornDieLevel != null && (
              renderThornDie(x, y, c.thornDieLevel)
            )}

            {/* 10. Blocked thorn ✕ badge */}
            {isBlockedThorn && (
              <g>
                <circle
                  cx={x - HEX_SIZE * 0.62}
                  cy={y - HEX_SIZE * 0.55}
                  r={11}
                  fill="rgba(196, 32, 16, 0.95)"
                  stroke="#fff"
                  strokeWidth={1.6}
                />
                <text
                  x={x - HEX_SIZE * 0.62}
                  y={y - HEX_SIZE * 0.55}
                  className="hex-label"
                  fontSize={14}
                  fill="#fff"
                  fontWeight={900}
                >
                  ✕
                </text>
              </g>
            )}

            {/* 11. Marker (bobek/mrkev) — shield emblem */}
            {c.marker && (() => {
              const markerColor = state.players.find((p) => p.id === c.marker!.playerId)?.color || '#000';
              return (
                <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.65))' }}>
                  <path
                    d={`M ${x + HEX_SIZE * 0.5 - 13} ${y - HEX_SIZE * 0.05}
                        L ${x + HEX_SIZE * 0.5 + 13} ${y - HEX_SIZE * 0.05}
                        L ${x + HEX_SIZE * 0.5 + 13} ${y - HEX_SIZE * 0.05 + 18}
                        L ${x + HEX_SIZE * 0.5} ${y - HEX_SIZE * 0.05 + 26}
                        L ${x + HEX_SIZE * 0.5 - 13} ${y - HEX_SIZE * 0.05 + 18} Z`}
                    fill={markerColor}
                    stroke="#1a0e02"
                    strokeWidth={1.6}
                  />
                  <text
                    x={x + HEX_SIZE * 0.5}
                    y={y - HEX_SIZE * 0.05 + 12}
                    className="hex-label"
                    fontSize={14}
                  >
                    {c.marker.kind === 'bobek' ? '💩' : '🥕'}
                  </text>
                </g>
              );
            })()}

            {/* 12. Vombat(s) — medallion token */}
            {state.players.map((p) =>
              p.vombats
                .filter((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r)
                .map((v, i) => (
                  <g key={v.id} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.7))' }}>
                    {/* Outer dark ring */}
                    <circle
                      cx={x - HEX_SIZE * 0.5 + i * 19}
                      cy={y + HEX_SIZE * 0.4}
                      r={17}
                      fill="#1a0e02"
                    />
                    {/* Player color disc */}
                    <circle
                      cx={x - HEX_SIZE * 0.5 + i * 19}
                      cy={y + HEX_SIZE * 0.4}
                      r={14}
                      fill={p.color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    {/* Inner cream emblem */}
                    <circle
                      cx={x - HEX_SIZE * 0.5 + i * 19}
                      cy={y + HEX_SIZE * 0.4}
                      r={10}
                      fill="rgba(255, 248, 220, 0.94)"
                    />
                    <text
                      x={x - HEX_SIZE * 0.5 + i * 19}
                      y={y + HEX_SIZE * 0.4 + 1}
                      className="hex-label"
                      fontSize={15}
                    >
                      🐾
                    </text>
                  </g>
                ))
            )}
          </g>
        );
      })}
    </svg>
  );
}
