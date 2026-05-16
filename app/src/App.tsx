import { useEffect, useState } from 'react';
import { createGame } from './game/engine';
import type { GameState } from './game/types';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';
import { StatsViewer } from './components/StatsViewer';
import { QuickRules, shouldAutoShowQuickRules } from './components/QuickRules';
import { loadFromStorage, saveToStorage, clearStorage, getSaveMeta } from './game/persistence';

type Mode = 'hotseat' | 'vs_ai';

export function App() {
  // Try to restore a saved game on mount.
  const [state, setStateInternal] = useState<GameState | null>(() => loadFromStorage());
  const [mode, setMode] = useState<Mode>('hotseat');
  const [p1Name, setP1Name] = useState('Hráč 1');
  const [p2Name, setP2Name] = useState('Hráč 2');
  const [aiName, setAiName] = useState('AI');
  const [showStats, setShowStats] = useState(false);
  const [showRules, setShowRules] = useState<boolean>(() => shouldAutoShowQuickRules());

  // Wrapper that always persists.
  const setState = (s: GameState | null) => {
    setStateInternal(s);
    saveToStorage(s);
  };

  // Defensive: if state changes by any path, mirror it to storage.
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  function startNewGame() {
    clearStorage();
    setStateInternal(null);
  }

  if (showStats) {
    return <StatsViewer onClose={() => setShowStats(false)} />;
  }

  // QuickRules can render on top of any screen
  const rulesOverlay = showRules ? <QuickRules onClose={() => setShowRules(false)} /> : null;

  if (!state) {
    const meta = getSaveMeta();
    return (
      <div className="setup-screen">
        <h1 style={{ marginBottom: 0 }}>🐾 Vombat & Co.</h1>
        <p style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--muted)' }}>
          Inženýři krychlí
        </p>
        <p>
          Tahová desková hra pro 2 hráče. Vombati žvýkají eukalyptus, vyformovávají
          kostkové bobky a chystají se rozmačkat Tasmánského Čerta. Vyhrává ten,
          kdo to dotáhne první.
        </p>
        {meta && (
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            (Žádná rozehraná partie - poslední uložení smazáno.)
          </p>
        )}

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
        <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 14 }}>
          💾 Stav hry se automaticky ukládá do prohlížeče - po obnovení stránky pokračuješ, kde jsi skončil.
        </p>
        <button
          onClick={() => setShowRules(true)}
          style={{ marginTop: 8, width: '100%' }}
          className="primary"
        >
          📖 Jak hrát (rychlý úvod)
        </button>
        <button
          onClick={() => setShowStats(true)}
          style={{ marginTop: 8, width: '100%' }}
        >
          📊 Zobrazit statistiky AI simulací
        </button>
        {rulesOverlay}
      </div>
    );
  }

  if (state.phase === 'setup') {
    return (
      <>
        <SetupScreen
          state={state}
          setState={setState}
          onNewGame={startNewGame}
          onShowStats={() => setShowStats(true)}
          onShowRules={() => setShowRules(true)}
        />
        {rulesOverlay}
      </>
    );
  }
  return (
    <>
      <GameScreen
        state={state}
        setState={setState}
        onNewGame={startNewGame}
        onShowStats={() => setShowStats(true)}
        onShowRules={() => setShowRules(true)}
      />
      {rulesOverlay}
    </>
  );
}
