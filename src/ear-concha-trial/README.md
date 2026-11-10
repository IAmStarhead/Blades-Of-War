# Ear concha surface trial — unsuccessful

Left is `ear-detail-trial`'s right-hand result. On the right the oval root insert is hidden and the existing inner-ear vertices are projected locally above the actual head surface, with averaged normals. This modifies a copy of the ear geometry only; the head, body, face and neck are unchanged. CC0 MakeHuman-derived ear provenance: `../head-reference/README.md`.

This does **not** create new inner-ear topology or weld the ear to the head. The extracted ear has an incomplete central patch: projecting its existing vertices exposes a pale hole/overlap and dark edges rather than creating a continuous concha. It is not an improvement to integrate. A true repair needs rebuilding and connecting the missing surface and checking it in motion. The earlier models and game remain unchanged. PNGs including enlarged screenshot crops are in `docs/previews/ear-concha-trial/`.

Desktop and mobile browser checks exercised controls, confirmed head/body positions and finite nonempty ear geometry; `npm run verify` passed 232 tests. These checks do not establish artistic quality or animation compatibility.
