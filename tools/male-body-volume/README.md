# Separate waist and crouched-knee volume trial

`work/male-body-volume/` is an optional review build, not a replacement for
`work/male-anatomy-followup/`. The build checks the SHA-256 of the immediately
preceding ZIP and GLB before using them. The viewer's «Последняя проба» embeds
that GLB's exact base positions and normals, retains its skin and old morphs,
and plays the old clips. The new GLB retains all 49 inherited clips and adds
only two duplicate crouch clips with the new knee morphs enabled. The waist
edit is in the new base mesh; the knee morphs are active only in the duplicate
crouch clips. The posterior fold and the old crouch motion are **not fixed**.

The position morphs approximate a portion of the dual-quaternion versus linear
skinning difference in 20 representative crouch poses per side. Their normal
morphs are fitted separately to the posed surface change in 20 poses; the
straight-bind-pose normal fit created an exaggerated dark patch. Both fits are
approximations, not physical volume preservation or anatomical validation.

## Rebuild

Requires Node.js, Python 3, and the pinned packages from the existing projects:

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase  # validator and browser QA only
python3 tools/male-body-volume/build.py
python3 tools/male-body-volume/verify.py --rebuild
node tools/male-body-volume/qa-gltf.mjs
```

The build writes only its own output directory (or an explicitly supplied
scratch directory). `verify.py` checks hashes, archive contents, CRC, the
embedded GLB and a byte-identical clean rebuild with the installed toolchain.
The user-facing archive includes instructions and source/license information.

## Additional checks

Browser tests use Puppeteer and `@sparticuz/chromium`; set `CHROME_BIN` and
any required library paths if using an alternate Chromium installation.

```sh
node tools/male-body-volume/qa-browser.mjs
node tools/male-body-volume/qa-download.mjs
node tools/male-body-volume/qa-comparison.mjs
node tools/male-body-volume/qa-knee-normals.mjs
node tools/male-library-motion/qa-transitions.mjs work/male-body-volume
node tools/male-body-volume/review.mjs work/male-body-volume /tmp/bow-body-volume-stills
```

The geometry checks additionally require Python packages `numpy` and
`python-fcl` (and the FCL native library as required by that installation):

```sh
node tools/male-library-motion/qa-geometry-export.mjs work/male-body-volume /tmp/bow-body-geometry.json
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-body-geometry.json
node tools/male-body-volume/qa-crouch-idle-export.mjs work/male-body-volume /tmp/bow-body-idle.json
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-body-idle.json
node tools/male-library-motion/qa-armpit-export.mjs work/male-body-volume /tmp/bow-body-armpit.json
python3 tools/male-library-motion/qa-armpit.py /tmp/bow-body-armpit.json
node tools/male-body-volume/qa-waist-export.mjs work/male-body-volume /tmp/bow-body-waist.json
python3 tools/male-body-volume/qa-waist.py /tmp/bow-body-waist.json
```

These JSON files are scratch artifacts and can be large; they do not belong in
Git. On the final build, the selected hip/leg and hand/body checks reported no
contacts in 832 walk/run/crouch/transition poses and 96 steady crouch-idle
poses. The selected armpit test found none in 1,424 poses; 656 paired poses
showed no new selected torso/arm contacts. The before toggle matched the prior
viewer in 48 steady poses and 544 sampled crouch-transition states. The normal
fit reduced the mean angular error against its transported-surface reference in
20 held-out steady and 32 transition samples. These are finite, region-limited
checks; they do not rule out all intersections, clipping, visual artifacts or
foot sliding. Mobile testing was browser emulation, not a physical-device test.
