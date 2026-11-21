# C head/feet follow-up — scope, reproducibility and checks

This is an **isolated review trial**, not an approved fix or an in-game replacement. The user rejected the intervening 100STYLE/C mixture because the posture, arms, tilted head and feet, and slower run were unsatisfactory. This follow-up does **not** use that mix. It starts from the last `male-gait-refine` C/C delivery; the old C is included byte-for-byte for an aligned comparison. Nothing from the prior deliveries is overwritten. See `README.ru.md` and `CREDITS.md` for the user-facing scope and attribution.

## Method

`author.mjs` verifies the old GLB hash, then changes only the four rotation channels `Rig_Neck`, `Rig_Head`, `Rig_Foot_L`, `Rig_Foot_R` in each C clip. Clip names change to `Walk_C_HeadFeet_Trial` and `Run_C_HeadFeet_Trial`. The other channel outputs and all key times, root motion, shared skin, rest geometry, textures, hierarchy and inverse binds are retained. The same loop durations are retained. Previous C already had its own prior posture, arm, foot and skin adjustments; this step does not undo or redo those.

The walk world-space head/neck X adjustments are −5°/−1° and head roll is +2.5°; run is −8°/−2° and +1.5°. They are applied at the existing keys relative to the original animated head, not as a static gaze pose. These values do not certify the resulting gaze or anatomy.

A heel-to-tip direction estimated from skinned foot vertices guides a bounded yaw adjustment: desired direction uses 30% of hip yaw plus 6° of outward toe angle, a maximum raw 14° adjustment, strength 0.8, and three circular smoothing passes. The adjustment is faded based on lowest-sole height (8–35 mm walk, 15–80 mm run) and disabled where the forward projection is unreliable. It is intentionally concentrated in swing, with almost no change near the floor; it is **not foot locking**. The head skin-matrix angle and heel/toe vertex centroid are proxies, not anatomical or aesthetic judgments. Because the correction is resampled at existing keys, between-key behavior also needs checking.

The interactive viewer uses C's original durations and the same approximate moving-grid speed for both variants. Its animation clock advances by elapsed `requestAnimationFrame` time, without the previous 100 ms/frame cap; a slow render can therefore skip frames rather than turn the run into slow motion. Hiding/resuming, pausing, changing speed, and seeking reset the clock; the ½-speed control is optional. Low frame rate may still make the motion look jerky. Videos sample the same source times offline and are encoded independently of rendering speed.

## Rebuild

