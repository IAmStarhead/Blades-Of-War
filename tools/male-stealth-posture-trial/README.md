# Stealth posture trial tools

Consumer overview, controls, results, limitations and credits: [`work/male-stealth-posture-trial/README.md`](../../work/male-stealth-posture-trial/README.md). The published human-leg trial and its tools are inputs and are not modified by this build.

## Build

With Node 22: `npm ci --prefix tools/male-stealth-posture-trial && npm run build --prefix tools/male-stealth-posture-trial`. `author-crouch.mjs` verifies SHA-256 of the existing GLB and prior crouch clips, creates 121-key reposed idle/walk clips with a two-bone ankle-target fit and finger tracks, and writes only this directory's `crouch-clips.json`. `build.mjs` then bundles the separate `viewer.mjs`, runtime and clips into `work/male-stealth-posture-trial/index.html`. It does not alter the model, previous clips, or previous scene.

`npm run build --prefix tools/male-stealth-posture-trial -- --output /tmp/posture-build` puts the HTML in a separate directory, but still regenerates this tool directory's clips. This is an authored adaptation; unchanged source ankle targets at the keyed samples do not constitute dynamic foot locking.

## Check

`npm test --prefix tools/male-stealth-posture-trial` tests offline scene behavior and sampled animation continuity. Browser dependencies are in `tools/character-showcase`; `CHROME_BIN` is optional. `npm run check:contact --prefix tools/male-stealth-posture-trial` compares near-floor vertex episodes at the nominal straight-line speed; `npm run check:ground --prefix tools/male-stealth-posture-trial` samples actual foot-region vertices during nine enter/exit/reversal/turn scenarios. Neither is a contact-force or whole-foot slip measurement. Collision sampling uses the documented prior `male-stealth-tuning` utilities and python-fcl, and covers selected regions and poses only.

`PORT=4364 node tools/male-stealth-posture-trial/serve.mjs` serves this trial and the unchanged previous trial (including MP4 byte ranges); `npm run test:report --prefix tools/male-stealth-posture-trial` checks the overview page, links, video seeking and emulated screen sizes. Physical devices are not tested.

For new evidence, `capture-poses.mjs /tmp/NEW-directory` captures both scenes with matched cameras and phases; `make-evidence.py /tmp/NEW-directory` needs Pillow and will not overwrite existing sheets. `record.mjs /tmp/NEW-file.mp4` repeats real movement commands and requires Chromium plus FFmpeg/libx264/drawtext. The delivered 18-second comparison was generated against `work/male-leg-human-trial/index.html`, with video-only floor markers; the poster is a frame of that recording.
