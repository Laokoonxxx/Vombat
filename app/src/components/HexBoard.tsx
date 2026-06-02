import { useMemo, type MouseEvent } from 'react';
import type { BoardCell, GameState, Hex } from '../game/types';
import { hexKey } from '../game/types';
import { hexCorners, hexToPixel } from '../game/hex';

const HEX_SIZE = 52;

const TYPE_GRAD: Record<BoardCell['type'], string> = {
  dirt:   'url(#grad-dirt)',
  bed:    'url(#grad-bed)',
  desert: 'url(#grad-desert)',
  tree:   'url(#grad-tree)',
  thorn:  'url(#grad-thorn)',
  cat:    'url(#grad-cat)',
  devil:  'url(#grad-devil)',
};

const TYPE_PATTERN: Record<BoardCell['type'], string | null> = {
  dirt:   'url(#pat-dirt)',
  bed:    'url(#pat-bed)',
  desert: 'url(#pat-desert)',
  tree:   'url(#pat-tree)',
  thorn:  'url(#pat-thorn)',
  cat:    null,
  devil:  'url(#pat-devil)',
};

const TYPE_EMOJI: Record<BoardCell['type'], string> = {
  dirt:   '🟫',
  bed:    '🌱',
  desert: '🏜️',
  tree:   '🌳',
  thorn:  '🌵',
  cat:    '🐱',
  devil:  '👹',
};

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
  dirt:   'Hlína',
  bed:    'Záhon',
  desert: 'Poušť',
  tree:   'Eukalyptus',
  thorn:  'Houští',
  cat:    'Kočka',
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

