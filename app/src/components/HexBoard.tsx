import { useMemo, type MouseEvent } from 'react';
import type { BoardCell, GameState, Hex } from '../game/types';
import { hexKey } from '../game/types';
import { hexCorners, hexToPixel } from '../game/hex';

const HEX_SIZE = 46;

// Per-type fill (refer to gradient defs). For solid fallback see TYPE_SOLID.
const TYPE_GRAD: Record<BoardCell['type'], string> = {
  dirt:   'url(#grad-dirt)',
  bed:    'url(#grad-bed)',
  desert: 'url(#grad-desert)',
  tree:   'url(#grad-tree)',
  thorn:  'url(#grad-thorn)',
  cat:    'url(#grad-cat)',
  devil:  'url(#grad-devil)',
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
    const pad = 24;
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
      style={{ maxWidth: '100%', maxHeight: '85vh', display: 'block', filter: 'drop-shadow(0 4px 8px rgba(60, 45, 20, 0.18))' }}
    >
      <defs>
        {/* Drop shadow filter for individual hexes (light, soft) */}
        <filter id="hex-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0.5" dy="1.2" stdDeviation="1.2" floodOpacity="0.22" floodColor="#3a2810" />
        </filter>

        {/* Gradient per hex type — light top to darker bottom for tactile depth */}
        <linearGradient id="grad-dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8a55a" />
          <stop offset="100%" stopColor="#c47828" />
        </linearGradient>
        <linearGradient id="grad-bed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c4bdaf" />
          <stop offset="100%" stopColor="#928a7c" />
        </linearGradient>
        <linearGradient id="grad-desert" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7e7bf" />
          <stop offset="100%" stopColor="#e3c884" />
        </linearGradient>
        <linearGradient id="grad-tree" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6cb1de" />
          <stop offset="100%" stopColor="#3a7fb3" />
        </linearGradient>
        <linearGradient id="grad-thorn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#82c25c" />
          <stop offset="100%" stopColor="#549a32" />
        </linearGradient>
        <linearGradient id="grad-cat" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a4703c" />
          <stop offset="100%" stopColor="#6e4720" />
        </linearGradient>
        <linearGradient id="grad-devil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4a4a" />
          <stop offset="100%" stopColor="#1c1c1c" />
        </linearGradient>

        {/* Tunnel: dark with subtle violet undertone */}
        <linearGradient id="grad-tunnel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1f25" />
          <stop offset="100%" stopColor="#0a0608" />
        </linearGradient>

        {/* Actionable golden glow gradient overlay */}
        <radialGradient id="actionable-glow">
          <stop offset="0%" stopColor="#ffd95e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ffd95e" stopOpacity="0" />
        </radialGradient>

        {/* Subtle white highlight (top) for tactile feel */}
        <linearGradient id="hex-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.08" />
        </linearGradient>

        {/* Blocked thorn diagonal hatching */}
        <pattern id="thorn-block-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.32)" strokeWidth="2" />
        </pattern>

        {/* Activation badge background */}
        <filter id="badge-blur">
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>

      {cells.map((c) => {
        const { x, y } = hexToPixel(c.hex, HEX_SIZE);
        const points = corners.map((p) => `${x + p.x},${y + p.y}`).join(' ');
        const k = hexKey(c.hex);
        const clickable = clickableSet.has(k);
        const actionable = actionableSet.has(k);
        const isSelected = selectedHex && c.hex.q === selectedHex.q && c.hex.r === selectedHex.r;

        // Tunnel-only (= non-cat/non-devil cell that became tunnel)
        const isTunnelOnly = c.type !== 'devil' && c.type !== 'cat' && c.isTunnel;
        const isDeadCat = c.type === 'cat' && !c.catAlive;
        let emoji = TYPE_EMOJI[c.type];
        if (isDeadCat || isTunnelOnly) emoji = '🕳️';

        // Choose gradient: tunnel cells get tunnel gradient
        let fillGrad = TYPE_GRAD[c.type];
        if (isDeadCat || isTunnelOnly) fillGrad = 'url(#grad-tunnel)';

        // Blocked thorn (die still on it, not yet taken) — diagonal hatch overlay
        const isBlockedThorn = c.type === 'thorn' && c.thornDieLevel != null && !c.marker;

        const tooltip = buildTooltip(c, isBlockedThorn);

        // Stroke priority: selected > actionable > default
        const strokeColor = isSelected ? '#ffb840' : actionable ? '#e89818' : '#3d2f1a';
        const strokeWidth = isSelected ? 3.5 : actionable ? 2.4 : 1.5;

        return (
          <g
            key={k}
            className={`hex-cell ${clickable ? 'clickable' : ''} ${actionable ? 'actionable' : ''} ${isSelected ? 'highlighted' : ''}`}
            onClick={(e) => clickable && onHexClick && onHexClick(c.hex, e)}
          >
            <title>{tooltip}</title>

            {/* 1. Background fill (gradient) with shadow */}
            <polygon
              points={points}
              fill={fillGrad}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              filter="url(#hex-shadow)"
            />

            {/* 2. Subtle top highlight for tactile feel */}
            <polygon
              points={points}
              fill="url(#hex-shine)"
              pointerEvents="none"
            />

            {/* 3. Actionable golden glow */}
            {actionable && !isSelected && (
              <polygon
                points={points}
                fill="url(#actionable-glow)"
                pointerEvents="none"
              />
            )}

            {/* 4. Blocked thorn diagonal hatch */}
            {isBlockedThorn && (
              <polygon
                points={points}
                fill="url(#thorn-block-hatch)"
                pointerEvents="none"
              />
            )}

            {/* 5. Activation badge (small rounded pill top-center) */}
            {!isTunnelOnly && !isDeadCat && (
              <g>
                <rect
                  x={x - 18}
                  y={y - HEX_SIZE * 0.78}
                  width={36}
                  height={14}
                  rx={7}
                  fill="rgba(255, 250, 235, 0.85)"
                  stroke="rgba(60, 45, 20, 0.35)"
                  strokeWidth={0.6}
                />
                <text
                  x={x}
                  y={y - HEX_SIZE * 0.78 + 7}
                  className="hex-label"
                  fontSize={9}
                  fill="#3d2f1a"
                  fontWeight={700}
                >
                  {ACTIVATION_LABEL[c.type]}
                </text>
              </g>
            )}

            {/* 6. Main emoji (bigger, centered) */}
            <text
              x={x}
              y={y + 2}
              className="hex-label"
              fontSize={26}
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.25))' }}
            >
              {emoji}
            </text>

            {/* 7. Thorn die (white die-like circle with k-value) */}
            {c.type === 'thorn' && c.thornDieLevel != null && (
              <g>
                <circle
                  cx={x}
                  cy={y + HEX_SIZE * 0.5}
                  r={11}
                  fill="#fff"
                  stroke="#2a2a2a"
                  strokeWidth={1.4}
                  filter="url(#hex-shadow)"
                />
                <text
                  x={x}
                  y={y + HEX_SIZE * 0.5}
                  className="hex-label"
                  fontSize={11}
                  fill="#1c1c1c"
                  fontWeight={700}
                >
                  k{c.thornDieLevel}
                </text>
              </g>
            )}

            {/* 8. "No entry" badge for blocked thorn */}
            {isBlockedThorn && (
              <text
                x={x - HEX_SIZE * 0.55}
                y={y - HEX_SIZE * 0.4}
                className="hex-label"
                fontSize={13}
              >
                🚫
              </text>
            )}

            {/* 9. Marker (bobek/mrkev) — bigger, with white halo */}
            {c.marker && (() => {
              const markerColor = state.players.find((p) => p.id === c.marker!.playerId)?.color || '#000';
              return (
                <g style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
                  <circle
                    cx={x + HEX_SIZE * 0.55}
                    cy={y + HEX_SIZE * 0.5}
                    r={12}
                    fill="#fff"
                    stroke={markerColor}
                    strokeWidth={2.5}
                  />
                  <text
                    x={x + HEX_SIZE * 0.55}
                    y={y + HEX_SIZE * 0.5}
                    className="hex-label"
                    fontSize={13}
                  >
                    {c.marker.kind === 'bobek' ? '💩' : '🥕'}
                  </text>
                </g>
              );
            })()}

            {/* 10. Vombat(s) — bigger, color halo + paw */}
            {state.players.map((p) =>
              p.vombats
                .filter((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r)
                .map((v, i) => (
                  <g key={v.id} style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))' }}>
                    {/* Outer color halo */}
                    <circle
                      cx={x - HEX_SIZE * 0.5 + i * 16}
                      cy={y + HEX_SIZE * 0.1}
                      r={14}
                      fill={p.color}
                      stroke="#000"
                      strokeWidth={1.5}
                    />
                    {/* Inner white ring for contrast */}
                    <circle
                      cx={x - HEX_SIZE * 0.5 + i * 16}
                      cy={y + HEX_SIZE * 0.1}
                      r={11}
                      fill="#fff"
                      opacity={0.65}
                    />
                    <text
                      x={x - HEX_SIZE * 0.5 + i * 16}
                      y={y + HEX_SIZE * 0.1}
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
