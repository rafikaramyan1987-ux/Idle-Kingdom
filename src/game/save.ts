import { newGame, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'idle-kingdom-save-v2';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and sanitises a save. Returns null when the data is unusable (the game then starts fresh). */
export function deserialize(raw: string | null, now: number): GameState | null {
  if (!raw) return null;
  let data: Partial<GameState>;
  try {
    data = JSON.parse(raw) as Partial<GameState>;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
  if (!Array.isArray(data.buildings) || typeof data.items !== 'object' || !data.items) return null;
  const base = newGame(now);
  const s = { ...base, ...data } as GameState;
  s.settings = { ...base.settings, ...data.settings };
  s.research = { ...base.research, ...data.research };
  s.troops = { ...base.troops, ...data.troops };
  for (const k of ['gold', 'gems', 'xp', 'play', 'taxAcc'] as const) s[k] = isNum(s[k]) ? Math.max(0, s[k]) : 0;
  if (!isNum(s.level) || s.level < 1) s.level = 1;
  for (const [k, v] of Object.entries(s.items)) if (!isNum(v) || v < 0) (s.items as Record<string, number>)[k] = 0;
  s.buildings = s.buildings.filter((b) => b && typeof b.type === 'string' && isNum(b.plot));
  for (const b of s.buildings) {
    b.jobs = Array.isArray(b.jobs) ? b.jobs.filter((j) => j && isNum(j.end)) : [];
    b.ready = Array.isArray(b.ready) ? b.ready : [];
    b.buildEnd = isNum(b.buildEnd) ? b.buildEnd : 0;
  }
  if (!s.buildings.some((b) => b.type === 'castle')) return null;
  if (!Array.isArray(s.regions) || !s.regions.includes(0)) s.regions = [0];
  if (!isNum(s.lastSeen) || s.lastSeen > now) s.lastSeen = now;
  return s;
}

export function saveTo(store: KeyValueStore | null, s: GameState): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serialize(s));
    return true;
  } catch {
    return false;
  }
}

export function loadFrom(store: KeyValueStore | null, now: number): GameState | null {
  if (!store) return null;
  try {
    return deserialize(store.getItem(SAVE_KEY), now);
  } catch {
    return null;
  }
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const ls = globalThis.localStorage;
    const probe = '__ik_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}
