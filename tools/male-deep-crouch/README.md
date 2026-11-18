# Independent deep-crouch trial

This tool builds a **separate** copy from `work/male-leg-mechanics/`; it does not
edit or replace that delivery. It retains its 22-bone rig, bind matrices, skin,
37 original clips and 13 original morph targets. It adds a modest body sculpt,
arm clearance and six trial clips, including a 16 cm deeper crouch. Three new
corrective morphs are carried by the clips; hip weights follow each thigh's
authored flexion at the keys. The offline viewer can restore the
previous surface and clips for comparison.

## Build and verify

From the repository root, with Node.js and Python 3 installed:

```sh
npm ci --prefix tools/male-deep-crouch
python3 tools/male-deep-crouch/build.py
python3 tools/male-deep-crouch/verify.py work/male-deep-crouch --rebuild
```

The source ZIP, GLB and shared code are hash-checked. The verification command
checks CRCs, embedded/neighboring GLB bytes and a byte-for-byte clean rebuild.
The final archive contains the page, GLB, README and license files. The HTML
works without a network; its download link requires the GLB next to it.

## QA

The browser and validator scripts use the pinned dependencies in
`tools/character-showcase` (`npm ci --prefix tools/character-showcase`). They
accept an output directory as their first argument. Chromium is supplied by that
package; set `CHROME_BIN` to an installed compatible executable if desired.
The collision scripts additionally need Python packages `numpy` and
`python-fcl` (install them in a separate virtual environment).

```sh
node tools/male-deep-crouch/qa-gltf.mjs
node tools/male-deep-crouch/qa-browser.mjs
node tools/male-deep-crouch/qa-comparison.mjs
node tools/male-deep-crouch/qa-motion.mjs
node tools/male-deep-crouch/qa-transitions.mjs
node tools/male-deep-crouch/qa-crouch-foot-pivot.mjs
node tools/male-deep-crouch/qa-download.mjs
node tools/male-deep-crouch/qa-playback.mjs
node tools/male-deep-crouch/qa-geometry-export.mjs work/male-deep-crouch /tmp/deep-geometry.json
python tools/male-deep-crouch/qa-geometry.py /tmp/deep-geometry.json
node tools/male-deep-crouch/qa-armpit-export.mjs work/male-deep-crouch /tmp/deep-armpits.json
python tools/male-deep-crouch/qa-armpit.py /tmp/deep-armpits.json
```

The scripts sample finite poses and selected surfaces, not the complete
continuous motion or all body parts. In the 48-phase crouch-walk sample, the
smallest selected hip-triangle area relative to its own bind shape is about
0.301 versus 0.373 in the previous, shallower crouch; this is a real compression
regression even though the targeted intersection checks passed. The sampled
armpit check improves on the previous delivery. Visual review remains necessary.

The viewer's transition foot fitting and floor guard are runtime-only. The GLB
contains the authored cycles and morph tracks, not those controller operations;
other engines may blend or handle negative existing morph weights differently.
There is no horizontal world-space foot lock, collision physics, or guarantee
of zero sliding. Browser software rendering is not a physical-phone benchmark.
