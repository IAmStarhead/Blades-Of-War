# Library locomotion trial: source, build and checks

This is an independent trial. The input is the exact `work/male-deep-crouch/`
delivery (ZIP and model are SHA-256 checked); it is not overwritten. The
result is written to `work/male-library-motion/`. Other project files are not
part of the build.

## Sources

The new clips use Quaternius Universal Animation Library Standard, 2025. The
author describes the pack as CC0 at
<https://quaternius.com/packs/universalanimationlibrary.html> and
<https://quaternius.itch.io/universal-animation-library>. This copy was taken
from the independent mirror at commit
[`e24c23cf2a1323488a3faa226ea7ea21f644b73e`](https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e).
The mirror states it downloaded the free Standard version on 2025-06-10 and
provides CC0 text; see `source/MIRROR_README.md` and
`source/LICENSE_CC0_QUATERNIUS.txt`. The mirror is not the author. The later
[general Quaternius Asset License](https://quaternius.com/license.html) has a
standalone redistribution restriction and applies to assets released under
that license; it differs from the CC0 indicated for this pack. Verify the terms
for the particular version obtained before any standalone redistribution.

The source GLTF SHA-256 is `0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765`,
BIN is `6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c`.
The previous character also contains CMU mocap derivatives with separate
terms; inherited notices and the library CC0 text accompany the final ZIP.

## What is authored

`author.mjs` applies a rest-relative global-orientation retarget from the
source humanoid to the existing 22-bone rig, rather than copying local
quaternions across incompatible bind axes. The 2025 `Walk_Loop` becomes
`Library_Walk`; `Jog_Fwd_Loop` becomes `Library_Run`; `Idle_Loop` is also
included as `Library_Idle`. Motion is in-place. The run's thigh swing is
reduced to 65% of the raw retarget for this mesh. Upper arms are offset by
16° in the library idle, 22° in walk and 6° in run to clear the continuous
armpit mesh. The cycle seam is smoothed and vertical root clearance is baked
at 96 Hz. The animation retains airborne phases. Each hip and knee has a
corrective morph, also keyed into the clips;
the hip correction approximates part of a dual-quaternion deformation at a
sampled maximum bend but remains ordinary glTF morph/linear skinning, not a
runtime DQ extension. Legs were broadened and the previous posterior sculpt
and some skin weights adjusted. Normals and coincident seams are checked.

All earlier clips, bones, inverse binds, materials and existing morphs remain;
old weight tracks are padded with four zero morph weights. Previous positions,
normals, joints and weights are embedded as custom attributes for the viewer's
comparison. The new GLB itself always uses the new geometry for its old clips;
use the old GLB for the exact old shape outside this viewer. The previous deep
crouch remains available and is not a library clip.

The offline viewer blends the in-place animations, brakes before entering a
crouch from a run, and adds runtime floor guarding in transitions. Its floor
and transition IK are **not** baked into those blends in the GLB; there is no
horizontal foot lock or contact physics. Gait/skin will still need adjustment
in a specific engine. The speed estimates are approximate and sliding can
occur. The model remains a visual trial, not a claim of anatomical perfection.

## Rebuild

```sh
npm ci --prefix tools/male-library-motion
python3 tools/male-library-motion/build.py
python3 tools/male-library-motion/verify.py --rebuild
```

The optional `--output /tmp/some-directory` on `build.py` produces a scratch
build. The script refuses to overwrite unrelated repository directories and
checks source hashes. Outputs include standalone `index.html`, GLB, licenses,
README, build info and `BladesOfWar_Hodba_i_Beg.zip`; the ZIP timestamp is
fixed to make rebuilding reproducible. `node_modules` is deliberately ignored.

## QA (sampled, not artistic approval)

Install browser and validator dependencies from the existing package first:
`npm ci --prefix tools/character-showcase`. Then:

```sh
node tools/male-library-motion/qa-gltf.mjs
node tools/male-library-motion/qa-browser.mjs
node tools/male-library-motion/qa-download.mjs
node tools/male-library-motion/qa-transitions.mjs
node tools/male-library-motion/qa-geometry-export.mjs
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-library-geometry.json
node tools/male-library-motion/qa-armpit-export.mjs
python3 tools/male-library-motion/qa-armpit.py /tmp/bow-library-armpit.json
```

Browser checks use Puppeteer/Chromium (set `CHROME_BIN` when necessary); both
Python geometry checks also require NumPy and `python-fcl`. Their sample JSONs
are scratch files and should not be committed. The checks compare all old animation keys,
verify the prior shape/skin against the actual prior offline viewer, validate
glTF, test offline/mobile-emulated controls and the download, sample soles,
loop/transition movement and selected non-adjacent triangle pairs. One run
sampled 832 poses and 4,811 vertices in hip/leg and selected hand/body regions
with no selected contacts; an additional 1,424 poses and 648 armpit vertices
covered the library idle, steady motions, crouch transitions and idle/walk/run blends. Those
regions and discrete frames do **not** cover every surface, transition or
engine; tests and phone emulation do not replace visual evaluation or a
physical-device test.
