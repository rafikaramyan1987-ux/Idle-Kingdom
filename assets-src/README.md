# Source assets (not committed)

Raw source packs live here locally and are git-ignored. Only the optimized
`public/assets/kingdom.glb` is committed.

```
node scripts/fetch-assets.mjs   # clones the CC0 KayKit pack and verifies its license
node scripts/build-assets.mjs   # builds public/assets/kingdom.glb (meshopt + 512px atlas)
```
