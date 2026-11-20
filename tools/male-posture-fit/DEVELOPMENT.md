# C/C posture and central hip fitting — build and QA

This is a **separate review trial**, not a replacement for the delivered `work/male-motion-fit/` model or the earlier static, rig and cut assets. The viewer loads two genuinely separate GLBs: the prior C trial is byte-identical, while the new file has two revised C clips and altered weights on part of the hip. The revised GLB deliberately does **not** include the old clips: adding them to a mesh with different shared skin weights would not preserve their old deformation. Reusing the revised skin with any other animation needs separate testing; transitions and cut-body behavior were not tested.

## Diagnosis and method

The previous retarget incorporated the alignment from the target's rest torso directions to the source actor's first standing frame into the world orientations of the moving torso. Because the target's rest torso has different bone directions, this introduced an exaggerated fixed lean. `author.mjs` checks the SHA-256 of the previous C GLB and the ACCAD standing BVH, computes each alignment, then multiplies its inverse into the hips, spine and chest world rotations in the two C clips. Approximate alignment pitch is +19.0° hips, +16.25° spine and −7.8° chest (the full quaternions are in `build-info.json`). The source movement, including run lean, remains. It compensates neck, shoulder and thigh local rotations so their old world rotations match at keys. The root Y is resampled to restore the previous skinned-sole height profile. This is a practical fit, not a new biomechanical capture, a new skeleton or horizontal planted-foot IK.

Posture correction alone left sample contacts in the central groin region. `skin.mjs` smoothly transfers a portion of each thigh's influence toward the pelvis near the centre seam (mask factor 0.65) on 200 vertices, preserving at most four normalized weights. Changed vertices have rest coordinates |x| < 0.055 m and y between about 0.796 and 1.019 m. No positions, normals, joint locations, hierarchy or inverse bind matrices are edited. The weights are shared skin data, not a clip-specific corrective, and future animations must be rechecked. No morph targets are introduced.

The old C file is copied intact as `previous_C_trial.glb`. The separate `male_posture_C_trial.glb` contains only `Walk_C_Posture` and `Run_C_Posture`. Video shows both actual skinned models with identical normalized time, side view and approximate moving grid. Both remain in place; the grid is only a visual approximation and does not lock the feet. Source and license details are in `CREDITS.md` and `README.ru.md`.

## Rebuild and package

Dependencies are pinned in the existing packages. The output path guard refuses to write into unrelated repository directories; do not overwrite the input trial.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-posture-fit/build.mjs
# Requires Chromium and FFmpeg/libx264; set CHROME_BIN / FFMPEG_BIN if needed.
node tools/male-posture-fit/record.mjs
python3 tools/male-posture-fit/package.py
python3 tools/male-posture-fit/verify.py --rebuild
```

`build.mjs --output /tmp/separate-folder` permits scratch builds. `record.mjs` samples 180 frames/video at 30 fps; capture metadata binds both model hashes and the HTML to the videos. Packaging refuses stale inputs and makes a deterministic 19-entry archive. The rebuild verification reuses the same recorded videos because output bytes depend on the browser, rendering, fonts and encoder. Do not commit temporary vertex samples or unpacked scratch archives.

## Verification performed (sampled, limited)

```sh
node tools/male-posture-fit/qa-gltf.mjs
node tools/male-posture-fit/qa-browser.mjs
node tools/male-posture-fit/qa-hip-export.mjs work/male-posture-fit /tmp/bow-posture-hip.json 128
python3 tools/male-posture-fit/qa-hip.py /tmp/bow-posture-hip.json
node tools/male-motion-fit/qa-deform-export.mjs work/male-posture-fit /tmp/bow-posture-deform.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/bow-posture-deform.json
```

FCL checks require NumPy and `python-fcl`. Run the last diagnostic without `--strict`: shoulder contacts are intentionally reported, not hidden. The checks use rest-position-defined subsets of the unified body, excluding adjacent welded triangles; they do not cover separate face/ears, containment, penetration depth, every surface or every instant.

- glTF Validator: **0 errors, 0 warnings**. Positions, normals, UVs, topology, textures, 52 joints and inverse binds match the previous model. Exactly 200 vertices have different normalized skin influences. The previous GLB's SHA-256 remains `b52a204a294ff7bf11e60b3da1be385eb406bdcd732e90d1e8240760f772270e`; the corrected one is `c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847`. The displayed standing-pose positions differed by less than 0.01 mm in the browser check.
- The clips have exact first/last key values. At their keys, neck, shoulder and thigh world-rotation error vs the previous trial was under 0.000004°. In 4,096 off-key sole samples per clip, lowest selected sole heights were **−0.017..3.169 mm walk** and **−0.005..149.264 mm run**; maximum deviation from the previous profile was 0.154/0.661 mm respectively. Flight is retained. This does not certify all surfaces or temporal transitions.
- At eight sample phases, the same target hip-to-neck landmark lean changed from **12.1..14.8° to 2.6..5.6° walk**, and **21.8..26.9° to 12.5..17.6° run**. This is an indicative geometric diagnostic, not clinical posture or a direct comparison to different source-actor landmarks.
- FCL on **128 off-key phases per gait** found **0/128 selected hip-region poses with non-neighbouring triangle contacts** (3,838 selected triangles). Prior uncorrected C clips had hip contacts in 9/64 walk and 2/64 run; the posture-only intermediate had 24/64 and 5/64. Sample counts do not prove collision freedom between frames or outside the region.
- In the broader 64-phase check, selected elbows, knees, foot/foot and hand/torso pairs had no contacts; the neck subset was clear in 16 phases. Shoulder contacts remain: **walk L/R 26/28 of 64**, **run L/R 32/38 of 64**. Contacts are not penetration-depth or severity measurements; visual artifacts and other defects remain possible.
- Approximate p95 horizontal velocity residual for a lowest vertex within 5 mm of the floor was 0.57/0.66 m/s walk/run relative to the grid; touchdown, lift-off and rolling are included. This is not a precise foot-slip measure, and neither clip has foot lock.
- Extracted-archive offline desktop and emulated 320, 390 and 768 px touch tests passed, including phase-preserving before/after switch, same grid, downloaded GLB byte equality, video seek, rotation/pinch, no overflow, and foot framing at 32 phases/four view presets. Both 1280×720 H.264/yuv420p silent videos decoded to 180 frames / 6 seconds. Emulator is not a physical Android/iOS, game-engine or animation-transition test. Manual zoom can crop the body.
