# Front ear fit and stronger face relief — trial

Left reproduces the right-hand `face-relief-trial` copy. Right pulls the exposed parts of both ears inward towards the skull (20% of their outward distance from the root), with y/z coordinates and ear indices unchanged, and applies a second localized relief pass to the head. The preserved nose and lip UV areas, neck/body and prior models remain intact. Original game models are not replaced. Ear provenance: CC0 MakeHuman-derived, see `../head-reference/README.md`.

This is an intermediate static visual trial, not a new ear topology or a weld: some blocky areas, edges and intersections remain. The changes to face relief are still modest; eye placement, eyelashes and northern/central face differentiation have not yet been done. Animation, hair and full lighting compatibility have not been tested. Comparisons of front, three-quarter, both profiles and full-body are in `docs/previews/front-ear-face-trial/`.

Desktop/mobile browser checks exercised view and light controls and verified unchanged body, head nose/lip positions, ear y/z and indices, finite bounded inward ear movement; `node tests/face-relief-trial.mjs` passes and `npm run verify` passed 232 tests. These checks do not certify visual quality or animation.
