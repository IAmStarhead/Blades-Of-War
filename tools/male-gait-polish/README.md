# Reversible gait polish — build and checks

The deliverable is `work/male-gait-polish/BladesOfWar_Proba_Pravok_Hodby_i_Bega.zip`.
It is a separate offline comparison against the immediately preceding
`work/male-library-motion/` delivery. Its model is sourced from that exact
archive and hash-checked; the prior files are never overwritten. The two
variants have the same gait phase/speed. The offline page embeds its GLB.

## What changed

`Polish_Walk` copies the retargeted Quaternius `Library_Walk` cycle, with the
upper-arm outward offset reduced by 2°, forearm Y/Z angles multiplied by .2,
hand rotations returned to rest and elbow morphs re-evaluated. The legs,
body, stride and source timing are unchanged. This is an adjusted game clip,
not an untouched stock animation or a procedurally substituted walk.

`Polish_Run` copies the liked `Library_Run`: every channel except neck/head
is byte-identical. Transferring the head's local Y twist to the neck maintains
the neck×head rotation product at keys, and nearly so between keys. It reduces
apparent lower-face side-shift from skinning; no jaw bone exists. The local
rest surface correction changes the perineal/rear transition, with a smooth
cutoff between Y=.65 and 1.10 m; max displacement 27.6 mm. It does **not**
change topology, skeleton, skin weights, prior morph targets or leg thickness.
This is a deliberately modest candidate, not a proof of correct anatomy.

All 46 pre-existing clips and the preceding position/normal attributes are
retained, and the comparison toggles those exact attributes and library clips.
The squat clip remains the old one but uses the new surface in the new mode.
An external GLB viewer will apply the new surface to the old clips; use the
old GLB or the comparison in this viewer to see the exact old version.

## Rebuild

```sh
npm ci --prefix tools/male-library-motion
python3 tools/male-gait-polish/build.py
python3 tools/male-gait-polish/verify.py --rebuild
node tools/male-gait-polish/qa-gltf.mjs
node tools/male-gait-polish/qa-browser.mjs
node tools/male-gait-polish/qa-download.mjs
node tools/male-library-motion/qa-transitions.mjs work/male-gait-polish
node tools/male-library-motion/qa-geometry-export.mjs work/male-gait-polish /tmp/bow-polish-geometry.json
python tools/male-library-motion/qa-geometry.py /tmp/bow-polish-geometry.json
node tools/male-library-motion/qa-armpit-export.mjs work/male-gait-polish /tmp/bow-polish-armpit.json
python tools/male-library-motion/qa-armpit.py /tmp/bow-polish-armpit.json
```

The browser checks use `tools/character-showcase`'s Puppeteer, Chromium and
validator packages. Geometry checks require NumPy and python-fcl. `node_modules` is a local dependency, not included in the deliverable.
The build also accepts an output outside the repository for a clean rebuild.

## Sampled results and limitations

- glTF Validator: zero errors/warnings; all 46 earlier clips are identical,
  22-bone rig and inverse binds, indices, skin weights, textures and all morphs
  unchanged. 919 coincident position seam pairs remain matched. Two new cycles
  are finite and closed. Run rotation-product difference is at most .00458°
  at sampled key midpoints.
- 48 walk/run/crouch poses of the “previous” switch matched the actual previous
  offline viewer; 120 off-key phases had ground clearance of at least 3.91 mm
  walking and 2.35 mm running; the run still has an airborne phase. In-place
  controls, keyboard, download, offline requests and emulated mobile layout
  passed. This is **not** a test of the new version on a physical phone.
- Selected hip/leg and hand/body triangles: 832 poses, no tested
  non-neighbouring intersections; selected armpits: 1,424 poses, none.
  Crouch-transition sampling kept selected soles at least .8 mm above ground.
  These checks do not cover the entire body, every phase or artistic quality.
- A separate 192-phase check of 660 lower-face vertices in head coordinates
  showed mean lateral range fall from 26.6 to 2.8 mm. Max head rotation change
  was .0046° and max translation change 1.12 mm. A 120-phase nearest-surface
  seam proxy showed no meaningful 95th-percentile increase (max .08 mm);
  it is not a watertightness proof. Neck/ear poses were visually inspected.
- The camera has a face close-up for inspecting the result. Rendering,
  transitions and visual quality still need user approval on the target phone.
  The correction is modest and visible central shading / folds remain possible,
  especially in deep crouch. There is no horizontal foot locking or physics;
  the floor and transition fitting belong to the viewer, not the GLB.

Quaternius source provenance and license uncertainty, plus inherited CMU,
CC0 and MIT terms, are documented in the deliverable README and license files.
