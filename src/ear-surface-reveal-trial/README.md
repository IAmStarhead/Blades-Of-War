# Expose the inner ear surface — unfinished trial

The right-hand variant uses a broader inward portion of the CC0 MakeHuman source-ear mesh and recesses the copied head surface behind the ear (up to 0.010 model units) to reveal more of the anatomical interior. Left is the accepted female-chin-forward base; no ellipsoid plug and no extra backing tint are used. Male back-margin trimming is more aggressive on the right. Face texture, original game assets and presets are untouched; localized side-of-head geometry is altered.

**Not finished:** the interior becomes more visible, but recessing the scalp exposes a conspicuous cut edge/flap and shading depression around the ear, especially behind the male ear. Ear-to-head geometry still overlaps and is not welded. Do not integrate; future work needs a properly matched boundary, not just a larger depression. Neck seam remains unchanged. Turn/tilt screenshots are static samples, not a full animation validation.

Open `/src/ear-surface-reveal-trial/` in Vite; screenshots and enlarged crops are under `docs/previews/ear-surface-reveal-trial/`. `node tests/ear-surface-reveal-trial.mjs` tests displacement limits and finite normals; `npm run verify` passed 232/232. Neither test establishes visual quality or watertight geometry. Reference source and license: `../head-reference/README.md`.
