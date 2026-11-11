# Male ear shape on female trial

Separate comparison based on `ear-finish-attempt-trial`. Left female uses its prior ear with experimental lobe strip; right female clones the actual final male trial ear geometry on each side, scales x by 0.96 and vertical extent by 0.95, and offsets z by 0.006 in head-local coordinates. The female ear material is retained. The male meshes are not modified; both male columns use the same rear trim. Neither game assets nor face textures/presets are replaced.

The copy is not a weld. On some profiles the copied geometry shows visible cut edges and dark fragments at the lower edge; it intersects the female head, and its internal appearance changes with the fit. Retained source normals are approximate after scaling. The woman's head retains the earlier local recess, and the ear-to-head and head/neck junctions are not fixed. This is for visual review, not game integration. Poses shown are static turn/tilt samples, not a full animation cycle.

Open `/src/female-ear-male-shape-trial/` in Vite; screenshots and crops are under `docs/previews/female-ear-male-shape-trial/`. `node tests/female-ear-male-shape-trial.mjs` checks cloning/transform and that male geometry is unchanged; `npm run verify` passed 232/232. Tests do not prove visual quality or a welded connection. CC0 ear source is documented in `../head-reference/README.md`.
