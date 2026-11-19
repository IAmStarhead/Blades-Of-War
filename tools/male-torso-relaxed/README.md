# Torso and relaxed-walk trial

The user-facing deliverable is
`work/male-torso-relaxed/BladesOfWar_Proba_Torsa_i_Hodby.zip`. This is an
independent follow-up to `work/male-gait-polish/`, the trial the user actually
reviewed. The build verifies the SHA-256 of that exact ZIP and GLB and does not
overwrite them. The offline page embeds its GLB and has a comparison toggle
against that exact previous surface, walk, run and crouch, at the same phase.

## Model changes

The body-influenced torso and upper-pelvis vertices are sculpted with smoothly
bounded masks; 542 vertices move by more than 1 mm, with a 51.36 mm maximum.
The chest is modestly projected relative to the abdomen and a broad posterior
volume is tapered into the upper thighs. An earlier small rear sculpt is partly
removed first by blending toward the retained pre-polish surface in that
region. Skin weights, topology, rest bones, inverse binds, textures and the
20 earlier morph targets are unchanged. Below the upper-thigh transition, the
leg surface is unchanged; the run and walk leg keys are unchanged. The head,
ear geometry and previous jaw fix are unchanged. The new surface applies in
all animations, including the liked run and the inherited crouch.

`Torso_Walk` is added, rather than replacing `Polish_Walk`. It is based on
that earlier Quaternius-derived walk, with each upper arm rotated inward by
10° while preserving the remaining tracks. Four local walk-only corrective
morphs approximate the prior underarm position where narrowing caused mesh
crossings. They are encoded using deterministic PCA of every keyed walk pose;
maximum fit residual is 0.095 mm, RMS 0.012 mm. Their weights are zero in the
48 previous clips. `Polish_Run` keeps every bone key and the first 20 morph
keys; its appearance can still change because the body surface changes.
These are adjusted game-animation clips, not untouched stock animations.

The previous position/normal attributes are embedded separately for the
viewer. The original GLB clips within the new model use the new surface in
other viewers; to see the exact previous surface outside this viewer use the
previous GLB. Crouch and transitions are inherited and remain experimental.
The runtime foot guard and transition fit in the page are not baked into GLB,
and there is no horizontal foot-lock or contact physics.

## Rebuild

```sh
npm ci --prefix tools/male-library-motion
python3 tools/male-torso-relaxed/build.py
python3 tools/male-torso-relaxed/verify.py --rebuild
```

A scratch output directory outside the repository may be passed as
`--output /tmp/bow-torso-build`. The builder refuses to overwrite other
repository artifacts. Input and output hashes plus sculpt/corrective-fit
measurements are recorded in `work/male-torso-relaxed/build-info.json`.

## Checks

Install the existing browser tools with `npm ci --prefix tools/character-showcase`.
Geometry checks additionally require NumPy and python-fcl. Set `CHROME_BIN`
(and any system library paths) if Chromium needs an explicit location. JSON
exports and browser screenshots are temporary and should not be committed.

```sh
node tools/male-torso-relaxed/qa-gltf.mjs
node tools/male-torso-relaxed/qa-shape.mjs
node tools/male-torso-relaxed/qa-browser.mjs
node tools/male-torso-relaxed/qa-download.mjs
node tools/male-library-motion/qa-transitions.mjs work/male-torso-relaxed
node tools/male-library-motion/qa-geometry-export.mjs work/male-torso-relaxed /tmp/bow-torso-geometry.json
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-torso-geometry.json
node tools/male-library-motion/qa-armpit-export.mjs work/male-torso-relaxed /tmp/bow-torso-armpit.json
python3 tools/male-library-motion/qa-armpit.py /tmp/bow-torso-armpit.json
```

- glTF Validator: zero errors and warnings. All 48 previous clips preserve
  bone keys and their first 20 morph weights; padded weights are zero. The new
  walk differs only in upper-arm keys and four local correctives. Topology,
  weights, textures, face and ear primitives are unchanged; 919 coincident
  position seam pairs remain matched.
- On selected bind-space vertices, mean chest and abdomen Z changes are
  +11.9 mm and −15.4 mm, respectively; rear is −35.7 mm. In 64 walking phases
  the average wrist is 54 mm closer to the body and 26 mm lower in chest
  coordinates. Sampled lower-leg positions during walk/run and face positions
  during run are unchanged.
- The before toggle matches sampled geometry, bones and prior morph values in
  the actual previous offline viewer at 48 walk/run/crouch poses. In 120
  off-key phases per cycle, selected soles remain at least 3.91 mm above the
  floor in walk and 2.35 mm in run; the run retains airborne phases.
- The FCL checks found no selected non-neighbour triangle contacts across 832
  hip/leg/hand poses or 1,424 armpit poses, including sampled transitions.
  The crouch transition check kept selected soles at least 0.8 mm above the
  floor. These are discrete, region-limited tests, not whole-body guarantees.
- Chromium tested offline opening, controls, previous comparison, the local
  download and an emulated mobile viewport. This new version has not been
  tested on a physical phone. The earlier version was viewed by the user on
  Android; their aesthetic approval of this follow-up is still needed.

The dark central rear fold and shading remain visible in some poses; the
posterior change is not a proven anatomical fix. Chest and pelvis still need
human visual evaluation in motion. Crouch folds or foot sliding may remain.

Source provenance, the Quaternius CC0 listing and later-license uncertainty,
CMU terms and all inherited notices are documented in the ZIP's README and
license files; external anatomy illustrations were not redistributed.
