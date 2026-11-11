# Female lobe contour experiment — unsuccessful

Based on `ear-finish-attempt-trial`: both columns use its experimental female boundary strip and male rear trim. On the right only, the female lower/front lobe is moved forward locally up to 0.004 model units and down up to 0.001, with adjusted normals. Male ears, face drawing, neck and original assets/presets are unchanged.

The female notch remains and the shifted edge looks hook-like from some profiles; this is not an acceptable finished lobe or a welded ear. The prior triangle strip, scalp depression and visible seams still exist. The male upper skin fragment and shading are not fixed here. Head/neck seam is unchanged. The trial should not be integrated. Full animation is not tested; turn/tilt are static samples.

Open `/src/female-lobe-contour-trial/` in Vite; PNGs are under `docs/previews/female-lobe-contour-trial/`. `node tests/female-lobe-contour-trial.mjs` checks synthetic displacement and normals; `npm run verify` passed 232/232. Tests do not validate anatomy or mesh integrity. CC0 ear source is described in `../head-reference/README.md`.
