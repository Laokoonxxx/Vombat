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
  // Farmland: rolling field furrows + a small barn silhouette
  return (
    <g>
      {/* Field furrow stripes — curved horizontal lines */}
      <path d={`M ${cx - 38} ${cy - 10} Q ${cx} ${cy - 14}, ${cx + 38} ${cy - 10}`}
        stroke="#7a4710" strokeWidth="1.5" fill="none" opacity="0.55" />
      <path d={`M ${cx - 40} ${cy + 2} Q ${cx} ${cy - 2}, ${cx + 40} ${cy + 2}`}
        stroke="#7a4710" strokeWidth="1.5" fill="none" opacity="0.5" />
      <path d={`M ${cx - 40} ${cy + 14} Q ${cx} ${cy + 10}, ${cx + 40} ${cy + 14}`}
        stroke="#7a4710" strokeWidth="1.5" fill="none" opacity="0.45" />
      {/* Small barn silhouette in top-right */}
      <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}>
        {/* Barn body */}
        <rect x={cx + 8} y={cy - 22} width={14} height={10} fill="#8a2a18" stroke="#1a0e02" strokeWidth="0.6" />
        {/* Barn roof (triangle) */}
        <path d={`M ${cx + 6} ${cy - 22} L ${cx + 15} ${cy - 28} L ${cx + 24} ${cy - 22} Z`}
          fill="#5a1a10" stroke="#1a0e02" strokeWidth="0.6" />
        {/* Door */}
        <rect x={cx + 13} y={cy - 18} width={4} height={6} fill="#3a1408" />
      </g>
      {/* Small wheat tufts */}
      <g opacity="0.7">
        <path d={`M ${cx - 22} ${cy + 18} l 0 -5 m -2 3 l 2 -3 m 2 3 l -2 -3`}
          stroke="#d9a93a" strokeWidth="1" fill="none" />
        <path d={`M ${cx - 14} ${cy + 20} l 0 -5 m -2 3 l 2 -3 m 2 3 l -2 -3`}
          stroke="#d9a93a" strokeWidth="1" fill="none" />
      </g>
    </g>
  );
}

function renderBedArt(cx: number, cy: number): JSX.Element {
  // Cultivated garden: tidy rows + sprouts + a small carrot tuft
  return (
    <g>
      {/* Vertical garden rows (raised beds) */}
      {[-18, -6, 6, 18].map((dx) => (
        <rect key={dx} x={cx + dx - 2} y={cy - 18} width={4} height={36} fill="#3a2e1a" opacity="0.35" />
      ))}
      {/* Small green sprouts on each row */}
      <g opacity="0.85">
        {[-18, -6, 6, 18].flatMap((dx) =>
          [-12, 0, 12].map((dy) => (
            <circle key={`${dx}-${dy}`} cx={cx + dx} cy={cy + dy} r={2} fill="#4a8a2a" />
          ))
        )}
      </g>
      {/* A small carrot icon — orange triangle with green top */}
      <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
        <path d={`M ${cx - 4} ${cy + 22} L ${cx + 4} ${cy + 22} L ${cx} ${cy + 32} Z`}
          fill="#e07820" stroke="#5a2e08" strokeWidth="0.5" />
        <path d={`M ${cx - 5} ${cy + 22} l 2 -4 m 3 4 l 0 -5 m 3 5 l 2 -4`}
          stroke="#2a6818" strokeWidth="1.5" fill="none" />
      </g>
    </g>
  );
}

function renderDesertArt(cx: number, cy: number): JSX.Element {
  // Sun-baked badlands: dunes + ancient ruin pillars + cracked earth
  return (
    <g>
      {/* Dune curves */}
      <path d={`M ${cx - 40} ${cy + 12} Q ${cx - 18} ${cy + 4}, ${cx + 4} ${cy + 14} Q ${cx + 28} ${cy + 22}, ${cx + 40} ${cy + 12}`}
        stroke="#a87a30" strokeWidth="1.2" fill="none" opacity="0.55" />
      <path d={`M ${cx - 36} ${cy + 24} Q ${cx - 8} ${cy + 18}, ${cx + 14} ${cy + 26} Q ${cx + 32} ${cy + 30}, ${cx + 38} ${cy + 22}`}
        stroke="#a87a30" strokeWidth="1" fill="none" opacity="0.4" />

      {/* Ancient ruin: 3 broken pillars in mid */}
      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(60,30,0,0.6))' }}>
        {/* Pillar 1 (tallest) */}
        <rect x={cx - 14} y={cy - 18} width={5} height={20} fill="#d6c08a" stroke="#5a4218" strokeWidth="0.6" />
        <rect x={cx - 16} y={cy - 18} width={9} height={3} fill="#b8a070" stroke="#5a4218" strokeWidth="0.6" />
        {/* Pillar 2 (broken short) */}
        <rect x={cx - 2} y={cy - 8} width={5} height={10} fill="#d6c08a" stroke="#5a4218" strokeWidth="0.6" />
        {/* Pillar 3 (medium) */}
        <rect x={cx + 10} y={cy - 14} width={5} height={16} fill="#d6c08a" stroke="#5a4218" strokeWidth="0.6" />
        {/* Top capstone fragment lying on ground */}
        <ellipse cx={cx + 8} cy={cy + 4} rx={8} ry={2} fill="#8a7048" stroke="#5a4218" strokeWidth="0.5" />
      </g>

      {/* Cracked earth lines (small) */}
      <g opacity="0.45">
        <path d={`M ${cx - 30} ${cy + 18} l 6 4 l -3 5`} stroke="#5a3a10" strokeWidth="0.7" fill="none" />
        <path d={`M ${cx + 20} ${cy + 16} l -4 5 l 5 3`} stroke="#5a3a10" strokeWidth="0.7" fill="none" />
      </g>
    </g>
  );
}

