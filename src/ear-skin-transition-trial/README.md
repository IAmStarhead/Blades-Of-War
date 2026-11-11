# Ear-to-skin transition trial

A separate comparison based on `ear-attachment-refine-trial`: both sides preserve the latest wider female lobe source extraction and the revealed reference-ear interior. On the right the local head recess is reduced from 0.010 to 0.0085 model units and the influence of its recalculated normals is reduced from 0.7 to 0.18; the male rear-ear clipping is also expanded slightly. This softens the conspicuous shading circle in the shown lighting, while retaining a small angular remnant behind the male ear. It does not finish the female lobe.

This is a visual experiment, NOT a welded connection: separate ear and head meshes still intersect, the depression still exists, and clipping can leave open boundaries. Altered normals are a shading approximation and may behave differently under other light. The head/neck seam is unchanged. Face texture and original game assets/presets remain untouched. Turn and tilt are static pose samples, not an animation-cycle test. The CC0 ear source is documented in `../head-reference/README.md`.

Open `/src/ear-skin-transition-trial/` in Vite. Compare both sides and alternate light; screenshots and enlarged crops are under `docs/previews/ear-skin-transition-trial/`. Run `node tests/ear-skin-transition-trial.mjs`; `npm run verify` passed 232/232. Tests do not prove visual or topological quality.
