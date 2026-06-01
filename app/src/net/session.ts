// =============================================================================
// Online session state + polling
// =============================================================================
// OnlineSession drží vše co klient potřebuje vědět o probíhající online hře.
// usePolling() spouští periodický poll vůči serveru (interval 2s, pauza když
// vlastní hráč právě hraje — server zatím nemá co nového říct).
// =============================================================================

import { useEffect, useRef } from 'react';
import type { Action } from '../game/actions';
import { apiPoll } from './api';

export interface OnlinePlayer {
  slot: number;
  name: string;
  color: string | null;
}

export interface OnlineSession {
  gameId: number;
  roomCode: string;       // host: dostaneš z create_game; joiner: zadal jsi ho
  playerToken: string;    // klientův secret
  slot: number;           // 0..numPlayers-1
  seed: number;
  numPlayers: number;
  status: 'lobby' | 'active' | 'ended';
  players: OnlinePlayer[];
  currentSeq: number;     // poslední seq, který klient zpracoval (apply-ed)
  winnerSlot: number | null;
  endedReason: string | null;
}

export interface PollHandler {
  /** Volá se na každou nově obdrženou akci v pořadí seq. */
  onAction: (action: Action, slot: number, seq: number) => void;
  /** Volá se při změně lobby/status/players. */
  onMetaUpdate: (update: Partial<OnlineSession>) => void;
  /** Volá se při chybě (nechytatelný stav). */
  onError?: (err: { error: string; status: number }) => void;
}

const POLL_INTERVAL_MS = 2000;

/**
 * Spustí polling, dokud je session aktivní.
 * - V lobby pollujeme každé 2s (čekáme na dalšího hráče).
 * - V active pollujeme každé 2s když nejsme na tahu; pokud jsme na tahu,
 *   nemá smysl pollovat (soupeř čeká na nás).
 * - V ended polling zastavíme.
 */
export function usePolling(
  session: OnlineSession | null,
  isMyTurn: boolean,
  handler: PollHandler,
): void {
  // Držíme handler v refu, aby se efekt nepouštěl při každé re-rendru rodiče.
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!session) return;
    if (session.status === 'ended') return;
    // V 'active' a hraje to já: čekej na input, nehlas se serveru.
    if (session.status === 'active' && isMyTurn) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelled || !session) return;
      try {
        const resp = await apiPoll(session.gameId, session.currentSeq, session.playerToken);
        if (cancelled) return;
        if ('ok' in resp && resp.ok) {
          // Meta update (status, players, winner)
          const metaUpdate: Partial<OnlineSession> = {
            status: resp.status,
            players: resp.players,
            winnerSlot: resp.winnerSlot,
            endedReason: resp.endedReason,
            currentSeq: resp.currentSeq,
          };
          handlerRef.current.onMetaUpdate(metaUpdate);
          // Aplikuj nové tahy v pořadí (server je vrací seq ASC)
          for (const m of resp.moves) {
            handlerRef.current.onAction(m.action, m.slot, m.seq);
          }
        } else {
          handlerRef.current.onError?.({ error: resp.error, status: resp.status });
        }
      } catch (e) {
        handlerRef.current.onError?.({ error: 'network', status: 0 });
      } finally {
        if (!cancelled) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    }

    // První tick okamžitě, pak intervalem.
    timer = setTimeout(tick, 100);

    return () => {
      cancelled = true;
      if (timer != null) clearTimeout(timer);
    };
    // currentSeq se aktualizuje uvnitř tick (přes onMetaUpdate → rodič
    // nastaví novou session → tento efekt se restartne s novým since).
  }, [session?.gameId, session?.status, session?.currentSeq, isMyTurn]);
}

// -----------------------------------------------------------------------------
// localStorage perzistence — abychom po refreshi mohli pokračovat ve hře
// -----------------------------------------------------------------------------

const STORAGE_KEY = 'vombat:onlineSession';

export function saveSession(s: OnlineSession | null): void {
  try {
    if (s == null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadSession(): OnlineSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj !== 'object' || obj == null) return null;
    if (typeof obj.gameId !== 'number') return null;
    return obj as OnlineSession;
  } catch {
    return null;
  }
}
