# First and latest 3D heads: visual comparison

Left: historical first 3D character implementation from commit `3ef5c03` (`src/engine3d/zomboid/zomboidCharacter.js` and `zomboidTextures.js`, copied verbatim into this directory). Right: latest isolated male-ear-artifact trial, commit `1b5e063`. Both sexes, same camera and lights, static rest pose. Original models are not replaced.

To make the faces visible, the first model's separate hair mesh is hidden and beard is disabled. Its original head texture still includes painted hair; the latest trial is bald. Head bone origins are aligned vertically for comparison, but neither head is rescaled, so the size difference is real. The models are different historical implementations and lighting/material response and proportions differ. The latest trial still has unresolved ear and neck joins. PNGs show front, both three-quarter views and profiles in `docs/previews/head-first-last-comparison/`.

Run Vite and visit `/src/head-first-last-comparison/`. Browser capture exercised each view for both sexes with no page errors. This is a visual comparison, not animation or topology validation.
