# Softer facial base — trial only

Left: the featureless `face-base-trial` with three stacked relief passes and one ear-boundary relaxation. Right: a single, broader, lower-amplitude relief field, one additional relaxation of the largest boundary loop of each ear, and a local 3.5% maximum widening of the female upper head (tapered to zero outside that region). Head height, lower jaw, protected central nose/lip geometry, body, ear indices and earlier game models are unchanged. The face drawing remains hidden on separately cloned textures, not deleted from earlier studies. Ear geometry is CC0 MakeHuman-derived; see `../head-reference/README.md`.

The new result is flatter and less blotchy, but still lacks clear anatomical planes and eye/eyelid geometry. Ear faceting and seams remain: relaxation moves only the existing open boundary, it does not add polygons or weld the ear to the head. No new eye designs, nation-specific face variants, hair or animation are included. This is not final game artwork.

The same orthographic camera scale is used for each sex (camera target is adjusted for their body heights), but the app shows before/after for one sex at a time, not both sexes next to one another. Existing head geometry bounding box dimensions include non-face elements, so should not be presented as anatomical head ratios. Screenshots under `docs/previews/face-form-study/`.

Browser checks on desktop/mobile exercised controls, both lights, views and distances; verified unchanged body positions, head Y, protected nose/lip coordinates, ear indices and independent textures. `npm run verify` passed 232 tests. Artistic appearance and animation compatibility are not covered by those checks.
