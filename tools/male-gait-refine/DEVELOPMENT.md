# C/C shoulder, upper-thigh and foot refit — build and QA

This is a **separate review trial**, not an overwriting replacement for the previous posture, retarget, rig, static or cut-body deliveries. `previous_posture_C.glb` is a byte-exact copy of `work/male-posture-fit/male_posture_C_trial.glb`. The two models have different shared skin weights and therefore are compared as separate GLBs, not as two clips on a single modified skin. The new GLB contains only `Walk_C_Refined` and `Run_C_Refined`. Reuse of its shared weights with other clips or transitions has not been tested.

## Method and design choices

- `author.mjs` checks the SHA-256 of the previous GLB and the pinned ACCAD standing-reference BVH. At the old rotation keys it adjusts shoulder/upper-arm world rotations by 1.25× the inverse of their original standing-direction alignment. The spine and chest world rotations are pitched back 3°; the neck's previous world rotation is compensated at keys. The hip and thigh tracks, root translation, loop duration, and the other untouched tracks remain identical.
- The feet receive constant outward world-yaw offsets throughout each clip, not only during contact: walk left/right 22°/10°, run left/right 30°/12°. This is a visual retarget fit, not untouched mocap. To avoid concentrating all of it at the ankle, the left/right shins are additionally twisted 12°/5° around the instantaneous shin-to-ankle bone axis. This does not translate the ankle at rotation keys; the feet's old pitch/roll and ankle paths are retained approximately between keys. Ground clearance and flight are checked rather than assumed. There is **no horizontal planted-foot lock**.
- `skin.mjs` applies two smooth, local shoulder-weight transfers (0.40 chest-to-upper-arm, then 0.40 chest/upper-arm-to-shoulder) and broadens the original pelvis/thigh influence profile from 0.29 m to 0.40 m without moving rest vertices. The resultant differences from the previous GLB affect 476 shoulder and 660 hip/thigh vertices. At most four normalized influences are kept; at most approximately 0.001 influence is dropped before renormalization. Geometry, normals, UVs, topology, textures, the 52-joint hierarchy, rest transforms and inverse bind matrices are unchanged. The skin is shared by both clips, not a corrective morph.
- A stronger broad thigh-to-pelvis transfer and a more extreme shifted blend visibly produced an extra anterior thigh kink. They were **not** selected even though some area metrics improved. The chosen hip change is intentionally modest; the user's reported upper-thigh prominence may still be visible and needs visual review. A raised-pelvis/two-bone-IK experiment also increased knee angular speed near full extension without clearly addressing the prominence, and was not adopted.
- The viewer adds a **Плечи** focus and **Сверху** angle; its previous/new buttons retain the normalized phase. The foot video uses this elevated view, first walk then run. Side videos use a common side camera. All movement remains in place, and the displayed grid is only an approximate velocity cue.

## Rebuild and package

