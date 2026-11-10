# Inner ear relief trial — unsuccessful

Left is `ear-skin-trial`'s right-hand result; right subdivides the previously reconstructed inner-ear triangles with slightly displaced centroids and applies a local vertex-colour shadow on independent ear geometry. Body and head geometry and original game characters are unchanged. CC0 MakeHuman-derived ear provenance: `../head-reference/README.md`.

This was an attempt to introduce shape and shading, not a successful cavity rebuild. The new faces still intersect the head/adjacent surfaces and produce speckled, harsh or broken boundaries in enlarged screenshots. Male scalp-margin fragment remains. The ear and head are separate, not welded; animation and hair have not been tested. Do not use this as a finished model. Comparisons and enlarged crops are under `docs/previews/ear-cavity-trial/`.

Desktop/mobile browser checks confirm controls, unchanged head/body positions, finite ear attributes, valid indices, expected new face counts and head parent. `npm run verify` passed 232 tests. These do not verify manifold topology, artistic quality or motion.
