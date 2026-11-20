# Source-only gait shortlist: build and QA

This is a **review, not an animation integration**. The only motion inputs are
six third-party BVHs in `sources/`; no project mesh, skin, rig or GLB is read by
`build.mjs` or `viewer.mjs`. The recordings are distributed under CC BY 4.0
(100STYLE) and CC BY 3.0 (ACCAD), **not CC0**; see `CREDITS.md` and the
per-source notices. The notices describe the mirror's unrelated cleanup; this
review does not use it. Source hashes are checked on each build.

`candidates.json` fixes the exact zero-based source-frame windows. The build
calculates timing, constant yaw alignment, a constant floor height and the mean
horizontal speed from those windows. `build-info.json` also reports named-joint
positional mismatches at their unblended seams. Sections were selected for
reasonably repeating strides using position/velocity comparisons and visually
reviewed in multiple poses; this does not certify their suitability for the
project character. In particular the raw 100STYLE run has a visible seam.

The Three.js BVHLoader reads the source and evaluates original local tracks.
Schematic segments follow the resulting source joint centres directly. The head
is an axisymmetric approximate shape; the surface, hand/finger and head-yaw
appearance are not a faithful skinned person. For display, metres are obtained
from the source centimetres, the actor is yaw-aligned to the mean travel
vector, horizontal root translation is held at zero and represented instead by
movement of a quarter-metre ground texture, and all frames receive one constant
vertical offset. Feet are not locked and no per-frame correction or retargeting
is applied. Ground translation is sampled directly from the BVH position track
so repeated paused samples cannot be corrupted by the mixer's property cache.

## Build

Node 22, locked dependencies already shared with the previous tools, Python 3,
Chromium and an FFmpeg build with `libx264` are used. No network access or
project character assets are required after the sources and dependencies exist.
The temporary FFmpeg used here was 4.2.2 from imageio-ffmpeg 0.5.1; it is not
bundled in the archive. `CHROME_BIN` and `FFMPEG_BIN` may be omitted if available
in the environment.

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
node tools/male-motion-candidates/build.mjs
CHROME_BIN=/path/to/chromium FFMPEG_BIN=/path/to/ffmpeg \
  node tools/male-motion-candidates/record.mjs
python3 tools/male-motion-candidates/package.py
CHROME_BIN=/path/to/chromium node tools/male-motion-candidates/qa-browser.mjs
```

Each program accepts an optional output directory argument; `build.mjs` and
`record.mjs` must point at the same output as `package.py` and QA. The HTML is
self-contained; the MP4s are separate fallback files. Video frames are rendered
at exact source times and encoded as 180 frames/30 fps, even if the local
software renderer is slow. The ZIP also contains the six original BVHs and their
notices. `package.py` uses fixed ZIP timestamps and verifies every entry against
its input. Pixel/video byte identity is not promised across GPU, Chromium,
FFmpeg, font or dependency versions.

## Checks performed

- Source BVH SHA-256 values, including the bytes embedded in HTML, match the
  pinned mirror notices; UI metadata and both license families are retained.
- A separate simple BVH hierarchy/channel parser evaluated **864 visible joint
  markers** at nine source frames per recording, including the selected end.
  The largest discrepancy from the viewer was below 0.001 mm. Ground-grid
  offsets were independently compared with the source root and repeated while
  paused. This validates sampled source-joint placement, not appearance of a
  target mesh, all interpolation times, contacts, or animation quality.
- Chromium offline tests exercised all six changing views, selections, source
  categories, five preset cameras, speed, pause/play, phase including 100%,
  mouse rotation and both downloadable MP4s. The same tests were rerun from the
  extracted archive. With WebGL explicitly disabled, the page opened the
  working video fallback. Both videos decode as 1280×640 H.264, 30 fps and six
  seconds, with 180 frames. HTML and ZIP rebuilt byte-for-byte when using the
  same existing video inputs; this does not assert cross-platform video identity.
- Emulated 320×700, 390×844 and 768×1024 screens: no horizontal overflow,
  visible second card after scrolling while paused, selection and horizontal
  touch rotation. A vertical swipe on the stage scrolls the mobile page. At
  768px, conservative projected mannequin boxes remained in frame at 12 phases
  across five preset views. These are emulations, not physical-device tests.
- The approved static body, former animated model, delivered rig and fixed-cut
  GLBs are checked against their earlier SHA-256 values and remain unchanged.

The selected clips still require explicit user approval before any transfer to
the model. Future work would have to handle incompatible rest poses (ACCAD's
zero rotations are not a standing pose), proportion changes, looping, contact,
foot slide, deformation/collision and game-engine behavior separately.
