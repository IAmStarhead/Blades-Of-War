# Separate 100STYLE/C gait recovery trial

This is an **alternative for review**, not an in-game integration or a claim that every gait defect is solved. An attempted further correction of C reduced some torso/skin issues but left the approximate walk/run lowest-vertex residual at roughly 0.77/0.89 m/s and did not clearly resolve the thigh transition. Other sources and IK variants produced visible or sampled defects. The selected alternative is slower and has a particularly small jogging flight phase; the user should judge it in motion. The previous C delivery, rig, other animations and all unrelated project work remain unchanged.

## Method

- `fix-c.mjs` checks both prior GLB hashes and makes an intermediate partial C: it restores 75% of the previous hip-weight change, 85% of a localized front-shoulder change, transfers some additional front shoulder influence to the chest, and reduces C's torso yaw while preserving limb world orientations at keys. This supplies shared skin and the jogging arms; the intermediate C clips are not presented as the final result. Compared with the last C, **1,013** body weight records change; rest geometry, other vertex attributes, textures, rest transforms, 52-joint hierarchy and inverse binds remain unchanged.
- `retarget-100style.mjs` verifies the trimmed 100STYLE BVH hashes and the intermediate rig, uses the source BVH zero-channel rest orientation, maps global rest-relative rotations to the target bone directions, scales by leg length, removes mean horizontal travel, spreads arms, and closes the seam with eased corrections. It uses zero-based frames **27–110** of `neutral_fw.bvh` and **2–50** of `neutral_fr.bvh`, both at 60 Hz. These are different recordings from C.
- `fit-100style.mjs` adjusts collarbones, neck/head and skinned heel-to-tip foot direction. `walk-knees.mjs` softly biases the nearly straight walk knee toward a stable bend plane, with a 6° bias; it is not the earlier swing-foot IK that produced a large knee spike. `calibrate.mjs` fits the lowest selected sole to the source-derived height; `jog-clearance.mjs` lifts a forward-moving low swing foot with smoothed two-bone IK. There is **no horizontal stance lock**.
- `jog-arms.mjs` samples the adjusted C shoulders through hands at the new jog's cadence and applies them in world orientation on the 100STYLE torso. A **0.201-cycle offset** approximately aligns their step phase. Fingers are not animated.
- `smooth-root.mjs` low-passes the root's vertical track (Gaussian sigma 8 ms walk, 6 ms jog), then adds a smoothed local upper envelope so the smoothing does not intentionally lower the model. It changes root Y only, with maximum lift 1.19 mm walk / 3.90 mm jog at keys. It does not eliminate all velocity discontinuities or replace foot-contact solving.
- The viewer compares two genuinely separate GLBs: `previous_C.glb` is byte-identical to the last delivered C, while the new model has its own shared weights and clips. At switching, the normalized reference phase is retained; old C is offset by **0.227 walk / 0.201 jog** cycles, approximately matching mid-support rather than identical poses. Each active clip plays at its own duration and has its own approximate ground speed: new **0.87092 / 1.90007 m/s**, C **1.73 / 3.52 m/s**. The ground distance is accumulated through a switch rather than teleporting the texture. The videos use the same elapsed time and each variant's own cadence and grid, so their phases drift apart.

See `CREDITS.md` and the adjacent source notices: the new walk/jog basis is **100STYLE CC BY 4.0** and the previous C plus new jog arms are **ACCAD / The Ohio State University CC BY 3.0**. Both sets of adaptations and their attribution requirements must be retained.

## Rebuild and package

