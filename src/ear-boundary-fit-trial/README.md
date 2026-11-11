# Ear boundary fitting experiment

Separate comparison based on `ear-lobe-join-trial`. Both columns use the female lobe visibility adjustment and the previous male ear and softened head recess. On the right only, a rest-pose BVH raycast samples the copied head surface and brings nearby boundary ear vertices and a three-edge feather band toward it; head indices are preserved. No original asset or preset is replaced.

This is **not a weld**: the two meshes still overlap and remain topologically separate. Some back-edge geometry is less conspicuous, but the lobe can still look pointed and the scalp depression/shading and other edge artifacts remain. Local normal adjustment is an approximation, and altered edge triangles can affect appearance in other lights or angles. No promise of watertight geometry or full animation compatibility; turn/tilt are static samples. Head/neck seam is unchanged. Do not integrate without review.

Open `/src/ear-boundary-fit-trial/` in Vite; screenshots and enlarged crops are under `docs/previews/ear-boundary-fit-trial/`. `node tests/ear-boundary-fit-trial.mjs` checks basic behavior on synthetic geometry, finite normals and preservation of head indices; `npm run verify` passed 232/232. Neither validates anatomy or connectivity. CC0 source documented in `../head-reference/README.md`.
