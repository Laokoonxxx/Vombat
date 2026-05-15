import type { PlayerState } from '../game/types';

export function DiceTray({ player }: { player: PlayerState }) {
  if (player.lastRoll == null) {
    return (
      <div className="dice-tray">
        <span style={{ color: 'var(--muted)' }}>(ještě nehozeno)</span>
      </div>
    );
  }
  if (player.lastRoll.length === 0) {
    return (
      <div className="dice-tray">
        <span style={{ color: 'var(--muted)' }}>(žádné kostky v Ruce)</span>
      </div>
    );
  }
  const sum = player.lastRoll.reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="dice-tray">
        {player.lastRoll.map((val, i) => (
          <div key={i} className="die rolled">
            {val}
            <span className="lvl">k{player.hand[i]}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 14 }}>
        Součet: <strong>{sum}</strong>
      </div>
    </div>
  );
}