function renderTreeArt(cx: number, cy: number): JSX.Element {
  // Lush old-growth forest: 3 layered tree silhouettes
  // Eukalyptus = stylized, slightly mystic blue-teal tint
  return (
    <g>
      {/* Mist overlay at base */}
      <ellipse cx={cx} cy={cy + 22} rx={36} ry={5} fill="#d4ecf5" opacity="0.25" />

      {/* Back row tree (smallest, distant) */}
      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,30,60,0.55))' }}>
        <rect x={cx - 18} y={cy - 4} width={3} height={14} fill="#2a1810" />
        <circle cx={cx - 16.5} cy={cy - 12} r={11} fill="#2a6a4a" stroke="#0e3a26" strokeWidth="0.8" />
        <circle cx={cx - 16.5} cy={cy - 14} r={6} fill="#4a8e62" opacity="0.6" />
      </g>

      {/* Front-center BIG tree */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,30,60,0.7))' }}>
        <rect x={cx - 3} y={cy - 2} width={6} height={20} fill="#3a2010" stroke="#1a0e02" strokeWidth="0.6" />
        <circle cx={cx} cy={cy - 18} r={16} fill="#1f5a3a" stroke="#0a2818" strokeWidth="1" />
        <circle cx={cx - 6} cy={cy - 20} r={10} fill="#2d7a4e" opacity="0.7" />
        <circle cx={cx + 5} cy={cy - 16} r={8} fill="#2d7a4e" opacity="0.5" />
        {/* Highlight glints */}
        <circle cx={cx - 5} cy={cy - 22} r={2.5} fill="#5fb380" opacity="0.7" />
      </g>

      {/* Right tree (medium) */}
      <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,30,60,0.55))' }}>
        <rect x={cx + 14} y={cy - 2} width={4} height={16} fill="#2a1810" />
        <circle cx={cx + 16} cy={cy - 12} r={12} fill="#256c46" stroke="#0a2818" strokeWidth="0.8" />
        <circle cx={cx + 12} cy={cy - 14} r={6} fill="#4a8e62" opacity="0.55" />
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
    // Dead cat = tunnel — render as cave opening (handled by renderTunnelArt fallback)
    return renderTunnelArt(cx, cy);
  }
  // Predator lair: rocky den + glowing eyes
  return (
    <g>
      {/* Rocky outcrop / den base */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>
        <path d={`M ${cx - 28} ${cy + 16}
                  L ${cx - 22} ${cy + 4}
                  L ${cx - 10} ${cy - 4}
                  L ${cx + 6} ${cy - 8}
                  L ${cx + 22} ${cy - 2}
                  L ${cx + 28} ${cy + 8}
                  L ${cx + 26} ${cy + 18} Z`}
          fill="#5a3a20" stroke="#1a0e02" strokeWidth="1.2" />
        {/* Den opening (dark cave) */}
        <ellipse cx={cx} cy={cy + 4} rx={12} ry={9} fill="#0a0604" />
      </g>

      {/* Glowing predator eyes inside the den */}
      <g style={{ filter: 'drop-shadow(0 0 4px #ffe066)' }}>
        <ellipse cx={cx - 5} cy={cy + 2} rx={2.2} ry={3} fill="#ffe066" />
        <ellipse cx={cx + 5} cy={cy + 2} rx={2.2} ry={3} fill="#ffe066" />
        {/* Pupils — black slits */}
        <rect x={cx - 5.7} y={cy + 0.5} width={1.4} height={3} fill="#1a0e02" />
        <rect x={cx + 4.3} y={cy + 0.5} width={1.4} height={3} fill="#1a0e02" />
      </g>

      {/* Paw prints in the foreground */}
      <g opacity="0.55">
        <g fill="#1a0e02">
          <circle cx={cx - 18} cy={cy + 22} r={1.4} />
          <circle cx={cx - 21} cy={cy + 20} r={1.2} />
          <circle cx={cx - 16} cy={cy + 20} r={1.2} />
          <ellipse cx={cx - 18} cy={cy + 24} rx={1.5} ry={1.1} />
        </g>
      </g>
    </g>
  );
}

