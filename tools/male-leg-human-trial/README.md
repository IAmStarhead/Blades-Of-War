# Human-leg research / authoring tools

Consumer documentation, source attribution, licences and limitations: [`work/male-leg-human-trial/README.md`](../../work/male-leg-human-trial/README.md) and [`RESEARCH.ru.md`](../../work/male-leg-human-trial/RESEARCH.ru.md). Do not treat any angle, sampled collision result or near-floor vertex as a clinical or physical guarantee.

## Rebuild

Node 22: `npm ci --prefix tools/male-leg-human-trial && npm run build --prefix tools/male-leg-human-trial`. Pinned dependencies live in `package-lock.json`. Inputs are SHA-checked inside the scripts; the prior GLB, prior scene, existing CC0 well and inherited runtime remain untouched. This writes the standalone HTML. For a fresh output outside the repo: `npm run build --prefix tools/male-leg-human-trial -- --output /tmp/human-leg-build`. `author-crouch.mjs` regenerates the baked HMC adaptation (including toe lift/support fit) in `crouch-clips.json`, then `build.mjs` bundles the viewer.

## Analysis

`reference/` contains SHA-pinned HumanMotionCraft's rig, Crouch walk 7, Walk 12 and Run 9, and two sets of 96 sampled scene poses. Source files are attributed in the deliverable CREDITS; the trial uses the crouch clip, the other clips are just comparison inputs. `capture-kinematics.mjs` loads a specified viewer offline with Puppeteer and writes a **new file outside the repo**, e.g.:

```sh
node tools/male-leg-human-trial/capture-kinematics.mjs /tmp/old-pose-samples.json
node tools/male-leg-human-trial/capture-kinematics.mjs /tmp/trial-pose-samples.json work/male-leg-human-trial/index.html
```

`CHROME_BIN` may be specified. The sampler requires the browser dependencies in `tools/character-showcase` and checks browser errors. On intentionally changing either viewer, replace the corresponding `reference/{old,trial}-samples.json` with freshly captured data after reviewing it. Do not overwrite unrelated artifacts.

`python3 tools/male-leg-human-trial/compare-kinematics.py` requires NumPy and verifies clip and viewer hashes before generating `work/male-leg-human-trial/kinematics-report.json` (or `--output /tmp/another.json`). HMC key poses are evaluated with FK using rest heads, hip-height root offset and yaw removal. For each reference cycle, one of 96 phase offsets minimizes mean unsigned angular error across both thigh and shin directions at the **listed exact HMC key frames**. It does not synchronize source speeds or humans, compare feet/skin, or assess clinical normality. The target uses the rendered sample path; original HMC uses SQUAD/Hermite between keys, whereas the trial uses SLERP/linear. Crouch comparison with its own source is not an independent validation.

`measure-foot-contact.mjs` reports near-floor vertex episodes rather than true contact, only for a straight route at nominal speed. `qa.mjs` tests offline/HTTP behavior and emulated input. Collision exports and FCL checks use the inherited `male-stealth-tuning` utilities. Each report records the viewer hash; see the deliverable README for commands and limitations.

`capture-poses.mjs`, `record.mjs` and `make-evidence.py` generate the comparison assets, but require separately obtained external source videos, HMC mannequin and intermediate captures. Their sources and exact hashes are in CREDITS. No claim that the whole evidence build works from a clean checkout without those downloads. The previous scene and the new scene in the video receive identical commands; the camera follows them while video-only floor markers stay fixed.
