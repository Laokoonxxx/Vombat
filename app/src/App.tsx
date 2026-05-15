import { useState } from 'react';
import { createGame } from './game/engine';
import type { GameState } from './game/types';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';

type Mode = 'hotseat' | 'vs_ai';

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [mode, setMode] = useState<Mode>('hotseat');
  const [p1Name, setP1Name] = useState('Hráč 1');
  const [p2Name, setP2Name] = useState('Hráč 2');
  const [aiName, setAiName] = useState('AI');

  if (!state) {
    return (
      <div className="setup-screen">
        <h1>🐾 Vombat</h1>
        <p>
          Vítej v digitální verzi deskové hry Vombat. MVP podporuje 2 hráče a cíl{' '}
          <strong>Rozmačkej Tasmánského Čerta</strong>.
        </p>

        <label>Režim hry</label>
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button
            onClick={() => setMode('hotseat')}
            className={mode === 'hotseat' ? 'primary' : ''}
            style={{ flex: 1 }}
          >
            👥 Hot-seat (2 hráči)
          </button>
          <button
            onClick={() => setMode('vs_ai')}
            className={mode === 'vs_ai' ? 'primary' : ''}
            style={{ flex: 1 }}
          >
            🤖 Proti AI
          </button>
        </div>

        {mode === 'hotseat' ? (
          <>
            <label>Jméno hráče 1</label>
            <input type="text" value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
            <label>Jméno hráče 2</label>
            <input type="text" value={p2Name} onChange={(e) => setP2Name(e.target.value)} />
          </>
        ) : (
          <>
            <label>Tvoje jméno</label>
            <input type="text" value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
            <label>Jméno AI soupeře</label>
            <input type="text" value={aiName} onChange={(e) => setAiName(e.target.value)} />
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              AI je jednoduchá heuristika: snaží se získávat kostky z Houští, blížit se k Čertovi a bojovat když má dost kostek.
            </p>
          </>
        )}

        <button
          className="primary"
          style={{ marginTop: 20, width: '100%' }}
          onClick={() =>
            setState(
              createGame(
                mode === 'hotseat'
                  ? [
                      { name: p1Name, kind: 'human' },
                      { name: p2Name, kind: 'human' },
                    ]
                  : [
                      { name: p1Name, kind: 'human' },
                      { name: aiName, kind: 'ai' },
                    ]
              )
            )
          }
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
