# Idle Kingdom (working title)

A relaxing idle kingdom builder in cozy stylized 3D (Three.js). Single-player, no server, mobile-first portrait.

- Hex island with a river, walls, forests and mountains; locked land is misty with clouds drifting over the edges.
- Farms, lumber mills, mines, houses, markets, a forge, walls and the castle. Buildings visibly grow with level.
- Resources accumulate while you play and while the game is closed (up to 8 h, with a "welcome back" screen).
- Heroes unlocked by milestones (no gacha), a quest card with the next small goal, and "New era" prestige.
- EN / FR, soft synthesized sounds, mute, `prefers-reduced-motion`, adaptive quality, autosave to localStorage.
- CrazyGames HTML5 SDK v3 adapter (rewarded: x2 offline, x2 production 5 min, finish upgrade; paced midgame ads).
  Without the SDK (GitHub Pages, local) the game runs normally with no ads.

## Develop

```bash
npm ci
npm run dev            # http://localhost:5173
npm run lint && npm run typecheck && npm test
npm run build && npm run test:e2e   # Playwright smoke test at 390px (software WebGL)
npm run build:crazygames            # -> idle-kingdom-crazygames.zip
npm run build && npm run covers     # -> covers/*.png rendered from the real scene
```

Assets: `node scripts/fetch-assets.mjs && node scripts/build-assets.mjs` regenerates `public/assets/kingdom.glb`
from the CC0 KayKit pack (see [CREDITS.md](CREDITS.md)).

Useful URL flags: `?cover=1` (cover render mode), `?e2e=1` (fresh game, test hooks), `?cg=1` (load the CrazyGames SDK).

## Deploy

- **GitHub Pages**: `.github/workflows/deploy.yml` deploys only from `main`
  (Settings → Pages → Source: GitHub Actions).
- **CrazyGames**: CI uploads `idle-kingdom-crazygames.zip` as a build artifact on every run.

## Structure

- `src/game/` pure, unit-tested logic: economy, state & actions, quests, heroes, map layout, save, ad pacing.
- `src/render/` Three.js scene: instanced terrain, building visuals, ocean/smoke/birds/villagers/clouds, camera, adaptive quality.
- `src/ui/` HTML overlay (resource bar, labels, quest card, bottom nav, bottom sheets).
- `src/platform/sdk.ts` CrazyGames SDK adapter. `src/audio/` Web Audio synth.
