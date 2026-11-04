# Credits

## 3D models

| Pack | Author | Link | License |
|---|---|---|---|
| KayKit – Medieval Hexagon Pack 1.0 | Kay Lousberg (www.kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 (also https://kaylousberg.itch.io/kaykit-medieval-hexagon) | **CC0 1.0** (Creative Commons Zero) |

The license was verified from `LICENSE.txt` inside the pack ("License: (Creative Commons Zero, CC0)").
A copy ships with the game as `public/assets/LICENSE-KayKit.txt`. The pack is fetched at a pinned commit by
`scripts/fetch-assets.mjs`, which refuses to build if the license is not CC0.

Kenney (kenney.nl) packs were the first choice, but kenney.nl refuses downloads from the build environment,
so with the owner's approval the CC0 KayKit pack was used instead. No Kenney or Quaternius files are included.

All models (red-roof variants for the kingdom) were converted to a single optimized `kingdom.glb` (meshopt compression,
512px shared atlas). The build step gives only the lime grass hue band of the atlas a fresher green.
The tiny villagers, birds, smoke, ocean and fog are drawn procedurally in code.

## Font

| Font | Author | Link | License |
|---|---|---|---|
| Fredoka | Milena Brandão, Hafontia | https://fonts.google.com/specimen/Fredoka (via `@fontsource/fredoka`) | SIL Open Font License 1.1 |

## Code libraries

- three.js 0.187.0 — MIT — https://threejs.org
- Sounds and music are synthesized at runtime with the Web Audio API (no audio files).
