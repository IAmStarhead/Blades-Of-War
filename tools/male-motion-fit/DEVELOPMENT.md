# C/C fitting trial — build and QA

This is a separate visual trial, not a replacement for the previously delivered static, animated, rig or cut assets. The `male_rig_rebuild.glb` SHA-256 is pinned, the copied body geometry, skin weights, joint hierarchy and previous two clips are checked against it, and only two fitted clips are added. The segmented/cut GLB is **not** reanimated here. See the Russian user README and `CREDITS.md` for the actual limitations and all attribution.

## Sources and method

The exact C walk/run sources and their notices are under `tools/male-motion-candidates/sources/`. The pinned `sources/accad_male2_stand_to_walk.bvh` here supplies the Male 2 actor's actual first-frame standing reference; the zero-rotation BVH hierarchy is not standing. `retarget.mjs` verifies the source hashes, parent relationships and non-root offsets, aligns the standing hip axis, and combines a rest-relative global orientation with a bone-direction adjustment for the target. It extracts zero-based 271–391 (120 fps) and 11–34 (30 fps), sampled at 120 Hz on the destination. Clip durations are approximately 1.000 and 0.767 seconds.

The fit is deliberately **not** the unmodified mocap: average horizontal root travel is removed; arms are spread 12°/16°; run thigh local rotation is reduced to 90%; additive endpoint corrections ease over 12% at each end. `swing-foot.mjs` computes a small filtered two-bone lift for the moving foot, preserving its world orientation where possible; it is baked and does not lock the support foot. `calibrate.mjs` adjusts root Y to a smoothed, near-ground-tolerant version of the source marker's lowest-foot trajectory, retaining flight. The moving floor in the viewer/video is only a visual diagnostic (1.73/3.52 m/s estimated for this fitted rig); no locomotion, IK or grid speed is baked as a horizontal world trajectory. The run's original source mean speed is different. These choices change the movement and can introduce artifacts.

The previous gait and current C share the same body in the viewer. A comparison at the same normalized phase is useful but is not synchronized by foot contact. Fingers are not animated by the BVH. Existing neck streaks and open head-region edges remain. No transition, arbitrary pose, detached-part behavior, physical Android/iOS device or game-engine import was validated.

## Rebuild and package

Dependencies are pinned by the existing packages; no network is required after installation. The build checks all BVH and rig hashes and refuses to overwrite unrelated repository directories.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-motion-fit/build.mjs
# Requires Chromium and FFmpeg with libx264; set CHROME_BIN / FFMPEG_BIN if needed.
node tools/male-motion-fit/record.mjs
python3 tools/male-motion-fit/package.py
python3 tools/male-motion-fit/verify.py --rebuild
```

`build.mjs --output /tmp/separate-folder` permits scratch builds. `record.mjs` renders exactly 180 source-time frames per video at 30 fps and pipes PNGs to FFmpeg; it records the model and HTML hashes. Packaging refuses stale videos or altered build files. The archive has fixed entry order/timestamps; the rebuild check reuses the same captured videos, because the exact video bytes depend on Chromium, renderer, fonts and FFmpeg version. Do not commit the temporary sample JSON.

## Verification performed (sampled)

```sh
node tools/male-motion-fit/qa-gltf.mjs
node tools/male-motion-fit/qa-browser.mjs
node tools/male-motion-fit/qa-deform-export.mjs work/male-motion-fit /tmp/bow-motion-fit-deform.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/bow-motion-fit-deform.json
```

The last command requires NumPy and `python-fcl`. **Run it without `--strict`: known contacts are deliberately reported, not hidden or classified as a pass.** It checks the previous rig's named rest-position-based subsets of the unified body (welded neighbours excluded), not separate face/ears, penetration depth, containment, all surfaces or time between samples.

- glTF Validator: 0 errors and 0 warnings. The input geometry, normals, indices, joint weights, 52 joints, inverse binds, textures and both old gait accessors match. Four previous GLB hashes still match.
- New tracks have exact matching first/last keys. In 4,096 off-key sole samples per clip, the minimum/maximum lowest selected sole heights were −0.017 to 3.169 mm in walk and −0.005 to 149.264 mm in run. Maximum error from the intended adjusted source-height profile was 0.154/0.660 mm. This samples 1,123 vertices per foot region, not every character surface.
- A diagnostic at 480 samples per cycle found the p95 residual horizontal velocity of a lowest vertex within 5 mm of the floor was about 0.57 m/s for walk and 0.66 m/s for run against the displayed grid. Those values include foot roll, landing and take-off and are not a precise planted-foot slip measurement; they do confirm that this is not a foot lock.
- FCL on 64 off-key phases per motion: no selected non-neighbouring contacts in the two knee and elbow regions, between the selected feet, or in the selected hand/torso pairs; the neck subset was clear in 16 phases per clip. Contacts **were** found: walk shoulders L/R in 24/28 of 64 phases and hip in 9/64; run shoulders L/R in 37/40 and hip in 2/64. The subsets and broad hand/torso categories have limited coverage. Contact count does not measure visible severity, and other defects may exist.
- Offline desktop control/download QA, repeated paused samples, moving-grid speed, zoom/rotation and WebGL-error links passed; emulated 320, 390 and 768 px touch rotation/pinch and overflow checks passed. Both 1280×720 H.264/yuv420p silent videos decode completely to 180 frames / 6.00 s at 30 fps. These checks do not substitute for visual or physical-device review.