Node 22 with the repository's existing pinned dependencies, Python 3, Chromium and FFmpeg with `libx264` are required. After dependency installation and with the checked-in source files, the build does not require network access. The output guard refuses to write into unrelated repository directories.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-gait-recovery/build.mjs
# Set CHROME_BIN and FFMPEG_BIN if the binaries are not on PATH.
node tools/male-gait-recovery/record.mjs
python3 tools/male-gait-recovery/package.py
python3 tools/male-gait-recovery/verify.py --rebuild
python3 tools/male-gait-recovery/preview.py --bind 0.0.0.0 --port 4351
```

`build.mjs --output /tmp/separate-folder` builds elsewhere without changing earlier deliveries. The recording step renders 180 exact-time frames per six-second video, not screen-captured wall-clock speed. `capture-info.json` binds the video hashes to the exact model and viewer. Packaging checks those hashes and writes a deterministic 24-entry ZIP. `verify.py --rebuild` rebuilds the GLBs/viewer/archive byte-for-byte using the same recorded videos; it does **not** promise pixel identity across Chromium, GPU, fonts or encoders. The standalone archive needs no server; `preview.py` is for HTTP preview and supports single byte ranges for video seeking.

## Checks performed and their scope

```sh
node tools/male-gait-recovery/qa-gltf.mjs
CHROME_BIN=/path/to/chromium node tools/male-gait-recovery/qa-browser.mjs
python3 tools/male-gait-recovery/qa-preview.py
node tools/male-gait-recovery/qa-region-export.mjs work/male-gait-recovery /tmp/gait-regions.json 64
python3 tools/male-gait-refine/qa-region.py /tmp/gait-regions.json --strict
CHROME_BIN=/path/to/chromium node tools/male-motion-fit/qa-deform-export.mjs work/male-gait-recovery /tmp/gait-broad.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/gait-broad.json
```

The FCL tests require NumPy and `python-fcl`. Their exported JSON is temporary scratch data and should not be committed.

- Both GLBs: glTF Validator **0 errors / 0 warnings**. New GLB SHA-256 `ccb9e718ddbd6708712d11664ec3cc43cb131fea904953c8fa8b92583ace51f6`; previous C SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`. Key times are increasing, quaternion signs/normalization checked and first/last values match exactly.
- At 4,096 off-key poses, the lowest selected sole spans **−0.005…1.264 mm walk**, **−0.001…13.812 mm jog**. This estimates only selected vertices and sampled instants; the very small flight height is a limitation, not a promise of proper running.
- At 1,200 samples, minimum knee bend L/R was **6.25°/6.03° walk**, **9.16°/18.96° jog**; maximum absolute change of bend angle was **378°/345° per second walk**, **603°/459° per second jog**. This is not a guarantee of natural-looking motion or absence of all directional jerk.
- A finite-difference seam check at 1/240 s gave hips/chest velocity jumps **0.066/0.069 m/s walk** and **0.164/0.143 m/s jog**. Jogging C had **0.664/0.699 m/s** under the same check. These are sampled diagnostics, not proof of continuous velocity.
- Root-Y finite differences at the root key spacing gave maximum acceleration **188.6→17.4 m/s² walk** and **1296.4→91.4 m/s² jog** before/after smoothing. These high-rate finite differences are useful for detecting numerical kinks, not a physiological acceleration measurement; linear GLB tracks are still only piecewise smooth.
- Approximate horizontal residual p95 of the lowest vertex within 5 mm of the floor was **0.78→0.30 m/s walk** and **0.88→0.91 m/s run/jog**, using each model's own approximate ground speed. The clips and speeds differ. This metric includes roll, landing/lift-off and changing vertices, and is **not** a planted-foot slip measurement. The jogging result has not been shown to eliminate foot sliding.
- On 64 phases per clip, CPU-skinned selected shoulder L/R and hip surfaces had **0/64** contact phases. Worst per-pose first-percentile triangle area ratios were walk **0.741/0.722/0.709**, jog **0.542/0.533/0.625**. In the browser-skinned broader FCL check, selected elbows, knees, shoulders, hips, hand/torso and foot/foot regions had no non-neighbouring contacts at **64 phases** per clip; the neck had none at **16**. Rest was also checked once. FCL only tests the named triangle subsets/times and excludes separate face/ears, fully enclosed geometry, penetration depth, other animations and instants between samples. It is not a visual-quality guarantee.
- Sampled front and side sequences and closer views of feet, torso and hips were inspected; continuous videos were rendered and fully decoded. Offline Chromium tested playback at each native rate, phase mapping, ground speed and no-jump switching, download byte equality, camera, focus, pause, skeleton, three video seeks and WebGL fallback. The same browser test ran from the extracted ZIP. Emulated 320×700, 390×844 and 768×1024 screens checked touch/zoom, framing and overflow; **no physical phone or game engine was tested**. HTTP tests covered full and partial responses, invalid ranges and seeking each MP4.

Known limitations include residual foot skating, possible creases/protrusions, short jog flight, no animated fingers, unverified transitions/other actions/dismemberment and no specific engine import or runtime-speed tests. Avoid treating this trial as production-ready without user review and further contact work.
