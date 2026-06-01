import { useEffect, useMemo, useState } from 'react';
import { createGame } from './game/engine';
import type { GameState } from './game/types';
import type { Action } from './game/actions';
import { applyAction } from './game/actions';
import { SetupScreen } from './components/SetupScreen';
import { GameScreen } from './components/GameScreen';
import { StatsViewer } from './components/StatsViewer';
import { DiceProbabilityViewer } from './components/DiceProbabilityViewer';
import { QuickRules, shouldAutoShowQuickRules } from './components/QuickRules';
import { loadFromStorage, saveToStorage, clearStorage, getSaveMeta } from './game/persistence';
import { LobbyScreen } from './components/LobbyScreen';
import { OnlineHomeScreen } from './components/OnlineHomeScreen';
import type { OnlineSession } from './net/session';
import { loadSession, saveSession, usePolling } from './net/session';
import { apiSubmitMove, apiEndGame } from './net/api';

type Mode = 'hotseat' | 'vs_ai' | 'online';

export function App() {
  // Hot-seat / AI: GameState žije v lokalStorage.
  // Online: GameState se zbuduje z (session.seed + log akcí ze serveru).
  const [state, setStateInternal] = useState<GameState | null>(() => loadFromStorage());
  const [onlineSession, setOnlineSessionInternal] = useState<OnlineSession | null>(() => loadSession());
  const [mode, setMode] = useState<Mode>(() => (loadSession() ? 'online' : 'hotseat'));
  const [p1Name, setP1Name] = useState('Hráč 1');
  const [p2Name, setP2Name] = useState('Hráč 2');
  const [p3Name, setP3Name] = useState('Hráč 3');
  const [p4Name, setP4Name] = useState('Hráč 4');
  const [hotseatPlayers, setHotseatPlayers] = useState<2 | 3 | 4>(2);
  // Proti AI: počet hráčů + per-slot Human/AI volba.
  // Default: slot 0 = human, ostatní AI.
  const [aiPlayers, setAiPlayers] = useState<2 | 3 | 4>(2);
  const [aiSlotKinds, setAiSlotKinds] = useState<('human' | 'ai')[]>(['human', 'ai', 'ai', 'ai']);
  const [aiSlotNames, setAiSlotNames] = useState<string[]>(['Hráč 1', 'AI 2', 'AI 3', 'AI 4']);

  function setAiSlotKind(idx: number, kind: 'human' | 'ai') {
    const next = [...aiSlotKinds];
    next[idx] = kind;
    setAiSlotKinds(next);
  }
  function setAiSlotName(idx: number, name: string) {
    const next = [...aiSlotNames];
    next[idx] = name;
    setAiSlotNames(next);
  }
  const [showStats, setShowStats] = useState(false);
  const [showProbabilities, setShowProbabilities] = useState(false);
  const [showRules, setShowRules] = useState<boolean>(() => shouldAutoShowQuickRules());

  function setState(s: GameState | null) {
    setStateInternal(s);
    if (!onlineSession) saveToStorage(s); // online stav je deriváten ze serveru, neukládáme
  }

  function setOnlineSession(s: OnlineSession | null) {
    setOnlineSessionInternal(s);
    saveSession(s);
  }

  // Hot-seat: defenzivně mirror state → storage
  useEffect(() => {
    if (onlineSession) return;
    saveToStorage(state);
  }, [state, onlineSession]);

  // Online: jakmile session přejde do 'active' a my ještě nemáme state,
  // postav lokální stav ze seedu (server pošle stav přes log akcí postupně,
  // ale prvotní GameState s mapou musí mít obě strany identicky vygenerovaný).
  useEffect(() => {
    if (!onlineSession) return;
    if (onlineSession.status !== 'active') return;
    if (state) return;
    // Vyrob setupPlayers podle session.players (slot pořadí = pořadí hráčů)
    const setupPlayers = onlineSession.players
      .slice()
      .sort((a, b) => a.slot - b.slot)
      .map((p) => ({ name: p.name || `Hráč ${p.slot + 1}`, kind: 'human' as const }));
    // createGame přijme seed → deterministická mapa + pořadí hráčů
    const initial = createGame(setupPlayers, onlineSession.seed);
    setStateInternal(initial);
  }, [onlineSession, state]);

  // Dispatch — jeden kontrakt pro hot-seat i online. Hot-seat: apply + setState.
  // Online (active): apply lokálně optimisticky + odešli na server (fire-and-forget).
  const dispatch = useMemo(() => {
    return (action: Action) => {
      if (!state) return;
      const next = applyAction(state, action);
      setStateInternal(next);
      if (onlineSession && onlineSession.status === 'active') {
        const newSeq = onlineSession.currentSeq + 1;
        setOnlineSession({ ...onlineSession, currentSeq: newSeq });
        apiSubmitMove(onlineSession.gameId, onlineSession.playerToken, newSeq, action).then((resp) => {
          if ('ok' in resp && resp.ok) return;
          // Konflikt = klient zaostal/předběhl. Polling stáhne aktuální stav.
          // Pro jiné chyby zatím jen log.
          console.warn('submit_move failed', resp);
        });
      } else {
        // Hot-seat: persist hned do storage
        saveToStorage(next);
      }
    };
  }, [state, onlineSession]);

  // Polling — pauzuje když jsme na tahu v active hře.
  const isMyTurn =
    !!state && !!onlineSession && onlineSession.status === 'active'
      ? state.currentPlayerIdx === onlineSession.slot
      : false;

  usePolling(onlineSession, isMyTurn, {
    onAction: (action, _slot, _seq) => {
      // Soupeřovy (i naše) akce ze serveru: apply via applyAction.
      // Naše vlastní akce už jsou aplikované optimisticky — server je vrací
      // jen pokud seq > našeho currentSeq, takže duplikace nehrozí (po našem
      // dispatchu jsme zvýšili currentSeq → poll už je nestáhne).
      setStateInternal((cur) => (cur ? applyAction(cur, action) : cur));
    },
    onMetaUpdate: (update) => {
      setOnlineSessionInternal((prev) => (prev ? { ...prev, ...update } : prev));
    },
    onError: (e) => {
      console.warn('poll error', e);
    },
  });

  function startNewGame() {
    clearStorage();
    setStateInternal(null);
  }

  function leaveOnlineGame() {
    if (onlineSession) {
      apiEndGame(onlineSession.gameId, onlineSession.playerToken, null, 'left').catch(() => {});
    }
    setOnlineSession(null);
    setStateInternal(null);
    saveToStorage(null);
    setMode('hotseat');
  }

  if (showStats) {
    return <StatsViewer onClose={() => setShowStats(false)} />;
  }
  if (showProbabilities) {
    return <DiceProbabilityViewer onClose={() => setShowProbabilities(false)} />;
  }
  const rulesOverlay = showRules ? <QuickRules onClose={() => setShowRules(false)} /> : null;

  // ---------------------------------------------------------------------------
  // Online flow
  // ---------------------------------------------------------------------------
  if (mode === 'online') {
    if (!onlineSession) {
      return (
        <>
          <OnlineHomeScreen
            onSessionCreated={(s) => {
              setOnlineSession(s);
            }}
            onBack={() => setMode('hotseat')}
            onShowRules={() => setShowRules(true)}
          />
          {rulesOverlay}
        </>
      );
    }
    if (onlineSession.status === 'lobby') {
      return (
        <>
          <LobbyScreen
            session={onlineSession}
            onLeave={leaveOnlineGame}
            onShowRules={() => setShowRules(true)}
          />
          {rulesOverlay}
        </>
      );
    }
    if (onlineSession.status === 'ended') {
      const winner = onlineSession.winnerSlot != null
        ? onlineSession.players.find((p) => p.slot === onlineSession.winnerSlot)
        : null;
      return (
        <div className="setup-screen">
          <h1>🏁 Hra skončila</h1>
          {winner ? (
            <p>Vítěz: <strong style={{ color: winner.color || undefined }}>{winner.name}</strong></p>
          ) : (
            <p>Hra ukončena ({onlineSession.endedReason || 'bez vítěze'}).</p>
          )}
          <button className="primary" onClick={leaveOnlineGame} style={{ width: '100%' }}>
            ↺ Zpět do menu
          </button>
        </div>
      );
    }
    // active: hraje se
    if (!state) {
      return <div className="setup-screen"><p>Načítám hru…</p></div>;
    }
    if (state.phase === 'setup') {
      return (
        <>
          <SetupScreen
            state={state}
            dispatch={dispatch}
            onNewGame={leaveOnlineGame}
            onShowStats={() => setShowStats(true)}
            onShowRules={() => setShowRules(true)}
            onShowProbabilities={() => setShowProbabilities(true)}
          />
          {rulesOverlay}
        </>
      );
    }
    return (
      <>
        <GameScreen
          state={state}
          dispatch={dispatch}
          onNewGame={leaveOnlineGame}
          onShowStats={() => setShowStats(true)}
          onShowRules={() => setShowRules(true)}
          onShowProbabilities={() => setShowProbabilities(true)}
        />
        {rulesOverlay}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Hot-seat / vs AI
  // ---------------------------------------------------------------------------
  if (!state) {
    const meta = getSaveMeta();
    return (
      <div className="setup-screen">
        <h1 style={{ marginBottom: 0 }}>🐾 Vombat & Co.</h1>
        <p style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--muted)' }}>
          Inženýři krychlí
        </p>
        <p>
          Tahová desková hra. Vombati žvýkají eukalyptus, vyformovávají kostkové
          bobky (vědecký fakt!) a chrupavčitým zadkem drtí Tasmánského Čerta.
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
            👥 Hot-seat
          </button>
          <button
            onClick={() => setMode('vs_ai')}
            className={mode === 'vs_ai' ? 'primary' : ''}
            style={{ flex: 1 }}
          >
            🤖 Proti AI
          </button>
          <button
            onClick={() => setMode('online')}
            className={(mode as Mode) === 'online' ? 'primary' : ''}
            style={{ flex: 1 }}
          >
            🌐 Online
          </button>
        </div>

        {mode === 'hotseat' ? (
          <>
            <label>Počet hráčů</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setHotseatPlayers(n)}
                  className={hotseatPlayers === n ? 'primary' : ''}
                  style={{ flex: 1 }}
                >
                  {n}
                </button>
              ))}
            </div>
            <label>Jméno hráče 1</label>
            <input type="text" value={p1Name} onChange={(e) => setP1Name(e.target.value)} />
            <label>Jméno hráče 2</label>
            <input type="text" value={p2Name} onChange={(e) => setP2Name(e.target.value)} />
            {hotseatPlayers >= 3 && (
              <>
                <label>Jméno hráče 3</label>
                <input type="text" value={p3Name} onChange={(e) => setP3Name(e.target.value)} />
              </>
            )}
            {hotseatPlayers >= 4 && (
              <>
                <label>Jméno hráče 4</label>
                <input type="text" value={p4Name} onChange={(e) => setP4Name(e.target.value)} />
              </>
            )}
          </>
        ) : (
          <>
            <label>Počet hráčů</label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              {([2, 3, 4] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setAiPlayers(n)}
                  className={aiPlayers === n ? 'primary' : ''}
                  style={{ flex: 1 }}
                >
                  {n}
                </button>
              ))}
            </div>
            {Array.from({ length: aiPlayers }, (_, i) => (
              <div key={i} style={{ marginTop: 8, padding: 8, background: '#fafafa', border: '1px solid var(--border)', borderRadius: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                  <strong style={{ minWidth: 56 }}>Slot {i + 1}</strong>
                  <button
                    onClick={() => setAiSlotKind(i, 'human')}
                    className={aiSlotKinds[i] === 'human' ? 'primary' : ''}
                    style={{ flex: 1 }}
                  >
                    👤 Hráč
                  </button>
                  <button
                    onClick={() => setAiSlotKind(i, 'ai')}
                    className={aiSlotKinds[i] === 'ai' ? 'primary' : ''}
                    style={{ flex: 1 }}
                  >
                    🤖 AI
                  </button>
                </div>
                <input
                  type="text"
                  value={aiSlotNames[i]}
                  onChange={(e) => setAiSlotName(i, e.target.value)}
                  placeholder={aiSlotKinds[i] === 'ai' ? `AI ${i + 1}` : `Hráč ${i + 1}`}
                />
              </div>
            ))}
            <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
              AI hraje sama heuristikou — nákup kostek, pohyb, využití polí, boj s Čertem.
              Můžeš nastavit i 0 humans (sleduješ jen AI proti sobě) nebo všechny humans
              (= ekvivalent hot-seatu).
            </p>
          </>
        )}

        <button
          className="primary"
          style={{ marginTop: 20, width: '100%' }}
          onClick={() => {
            const hotseatSetup =
              hotseatPlayers === 2
                ? [
                    { name: p1Name, kind: 'human' as const },
                    { name: p2Name, kind: 'human' as const },
                  ]
                : hotseatPlayers === 3
                  ? [
                      { name: p1Name, kind: 'human' as const },
                      { name: p2Name, kind: 'human' as const },
                      { name: p3Name, kind: 'human' as const },
                    ]
                  : [
                      { name: p1Name, kind: 'human' as const },
                      { name: p2Name, kind: 'human' as const },
                      { name: p3Name, kind: 'human' as const },
                      { name: p4Name, kind: 'human' as const },
                    ];
            const aiSetup = Array.from({ length: aiPlayers }, (_, i) => ({
              name: aiSlotNames[i] || (aiSlotKinds[i] === 'ai' ? `AI ${i + 1}` : `Hráč ${i + 1}`),
              kind: aiSlotKinds[i],
            }));
            setState(createGame(mode === 'hotseat' ? hotseatSetup : aiSetup));
          }}
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
        <button onClick={() => setShowProbabilities(true)} style={{ marginTop: 8, width: '100%' }}>
          🎲 Pravděpodobnosti kostek (tabulka pro plánování ruky)
        </button>
        <button onClick={() => setShowStats(true)} style={{ marginTop: 8, width: '100%' }}>
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
          dispatch={dispatch}
          setStateForAi={setStateInternal}
          onNewGame={startNewGame}
          onShowStats={() => setShowStats(true)}
          onShowRules={() => setShowRules(true)}
          onShowProbabilities={() => setShowProbabilities(true)}
        />
        {rulesOverlay}
      </>
    );
  }
  return (
    <>
      <GameScreen
        state={state}
        dispatch={dispatch}
        setStateForAi={setStateInternal}
        onNewGame={startNewGame}
        onShowStats={() => setShowStats(true)}
        onShowRules={() => setShowRules(true)}
        onShowProbabilities={() => setShowProbabilities(true)}
      />
      {rulesOverlay}
    </>
  );
}
