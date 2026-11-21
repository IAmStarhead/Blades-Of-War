# Feet and walking-arm follow-up

The user liked the preceding Quaternius 2017 gait trial but reported feet pointing toward each other in walk/run and arms held too wide in walk. They asked that the rest of the run be left alone. This isolated follow-up starts from the exact reviewed GLB (`844de26eb624dcb6b630157dda1227b6be2c54e4654c35d086c74149be26f45a`) and does not overwrite it. It is a review candidate, not an approved engine integration.

## Method and scope

`author.mjs` verifies the input hash and writes a separate GLB. At each existing key the two feet are pre-rotated around world up, converted back to the respective shin's local space, and the resulting tracks are interpolated at the original times. The asymmetric outward adjustments (left/right, in degrees) are walk 12/14 and run 8/18; these are corrections, not the final heel-to-tip angles. The originals differ by side. Toe bones retain their local tracks and inherit the foot transformation.

Walking upper arms are rotated inward about their parent-space Z axis, by 12° left and 7° right; forearms and hands inherit that motion. The asymmetry limits shoulder/hand contacts for this particular skin while reducing the original asymmetry. No shoulder or forearm track is edited. Test variants bringing both arms inward by 12–14° produced sampled shoulder and/or hand–torso contacts; they were not delivered. This is specific to this rig and animation, not a general retargeter or a universal ergonomic correction.

Exactly four walking rotation tracks change (`Rig_Foot_L/R`, `Rig_UpperArm_L/R`) and exactly two running tracks (`Rig_Foot_L/R`). Every other track and all key times are byte-identical to the previous model; the rest pose, mesh attributes, bind matrices, hierarchy and textures are retained. In particular, running arms/torso/head, leg joints above the feet, root path and timing are not altered. Rotating each foot around its ankle retains the ankle location; the near-vertical clearance is practically unchanged in samples. There is still **no horizontal planted-foot lock** and this does not cure possible skating.

## Build and test

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-gait-limbs/build.mjs
node tools/male-gait-limbs/qa-gltf.mjs
node tools/male-gait-limbs/qa-motion.mjs
node tools/male-game-gait/qa-export.mjs work/male-gait-limbs/male_feet_arms_trial.glb /tmp/gait-limbs-regions.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/gait-limbs-regions.json --strict
# With Chromium and FFmpeg available (set CHROME_BIN / FFMPEG_BIN if needed):
node tools/male-gait-limbs/record.mjs
node tools/male-gait-limbs/qa-browser.mjs
python3 tools/male-gait-limbs/package.py
```

`build.mjs --output /tmp/separate-directory` makes a scratch build and refuses to overwrite unrelated repository artifacts. FCL requires NumPy and python-fcl. The offline viewer embeds both the new model and a byte-identical copy of the previous GLB; its version toggle preserves phase, ground position and camera. Both models use the same approximate grid speeds as before, not a physics/contact solution. The three silent six-second H.264 videos show the new model at fixed 1× timestamps. Each decoded frame is checked for blank/frozen output, but that is not a visual-quality guarantee. Build/capture hashes bind the videos and viewer to both models; the ZIP verifier checks its entries byte-for-byte.

## Checks on the selected output

- Final GLB SHA-256 `9dd20ca505bf5194cd9ab3bf0034343cd134db400a4b907cd0a51caad32ef83e`; glTF Validator reports 0 errors, 0 warnings and 2 informational notices. Automated track/geometry comparisons confirm the exact edit scope above.
- At 4,096 off-key phases per clip, the sampled lowest sole ranged 2.13–9.49 mm walk and 2.24–73.91 mm run. The largest per-foot difference in lowest sole height from the previous model was 0.0018/0.0192 mm walk/run; sampled ankle origins and unchanged joints did not move beyond numerical tolerance. Approximation of the world-yaw adjustment between original keys was within 0.0053°/0.0219°. These are samples, not continuous contact proof.
- At 256 sampled phases, using heel/tip vertex centroids only when the selected foot's lowest vertex was below 8 mm and its projected heel-to-tip Z exceeded 85 mm, the signed outward-yaw medians changed from −9.68°/−10.40° to +2.00°/+3.22° for walking left/right, and from −3.49°/−13.07° to +4.30°/+4.45° for running. This proxy ignores less horizontal poses, and near floor is not the same as planted; it does not prove zero inward appearance at every instant. The walking elbow's median outward X coordinate changed from 0.34/0.30 m to 0.29/0.27 m (left/right); this is not a direct clearance measurement.
- Selected FCL triangle subsets found no non-neighbouring contacts at 64 off-key phases per clip for knees, elbows, shoulders, hips, hands/torso and foot/foot; neck was checked at 16 phases. The worst per-pose first-percentile area ratios were 0.729/0.671/0.742 for walking shoulder L/R and hip, and 0.580/0.600/0.596 for running. The regions are chosen by rest-position predicates; welded neighbours are excluded. Separate face/ears, fully enclosed surfaces, penetration depth, other animations and times between samples are not covered.
- Offline and local HTTP browser checks cover desktop and emulated 320/390/768 px layouts, sampled body/foot framing, phone quick controls, synchronized before/after and download bytes, wall-clock playback, late video seeks and WebGL fallback. Actual physical phones and arbitrary gestures were not tested. The user's screenshots are not included in the package.
- Multiple phase and angle views and selected video frames were inspected; these do not replace the user's assessment of the full movement at normal speed. Some near-floor walking samples still measure about 1° inward and toe direction is not constrained throughout the cycle.
