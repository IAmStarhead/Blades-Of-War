# Walk and neck comparison — build and checks

This is a separate trial built from the published `work/male-locomotion/` ZIP
and GLB. It does not alter that trial. The standalone HTML contains its model
and renderer; the ZIP also includes the GLB, instructions and the inherited
licenses. The same well source and navigation module are hash-checked at build.

```sh
npm ci --prefix tools/male-walk-refinement
npm ci --prefix tools/character-showcase  # glTF Validator and browser QA
python3 tools/male-walk-refinement/build.py
python3 tools/male-walk-refinement/verify.py --rebuild
node tools/male-walk-refinement/qa-gltf.mjs
node tools/male-walk-refinement/qa-navigation.mjs
node tools/male-walk-refinement/qa-browser.mjs
node tools/male-walk-refinement/qa-animation.mjs
```

The browser checks require a Chromium installation and its system libraries;
set `CHROME_BIN` if the bundled Chromium is not suitable. Optional
`--screenshots=/path` writes human-review screenshots outside the build.

## Scope and measurements

- The original base mesh attributes, topology, skin and bind transforms are
  unchanged. A reversible morph changes the back of the neck and its normals:
  maximum displacement 1.03 mm on `head_1`, 9.63 mm on `head_2`. The previously
  smoothed nape normals are transformed analytically rather than recomputed.
- All original clips remain; the old `Walk_Loop` is named `Previous_Walk`.
  The former arm weight channel gains a second, constant neck-profile weight;
  its original weight samples remain unchanged. The new walk is 0.90 s at
  0.9 m/s with 60% stance. The unchanged run is 0.72 s at 2.2 m/s.
- In the browser's 120-interval straight-cycle sample, the new versus old walk
  had minimum sampled foot height about 2.00 versus 2.12 mm above the plane,
  peak left swing height 4.20 versus 7.90 cm, and selected stance-foot centroid
  drift about 7.25 versus 21.18 mm for either foot after compensating for forward
  motion. The centroid includes foot roll and is not a contact-point lock or a
  test of every surface.
  Target reach is checked against a simplified two-link chain during generation.
  No runtime foot IK or physical contact solver is present; sliding can occur,
  especially during transitions and turns.
- `qa-animation.mjs` compares mesh samples for all 11 old clips in the actual
  previous and new viewers with the profile disabled. It also samples nearby
  neck/head and ear/head vertex pairs during head turns, arms, idle and gait;
  the largest change in sampled neck-pair distance was about 0.070 mm. These
  distances and screenshots are regression checks, not proof of a watertight
  seam or perfect shading under every light.
- The in-viewer comparison uses the old walk and zero profile morph for
  “Прежняя”; “Новая проба” uses the new walk and the morph. Run animation keys
  are unchanged, although the new profile remains visible in that variant.
  No cut surfaces, dismemberment, separate finger animation, or user-device
  performance measurements are provided.
