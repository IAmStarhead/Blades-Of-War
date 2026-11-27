# Separate natural-motion trial — developer notes

The delivered page and compact archive are in `work/male-natural-motion-trial/`. This is a separate experiment: it does not rewrite the accepted 52-bone model, prior posture/idle-stop trials, or their files. The crouch control is deliberately disabled here.

## Motion and controller

`author.mjs` verifies checksums of the GLB and the five local BVH sources, retargets source joint directions, and writes `clips.json`. `build.mjs` inlines the untouched model, Three.js and the controller in a single `index.html`. It only writes this trial (or a scratch output outside the repository). See the trial's `CREDITS.md` for sources, licences, frame ranges and changes.

Idle, walk, run and the walk arrival use modified 100STYLE Neutral captures. The run stop is modified CMU 104_56, with mirrored variants. Root heading and translation are removed; the game controller chooses direction and integrates a nonincreasing brake-speed curve. Gait cycles are phase-locked, speed-scaled and crossfaded at the seam. An entry is selected by a weighted comparison of leg rotations over a short horizon. A new direction, including a reversal, interrupts the brake and blends from the visible pose. It may still take a fraction of a second to rotate physically toward the new direction. Feet are protected vertically against the flat floor; there is **no horizontal foot lock, IK contact solver or physics simulation**.

The target has different proportions from either actor. The retargeter restricts head/torso tilt, biases the arms away from the hips, and adds up to 12° toe pitch during the running swing. These are artistic modifications, not unchanged recordings. The front/side/rear video and research stills in `study.html` help a human evaluate the result but are not a universal gait reference.

## Rebuild and checks

From this directory (Node 22 and npm):

```sh
npm ci
npm run build
PORT=4366 npm run preview             # bind 0.0.0.0
npm test                              # file:// with networking disabled
npm test -- http://localhost:4366/male-natural-motion-trial/index.html
npm run check:study
npm run check:study -- http://localhost:4366/male-natural-motion-trial/index.html
npm run check:gait
npm run check:contact
npm run export:collision -- /tmp/natural-collision-samples.json
```

Chromium/puppeteer are dev dependencies. On systems where the bundled Chromium cannot start, point `CHROME_BIN` at a compatible Chromium and provide required system libraries. For the optional selected-surface collision test, use Python with `numpy` and `python-fcl`:

```sh
python ../../tools/male-stealth-tuning/qa-collision.py /tmp/natural-collision-samples.json --strict --report /tmp/natural-collision-report.json
# Inspect it first, then copy it to work/male-natural-motion-trial/collision-report.json.
```

`npm run record` regenerates the optional video and needs `ffmpeg` with libx264; set `FFMPEG_BIN` if it is not on `PATH`. It is a fixed-step render, not a real-time-device test. After all reports reflect the same built page:

```sh
npm run package:trial
npm run check:package
```

The packager verifies the embedded model, previous scene hashes, local links, report hashes and archive contents. Its output is `BladesOfWar_Estestvennoe_Dvizhenie.zip`, not a full-repository archive. The package check unpacks it outside the repository, disables network, tests real browser input, and checks video playback/seek and local links at three viewport sizes.

## What was measured, and limits

- `qa-*.json`: 48 straight stop entries, 10 scripted interruptions, 16 actual key-event restarts, actual mouse and emulated touchscreen restarts while braking, 32 routes, short targets, well interaction, four emulated phone/tablet layouts, live requestAnimationFrame, offline and HTTP. These samples do not prove naturalness or real-device performance.
- `collision-report.json`: 278 discrete idle, gait, stop and reversal/restart poses; selected hand/hip, knee and foot surfaces only. No intersections in these tested pairs and poses. This is not a whole-body or continuous-collision guarantee.
- `gait-report.json` and `foot-report.json`: same skinned vertex at or below 12 mm for at least six 60 Hz frames, 2.5 seconds per steady gait and eight phases per stop. In these samples maximum net near-floor vertex travel is about 0.086 m (walk cycle), 0.053 m (run cycle), 0.194 m (walk stop), and 0.295 m (run stop). Near-floor height is a geometric proxy, not proof of actual foot contact; toe roll, sample boundaries and vertex selection affect the figures. Significant sliding is still possible, especially during transitions and reversals.

The browser phone tests are emulated and cannot confirm Android `content://` providers, Vivaldi-specific permissions, performance on physical devices or subjective animation quality.
