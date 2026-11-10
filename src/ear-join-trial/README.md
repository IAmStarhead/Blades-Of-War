# Ear-to-head edge experiment — not finished

Comparison on copied game figures: left is `ear-fit-trial`, right adds a small triangle strip from selected open edges at the front of each extracted ear toward ray intersections with the head surface. This targets front gaps while preserving the reference ear, nose and pre-bridge neck. Both ear extraction and body/face are unchanged; the old trial and game models remain available.

The strips overlap the head and use the ear material: they do not share vertices, UVs, normals or topology with the head and are not a proper weld. Shading and small borders are still visible, and this trial can add seams of its own. This is not a completed fix or approved game asset. Head motion is not validated; the elements are rigidly parented to the head bone. The ear's CC0 MakeHuman-derived reference and provenance are described in `../head-reference/README.md`.

Vite: `/src/ear-join-trial/`; screenshots: `docs/previews/ear-join-trial/`. Browser checks verify finite, nonempty edge strips and controls at desktop/mobile sizes, not artistic quality or animation.
