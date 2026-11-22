# Uphill locomotion trial

This is a separate Three.js runtime demonstration for the user's existing character, not a completed engine integration. The only model input is `work/male-hand-flight/male_hands_airfoot_trial.glb`, SHA-256 `576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf`. No model, rig, clip, or earlier delivery was edited; the delivered GLB is an exact copy. In particular, neither the uphill behaviour nor the reversible walk/run transition is a new baked GLB clip. The user's earlier concern about the run foot angle still merits visual review.

## Method and scope

- `terrain.mjs` defines a straight +Z heightfield: two flat platforms joined to a constant-grade central ramp by smooth 0.8 m shoulders. Its height and analytical gradient are bounded to 0–20°. The ground mesh in the viewer approximates this same surface, offset 1 mm down for visibility. UI presets are 0, 10, 15 and 20 degrees.
- The prior `phase-clock.mjs`, `floor-envelope.mjs`, and `locomotion-three.mjs` are byte-identical to the approved walk/run transition trial. The actor now moves +Z at an approximate horizontal speed of 1.44→4.37 m/s, integrated from the common phase clock; its Y follows the terrain. Switching or reversing the target does not reset its phase, blend weight, blend velocity or position. At the finish the viewer stops rather than teleporting; replay and changing grade intentionally restart at the bottom.
- `uphill-controller.mjs` restores the raw mixed pose each update, then samples 2,246 rest-selected skinned sole-region vertices against the actual heightfield. It tilts each foot smoothly toward the local normal, stronger near the ground, and shifts its ankle target so its animated vertical clearance follows the surface throughout the step. A small grade-dependent pelvis drop supplies reach. If the old stride is unreachable, the target is moved toward the hip along Z, following the terrain height; a margin keeps some knee bend and tapers off at the shoulders. A two-bone IK solver preserves the foot world rotation and uses a regularized forward knee plane; the existing floor-envelope plus measured fallback handles remaining small penetrations. The torso leans slightly forward on the grade.
- This is not horizontal foot planting, general terrain collision, stairs, downhill or turning. The target shortening and approximate travel speeds can cause sliding. The controller is tied to this rig's named bones, selected vertices, clip names, unit scale and original axes. It assumes Y up, +Z travel, x=0, and no rotation/scaling of the model, actor, or its ancestors; it must be the only writer for its animated bones. An arbitrary game engine or navigation mesh requires separate integration and testing.

## Reproduce

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-uphill/build.mjs
node tools/male-uphill/qa-terrain.mjs
node tools/male-gait-transition/qa-clock.mjs
node tools/male-uphill/qa-flat-parity.mjs
node tools/male-uphill/qa-motion.mjs
# The next export is large. Keep scratch data outside the repo; this check
# requires NumPy and python-fcl. Set CHROME_BIN if Chromium needs a path.
node tools/male-uphill/qa-export-poses.mjs /dev/shm/uphill-poses.json
python3 tools/male-rig-rebuild/qa-deform.py /dev/shm/uphill-poses.json --strict
python3 tools/male-gait-transition/qa-blend-regions.py /dev/shm/uphill-poses.json --strict-hands
# Set FFMPEG_BIN if FFmpeg is not on PATH.
node tools/male-uphill/record.mjs
node tools/male-uphill/qa-browser.mjs
python3 tools/male-uphill/package.py
```

`build.mjs --output /tmp/separate-folder` creates an independent scratch build and refuses to overwrite other repository work. Capture, QA and package accept that directory as their first argument; browser QA accepts an optional HTTP URL as its second. The page embeds the GLB and bundled Three.js for offline use. The ZIP includes the five actual modules, source GLB, inherited licenses, checksums, and four silent MP4s captured from the final viewer. Walk and transition run at normal speed; the run video first uses normal speed, then repeats at half speed. The two target changes in the transition/feet videos occur on the full 15° grade.

## Recorded checks and limitations

- The GLB bytes match the previous delivery. That source previously passed glTF Validator with 0 errors and 0 warnings; no reauthoring was done here. The prior phase clock passed 5,000 irregular/reversed timing segments. In 320 flat phase/weight poses, all local bone transforms and root lift in the new bundled viewer matched the prior viewer (max position difference `3.61e-17` m, quaternion component distance `5.64e-16`).
- `qa-terrain.mjs` checked 70,007 height and gradient samples, range validation, monotonicity and joins. Browser QA checked the displayed mesh vertices and intermediate interpolated positions against the analytic surface (including its intentional 1 mm offset). This is a heightfield, not a mesh raycast.
- `qa-motion.mjs` sampled 10,080 poses at 0, 5, 10, 15, 17.5 and 20°, seven course positions, five blend weights and 48 phases. On 20°, selected-sole raw minimum was −119.26 mm before adaptation and corrected minimum was +1.00 mm. For poses whose raw flat-animation sole was below 20 mm, the 20° p95/max corrected gap was 20.25/26.67 mm. This threshold is a near-ground proxy, not a guarantee of a planted foot. The maximum sampled horizontal target shortening was 134.8 mm. Independent Three.js skinned-vertex sampling agreed within 0.01 mm, and repeated identical evaluation did not accumulate corrections.
- Thirty-two complete steady walk/run routes at four initial phases had a maximum near-ground proxy gap of 20.97 mm. In 320 transition trajectories with 320 switches and 640 reversals, there was no instantaneous state/pose reset; the sampled 10 ms maximum joint displacement was 102.0 mm, joint rotation 12.64°, and guard-lift change 2.55 mm. On 256 fixed-phase crossings of the ramp shoulders the maximum joint rotation was 1.084° per 1 cm advance; the maximum at activation was 0.001745°. An additional finite 1 ms sample gave a maximum selected-joint rotation of 1.267° on 20° versus 0.981° on flat (across the tested steady/reversal cases). These proxies do not establish that the animation is visually natural or free of sliding.
- The FCL export used the actual adapted Three.js pose, 13,791 selected vertices and 144 discrete poses: 15°/20° central slope and both 20° shoulders, at walk, mid-blend and run weights. After subtracting the common actor translation before float32 encoding, there were no sampled non-neighbouring contacts in selected knees, elbows, shoulders, hip, hand–torso, foot–foot, or 36 checked neck poses. Selected hands, hand–hip and same-side hand–knee groups also had none. Right-foot self surfaces had two intersecting triangle pairs in two 15°/20° walking samples at phase 0.335625; the same pairs occur in the flat pose at that phase. An earlier export in absolute float32 world coordinates reported one neck pair in each of two shoulder samples, but those disappeared after translation was removed before encoding; this is precision-sensitive and no depth/visibility was measured. Neither result proves absence of other intersections, enclosure, or contacts between samples.
- Offline Chromium tests covered emulated 320/390/768/800/1440 px layouts, selected body/overview/foot framing, actual clicks and reversal, pause/phase seek, grade reset, finish/replay, reduced motion, normal-time playback, exact GLB download, late video seeking, and four WebGL-fallback links. Four videos decoded with no blank frames. Physical devices, arbitrary gestures, game-engine import, all phases and artistic quality remain unverified.
