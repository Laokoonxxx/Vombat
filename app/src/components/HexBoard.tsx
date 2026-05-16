import { useMemo, type MouseEvent } from 'react';
import type { BoardCell, GameState, Hex } from '../game/types';
import { hexKey } from '../game/types';
import { hexCorners, hexToPixel } from '../game/hex';

const HEX_SIZE = 38;

const TYPE_FILL: Record<BoardCell['type'], string> = {
  dirt:   'var(--hex-dirt)',
  bed:    'var(--hex-bed)',
  desert: 'var(--hex-desert)',
  tree:   'var(--hex-tree)',
  thorn:  'var(--hex-thorn)',
  cat:    'var(--hex-cat)',
  devil:  'var(--hex-devil)',
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
        parts.push('Aktivace 11-14 (rozdrcení zadkem → 1k20 + tunel). Pozor: útok při hodu <5 v sousedství.');
      } else {
        parts.push('Mrtvá kočka - tunel.');
      }
      break;
    case 'devil':
      parts.push('Aktivace 12+ (pohyb). Boj se vyhlašuje PŘED hodem.');
      break;
  }
  if (c.isTunnel) {
    parts.push('🕳️ Tunel: lze sem vstoupit z libovolného jiného tunelu.');
  }
  if (c.marker) {
    parts.push(`Obsazeno ${c.marker.kind === 'bobek' ? 'bobkem 💩' : 'mrkví 🥕'}.`);
  }
  return parts.join('\n');
}

export interface HexBoardProps {
  state: GameState;
  clickableHexes?: Hex[]; // for current action — highlighted & clickable
  selectedHex?: Hex | null;
  onHexClick?: (hex: Hex, event?: MouseEvent) => void;
}

export function HexBoard({ state, clickableHexes, selectedHex, onHexClick }: HexBoardProps) {
  const cells = useMemo(() => Array.from(state.board.values()), [state.board]);

  const clickableSet = useMemo(() => {
    const s = new Set<string>();
    clickableHexes?.forEach((h) => s.add(hexKey(h)));
    return s;
  }, [clickableHexes]);

  // Compute bounds
  const bounds = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    cells.forEach((c) => {
      const { x, y } = hexToPixel(c.hex, HEX_SIZE);
      minX = Math.min(minX, x - HEX_SIZE);
      maxX = Math.max(maxX, x + HEX_SIZE);
      minY = Math.min(minY, y - HEX_SIZE);
      maxY = Math.max(maxY, y + HEX_SIZE);
    });
    const pad = 20;
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
      style={{ maxWidth: '100%', maxHeight: '80vh', display: 'block' }}
    >
      {/* SVG pattern for "blocked thorn" diagonal hatching */}
      <defs>
        <pattern id="thorn-block-hatch" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="transparent" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(0,0,0,0.35)" strokeWidth="2" />
        </pattern>
      </defs>
      {cells.map((c) => {
        const { x, y } = hexToPixel(c.hex, HEX_SIZE);
        const points = corners.map((p) => `${x + p.x},${y + p.y}`).join(' ');
        const k = hexKey(c.hex);
        const clickable = clickableSet.has(k);
        const isSelected = selectedHex && c.hex.q === selectedHex.q && c.hex.r === selectedHex.r;
        // Determine display: emoji for entity, otherwise activation label.
        const isTunnelOnly = c.type !== 'devil' && c.type !== 'cat' && c.isTunnel;
        let emoji = TYPE_EMOJI[c.type];
        if (c.type === 'cat' && !c.catAlive) emoji = '🕳️';
        if (isTunnelOnly) emoji = '🕳️';

        const fill = TYPE_FILL[c.type];
        const opacity = (c.type === 'cat' && !c.catAlive) ? 0.5 : 1;

        // Thorn with a die is impassable for movement until cleared
        const isBlockedThorn = c.type === 'thorn' && c.thornDieLevel != null && !c.marker;

        // Build a tooltip explaining what this cell does
        const tooltip = buildTooltip(c, isBlockedThorn);

        return (
          <g
            key={k}
            className={`hex-cell ${clickable ? 'clickable' : ''} ${isSelected ? 'highlighted' : ''}`}
            onClick={(e) => clickable && onHexClick && onHexClick(c.hex, e)}
          >
            <title>{tooltip}</title>
            <polygon
              points={points}
              fill={fill}
              opacity={opacity}
              stroke={isSelected ? '#ffd95e' : '#3d2f1a'}
              strokeWidth={isSelected ? 3 : 1}
            />
            {/* Diagonal-hatch overlay marking blocked thorn (impassable until die is taken) */}
            {isBlockedThorn && (
              <polygon
                points={points}
                fill="url(#thorn-block-hatch)"
                pointerEvents="none"
              />
            )}
            {/* Activation hint */}
            <text x={x} y={y - HEX_SIZE * 0.55} className="hex-label" fontSize={9} fill="#1c150a">
              {ACTIVATION_LABEL[c.type]}
            </text>
            {/* Main emoji */}
            <text x={x} y={y - 2} className="hex-label" fontSize={22}>
              {emoji}
            </text>
            {/* Thorn die */}
            {c.type === 'thorn' && c.thornDieLevel != null && (
              <g>
                <circle cx={x} cy={y + HEX_SIZE * 0.42} r={9} fill="#fff" stroke="#222" />
                <text x={x} y={y + HEX_SIZE * 0.42} className="hex-label" fontSize={10} fill="#222">
                  k{c.thornDieLevel}
                </text>
              </g>
            )}
            {/* "No entry" badge in upper-left corner of blocked thorn */}
            {isBlockedThorn && (
              <text
                x={x - HEX_SIZE * 0.45}
                y={y - HEX_SIZE * 0.4}
                className="hex-label"
                fontSize={12}
              >
                🚫
              </text>
            )}
            {/* Marker (bobek/mrkev) */}
            {c.marker && (
              <g>
                <circle
                  cx={x + HEX_SIZE * 0.45}
                  cy={y + HEX_SIZE * 0.45}
                  r={9}
                  fill={state.players.find((p) => p.id === c.marker!.playerId)?.color || '#000'}
                  stroke="#222"
                  strokeWidth={1}
                />
                <text
                  x={x + HEX_SIZE * 0.45}
                  y={y + HEX_SIZE * 0.45}
                  className="hex-label"
                  fontSize={11}
                  fill="#fff"
                >
                  {c.marker.kind === 'bobek' ? '💩' : '🥕'}
                </text>
              </g>
            )}
            {/* Vombat(s) */}
            {state.players.map((p) =>
              p.vombats
                .filter((v) => v.hex.q === c.hex.q && v.hex.r === c.hex.r)
                .map((v, i) => (
                  <g key={v.id}>
                    <circle
                      cx={x - HEX_SIZE * 0.4 + i * 14}
                      cy={y + HEX_SIZE * 0.05}
                      r={10}
                      fill={p.color}
                      stroke="#000"
                      strokeWidth={1.5}
                    />
                    <text
                      x={x - HEX_SIZE * 0.4 + i * 14}
                      y={y + HEX_SIZE * 0.05}
                      className="hex-label"
                      fontSize={12}
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
