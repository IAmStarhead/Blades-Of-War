# Ear boundary face-winding correction — partial

Left reproduces `ear-stitched-trial`'s right-hand result. Right uses the same stitched boundary, local head recess, position data and materials but chooses the new faces' winding against the original boundary edges on each ear, before recomputing and averaging normals. Both sides use copies, with no game integration; CC0 MakeHuman ear source provenance is in `../head-reference/README.md`.

The female new triangles previously ran the same way as all 13 neighbouring boundary edges; this trial reverses them. One male ear had all 22 boundary edges the same way and is also reversed; the other already had the opposite winding on all 21 edges. The darker angular female patch is lighter in the static side view, but discontinuities and remaining intersections are still visible. Split vertices and separate head/ear meshes mean this is not a complete watertight weld, nor does it guarantee proper shading under every light or in animation.

Browser checks at desktop/mobile verify unchanged head/body positions between the comparison copies, nonempty finite ear normals, matching index counts, and boundary winding evidence. `npm run verify` passes 232 tests. Animation has not been tested. See PNGs including enlarged crops in `docs/previews/ear-normal-trial/`.
