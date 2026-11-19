# Reversible abdomen and pelvic-contour trial

`work/male-body-contour/` is a separate review build based on the delivered
`work/male-body-volume/` ZIP. It does not replace or modify any earlier trial.
The build verifies the previous archive and GLB hashes before authoring. The
new GLB retains all 51 clips, 26 body morphs, the rig, skin, topology and
textures; the viewer embeds the last surface's exact positions and normals for
its «Последняя проба» comparison, with the same animations on both sides.

The sculpt removes the previous forward abdominal fill, rolls back half of its
sideways waist enlargement, pulls the front inward over a broad band, and
relaxes a small welded posterior region. The change is bounded to bind heights
0.84–1.43 m; 493 vertices move more than 1 mm, up to about 28.6 mm. It is an
artistic experiment, not an anatomical guarantee. The rear fold **remains**;
in some running poses the under-chest hollow/shadow is more pronounced than
before. The inherited crouch and knee corrections are still experimental, and
feet can slide. The viewer's floor and transition guards are not baked into
the GLB. The user-facing README describes these limitations and the licenses.

## Rebuild and structural checks

Requires Node.js, Python 3, and the pinned packages from the existing projects:

```sh
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase  # validator and browser QA only
python3 tools/male-body-contour/build.py
python3 tools/male-body-contour/verify.py --rebuild
node tools/male-body-contour/qa-gltf.mjs
```

The build writes only its own output directory, or an explicitly supplied
scratch directory. The verifier checks hashes, archive CRC and contents, the
embedded GLB, and a byte-identical clean rebuild with the installed toolchain.
The glTF check compares individual animation, morph, skin and index accessors
against the preceding model and validates seams and changed bind triangles.

## Browser and sampled geometry checks

Browser tests use Puppeteer and `@sparticuz/chromium`; set `CHROME_BIN` and any
required library paths when using a different Chromium installation.

```sh
node tools/male-body-contour/qa-browser.mjs
node tools/male-body-contour/qa-download.mjs
node tools/male-body-contour/qa-comparison.mjs
node tools/male-library-motion/qa-transitions.mjs work/male-body-contour
node tools/male-body-contour/review.mjs work/male-body-contour /tmp/bow-contour-stills
```

The geometry checks additionally require `numpy` and `python-fcl` (plus the
FCL native library if required by the installation). Their JSON files are large
scratch artifacts and should not be committed:

```sh
node tools/male-library-motion/qa-geometry-export.mjs work/male-body-contour /tmp/bow-contour-geometry.json
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-contour-geometry.json
node tools/male-body-volume/qa-crouch-idle-export.mjs work/male-body-contour /tmp/bow-contour-idle.json
python3 tools/male-library-motion/qa-geometry.py /tmp/bow-contour-idle.json
node tools/male-library-motion/qa-armpit-export.mjs work/male-body-contour /tmp/bow-contour-armpit.json
python3 tools/male-library-motion/qa-armpit.py /tmp/bow-contour-armpit.json
node tools/male-body-contour/qa-waist-export.mjs work/male-body-contour /tmp/bow-contour-waist.json
python3 tools/male-body-volume/qa-waist.py /tmp/bow-contour-waist.json
```

The final GLB had zero glTF Validator errors and warnings. The before toggle
matched the preceding viewer in 48 steady and 544 transition samples. Selected
collision tests found no contacts in 832 movement/transition poses, 96 extra
crouch-idle poses and 1,424 armpit poses, and no new selected torso/arm contacts
in 656 paired poses. These tests cover finite samples and selected surface
subsets, excluding neighboring faces; they do not establish absence of all
intersections, folds, sliding or other visual defects. Browser testing included
mobile emulation, not a physical Android device. Review stills are from the
actual viewer; matching a user's screenshot to a particular phase is only
approximate. Artistic acceptance remains with the user.
