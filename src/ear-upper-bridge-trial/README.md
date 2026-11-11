# Second ear repair attempt: upper bridge

Left is `ear-three-pass-trial` (57cfcb6), right adds an upper-root strip to both ears of both figures using boundary edges and ray intersections against the private head, without moving existing ear/head vertices. The strip is part of the ear mesh and overlaps the scalp, not welded to it. Lower lobes, faces and original game models are unchanged.

The strip closes some of the large upper gap seen from the front, but creates a blocky vertical patch; the small black point on the woman's right ear remains visible. It does not resolve the angular ear contours and is not ready for integration. An expanded version of the strip was rejected because it produced a dark line on the head in three-quarter view. Opposite profiles and static head turn/tilt are captured; full animation has not been tested.

Preview `/src/ear-upper-bridge-trial/` in Vite; screenshots in `docs/previews/ear-upper-bridge-trial/`. `node tests/ear-upper-bridge-trial.mjs` checks on a synthetic head that the bridge adds valid indices without moving originals, not visual or animation quality. Ear source provenance: `../head-reference/README.md`.
