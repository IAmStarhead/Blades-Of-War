# Static male body-rebuild study

This is a **separate, static-only review**; it does not replace or modify any
previous delivery. The packaged browser page embeds the new body and a baked,
static reference of the previous one. The reference shares the same lighting
and camera, but the arms, fingers and stance differ.

## Provenance

* Previous head, nape, ears, face texture and comparison reference:
  `work/male-body-contour/male_body_contour.glb`, SHA-256
  `db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5`.
  The source's Human Basemeshes (pistachio) and MakeHuman ear assets are
  described as CC0 in the preceding deliveries. The default head/neck morphs
  are baked; the head indices and other needed vertex attributes, the ears'
  rest transforms and the face texture are preserved.
* The new body uses graphical data from MakeHuman's pinned commit
  [`a8bc2d54ff0ac92e78ff71431b1023eda42bf482`](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482).
  The upstream [asset license](sources/LICENSE.MAKEHUMAN.md) identifies the
  base mesh, targets, poses, etc. as CC0 1.0; `base.obj`, the skeleton and the
  weights also explicitly identify CC0. MakeHuman application code is not
  copied. The checked-in source files and SHA-256 values are checked by
  `build.py` before use; paths, URLs and hashes are in the output build-info.

| File | Upstream Git blob |
|---|---|
| `base.obj` | `d26635e9326e3cca30778fd7b9c00062b03cce09` |
| `caucasian-male-young.target` | `c3b82f92c5ced85599199cd184b0faf3b3fc6881` |
| `universal-male-young-maxmuscle-averageweight.target` | `b7c039c7f463fe1f1721b9ab269c7248d9c4f2f7` |
| `default.mhskel` | `b02cbecae00143856410d7561adf006d83bf9b3e` |
| `default_weights.mhw` | `66185806afacf87749be8e5cf6dbf66496b2a6b0` |
| `LICENSE.MAKEHUMAN.md` | `5d1a49d31ebdaa46b06c52eae2c005c678a63ffa` |

* The offline viewer uses Three.js r187 under MIT. License notices and full
  CC0 text are included. These notices do not license the entire game.

## Construction and limitations

`mesh.py` applies the male target at 1.0 and the muscle target at 0.35, scales
the donor to approximately the previous height, then uses the source joints
and weights to bake a roughly 28° upper-arm, 25° forearm, 4° leg and mild
finger curl into the **static** position. Those input weights and bones are not
exported. The thumb is not bent. The donor neck is shifted down, mildly altered
in depth, and clipped at Y=1.510 m; the old nape is clipped at Y=1.545 m.
Both boundaries are split on a shared 294-angle grid and connected by 13
intermediate smoothed Hermite rings. The face, ears and source face texture are
copied separately; the new body's skin material is flat and has **no UVs**.

The new body has 14,703 vertices and 28,196 triangles, of which 8,232 form the
neck bridge. The figure's height is about 1.788 m. The bridge has 588 boundary
edges with two adjacent faces, no near-zero bridge faces at the tested
threshold, and a minimum bridge face/mean-vertex-normal dot of about 0.876.
That is only a local test: the inherited nape/head area has 1,208 open edges in
the body mesh, and the retained head and ears remain separate surfaces. The
whole figure is **not claimed to be watertight**; side-neck striations and
shading/shape irregularities are visible on close inspection. No animation,
rigging, skinning, game performance, whole-model self-intersection, printability
or actual Android-device compatibility is claimed. The user must judge shape.

## Rebuild and checks

Dependencies used for the byte-identical rebuild: Node.js 22.22.3, Python
3.11.2, NumPy 2.4.6, SciPy 1.17.1, NetworkX 3.6.1 and the locked JavaScript
dependencies. FCL QA additionally uses trimesh 5.2.1 and python-fcl 0.7.0.11.
The exact compressed output can vary with platforms or library versions.

```bash
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
python -m pip install 'numpy==2.4.6' 'scipy==1.17.1' 'networkx==3.6.1' \
  'trimesh==5.2.1' 'python-fcl==0.7.0.11'
python tools/male-static-rebuild/build.py
python tools/male-static-rebuild/verify.py --rebuild
node tools/male-static-rebuild/qa-gltf.mjs
python tools/male-static-rebuild/qa-fcl.py
CHROME_BIN=/path/to/chromium node tools/male-static-rebuild/qa-browser.mjs
```

`build.py --output /some/new/directory` writes a separate package. Validator
reported zero errors/warnings on both GLBs; the structural check verifies that
the old reference is the previous model's default baked shape and both copies
retain the head, ears and face texture. `qa-fcl.py` tests selected hands,
arms, feet, legs, pelvis, shoulders and the new bridge for non-neighboring
triangle contacts in this **one** static pose. It deliberately excludes ordinary
adjacent triangles and does not cover the old head overlap. `qa-browser.mjs`
tests offline `file://` use, switching without changing the camera, presets,
mouse/touch/pinch, mobile layouts and byte-exact GLB download in Chromium
emulation. None of these tests proves visual quality or movement suitability.
