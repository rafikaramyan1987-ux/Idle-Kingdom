import { RESOURCES } from './economy';
import { newGame, SAVE_VERSION, type GameState } from './state';

export const SAVE_KEY = 'idle-kingdom-save-v1';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(s: GameState): string {
  return JSON.stringify(s);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Parses and sanitises a save. Returns null when the data is unusable. */
export function deserialize(raw: string | null, now: number): GameState | null {
  if (!raw) return null;
  let data: Partial<GameState>;
  try {
    data = JSON.parse(raw) as Partial<GameState>;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || !isNum(data.version) || data.version > SAVE_VERSION) return null;
  if (!Array.isArray(data.buildings) || !data.res) return null;
  const base = newGame(now);
  const s: GameState = { ...base, ...data, settings: { ...base.settings, ...data.settings }, stats: { ...base.stats, ...data.stats } } as GameState;
  for (const r of RESOURCES) {
    s.res[r] = isNum(s.res[r]) ? Math.max(0, s.res[r]) : 0;
    s.earned = s.earned ?? { ...base.earned };
    s.earned[r] = isNum(s.earned[r]) ? s.earned[r] : 0;
    s.collected = s.collected ?? { ...base.collected };
    s.collected[r] = isNum(s.collected[r]) ? s.collected[r] : 0;
  }
  s.buildings = s.buildings.filter((b) => b && isNum(b.level) && typeof b.type === 'string');
  for (const b of s.buildings) {
    b.pending = Object.assign({ food: 0, wood: 0, stone: 0, gold: 0 }, b.pending);
    b.upgradeEnd = isNum(b.upgradeEnd) ? b.upgradeEnd : 0;
    b.upgradeStart = isNum(b.upgradeStart) ? b.upgradeStart : 0;
  }
  if (!s.buildings.some((b) => b.type === 'castle')) return null;
  if (!s.buildings.some((b) => b.type === 'walls')) s.buildings.push({ ...base.buildings[1], id: s.nextId++ });
  if (!Array.isArray(s.regions) || !s.regions.includes(0)) s.regions = [0, ...(s.regions ?? [])];
  if (!isNum(s.lastSeen) || s.lastSeen > now) s.lastSeen = now;
  s.newHeroes = Array.isArray(s.newHeroes) ? s.newHeroes : [];
  s.version = SAVE_VERSION;
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