Dependencies are pinned by the existing packages; after installation, the build requires no network. It refuses to write into unrelated repository directories.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-gait-refine/build.mjs
# Requires Chromium and FFmpeg with libx264; set CHROME_BIN / FFMPEG_BIN if needed.
node tools/male-gait-refine/record.mjs
python3 tools/male-gait-refine/package.py
python3 tools/male-gait-refine/verify.py --rebuild
```

`build.mjs --output /tmp/separate-folder` permits scratch builds. The record step renders exactly 180 frames at 30 fps per video and binds the model, viewer and video hashes in `capture-info.json`. The reproducible archive has 20 entries; `verify.py --rebuild` reuses the three captured videos because renderer/fonts/encoder can affect their exact bytes. Temporary vertex JSON and extracted archives do not belong in Git. The output guard protects earlier deliveries, which must remain unchanged.

## Verification performed (sampled, limited)

```sh
node tools/male-gait-refine/qa-gltf.mjs
node tools/male-gait-refine/qa-browser.mjs
node tools/male-gait-refine/qa-region-export.mjs work/male-gait-refine /tmp/bow-gait-regions.json 128
python3 tools/male-gait-refine/qa-region.py /tmp/bow-gait-regions.json --strict
node tools/male-motion-fit/qa-deform-export.mjs work/male-gait-refine /tmp/bow-gait-broad.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/bow-gait-broad.json
```

The FCL scripts require NumPy and `python-fcl`. Region sampling is CPU-skinned; it was cross-checked against browser skinning in four poses (maximum selected-vertex difference approximately 0.000127 mm). The broader export samples the actual offline viewer. FCL checks rest-position-selected triangle subsets, excluding welded neighbours; it does not measure penetration depth, enclosed containment, separate face/ears, all surfaces, other animations, or every instant. Counts below are not a visual-quality guarantee.

- glTF Validator: **0 errors, 0 warnings**. Model SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`; previous GLB SHA-256 `c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847`. Original rest geometry, hierarchy, inverse binds and untouched tracks are equal. First/last key values match exactly, quaternion signs are continuous, and durations are unchanged.
- In 4,096 off-key samples per clip the lowest selected sole was **−0.017..3.169 mm walk**, **−0.012..149.264 mm run**; maximum change from the previous lowest-sole profile was 0.002/0.029 mm respectively. Flight remains. Maximum sampled ankle-position displacement was under 0.0002 mm, and foot world yaw/roll error at keys under 0.000006°. These are numerical sampling results, not contact locking or complete floor-collision certification.
- At eight sample phases, indicative hip-to-neck lean changed **2.6..5.6° → 0.6..3.5° walk**, **12.5..17.6° → 10.4..15.5° run**. This is a landmark-based estimate, not clinical posture.
- For near-floor samples where the foot-to-toe vector is sufficiently forward, walk left yaw p05/median/p95 changed **−20.1/−14.9/−12.7° → 1.0/7.1/9.3°**, right **−5.2/−2.3/−0.2° → 4.8/7.7/9.8°**. Run left changed **−30.0/−26.2/−21.4° → −2.6/3.2/8.6°**, right **−8.7/−6.0/−0.7° → 3.3/6.0/11.3°**. In this convention positive is outward. Sample counts differ slightly because the near-floor vertex can change; this excludes highly tilted/backward feet and is not a clinical measurement. Visual inspection remains necessary.
- Selected shoulder L/R and hip regions had **0/128** contact phases per clip. The worst per-pose first-percentile triangle-area ratios for shoulder L/R and hip were walk **0.736/0.647/0.696**, run **0.560/0.582/0.568**; they are coarse collapse diagnostics, not smoothness scores. The previous delivery's 64-phase shoulder contacts were 26/28 walk and 32/38 run; contact counts alone are not severity comparisons.
- The browser-export broad check found no non-neighbouring contacts in its selected shoulder, hip, elbow, knee, hand/torso or foot/foot subsets at 64 phases per clip, or neck subset at 16 per clip. Rest was also clear in those subsets. Other body regions or instants may still intersect or crease.
- Approximate p95 horizontal velocity residual of a lowest vertex within 5 mm of the floor increased from **0.57/0.66 m/s** in the previous trial to **0.79/0.88 m/s** walk/run relative to the approximate moving grid. The metric includes roll, landing/lift-off and possible changes of the lowest vertex; it is not an exact slip measurement. The increase is a reason to inspect and, if necessary, address planted-foot motion later, not a claim of improved foot locking.
- Offline desktop and emulated 320, 390 and 768 px touch tests covered switching, playback, phase, skeleton, orbit/pinch, download byte equality, the new high/shoulder controls, videos, full-body framing at 32 phases/four presets and foot framing at 32 phases/five presets. All three silent H.264/yuv420p 1280×720 videos decoded to 180 frames / 6 seconds. Physical Android/iOS, game-engine import, arbitrary poses, cut-body behavior and transitions were not tested.