export interface HexBoardProps {
  state: GameState;
  clickableHexes?: Hex[];
  actionableHexes?: Hex[];
  selectedHex?: Hex | null;
  onHexClick?: (hex: Hex, event?: MouseEvent) => void;
}

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
    const pad = 32;
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
        filter: 'drop-shadow(0 8px 16px rgba(20, 10, 0, 0.55))',
      }}
    >
      <defs>
        {/* ============================================================
            FILTERS
            ============================================================ */}
        <filter id="hex-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1" dy="2.5" stdDeviation="2" floodOpacity="0.45" floodColor="#1a0e02" />
        </filter>

        {/* Inner shadow: darker rim for "tile depth" */}
        <filter id="hex-inner" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
          <feOffset dx="0" dy="2" />
          <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff" />
          <feFlood floodColor="#000" floodOpacity="0.35" />
          <feComposite in2="shadowDiff" operator="in" />
          <feComposite in2="SourceGraphic" operator="over" />
        </filter>

        {/* Subtle glow for actionable */}
        <filter id="hex-actionable-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feFlood floodColor="#ffc24a" floodOpacity="0.9" result="color" />
          <feComposite in="color" in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* ============================================================
            GRADIENTS — vivid biome palette, high contrast
            ============================================================ */}
        <linearGradient id="grad-dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0a653" />
          <stop offset="60%" stopColor="#c87423" />
          <stop offset="100%" stopColor="#8a4e0e" />
        </linearGradient>
        <linearGradient id="grad-bed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d5cbb6" />
          <stop offset="60%" stopColor="#9c9180" />
          <stop offset="100%" stopColor="#665d4e" />
        </linearGradient>
        <linearGradient id="grad-desert" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe9b8" />
          <stop offset="60%" stopColor="#e0c47b" />
          <stop offset="100%" stopColor="#a8854a" />
        </linearGradient>
        <linearGradient id="grad-tree" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#83c4e8" />
          <stop offset="60%" stopColor="#3a82bd" />
          <stop offset="100%" stopColor="#155182" />
        </linearGradient>
        <linearGradient id="grad-thorn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a0d574" />
          <stop offset="60%" stopColor="#549a32" />
          <stop offset="100%" stopColor="#2d5e15" />
        </linearGradient>
        <radialGradient id="grad-cat" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#b7864e" />
          <stop offset="70%" stopColor="#7a5028" />
          <stop offset="100%" stopColor="#3a2510" />
        </radialGradient>
        <radialGradient id="grad-devil" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#7a2a2a" />
          <stop offset="50%" stopColor="#3a0e10" />
          <stop offset="100%" stopColor="#0a0204" />
        </radialGradient>
        <radialGradient id="grad-tunnel" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#3a2a3a" />
          <stop offset="60%" stopColor="#1a0e1a" />
          <stop offset="100%" stopColor="#000000" />
        </radialGradient>

        {/* Subtle highlight on top + dark shadow on bottom */}
        <linearGradient id="hex-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>

        {/* Actionable golden glow overlay */}
        <radialGradient id="actionable-glow">
          <stop offset="0%" stopColor="#ffe066" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffe066" stopOpacity="0" />
        </radialGradient>

        {/* ============================================================
            PATTERNS — biome textures
            ============================================================ */}

        {/* Dirt: small dots like soil particles */}
        <pattern id="pat-dirt" patternUnits="userSpaceOnUse" width="10" height="10">
          <circle cx="2" cy="3" r="0.8" fill="#4a2a08" opacity="0.45" />
          <circle cx="7" cy="6" r="0.6" fill="#4a2a08" opacity="0.35" />
          <circle cx="3" cy="8" r="0.5" fill="#4a2a08" opacity="0.4" />
        </pattern>

        {/* Bed: vertical "rows" (záhon brázdy) */}
        <pattern id="pat-bed" patternUnits="userSpaceOnUse" width="8" height="14" patternTransform="rotate(0)">
          <line x1="0" y1="0" x2="0" y2="14" stroke="#3a2e1a" strokeWidth="0.4" opacity="0.35" />
          <line x1="4" y1="0" x2="4" y2="14" stroke="#3a2e1a" strokeWidth="0.3" opacity="0.25" />
        </pattern>

        {/* Desert: wavy dune lines */}
        <pattern id="pat-desert" patternUnits="userSpaceOnUse" width="16" height="10">
          <path d="M 0 5 Q 4 2, 8 5 T 16 5" stroke="#7a5a20" strokeWidth="0.5" fill="none" opacity="0.4" />
          <path d="M 0 9 Q 4 6, 8 9 T 16 9" stroke="#7a5a20" strokeWidth="0.4" fill="none" opacity="0.3" />
        </pattern>

        {/* Tree: leaf-vein cross pattern */}
        <pattern id="pat-tree" patternUnits="userSpaceOnUse" width="12" height="12">
          <path d="M 6 1 L 6 11 M 2 4 L 6 6 L 10 4 M 2 8 L 6 10 L 10 8" stroke="#0d3a5a" strokeWidth="0.4" fill="none" opacity="0.45" />
        </pattern>

        {/* Thorn: thorny spikes */}
        <pattern id="pat-thorn" patternUnits="userSpaceOnUse" width="10" height="10">
          <path d="M 5 0 L 6 4 L 5 5 L 4 4 Z" fill="#1f3f0a" opacity="0.55" />
          <path d="M 2 6 L 3 9 L 2 9.5 L 1 9 Z" fill="#1f3f0a" opacity="0.4" />
          <path d="M 8 5 L 9 8 L 8 9 L 7 8 Z" fill="#1f3f0a" opacity="0.4" />
        </pattern>

        {/* Devil: cracked fire pattern */}
        <pattern id="pat-devil" patternUnits="userSpaceOnUse" width="14" height="14">
          <path d="M 2 12 L 4 8 L 3 5 L 6 3 L 5 0" stroke="#c44020" strokeWidth="0.6" fill="none" opacity="0.5" />
          <path d="M 9 14 L 11 10 L 10 7 L 12 4" stroke="#c44020" strokeWidth="0.5" fill="none" opacity="0.4" />
        </pattern>

        {/* Blocked thorn diagonal hatching */}
        <pattern id="thorn-block-hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
          <rect width="9" height="9" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="9" stroke="rgba(0,0,0,0.4)" strokeWidth="2.5" />
        </pattern>
      </defs>

      {/* Background — dark vignette pad behind hexes for atmospheric depth */}
      <rect
        x={bounds.minX - 100}
        y={bounds.minY - 100}
        width={bounds.width + 200}
        height={bounds.height + 200}
        fill="transparent"
      />

      {cells.map((c) => {
        const { x, y } = hexToPixel(c.hex, HEX_SIZE);
        const points = corners.map((p) => `${x + p.x},${y + p.y}`).join(' ');
        const k = hexKey(c.hex);
        const clickable = clickableSet.has(k);
        const actionable = actionableSet.has(k);
        const isSelected = selectedHex && c.hex.q === selectedHex.q && c.hex.r === selectedHex.r;

        const isTunnelOnly = c.type !== 'devil' && c.type !== 'cat' && c.isTunnel;
        const isDeadCat = c.type === 'cat' && !c.catAlive;
        let emoji = TYPE_EMOJI[c.type];
        if (isDeadCat || isTunnelOnly) emoji = '🕳️';

        let fillGrad = TYPE_GRAD[c.type];
        if (isDeadCat || isTunnelOnly) fillGrad = 'url(#grad-tunnel)';
        const pattern = (isDeadCat || isTunnelOnly) ? null : TYPE_PATTERN[c.type];

        const isBlockedThorn = c.type === 'thorn' && c.thornDieLevel != null && !c.marker;
        const tooltip = buildTooltip(c, isBlockedThorn);

        // Stroke: very dark border for tile-on-table feel
        const strokeColor = isSelected ? '#ffc845' : actionable ? '#f59820' : '#1a0e02';
        const strokeWidth = isSelected ? 4.5 : actionable ? 3.2 : 2.2;

        return (
          <g
            key={k}
            className={`hex-cell ${clickable ? 'clickable' : ''} ${actionable ? 'actionable' : ''} ${isSelected ? 'highlighted' : ''}`}
            onClick={(e) => clickable && onHexClick && onHexClick(c.hex, e)}
          >
            <title>{tooltip}</title>

            {/* Layer 1: gradient base with strong shadow */}
            <polygon
              points={points}
              fill={fillGrad}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              filter="url(#hex-shadow)"
            />

            {/* Layer 2: pattern texture overlay (biome character) */}
            {pattern && (
              <polygon
                points={points}
                fill={pattern}
                pointerEvents="none"
              />
            )}

            {/* Layer 3: top shine + bottom darkening for tactile feel */}
            <polygon
              points={points}
              fill="url(#hex-shine)"
              pointerEvents="none"
            />

            {/* Layer 4: inner dark rim — depth ring inside hex */}
            <polygon
              points={points}
              fill="none"
              stroke="rgba(0,0,0,0.4)"
              strokeWidth="2"
              pointerEvents="none"
              transform={`translate(${x} ${y}) scale(0.85) translate(${-x} ${-y})`}
            />

            {/* Layer 5: actionable golden glow */}
            {actionable && !isSelected && (
              <polygon
                points={points}
                fill="url(#actionable-glow)"
                pointerEvents="none"
              />
            )}

            {/* Layer 6: blocked thorn diagonal hatch */}
            {isBlockedThorn && (
              <polygon
                points={points}
                fill="url(#thorn-block-hatch)"
                pointerEvents="none"
              />
            )}

            {/* Activation label — small fancy banner top */}
            {!isTunnelOnly && !isDeadCat && (
              <g style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.5))' }}>
                <path
                  d={`M ${x - 22} ${y - HEX_SIZE * 0.72}
                      L ${x + 22} ${y - HEX_SIZE * 0.72}
                      L ${x + 19} ${y - HEX_SIZE * 0.55}
                      L ${x - 19} ${y - HEX_SIZE * 0.55} Z`}
                  fill="#fdf3d3"
                  stroke="#1a0e02"
                  strokeWidth="0.8"
                />
                <text
                  x={x}
                  y={y - HEX_SIZE * 0.635}
                  className="hex-label"
                  fontSize={10}
                  fill="#1a0e02"
                  fontWeight={800}
                >
                  {ACTIVATION_LABEL[c.type]}
                </text>
              </g>
            )}

            {/* Main emoji on a "medallion" backdrop */}
            <g>
              {/* Soft circular backdrop for emoji */}
              <circle
                cx={x}
                cy={y + 4}
                r={20}
                fill="rgba(255, 240, 200, 0.32)"
                stroke="rgba(0, 0, 0, 0.25)"
                strokeWidth="0.8"
              />
              <text
                x={x}
                y={y + 6}
                className="hex-label"
                fontSize={30}
                style={{ filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.5))' }}
              >
                {emoji}
              </text>
            </g>

            {/* Thorn die — wooden die look */}
            {c.type === 'thorn' && c.thornDieLevel != null && (
              <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
                <rect
                  x={x - 12}
                  y={y + HEX_SIZE * 0.42}
                  width={24}
                  height={20}
                  rx={4}
                  fill="#fff8e0"
                  stroke="#1a0e02"
                  strokeWidth={1.5}
                />
                <text
                  x={x}
                  y={y + HEX_SIZE * 0.42 + 12}
                  className="hex-label"
                  fontSize={11}
                  fill="#1a0e02"
                  fontWeight={800}
                >
                  k{c.thornDieLevel}
                </text>
              </g>
            )}

            {/* "No entry" badge for blocked thorn */}
            {isBlockedThorn && (
              <g>
                <circle
                  cx={x - HEX_SIZE * 0.62}
                  cy={y - HEX_SIZE * 0.5}
                  r={10}
                  fill="rgba(196, 32, 16, 0.95)"
                  stroke="#fff"
                  strokeWidth={1.5}
                />
                <text
                  x={x - HEX_SIZE * 0.62}
                  y={y - HEX_SIZE * 0.5}
                  className="hex-label"
                  fontSize={13}
                  fill="#fff"
                  fontWeight={900}
                >
                  ✕
                </text>
              </g>
            )}

            {/* Marker (bobek/mrkev) — shield-like emblem */}
            {c.marker && (() => {
              const markerColor = state.players.find((p) => p.id === c.marker!.playerId)?.color || '#000';
              return (
                <g style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.55))' }}>
                  {/* Shield shape: rectangle with notched bottom */}
                  <path
                    d={`M ${x + HEX_SIZE * 0.55 - 12} ${y + HEX_SIZE * 0.4}
                        L ${x + HEX_SIZE * 0.55 + 12} ${y + HEX_SIZE * 0.4}
                        L ${x + HEX_SIZE * 0.55 + 12} ${y + HEX_SIZE * 0.4 + 17}
                        L ${x + HEX_SIZE * 0.55} ${y + HEX_SIZE * 0.4 + 24}
                        L ${x + HEX_SIZE * 0.55 - 12} ${y + HEX_SIZE * 0.4 + 17} Z`}
                    fill={markerColor}
                    stroke="#1a0e02"
                    strokeWidth={1.5}
                  />
                  <text
                    x={x + HEX_SIZE * 0.55}
                    y={y + HEX_SIZE * 0.4 + 12}
                    className="hex-label"
                    fontSize={14}
                  >
                    {c.marker.kind === 'bobek' ? '💩' : '🥕'}
                  </text>
                </g>
              );
            })()}

            {/* Vombat(s) — medallion / token */}
            {state.players.map((p) =>
              p.vombats
                .filter((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r)
                .map((v, i) => (
                  <g key={v.id} style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}>
                    {/* Outer dark ring */}
                    <circle
                      cx={x - HEX_SIZE * 0.55 + i * 18}
                      cy={y + HEX_SIZE * 0.15}
                      r={16}
                      fill="#1a0e02"
                    />
                    {/* Player color disc */}
                    <circle
                      cx={x - HEX_SIZE * 0.55 + i * 18}
                      cy={y + HEX_SIZE * 0.15}
                      r={13}
                      fill={p.color}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    {/* Inner cream emblem area */}
                    <circle
                      cx={x - HEX_SIZE * 0.55 + i * 18}
                      cy={y + HEX_SIZE * 0.15}
                      r={9}
                      fill="rgba(255, 248, 220, 0.92)"
                    />
                    <text
                      x={x - HEX_SIZE * 0.55 + i * 18}
                      y={y + HEX_SIZE * 0.15 + 1}
                      className="hex-label"
                      fontSize={14}
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