The checked-in `work/male-gait-refine` model and pinned npm dependencies are inputs. `build.mjs` refuses outputs inside other repository deliveries. `--output /tmp/separate-folder` allows scratch builds. The renderer and FCL dependencies are not included in the ZIP.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-gait-feedback/build.mjs
# Chromium and FFmpeg with libx264 are required; set CHROME_BIN and FFMPEG_BIN if needed.
# FFmpeg is also needed for the package/rebuild video-content checks.
node tools/male-gait-feedback/record.mjs
python3 tools/male-gait-feedback/package.py
python3 tools/male-gait-feedback/verify.py --rebuild
```

The recording step renders three 180-frame / 30 fps / six-second, silent H.264 side-by-side comparisons and records the hashes of the exact viewer, two models and videos. It uses a fresh browser for each video, checks the source canvas every frame and decodes the finished clips with `qa-video.py`. Packaging repeats the all-frame decoded-content check before accepting a ZIP. This guard was added after an earlier scratch capture produced a technically valid MP4 whose last 58 frames were black; it is not the video in this delivery. That scratch environment also had less than 64 MB free in Chromium's temporary directory, which can prevent frame presentation; in this Linux sandbox the final extracted-archive browser test used `TMPDIR=/dev/shm` with ample free shared-memory space. Ensure the chosen temporary directory is large enough when recording or testing. The ZIP has 20 entries. The rebuild check reuses the captured videos (fonts, renderer and encoder can change the encoded bytes); it rebuilds the model and standalone HTML and verifies every entry and the final archive byte-for-byte. `README.md` inside the delivery is copied from `README.ru.md`. Scratch vertex samples are intentionally excluded from Git.

## Checks performed on the final model

```sh
node tools/male-gait-feedback/qa-gltf.mjs
node tools/male-gait-feedback/qa-browser.mjs
python3 tools/male-gait-feedback/qa-video.py
node tools/male-gait-feedback/qa-region-export.mjs work/male-gait-feedback /tmp/bow-c-regions.json 64
python3 tools/male-gait-refine/qa-region.py /tmp/bow-c-regions.json --strict
node tools/male-motion-fit/qa-deform-export.mjs work/male-gait-feedback /tmp/bow-c-broad.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/bow-c-broad.json
python3 tools/male-gait-recovery/qa-preview.py
```

The FCL tests need NumPy and `python-fcl`. The strict region exporter samples CPU skinning; the broad exporter samples the actual Three.js viewer. They select subsets of body triangles by rest position and ignore welded neighbours. They do **not** check the whole model, separate face/ears, enclosed surfaces, penetration depth, other clips or the instants between samples. A zero count does not mean a visually smooth or physically correct body.

- The input C is SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`; this GLB is `bc03eabc26ca876dc4f58995a3d77af897c4e6738566cc98060f46f15bd1cb3f`. glTF Validator reported 0 errors and 0 warnings for each. Hash checks found the expected four changed rotation tracks per clip, with other sampled data unchanged and exact first/last key values.
- At 4,096 off-key phases per clip, the lowest sampled sole was −0.017…3.169 mm for walk and −0.012…149.263 mm for run (the latter includes flight). The maximum change of that profile versus C was below 0.001 mm / 0.017 mm; sampled ankle and shoulder/hand displacements were below 0.00001 m. Maximum added foot turn when a selected sole was within 5 mm of the floor was 0.093° / 0.325°. Samples are not a floor-contact guarantee.
- Sampled head skin-matrix pitch medians changed −11.2→−6.3° walk and −14.9→−7.0° run; roll medians 2.6→0.1° and 1.8→0.2°. For sufficiently forward/moderately level feet, outward heel-to-tip yaw p95 changed L/R 22.2/20.2→13.5/17.4° walk and 19.6/12.3→10.2/12.3° run. These exclude steep or backward feet and are not clinical measurements.
- The approximate p95 velocity residual of the lowest vertex within 5 mm of the floor was unchanged at 0.78 m/s walk / 0.88 m/s run, relative to the approximate grid. It includes landing, lift-off, rolling and changes in the lowest vertex, so it is not a measurement of planted-foot sliding. The adjustment has **not** fixed skating. The sampled left-foot world angular-speed p95 during run increased approximately 540→590°/s; that is a reason to inspect the motion, not proof of a visible defect.
- In 64 sampled phases per clip, the strict shoulder L/R and hip subsets had 0 contact phases each; the worst first-percentile face-area ratios were walk 0.736/0.647/0.697 and run 0.560/0.585/0.567. The broad check found no non-neighbouring contacts in its selected shoulder, hip, elbow, knee, hand/torso, foot/foot subsets (64 phases) or neck subset (16 phases); the selected rest-pose subsets were also clear. This does not establish visual quality or all-time collision freedom.
- The offline browser check exercises desktop and emulated 320/390/768 px viewports, touch/orbit, seek, same-phase switching, camera framing, download-byte equality, video seek (including late frames) and WebGL fallback. A deliberate >250 ms render gap verifies 1× wall-clock cadence for both clips and variants; the half-speed and hidden/resume paths are also checked. Emulation is not a physical mobile-device test. All 180 frames of each video were decoded and checked for blank surround/panes and significant repeated frames; this does not judge how natural the animation looks. The local preview server supports byte ranges for seeking.

## Open issues

This attempt deliberately leaves pelvis-to-upper-leg deformation, upper-body animation, and feet in contact as they were in C. Those areas may still look poor or slide, and the swing yaw can still be objectionable or too fast. Static sample comparisons and numerical checks do not replace a continuous human review. The user has not yet approved this trial. Transitions, other animations, arbitrary poses, dismemberment and import into a game engine have not been tested.
