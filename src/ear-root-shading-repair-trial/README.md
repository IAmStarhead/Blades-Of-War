# Upper-root normal diagnostic

The left comparison recreates `ear-old-front-new-profile-trial` (63cb14d); right preserves the same ear vertices and root strip triangles but blends normals in a small upper area toward an outward-facing vector. Faces, lobe geometry and original game assets are unchanged. This is a lighting adjustment, not a geometry repair or a weld. The preceding diagnostic raycast found added strip triangles at the dark area on the female right ear, which motivated checking normals.

The test does not solve the spot; the female enlarged crop can appear darker, and the upper speck and front irregularities remain. No improvement can be claimed. The strip remains overlapping and may shade differently under other lights. This is a failed diagnostic, not ready for integration. Static poses were captured; no complete animation cycle has been verified.

See screenshots `docs/previews/ear-root-shading-repair-trial/`. `node tests/ear-root-shading-repair-trial.mjs` checks synthetic geometry preservation and finite changed normals, not visual appearance or animation. Ear source: `../head-reference/README.md`.
