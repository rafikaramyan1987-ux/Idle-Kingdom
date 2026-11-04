import { Bot } from './game/bot';
import { newGame, type GameState } from './game/state';

/** A lively, well-developed kingdom for store covers: the bot plays ~40 minutes first. */
export function coverState(now: number): GameState {
  const t0 = now - 2400 * 1000;
  const s = newGame(t0);
  const bot = new Bot(s, t0);
  bot.run(2400, 2);
  s.decor.push({ id: 'well', q: -4, r: 4 }, { id: 'flags', q: -2, r: 4 });
  s.chests = s.chests.slice(0, 1);
  s.visitor = null;
  return s;
}
