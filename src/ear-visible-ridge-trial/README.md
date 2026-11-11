# Front-visible ear surface experiment

Left is `ear-inner-relief-strong-trial` (99a8258); right adds a compact tapered forward displacement (up to .0035 local units) to a small part of each ear bowl, not a dark overlay. Target region informed by front-view raycasts on `reference-ear-left`; it is mirrored by coordinates for the other ear, whose topology differs. An existing open boundary is held fixed, as are positions outside the local region and the lobe; the head and original game models are unchanged. The same upper overlap strip is then regenerated. Actual affected vertices: female 39/61, male 24/45.

The change is more visible in the enlarged three-quarter crop, but on the male it appears as an artificial horizontal bulge, not convincing anatomy; the front result is still subtle. The upper dark spot, uneven edges and seams remain. The ear and head are not welded. Static turn/tilt images are available, but a full animation cycle has not been checked. Do not integrate this experiment without review.

View screenshots in `docs/previews/ear-visible-ridge-trial/`; Vite page `/src/ear-visible-ridge-trial/`. `node tests/ear-visible-ridge-trial.mjs` tests synthetic displacement, limit, fixed boundary, indices and finite normals, not anatomy or animation. See `../head-reference/README.md` for source ear provenance.
