# Источники и лицензии / Credits and licenses

This review uses recordings from two independent mocap datasets. All six BVHs
were retrieved from the pinned mirror below and checked against their companion
notices. The original source BVHs are included, byte for byte, in `sources/`;
the viewer also embeds those same files. `build-info.json` lists SHA-256 hashes,
frame windows, measured speeds and the endpoint mismatch for this preview.

## 100STYLE — ходьба A и бег A

**The 100STYLE Dataset — Ian Mason**. Ian Mason, Sebastian Starke, Taku Komura,
“Real-Time Style Modelling of Human Locomotion via Feature-Wise Transformations
and Local Motion Phases,” Proceedings of the ACM on Computer Graphics and
Interactive Techniques 5(1), 2022. DOI: https://doi.org/10.1145/3522618

- Dataset: https://www.ianxmason.com/100style/ and https://zenodo.org/records/8127870
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- `neutral_fw.bvh`: cut of `100STYLE/Neutral/Neutral_FW.bvh`, original frames
  1836–1974 (zero-based), SHA-256
  `fb0aeb4ab1bb4c56beddd1a8be2f7c08715a30b84b01afa483cd2688d8d7fcc7`.
  The review repeats frames 27–110 of the included cut (original frames 1863–1946).
- `neutral_fr.bvh`: cut of `100STYLE/Neutral/Neutral_FR.bvh`, original frames
  499–577 (zero-based), SHA-256
  `1f3e394493c1ebb1d75f968f57781eb98868adc899ba19a7339587223ae97457`.
  The review repeats frames 9–57 of the included cut (original frames 508–556).
- The source cuts were made by `aether-lang-dev/ae3d`; the included files
  preserve those source frames, as recorded in the accompanying notices.

## ACCAD — ходьба и бег B/C

**Open Motion Project — ACCAD / The Ohio State University**.
https://accad.osu.edu/research/motion-lab/mocap-system-and-data

License: [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/).

- `accad_male1_walk.bvh`: original `Male1_B3_Walk.bvh`, review frames 73–107,
  SHA-256 `5acbd06ab7f5f0dcaa5b70c1caeba3e972e1472050ab92f9b8846ac1c8cd034e`.
- `accad_male2_walk.bvh`: original `Male2_B3_Walk.bvh`, review frames 271–391,
  SHA-256 `6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3`.
- `accad_male1_run.bvh`: original `Male1_C03_Run.bvh`, review frames 13–32,
  SHA-256 `90bec698aea33584e4792d581946c1452d7cad0a29a4ee2656df0e04613bb95a`.
- `accad_male2_run.bvh`: original `Male2_C3_Run.bvh`, review frames 11–34,
  SHA-256 `ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c`.

All frames above are zero-based in the included files. ACCAD's original
archives and their SHA-256 values are identified in each companion notice.

## Acquisition and changes

Pinned mirror: https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets

The included mirror notices describe the mirror author's own retargeting and
cleanup pipeline; **that pipeline is not used or included in this review**.
The BVH files themselves are unchanged from that pinned mirror. This review
selects a subrange of each recording, repeats it without seam blending, rotates
it to a common approximate direction, holds the horizontal root at screen centre
while translating the ground grid by the source root motion, applies one constant
vertical offset, and draws schematic shapes connected to source joints. The
videos record this same transformed preview. No source motion was retargeted to
the project character or corrected with IK/foot locking.

Viewer code uses [Three.js](https://threejs.org/), MIT License; the full license
is included in `LICENSE_THREE.txt`. Dataset licenses apply to the recordings
and their displayed/recorded adaptations; preserve the credits and change
notices when reusing them.
