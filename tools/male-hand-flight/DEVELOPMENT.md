# Walking hands and rear-flight foot follow-up

This separate review candidate starts from the user's last reviewed feet/arms trial, `work/male-gait-limbs/male_feet_arms_trial.glb` (SHA-256 `9dd20ca505bf5194cd9ab3bf0034343cd134db400a4b907cd0a51caad32ef83e`). It does not overwrite that file or attempt an engine integration. The user reported open, robotic-looking walking hands and an odd running-foot angle in the rear airborne phase; the rest was to remain as it was.

## Method and scope

- `author.mjs` verifies the source bytes. Its local finger axes come from this rig's bind-pose finger directions and the plane formed by the wrist, index and little finger. In walk only, it adds rotation tracks for all 30 existing finger joints. The non-thumb fingers receive a mild graduated curl and slight adduction, with a small cyclical flex (1.2°, 0.8°, 0.4° on successive joints). Thumb adduction is distributed across its joints; putting more rotation at the base alone produced sampled webbing intersections. This is a rig-specific artistic approximation, not an anatomical or physiologic model.
- Walk's existing animation tracks, including both wrists, arms, feet, root and timing, remain byte-identical. The hand motion is inherited from the unchanged wrist; only the new finger channels alter the walking pose. In run, no finger or arm channel is added or edited.
- In run, at the existing key times, a smooth mask grows as the original sole rises from 55 to 145 mm and the ankle moves from 90 to 270 mm behind the hips. At full mask, a −14° rotation about the shin's local X and a partial reversal (80%) of the previous outward world-yaw adjustment are applied around the ankle. The latter matters because that world-yaw correction, useful when toes face forwards near the ground, acts laterally in the opposite direction when the foot faces backwards in flight. The two edited foot tracks retain their original times; toe tracks are unchanged but inherit foot orientation. As the mask falls away, the previous tracks are restored. Interpolation across key boundaries can leave tiny residual rotations outside the nominal mask; see below. No other running track changes.
- The body, rest transforms, mesh attributes, hierarchy, skin, inverse bind matrices and texture images are untouched. No horizontal foot lock is added. Character scale, two in-place clips and their original timing are retained.

## Reproduce

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-hand-flight/build.mjs
node tools/male-hand-flight/qa-gltf.mjs
# Large scratch files: choose a temporary directory with enough space.
node tools/male-game-gait/qa-export.mjs work/male-hand-flight/previous_feet_arms.glb /tmp/hands-before.json 64
node tools/male-game-gait/qa-export.mjs work/male-hand-flight/male_hands_airfoot_trial.glb /tmp/hands-after.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/hands-after.json --strict
python3 tools/male-hand-flight/qa-regions.py /tmp/hands-before.json /tmp/hands-after.json
# With Chromium and FFmpeg available (set CHROME_BIN and FFMPEG_BIN if needed):
node tools/male-hand-flight/record.mjs
node tools/male-hand-flight/qa-browser.mjs
python3 tools/male-hand-flight/package.py
```

The FCL checks require NumPy and python-fcl. `build.mjs --output /tmp/separate-directory` builds a scratch copy; it refuses to overwrite unrelated repository artifacts. The self-contained viewer embeds both GLBs, so it can run via `file://` without fetching dependencies. It keeps phase and camera on comparison and includes hand/foot close-ups. The four silent six-second H.264 videos capture the actual new model at fixed 30 fps timestamps. Video decode tests detect blank or frozen frames, not aesthetic issues; build/capture hashes bind the videos to the models/viewer, and the ZIP is checked entry-by-entry.

## Checked candidate and limits

- Candidate SHA-256 `576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf`. glTF Validator: 0 errors, 0 warnings, 2 informational notices. Track, mesh and rig comparisons confirm precisely the scope above; first/last key values close the cycles.
- At 4,096 off-key phases per clip, the lowest of the two selected soles was 2.13–9.49 mm in walk and 2.24–73.91 mm in run. Walk foot heights are unchanged. The greatest running per-foot height change is 43.84 mm **in flight**, not near-floor contact. Running foot orientation differs by at most 21.04°; at samples where the original lowest sole was below 50 mm, the difference was at most 0.0083°, and when the original ankle was less than 80 mm behind the hip it was at most 0.0401°. Unchanged joint and ankle positions agree within numeric tolerance. These are sampled checks, not continuous ground-contact or skating guarantees.
- At the same 4,096 samples, for feet with the original lowest sole above 160 mm and ankle over 300 mm behind the hip, the mean shin-to-toe direction angle increased by 12.84° left and 7.35° right. This is a proxy for a particular portion of rear flight, not a naturalness measurement or a clinical target. The sampled correction changed by at most 0.1345° per 1/4096 cycle; original motion already contains fast foot rotation.
- At 64 off-key phases per cycle, FCL checks on the selected hand regions found no non-neighbouring self-crossings or hand–torso crossings in either clip; hand–hip and same-side hand–knee checks in walking also found none. Selected foot–foot checks found none. Neck was tested only at 16 phases. The separately checked right walking foot retained **the same** local self-intersection pairs as the baseline in 2/64 poses (12 triangle pairs total); left walking foot had none. Depth and visual salience were not measured. Running foot self-crossings changed from 0/1 phases left/right to 0/0. Worst per-pose first-percentile triangle area ratios in walking hands were 0.718/0.718 and in running feet 0.680/0.677 (L/R). These regions are rest-position/skin selections and exclude adjacent welded triangles; separate face/ears, containment, depth, other regions and intervals between samples are not covered.
- Before/after close-ups across multiple phases and directions were inspected. Four videos decode to 180 nonblank, distinct frames each. Offline Chromium passed desktop and emulated 320/390/768 px layouts, close-up framing across sampled phases/views, phone quick controls, comparison phase/camera, 1× playback, late video seeks, exact GLB download and WebGL fallback. Physical phones, arbitrary gestures, engine import and animation blending were not tested. Automated checks and screenshots do not replace the user's evaluation of the complete motion at normal speed.

Source/licensing details and the earlier inherited fitting attribution are in `CREDITS.md`. The user's screenshots are not included in the package.
