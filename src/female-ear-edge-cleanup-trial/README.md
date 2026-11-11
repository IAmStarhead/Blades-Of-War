# Female ear lower-edge cleanup trial

Separate comparison using the user-preferred copied male ear fitted on the female head in `female-ear-fit-refine-trial`. Both columns use that same fit; right removes a small subset of shallow, lower/front ear triangles on both sides. Positions and retained normals are untouched by this trim. Male ear, face, neck and original game assets/presets remain unchanged.

The dark sliver is reduced in the shown three-quarter view, but a small dark boundary remains in profiles. Removing faces creates an open mesh boundary and may expose the head or clip the lobe; this is **not a welded or verified complete ear**. Other angles and lights may reveal artifacts. Static turn/tilt screenshots do not validate the animation cycle. Neck seam remains unchanged. Do not integrate without visual review.

Open `/src/female-ear-edge-cleanup-trial/` in Vite. Screenshots and enlarged crops are under `docs/previews/female-ear-edge-cleanup-trial/`. `node tests/female-ear-edge-cleanup-trial.mjs` checks the trim on a synthetic mesh and symmetry; `npm run verify` passed 232/232. Tests cannot establish visual quality, connectivity or animation integrity. CC0 ear source documented in `../head-reference/README.md`.
