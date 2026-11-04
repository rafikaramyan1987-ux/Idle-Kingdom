# Idle Kingdom (working title)

A cozy 3D kingdom builder (Three.js) with a Township-style production economy and light, readable auto-battles.
Single-player, no server, mobile-first portrait.

- **Production chains**: fields (wheat, corn, carrots, cotton), animals (chickens → eggs, cows → milk, sheep → wool),
  lumber mill, mine, and factories with queues: bakery, dairy, forge, weaver, kitchen, barracks.
- **Barn** with limited space and category tabs; bigger barn needs hammers, nails and paint from battles, chests and orders.
- **Orders**: villager order board, a trade cart with big crate orders (bonus chest), army orders in the barracks.
- **Heroes & battles**: KayKit adventurers vs skeletons, animated auto-battles with skills on cooldown, damage numbers,
  screen shake. Defeat camps to discover land, treasure and ruins. Heroes level up, get stars, equipment and meals.
- **Events**: skeleton raids on the walls every few minutes (losing only costs a few goods), chests, wandering heroes,
  villager gifts, daily tasks, weekly festival leaderboard with AI rivals.
- **Market & shop**: rotating merchant offers, selling surplus, queue slots, boosts, gear, decorations, castle skins,
  research. Gems come from battles, tasks and rewarded ads — no real-money purchases.
- EN / FR (auto-detected), soft synthesized sounds, mute, `prefers-reduced-motion`, adaptive quality, safe areas,
  autosave to localStorage. CrazyGames SDK v3 adapter; works normally without it.

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173
npm run lint && npm run typecheck && npm test   # TIMELINE=1 npm test prints the 15-minute session timeline
npm run build && npm run test:e2e               # Playwright at 390px (software WebGL)
npm run build:crazygames                        # -> idle-kingdom-crazygames.zip
npm run build && npm run covers                 # -> covers/*.png rendered from the real scene
```

Assets: `node scripts/fetch-assets.mjs && npm run assets` (CC0 KayKit packs, see [CREDITS.md](CREDITS.md)).
URL flags: `?cover=1` (cover mode), `?e2e=1` (fresh game, test hooks), `?cg=1` (load the CrazyGames SDK).

## Structure

- `src/game/` pure, unit-tested logic: `defs.ts` (items, recipes, buildings, heroes), `state.ts` (all actions, events,
  timers), `battle.ts` (deterministic auto-battle), `bot.ts` (first-session player for pacing tests and covers), map, save.
- `src/render/` Three.js: instanced island, building visuals, farm life, characters, battle view, effects, camera.
- `src/ui/` HTML overlay (HUD, bubbles, panels, battle HUD). `src/platform/` CrazyGames adapter. `src/audio/` synth.
