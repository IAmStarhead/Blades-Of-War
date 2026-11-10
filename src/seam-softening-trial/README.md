# Seam and protruding polygon visual experiment — incomplete

Left reproduces the previous `female-ear-edge-trial` result, right tests two isolated adjustments: darkens the upper strip of a cloned body texture to reduce contrast at the head/neck intersection without changing the accepted neck shape; prunes some upper scalp-margin triangles on the copied reference ears. Both figures keep the previous facial and body geometry, and the accepted male face is not changed. The ear reference is CC0 MakeHuman-derived; see `../head-reference/README.md` for provenance.

This does not smooth or weld all seams. The ear and head still overlap as separate meshes, some polygons and ear edges remain visible, and the neck/head colour change does not join or smooth their actual geometry. Fixed colours/materials can differ with lighting. Other body/garment joints have not been rebuilt and animation is not validated. Previous and original models remain unchanged; this is not game integration. Hair is hidden.

Vite URL `/src/seam-softening-trial/`; PNGs in `docs/previews/seam-softening-trial/`. Browser checks verify isolated body texture, unchanged head/body positions and finite retained ear geometry at desktop/mobile sizes. They do not establish artistic quality or animation compatibility.
