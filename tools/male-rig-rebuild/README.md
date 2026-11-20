# New-body rig and fixed-cut study

This is a **separate experimental delivery**. It does not modify the approved
static study or the previous animated model. `work/male-rig-rebuild/` contains
the intact rigged GLB, a segmented cut study, a trimmed previous-model reference,
a self-contained Russian review page, licenses, build metadata, and a ZIP.

## Inputs and construction

* Approved static body: `work/male-static-rebuild/male_static_rebuild.glb`,
  SHA-256 `4ff3f49882d1544a856d1d9061a696e13224803fd58250782e456a3bca5982c2`.
  The intact rig's body positions, normals and triangle indices match it
  exactly; the face is the same default-baked face, and ears and face texture
  are retained. The new body remains flat-colored and has no UVs. The static
  study describes the neck seam, including its remaining visible striations and
  1,208 inherited open body edges in the head/nape area.
* Previous animation, head skin and nape weights:
  `work/male-body-contour/male_body_contour.glb`, SHA-256
  `db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5`.
  Source and output notices are in the package. The comparison GLB keeps the
  two original clips and all their nonzero morph tracks; unused clips, unused
  morphs, archival custom attributes and unused color sets are removed. It is
  not a substitute for the original 51-clip file.
* The pinned MakeHuman base, targets, skeleton definitions and weights under
  `tools/male-static-rebuild/sources/` are checked by SHA-256 before use. The
  upstream assets are identified as CC0; Three.js is MIT. See the static study
  and package licenses. References used for the method include the [glTF skin
  tutorial](https://github.khronos.org/glTF-Tutorials/gltfTutorial/gltfTutorial_020_Skins.html),
  the [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html),
  and [Nexus Mods' discussion of rigging and dismemberment](https://wiki.nexusmods.com/index.php/Rigging_skinning_and_dismemberment).

`skin.py` reconstructs the exact approved surface, transfers MakeHuman donor
weights and retained-nape weights, and interpolates the 13-row bridge. Source
helper influences are mapped to the 22 named motion bones, plus 30 new finger
phalange bones. In the new neck the upper-arm influence is smoothly merged into
the shoulder before retaining four influences, to avoid abrupt fifth-influence
changes. The retained four are normalized; maximum discarded weight before the
bend adjustments is 2.99%, p99 0.051%; the later four-influence limit discards
at most another 0.029%. Zero-weight joint slots have index zero.

Most joint centers are averages of the MakeHuman guide vertices **after the
approved pose has been baked**. The manually chosen neck/head points are
`(0, 1.510, -0.040)` and `(0, 1.600, -0.025)` m. Both elbow centers are moved
+0.012 m in Z and both knees -0.028 m in Z from their donor guide estimates;
these empirical hinge adjustments and smooth elbow/knee/hip weight transitions
reduce folding in the two evaluated gaits, not proof of anatomical accuracy.
The knee transition is deliberately broad, and may look too soft in other poses.
The first 22 joint names/order match the old skeleton; individual finger bones
have weights but no finger animation. The glTF rest transforms and inverse binds
are consistent. Ear nodes follow the head bone. The baked face has no separate
expression morphs in the new GLB.

`author.mjs` copies all 21 joint rotation tracks and root translation from
`Torso_Walk` and `Polish_Run`, but **not** the old body's corrective morphs.
`calibrate.mjs` samples the old and new lower-foot vertices and bakes a vertical
root correction matching the prior per-phase minimum foot height, at 1,025 walk
and 705 run keys. Root X/Z and rotations are not altered; the previous run's
flight phases remain. This is not foot locking or IK, and horizontal sliding,
changed stride shape and unnatural joints remain possible. No other old clip,
crouch, gameplay transitions or facial animation is claimed to work here.

## Segmented version

`segment.py` intersects the original body with eight selected planes, chooses
the closed loop nearest each elbow, wrist, knee and ankle, splits only the
triangles on that loop, and assigns identical interpolated skin weights to both
sides. Each side receives an oppositely wound, ear-clipped surface made from the
same boundary points. The separate `male_cut_placeholders.glb` contains nine
surface nodes (`Part_Main`, forearms, hands, shins and feet) and 16 cap nodes.
For each cut, caps are `Cap_<Elbow|Wrist|Knee|Ankle>_<L|R>_Proximal` and
`..._Distal`; metadata and naming are also documented in the package README.
Interpolation lost at most `2.99e-8` weight before renormalization. The eight
individual distal shells have no boundary or non-manifold edges when their
appropriate caps are included; `Part_Main` still has the inherited 1,208 open
head-region edges. Matching boundary positions/weights makes the two rims
coincide under the same skinning, but splitting an edge can still slightly
change its skinned interior versus the uncut triangle. The simple colored caps
are not final cut anatomy. Shoulder, hip, neck and arbitrary cuts are absent.

GLB has no portable mesh-visibility flag. In a generic importer the caps are
present and may need hiding until the game triggers a cut. The viewer selects
one cut at a time, hides unused caps, and translates the relevant detached
segments while they keep following the same skeleton. An optional cut focus
tracks the skinned cap centroids; the one-sided display floor does not obscure
an ankle viewed from below. Frustum culling is disabled for the viewer's skinned
meshes and skeleton overlays, so cached bounds from a different pose cannot
hide a segment in a close-up. This only illustrates visibility and seam alignment;
runtime separation, cloning/capturing the pose,
physics, hit logic, collision and engine-specific skin handling are unimplemented.

## Rebuild and checks

Environment used: Node 22.22.3, Python 3.11.2, NumPy 2.4.6, SciPy 1.17.1,
NetworkX 3.6.1, trimesh 5.2.1, python-fcl 0.7.0.11, and the locked Node
packages. Platform/library/compression versions can change bytewise output.
No source files are downloaded by the build.

```bash
npm ci --prefix tools/male-library-motion
npm ci --prefix tools/character-showcase
python -m pip install 'numpy==2.4.6' 'scipy==1.17.1' 'networkx==3.6.1' \
  'trimesh==5.2.1' 'python-fcl==0.7.0.11'
python tools/male-rig-rebuild/build.py
python tools/male-rig-rebuild/verify.py --rebuild
node tools/male-rig-rebuild/qa-gltf.mjs
CHROME_BIN=/path/to/chromium node tools/male-rig-rebuild/qa-deform-export.mjs \
  work/male-rig-rebuild /tmp/bow-rig-deform.json 96
python tools/male-rig-rebuild/qa-deform.py /tmp/bow-rig-deform.json --strict
CHROME_BIN=/path/to/chromium node tools/male-rig-rebuild/qa-browser.mjs
```

`build.py --output /some/new/directory` keeps all prior outputs untouched.
Checks performed for this study:

* glTF Validator: zero errors and warnings on all three GLBs. Structural QA
  checks the static body, retained face/ears, bind matrices, nonnegative
  normalized four-weight skinning, 52 named joints, copied rotation tracks,
  previous-reference morph data, all cap/adjacent-surface rim attributes, and
  matching first/last key values for every track in both loops.
* 4,096 off-key samples per gait: maximum deviation of the lowest new foot
  from the previous foot-height profile was 0.273 mm for walk and 0.864 mm for
  run; the new run sampled 1.73–125.92 mm above Y=0, retaining ground approach
  and flight. This is a height comparison only, not a test of foot slip.
* FCL: no non-neighbouring selected contacts in 96 phases per gait for both
  knees, elbows, shoulders, pelvis, each hand versus the torso, and foot versus
  foot. The neck body subset was checked at 24 phases per gait, plus rest.
  Neighbouring triangles are excluded. Separate face/ears, enclosure,
  penetration depth, intermediate phases, other motions and unselected regions
  are not covered; these results do not prove collision freedom.
* Offline Chromium: desktop controls and byte-exact downloads, 320/390/768px
  mobile-emulated layouts, touch rotation and pinch. 22,912 comparisons of
  cap-rim vertices in the two clips, 16 phases and eight cuts matched their
  adjacent surface after skinning and preview offset. Each finger joint moved
  local hand vertices in a small isolated rotation; this is not a fist test.
  Emulation does not replace a physical Android or target-engine test.
