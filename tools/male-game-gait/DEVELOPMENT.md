# Separate game-gait trial — method and verification

This is a reviewable candidate after the user rejected both the C follow-up and the 100STYLE/C mixture. It is **not approved or integrated**. Earlier deliveries and unrelated files are untouched. The output uses new walk/run tracks from Quaternius Animated Human (2017), not the previously tried Quaternius Universal Animation Library (2025), KayKit, ACCAD tracks or 100STYLE. See `CREDITS.md` and `source/README.md` for provenance, the conversion mirror, pinned hashes and inherited attribution.

## Retargeting

`author.mjs` verifies the exact 2017 mirror GLB and C base hashes. It derives the source bind transforms from inverse bind matrices and mesh world transform because the source nodes' default transforms are animated poses. The source bind is turned −90° into the target convention; the animated source clips are already Z-forward. This mapping is specific to that converted source and these rigs, not a general retargeter.

The source's `Human Armature|Walk` and `Human Armature|Run` are sampled at approximately 120 Hz. Source world-relative rotations are mapped to the existing bones. Source motion is retained in the head/neck but the model has no separate jaw bone. Clavicle rotation is reduced to rest while the upper-arm world orientation is preserved, arm spread is adjusted, the run's upper-arm local swing is scaled to 0.65, and thigh/shin local rotations are scaled to 0.75/0.85 for walk and 0.78/0.72 for run. The foot and toe world orientations are restored after these limb adjustments. Other retargeted parts, including torso, also come from the new source; this is not C with only limb changes.

The source clips do not have exactly matching endpoints. Each receives an extra 1/24 s closure and a short smoothed seam, with matching first/last keys. Run key times are subsequently multiplied by 1.1. Durations are approximately 1.041667 s walk and 0.733333 s run. The original C tracks and their 88 orphaned accessors are removed. The character's body/face/ears, skin weights, rig, bind matrices, textures and rest geometry remain those of `male_gait_C_refined.glb`.

Vertical clearance uses source foot/toe proxy heights plus the target's CPU-skinned lowest sole vertices. The target root correction is smoothed circularly; run flight is scaled to 0.65 and uses a 50 ms smoothing radius. A root curve is not a contact solver: the output has **no horizontal planted-foot lock**. The viewer's 1.44/4.37 m/s grid speeds are only visual reference values, rounded from the median near-floor lowest-vertex velocities; neither the clip nor the viewer sets gameplay movement speed. Because landing, roll, takeoff and changes in the lowest vertex affect the diagnostic, it is not a measurement of actual planted-foot sliding.

## Rebuild

The source GLB and input C are checked in. Dependencies use the existing pinned package manifests; `node_modules` are not part of the delivery. Optional FCL checks need NumPy and python-fcl; Chromium and FFmpeg/libx264 are needed to record videos and validate the archive.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-game-gait/build.mjs
node tools/male-game-gait/qa-gltf.mjs
node tools/male-game-gait/qa-motion.mjs
node tools/male-game-gait/qa-export.mjs work/male-game-gait/male_game_gait_trial.glb /tmp/game-gait-regions.json 64
python3 tools/male-rig-rebuild/qa-deform.py /tmp/game-gait-regions.json --strict
# Set CHROME_BIN and FFMPEG_BIN if the tools are not on PATH.
node tools/male-game-gait/record.mjs
node tools/male-game-gait/qa-browser.mjs
python3 tools/male-game-gait/package.py
```

`build.mjs --output /tmp/separate-directory` permits scratch builds and refuses to overwrite other repository deliveries. The viewer embeds the GLB and Three.js so it works from an extracted archive without networking. The viewer's animation clock uses elapsed wall time: under a low rendering frame rate frames may be skipped rather than the animation playing in slow motion. The three silent 1280×720 H.264 videos are captured at fixed 1× timestamps, with 180 frames each. Capture checks the source canvas and `qa-video.py` decodes **every** output frame, checking the 3D background and frame variation; this is not aesthetic validation. The archive verifier checks build/capture hashes and byte-compares its 15 entries. Video bytes may differ between rendering/encoder environments, so a model/viewer rebuild should reuse previously captured videos only when their capture hashes match.

## Checks on this candidate

- GLB SHA-256 `844de26eb624dcb6b630157dda1227b6be2c54e4654c35d086c74149be26f45a`; glTF Validator: 0 errors, 0 warnings, 2 informational unused-UV notices. Mesh attributes, indices, morph targets, skin, textures, hierarchy and inverse binds match C. Exactly the two new clips remain; keys are finite, rotations normalized, endpoints closed.
- At 4,096 off-key phases per clip, the lowest selected sole height ranged 2.13–9.49 mm for walk and 2.24–73.91 mm for run. These are sampled lowest-vertex values, not continuous floor-contact proof. At 960 samples with an 8 mm near-floor threshold, the approximate lowest-vertex residual p95 was 0.54/1.12 m/s against the respective median grid-speed proxies. It includes foot roll, landing, takeoff and vertex changes; **it is not planted-foot slip**. Feet were not horizontally locked.
- The broad FCL test sampled 64 off-key phases per clip (neck every fourth phase) and found no non-neighbouring contacts in the selected knee, elbow, shoulder, hip, hand/torso and foot/foot subsets, or the selected neck subsets. The shoulder L/R/hip subsets' worst per-pose first-percentile area ratios were 0.742/0.695/0.742 for walk and 0.580/0.600/0.596 for run. Rest-position predicates select triangles; welded neighbours are excluded. This is not a test of the whole body, separate face/ears, enclosed surfaces, collision depth, other animations or times between samples; it does not establish smoothness or visual quality.
- Offline and preview-HTTP browser checks covered desktop and emulated 320/390/768 px layouts, presets and sampled joint framing, motion/view/focus controls, seek, skeleton and grid toggles, embedded download hash, wall-clock cadence, late video seeks and the WebGL fallback. The preview server's byte ranges and the three videos' 206 responses were also checked. Actual physical phones, arbitrary gestures and gameplay were not tested.
- Static phase and detail views were inspected, and normal-speed videos are provided for human review. They are not a substitute for the user's continuous subjective assessment. This remains an unapproved candidate; no claim is made that the shoulders, jaw, pelvis or feet look correct in every frame.

## Remaining work

The run is relatively energetic and the hands retain unanimated fingers. Check perceived posture, arm swing, pelvis, head/face and foot contact at normal speed. Visible skating may remain. A real game needs its own movement speed, transitions, contact/IK strategy, engine import and testing across the intended animation set and dismemberment workflow.
