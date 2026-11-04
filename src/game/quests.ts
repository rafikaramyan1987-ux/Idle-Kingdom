import type { Bundle, BuildingType, Res } from './economy';

export type QuestGoal =
  | { kind: 'build'; building: BuildingType; count: number }
  | { kind: 'level'; building: BuildingType; level: number }
  | { kind: 'collect'; res: Res; amount: number }
  | { kind: 'regions'; count: number }
  | { kind: 'population'; count: number }
  | { kind: 'heroes'; count: number };

export interface Quest {
  goal: QuestGoal;
  /** Fixed reward, or `null` = "N seconds of production" computed at claim time. */
  reward: Bundle | null;
  rewardSeconds?: number;
}

const SCRIPTED: Quest[] = [
  { goal: { kind: 'build', building: 'farm', count: 1 }, reward: { wood: 25, gold: 10 } },
  { goal: { kind: 'collect', res: 'food', amount: 10 }, reward: { gold: 15 } },
  { goal: { kind: 'build', building: 'lumber', count: 1 }, reward: { food: 25 } },
  { goal: { kind: 'level', building: 'farm', level: 2 }, reward: { wood: 30 } },
  { goal: { kind: 'build', building: 'house', count: 1 }, reward: { gold: 30 } },
  { goal: { kind: 'collect', res: 'wood', amount: 60 }, reward: { food: 40, gold: 20 } },
  { goal: { kind: 'level', building: 'castle', level: 2 }, reward: { food: 60, wood: 60 } },
  { goal: { kind: 'build', building: 'mine', count: 1 }, reward: { gold: 60 } },
  { goal: { kind: 'regions', count: 1 }, reward: { stone: 40, gold: 40 } },
  { goal: { kind: 'level', building: 'farm', level: 3 }, reward: { wood: 80 } },
  { goal: { kind: 'build', building: 'market', count: 1 }, reward: { stone: 60 } },
  { goal: { kind: 'level', building: 'walls', level: 1 }, reward: { gold: 120 } },
  { goal: { kind: 'build', building: 'house', count: 3 }, reward: { food: 150, wood: 150 } },
  { goal: { kind: 'level', building: 'lumber', level: 5 }, reward: null, rewardSeconds: 120 },
  { goal: { kind: 'level', building: 'castle', level: 3 }, reward: null, rewardSeconds: 120 },
  { goal: { kind: 'build', building: 'forge', count: 1 }, reward: null, rewardSeconds: 150 },
  { goal: { kind: 'regions', count: 3 }, reward: null, rewardSeconds: 150 },
  { goal: { kind: 'population', count: 40 }, reward: null, rewardSeconds: 150 },
  { goal: { kind: 'heroes', count: 3 }, reward: null, rewardSeconds: 180 },
  { goal: { kind: 'level', building: 'mine', level: 8 }, reward: null, rewardSeconds: 180 },
  { goal: { kind: 'level', building: 'castle', level: 5 }, reward: null, rewardSeconds: 240 },
];

const CYCLE: ((n: number) => QuestGoal)[] = [
  (n) => ({ kind: 'level', building: 'farm', level: 8 + n * 2 }),
  (n) => ({ kind: 'collect', res: 'gold', amount: Math.round(2000 * Math.pow(2.2, n)) }),
  (n) => ({ kind: 'level', building: 'lumber', level: 8 + n * 2 }),
  (n) => ({ kind: 'regions', count: Math.min(12, 4 + n) }),
  (n) => ({ kind: 'level', building: 'house', level: 6 + n * 2 }),
  (n) => ({ kind: 'level', building: 'castle', level: 5 + n }),
  (n) => ({ kind: 'level', building: 'mine', level: 8 + n * 2 }),
  (n) => ({ kind: 'population', count: 60 + n * 40 }),
  (n) => ({ kind: 'level', building: 'market', level: 6 + n * 2 }),
  (n) => ({ kind: 'level', building: 'walls', level: 5 + n * 2 }),
];

export function questAt(index: number): Quest {
  if (index < SCRIPTED.length) return SCRIPTED[index];
  const i = index - SCRIPTED.length;
  const goal = CYCLE[i % CYCLE.length](Math.floor(i / CYCLE.length));
  // Regions cap at 12; once maxed skip to the next template.
  if (goal.kind === 'regions' && goal.count >= 12 && Math.floor(i / CYCLE.length) > 8) return questAt(index + 1);
  return { goal, reward: null, rewardSeconds: 180 + Math.min(600, i * 15) };
}

export const SCRIPTED_QUEST_COUNT = SCRIPTED.length;
