import { describe, expect, it } from 'vitest';
import * as G from '../src/game/state';
import { deserialize, serialize, saveTo, loadFrom, SAVE_KEY, type KeyValueStore } from '../src/game/save';

const T0 = 1_700_000_000_000;

class MemStore implements KeyValueStore {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

describe('save / load', () => {
  it('round-trips the game state', () => {
    const s = G.newGame(T0);
    const field = s.buildings.find((b) => b.type === 'field')!;
    G.start(s, field.id, 'wheat', T0);
    G.tick(s, T0 + 5000, 5);
    const back = deserialize(serialize(s), T0 + 20_000)!;
    expect(back).toEqual(s);
  });
  it('rejects garbage, old versions and future versions', () => {
    expect(deserialize(null, T0)).toBeNull();
    expect(deserialize('not json', T0)).toBeNull();
    expect(deserialize('{"version":1,"buildings":[],"res":{}}', T0)).toBeNull();
    expect(deserialize('{"version":99,"buildings":[],"items":{}}', T0)).toBeNull();
  });
  it('sanitises bad numbers and a lastSeen in the future', () => {
    const raw = JSON.parse(serialize(G.newGame(T0)));
    raw.gold = 'lots';
    raw.items.wheat = -5;
    raw.lastSeen = T0 + 1e9;
    const back = deserialize(JSON.stringify(raw), T0)!;
    expect(back.gold).toBe(0);
    expect(back.items.wheat).toBe(0);
    expect(back.lastSeen).toBe(T0);
  });
  it('survives a throwing storage', () => {
    const bad: KeyValueStore = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };
    expect(saveTo(bad, G.newGame(T0))).toBe(false);
    expect(loadFrom(bad, T0)).toBeNull();
    expect(loadFrom(null, T0)).toBeNull();
  });
  it('writes to the store under the save key', () => {
    const m = new MemStore();
    expect(saveTo(m, G.newGame(T0))).toBe(true);
    expect(m.data.has(SAVE_KEY)).toBe(true);
    expect(loadFrom(m, T0)).not.toBeNull();
  });
});
