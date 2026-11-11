# Female lobe visibility trial

Separate comparison based on `ear-skin-transition-trial` (both columns use its softened head recess and male clipping). On the right only, the female lower/front ear vertices are moved outward locally by at most 0.0035 model units, to reduce scalp occlusion of the lobe; normals are adjusted on the copied mesh. Male ears and head/neck geometry are the same in both columns. Face textures and original game assets/presets are untouched.

The visible change is small and the lower edge can read as a raised point, particularly in profile. This is **not a welded ear or a completed skin transition**: the meshes remain separate, and the earlier head depression and some contour/shading artifacts remain. The trial does not claim to fix them or the neck seam. Turn and tilt PNGs are static poses, not an animation cycle. Do not integrate without visual review.

Open `/src/ear-lobe-join-trial/` in Vite; PNGs and enlarged crops are under `docs/previews/ear-lobe-join-trial/`. `node tests/ear-lobe-join-trial.mjs` checks bounded symmetric displacement and finite normals; `npm run verify` passed 232/232. Tests do not establish anatomical quality or watertightness. CC0 source documented in `../head-reference/README.md`.
