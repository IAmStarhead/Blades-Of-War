# Credits, provenance and modifications

This delivery contains two different skinned models. The previous C is the exact last `work/male-gait-refine/male_gait_C_refined.glb`, SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`. The new model is an adapted 100STYLE walk and jog, **with the jog's shoulder-to-hand motion derived from modified ACCAD C**. Both motion-license attributions below apply to the new model and to the videos; the previous model also carries the ACCAD attribution. None of these animations is CC0.

## New walk and jogging basis — 100STYLE, CC BY 4.0

Ian Mason, Sebastian Starke and Taku Komura, *Real-Time Style Modelling of Human Locomotion via Feature-Wise Transformations and Local Motion Phases*, Proceedings of the ACM on Computer Graphics and Interactive Techniques 5(1), 2022, DOI [10.1145/3522618](https://doi.org/10.1145/3522618). Dataset: <https://www.ianxmason.com/100style/>. Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

The included source clips are the unmodified BVH cuts made by `aether-lang-dev/ae3d`, obtained from the pinned [rywible/wrela mirror](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets). See the adjacent source notices for their origin and checksums. They preserve the dataset skeleton and frames, originally sampled at 60 Hz in centimetres:

- `sources/neutral_fw.bvh`, SHA-256 `fb0aeb4ab1bb4c56beddd1a8be2f7c08715a30b84b01afa483cd2688d8d7fcc7`: zero-based **27–110 of the included cut** (the cut itself is dataset frames 1836–1974).
- `sources/neutral_fr.bvh`, SHA-256 `1f3e394493c1ebb1d75f968f57781eb98868adc899ba19a7339587223ae97457`: zero-based **2–50 of the included cut** (the cut itself is dataset frames 499–577).

**Changes:** extracted different windows, scaled and reoriented the recording, retargeted to another rest pose and hierarchy, removed mean horizontal travel, eased the loop seams, spread and adjusted the arms, adjusted neck/head and foot orientation for the target mesh, regularized near-straight walking knees, calibrated vertical foot clearance and smoothed vertical root motion. Jogging swing-foot clearance is increased with two-bone corrections; its shoulder/upper-arm/forearm/hand tracks are replaced by resampled, further-adjusted C motion. The clips and videos are adaptations, not unchanged dataset recordings. The source notices' statements about unrelated `engine::humanoid` changes describe the mirror's project, not this delivery.

## Previous C and new jog arms — Open Motion Project, CC BY 3.0

**Open Motion Project — ACCAD / The Ohio State University**, [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Dataset and attribution: <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>.

The source files and adjacent notices are from the [rywible/wrela mirror at commit `3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb`](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets), using the Male 2 walk, run and stand-to-walk recordings. C used zero-based frames 271–391 of the walk, 11–34 of the run and the first frame of the stand-to-walk reference. The recordings were extracted, reoriented, scaled, retargeted, looped and adjusted; the previous C then received further spine, shoulder, leg, foot and skin-weight edits. For the new jog the C body yaw/weights were altered again, the arm tracks sampled at the new cadence, and the result adjusted to the 100STYLE trunk. See the repository's `tools/male-gait-refine/DEVELOPMENT.md` and `tools/male-gait-recovery/DEVELOPMENT.md` for details.

## Character and viewer

The new trial retains the earlier character's body, face, ears, geometry and 52-joint hierarchy but changes selected shared skin weights; it does not move rest vertices or change bind matrices. Body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); retained face/ears have inherited notices in `LICENSE_CC0_ASSETS.md`. Motion-license requirements are additional. The viewer uses Three.js, MIT (`LICENSE_THREE.txt`). The videos are rendered views of the two adapted trials; the encoder is not included.
