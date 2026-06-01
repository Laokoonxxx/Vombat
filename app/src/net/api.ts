// =============================================================================
// API klient — fetch wrappery proti PHP backendu (api/*.php)
// =============================================================================
// V dev módu lze přesměrovat na vzdálený backend přes VITE_API_BASE.
// V produkci se použije /api (frontend i backend na stejné doméně).
// =============================================================================

import type { Action } from '../game/actions';

const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') || '/api';

export interface ApiError {
  ok: false;
  error: string;
  status: number;
  currentSeq?: number; // jen u seq_conflict při submit_move
}

async function post<T>(path: string, body: unknown): Promise<T | ApiError> {
  const res = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<T | ApiError> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T | ApiError> {
  let json: any;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: 'invalid_json', status: res.status };
  }
  if (!json || typeof json !== 'object') {
    return { ok: false, error: 'invalid_response', status: res.status };
  }
  if (json.ok === false) {
    return {
      ok: false,
      error: typeof json.error === 'string' ? json.error : 'unknown',
      status: res.status,
      currentSeq: typeof json.currentSeq === 'number' ? json.currentSeq : undefined,
    };
  }
  return json as T;
}

// -----------------------------------------------------------------------------
// Response typy
// -----------------------------------------------------------------------------

export interface CreateGameResp {
  ok: true;
  gameId: number;
  roomCode: string;
  playerToken: string;
  slot: number;
  seed: number;
}

export interface JoinGameResp {
  ok: true;
  gameId: number;
  playerToken: string;
  slot: number;
  seed: number;
  numPlayers: number;
  players: { slot: number; name: string }[];
}

export interface StartGameResp {
  ok: true;
}

export interface SubmitMoveResp {
  ok: true;
  seq: number;
  acceptedAt: string;
}

export interface PollResp {
  ok: true;
  status: 'lobby' | 'active' | 'ended';
  currentSeq: number;
  seed: number;
  numPlayers: number;
  players: { slot: number; name: string; color: string | null }[];
  moves: { seq: number; slot: number; action: Action; at: string }[];
  winnerSlot: number | null;
  endedReason: string | null;
}

export interface EndGameResp {
  ok: true;
}

// -----------------------------------------------------------------------------
// Endpoints
// -----------------------------------------------------------------------------

export function apiCreateGame(name: string, numPlayers: number) {
  return post<CreateGameResp>('create_game.php', { name, numPlayers });
}

export function apiJoinGame(roomCode: string, name: string) {
  return post<JoinGameResp>('join_game.php', { roomCode, name });
}

export function apiStartGame(gameId: number, playerToken: string) {
  return post<StartGameResp>('start_game.php', { gameId, playerToken });
}

export function apiSubmitMove(
  gameId: number,
  playerToken: string,
  expectedSeq: number,
  action: Action,
) {
  // gameId není serverem potřeba (rozhoduje token), ale posíláme pro stabilitu/log
  return post<SubmitMoveResp>('submit_move.php', { gameId, playerToken, expectedSeq, action });
}

export function apiPoll(gameId: number, since: number, playerToken?: string) {
  const params: Record<string, string | number> = { gameId, since };
  if (playerToken) params.playerToken = playerToken;
  return get<PollResp>('poll.php', params);
}

export function apiEndGame(
  gameId: number,
  playerToken: string,
  winnerSlot: number | null,
  reason: string,
) {
  return post<EndGameResp>('end_game.php', { gameId, playerToken, winnerSlot, reason });
}