function renderDevilArt(cx: number, cy: number): JSX.Element {
  // Corrupted wasteland: volcanic cracks + horns silhouette + magical aura
  return (
    <g>
      {/* Magical red-orange aura */}
      <circle cx={cx} cy={cy - 4} r={26} fill="#c44020" opacity="0.18" />
      <circle cx={cx} cy={cy - 4} r={18} fill="#c44020" opacity="0.22" />

      {/* Lava cracks radiating */}
      <g style={{ filter: 'drop-shadow(0 0 3px #ff7a30)' }}>
        <path d={`M ${cx - 32} ${cy + 18} L ${cx - 18} ${cy + 4} L ${cx - 10} ${cy + 10} L ${cx + 4} ${cy - 6}`}
          stroke="#ff5510" strokeWidth="2" fill="none" />
        <path d={`M ${cx + 30} ${cy + 14} L ${cx + 16} ${cy} L ${cx + 8} ${cy + 6} L ${cx - 4} ${cy - 4}`}
          stroke="#ff5510" strokeWidth="2" fill="none" />
        <path d={`M ${cx} ${cy + 26} L ${cx + 2} ${cy + 12} L ${cx - 2} ${cy + 4}`}
          stroke="#ff5510" strokeWidth="1.8" fill="none" />
      </g>

      {/* Demon horns silhouette in upper area */}
      <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.85))' }}>
        {/* Left horn (curved) */}
        <path d={`M ${cx - 16} ${cy - 8}
                  Q ${cx - 22} ${cy - 22}, ${cx - 14} ${cy - 28}
                  Q ${cx - 10} ${cy - 18}, ${cx - 10} ${cy - 10}
                  Z`}
          fill="#2a0a0a" stroke="#000" strokeWidth="0.8" />
        {/* Right horn (curved) */}
        <path d={`M ${cx + 16} ${cy - 8}
                  Q ${cx + 22} ${cy - 22}, ${cx + 14} ${cy - 28}
                  Q ${cx + 10} ${cy - 18}, ${cx + 10} ${cy - 10}
                  Z`}
          fill="#2a0a0a" stroke="#000" strokeWidth="0.8" />
        {/* Demonic head silhouette (between horns) */}
        <ellipse cx={cx} cy={cy - 8} rx={11} ry={9} fill="#1a0408" />
        {/* Glowing red eyes */}
        <circle cx={cx - 4} cy={cy - 9} r={1.8} fill="#ff3a20" />
        <circle cx={cx + 4} cy={cy - 9} r={1.8} fill="#ff3a20" />
      </g>

      {/* Ember particles (small glowing dots) */}
      <g style={{ filter: 'drop-shadow(0 0 2px #ffaa30)' }}>
        <circle cx={cx - 24} cy={cy + 10} r={1.2} fill="#ffaa30" opacity="0.85" />
        <circle cx={cx + 22} cy={cy + 4} r={1} fill="#ff7a20" opacity="0.8" />
        <circle cx={cx + 18} cy={cy + 22} r={0.9} fill="#ffaa30" opacity="0.7" />
        <circle cx={cx - 14} cy={cy + 22} r={1.1} fill="#ff8a20" opacity="0.85" />
      </g>
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

            {/* 4. Inner dark rim — depth ring */}
            <polygon
              points={points}
              fill="none"
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="1.8"
              pointerEvents="none"
              transform={`translate(${x} ${y}) scale(0.87) translate(${-x} ${-y})`}
            />

            {/* 5. Actionable golden glow */}
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

            {/* 8. Activation banner — small scroll-shape badge */}
            {!isTunnelOnly && !isDeadCat && (
              <g style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.6))' }}>
                <path
                  d={`M ${x - 22} ${y - HEX_SIZE * 0.78}
                      L ${x + 22} ${y - HEX_SIZE * 0.78}
                      L ${x + 19} ${y - HEX_SIZE * 0.6}
                      L ${x - 19} ${y - HEX_SIZE * 0.6} Z`}
                  fill="#fdf3d3"
                  stroke="#1a0e02"
                  strokeWidth="0.9"
                />
                <text
                  x={x}
                  y={y - HEX_SIZE * 0.69}
                  className="hex-label"
                  fontSize={10}
                  fill="#1a0e02"
                  fontWeight={800}
                >
                  {ACTIVATION_LABEL[c.type]}
                </text>
              </g>
            )}

            {/* 9. Thorn die — wooden cube look */}
            {c.type === 'thorn' && c.thornDieLevel != null && (
              <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.65))' }}>
                <rect
                  x={x - 14}
                  y={y + HEX_SIZE * 0.45}
                  width={28}
                  height={22}
                  rx={4}
                  fill="#fff8e0"
                  stroke="#1a0e02"
                  strokeWidth={1.6}
                />
                <text
                  x={x}
                  y={y + HEX_SIZE * 0.45 + 13}
                  className="hex-label"
                  fontSize={12}
                  fill="#1a0e02"
                  fontWeight={800}
                >
                  k{c.thornDieLevel}
                </text>
              </g>
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
