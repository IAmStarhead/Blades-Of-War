# Ear angle and inner colour trial

Left is the right-hand result of `ear-margin-trial`; right gently moves the upper outer ear vertices towards the skull, pivoting around the root. A subtle warm vertex-colour gradient is applied to the central inner ear; this is not a painted texture map. Head and body geometry, neck length and earlier trials are unchanged. The ear geometry is CC0 MakeHuman-derived; see `../head-reference/README.md` for provenance.

The visual change is deliberately slight. The ear/head and head/neck meshes still overlap, are not welded, and visible edges remain. Other body joints and animation have not been addressed. This is a static comparison, not game integration.

Run at `/src/ear-detail-trial/`; PNG comparisons are in `docs/previews/ear-detail-trial/`. Browser checks at desktop and mobile exercised controls, checked finite ear positions and unchanged head/body vertices; a separate check verified bounded inward ear movement and vertex colours on both ears. They do not establish artistic quality or animation compatibility.
