import { useState } from 'react';
import { createGame } from './game/engine';
import type { GameState } from './game/types';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [p1Name, setP1Name] = useState('Hráč 1');
  const [p2Name, setP2Name] = useState('Hráč 2');

  if (!state) {
    return (
      <div className="setup-screen">
        <h1>🐾 Vombat</h1>
        <p>Vítej v digitální verzi deskové hry Vombat. MVP podporuje 2 hráče na jednom zařízení (hot-seat) a cíl <strong>Rozmačkej Tasmánského Čerta</strong>.</p>
        <label>Jméno hráče 1</label>
        <input type="text" value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
        <label>Jméno hráče 2</label>
        <input type="text" value={p2Name} onChange={(e) => setP2Name(e.target.value)} />
        <button
          className="primary"
          style={{ marginTop: 20, width: '100%' }}
          onClick={() => setState(createGame([{ name: p1Name }, { name: p2Name }]))}
        >
          Vytvořit hru
        </button>
      </div>
    );
  }

  if (state.phase === 'setup') {
    return <SetupScreen state={state} setState={setState} />;
  }
  return <GameScreen state={state} setState={setState} />;
}
