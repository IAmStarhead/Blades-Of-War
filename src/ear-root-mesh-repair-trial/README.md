# Ear upper-root mesh experiment

Left is the previous female placement trial `5b67c15`. Right builds an ear-mesh strip at selected upper-inner boundary edges using closest points on the head's geometry, with an intermediate row and interpolated normals. Both sexes are included. New geometry belongs to the ear and slightly overlaps the head; it is not a topological weld. The female inward placement is retained in both columns. Existing vertices of the ears, heads, faces, and lower lobes are untouched.

At runtime the four ears gained 60/88 triangles (female) and 60/100 (male). In the captured views the visible improvement is minimal; a small line can appear along the upper female ear in profile, and remaining seams/angular pieces are not repaired. The ear and scalp still intersect; a full animation cycle has not been verified. This is a failed/incomplete repair experiment, not ready to integrate. Game assets remain unchanged.

Open `/src/ear-root-mesh-repair-trial/` in Vite. The front, three-quarter, profile, alternative-light and static pose screenshots are under `docs/previews/ear-root-mesh-repair-trial/`. `node tests/ear-root-mesh-repair-trial.mjs` checks a synthetic head for valid indices, finite normals and preservation of original vertices; it does not establish visual or animation quality. Source ear provenance in `../head-reference/README.md`.
