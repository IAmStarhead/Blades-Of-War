# Ear edge shading and color trial

Both columns use the uncut left-hand ear from `female-ear-edge-cleanup-trial`, as requested. Right keeps identical ear positions and triangles but locally lightens vertex color and blends lower-edge normals towards nearby scalp normals in rest pose. The ear material continues to use the existing sampled head-skin color. Male ears, face, neck and original assets/presets are unchanged.

The visual effect is slight; dark geometry/intersection remains at the lower edge. It is not possible to guarantee a perfect color match under all lighting using a sampled color and adjusted normals. The ear and head are separate overlapping meshes, not welded. Static turn/tilt views are not a full animation-cycle test. Do not integrate without visual review.

Open `/src/ear-skin-color-balance-trial/` in Vite; PNGs and enlarged crops are in `docs/previews/ear-skin-color-balance-trial/`. `node tests/ear-skin-color-balance-trial.mjs` checks synthetic geometry and index preservation and finite normals; `npm run verify` passed 232/232. Tests do not establish visual or topology quality. CC0 ear source documented in `../head-reference/README.md`.
