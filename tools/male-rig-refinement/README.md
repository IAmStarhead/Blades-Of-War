# Male motion refinement — build notes

This is a separate diagnostic follow-up, not a production game rig. The build
starts from the SHA-verified first trial ZIP in `work/male-rig-trial/` and does
not overwrite it. `refine.mjs` preserves the bind geometry, materials, skin
weights, bones, and the approved head and elbow animations. The former idle,
arm and knee clips remain available as `Previous_...` clips. A new breathing
cycle expands the chest more visibly; the knee test coordinates hip, shin and
ankle motion; and the shoulder test includes a small, local upper-arm morph.
The morph is zero at rest and only animated in the new arm test. There is no
locomotion, finger animation, ground-contact IK or physics in this trial.

`well-source.mjs` is byte-identical to the code used in the first rig trial.
The build verifies the original ZIP, GLB and well code, emits a separate GLB,
bundles a standalone offline page, includes attribution, and writes the ZIP
in `work/male-rig-refinement/`. The page offers phase-matched before/after
comparison and a motion-specific detail view; the tactical view remains fixed.

## Rebuild and checks

```sh
npm ci --prefix tools/male-rig-refinement
# Only required for the independent validator and browser QA:
npm ci --prefix tools/character-showcase
python3 tools/male-rig-refinement/build.py
node tools/male-rig-refinement/qa-gltf.mjs
python3 tools/male-rig-refinement/verify.py --rebuild
node tools/male-rig-refinement/qa-browser.mjs
```

The glTF check validates both models, byte-compares the preserved accessors and
approved clips, and bounds the added arm correction. The browser QA works offline
with network requests blocked; it tests the comparison, morph reset, phase and
camera continuity, breathing, sampled foot clearance, ear/head/neck attachment,
well geometry, responsive layouts, reduced motion, and mouse/touch controls.
Screenshots go to a temporary directory unless `--screenshots=/some/directory`
is supplied. Set `CHROME_BIN` for a nonstandard Chromium location; on Linux,
Chromium may need system libraries available via `LD_LIBRARY_PATH`. Automated
checks do not replace the user's visual judgment or testing in a game engine.
