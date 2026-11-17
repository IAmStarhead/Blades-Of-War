# Male skeletal trial — build notes

This is a separate experiment, not a final game rig. The build starts with the
SHA-verified corrected GLB in `work/male-nape-seam/BladesOfWar_Proba_Zatylka.zip`
and leaves it and all earlier files untouched. `rig.mjs` adds a 22-joint skin,
uses mesh connectivity and a harmonic shoulder falloff to keep hanging hands
from inheriting leg weights, binds the separate ears rigidly to the head, and
adds one subtle 4-second breathing loop plus four short joint-test clips. It
retains all source vertices, normals, indices, materials and textures. It does
not add finger animation, dismemberment, locomotion, IK or ground-contact logic.

The well implementation in `well-source.mjs` is copied byte-for-byte from the
previous viewer with aliases to the same Three.js r187 API. `build.py` verifies
that source, builds the male GLB and bundles a single offline page, copies the
licenses, and produces a matching ZIP in `work/male-rig-trial/`.

## Rebuild and checks

```sh
npm ci --prefix tools/male-rig-trial
# Only required for the independent validator and browser QA:
npm ci --prefix tools/character-showcase
python3 tools/male-rig-trial/build.py
node tools/male-rig-trial/qa-gltf.mjs
python3 tools/male-rig-trial/verify.py --rebuild
node tools/male-rig-trial/qa-browser.mjs
```

The browser check opens `file://` pages while offline, blocks network requests,
compares the original and rigged bind-pose renders and the full well geometry,
measures loop closure, foot/floor clearance and ear/head/neck attachment, and
checks controls and framing across desktop and mobile sizes. Review PNGs are
written to a temporary directory (or supply `--screenshots=/some/directory`).
Set `CHROME_BIN` if Chromium is installed in a nonstandard location. Linux
Chromium may require its system libraries to be available via `LD_LIBRARY_PATH`.
The glTF Validator check requires zero errors and warnings. These checks do not
replace visual approval or testing in a real game engine.
