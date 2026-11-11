# Female ear fitting refinement

Separate before/after comparison using the male ear shape preferred by the user. Left female uses the previous trial fit (x scale 0.96, z offset +0.006); right uses x scale 0.95 and z offset +0.004, with the same y scale 0.95. Both ears are cloned from the finalized male trial geometry and retain the female material. Male ears, face texture and neck remain unchanged. No game asset or preset is replaced.

The change is small. The dark lower edge and intersection with the head still appear in some profiles; this is NOT a welded connection or a verified fix for the lobe. The original normals are retained approximately under scaling. Turn/tilt screenshots are static samples, not a full animation test. Do not integrate without visual review.

Open `/src/female-ear-fit-refine-trial/` in Vite. PNGs and close-ups are under `docs/previews/female-ear-fit-refine-trial/`. Run `node tests/female-ear-fit-refine-trial.mjs`; `npm run verify` passed 232/232. Tests do not validate artistic or mesh quality. CC0 ear source is documented in `../head-reference/README.md`.
