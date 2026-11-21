# Credits and modifications

## Motion capture

**Open Motion Project — ACCAD / The Ohio State University**, [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Primary dataset and attribution: <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>.

The unmodified BVH recordings and adjacent notices in `sources/` come from the [rywible/wrela mirror at commit `3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb`](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets). The mirror identifies them as `Male2_B3_Walk.bvh`, `Male2_C3_Run.bvh`, and `Male2_B1_StandToWalk.bvh` from the [Male 2 BVH archive](https://accad.osu.edu/sites/accad.osu.edu/files/Male2_bvh.zip). The first stand-to-walk frame supplies a previous standing calibration.

- `accad_male2_walk.bvh`: SHA-256 `6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3`; zero-based frames 271–391 at 120 Hz.
- `accad_male2_run.bvh`: SHA-256 `ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c`; zero-based frames 11–34 at 30 Hz.
- `accad_male2_stand_to_walk.bvh`: SHA-256 `deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6`; first frame used for calibration.

**Changes:** fragments were extracted and looped, reoriented and scaled, retargeted to another hierarchy, stripped of average horizontal travel, and adjusted at the arms, torso, feet, legs and loop seams. The previous C fitting also adjusted shared shoulder and hip skin weights and calibrated vertical clearance. This follow-up starts from that C and further adjusts head/neck orientation and foot yaw during swing; it does not modify the other motion tracks, timing or skin. The GLBs and videos are adaptations, not the unchanged recordings. CC BY 3.0 is not CC0: retain author, license link, source and modification notice when redistributing.

## Character and viewer

`previous_C.glb` is a byte-identical copy of `work/male-gait-refine/male_gait_C_refined.glb` (SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`). The new trial retains its body, face, ears, geometry, weights, textures, rest transforms, 52-joint rig and bind matrices. The body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); retained face/ears have inherited notices in `LICENSE_CC0_ASSETS.md`. The CC BY motion attribution is additional. No 100STYLE motion is used in this follow-up.

Viewer: Three.js, MIT license (`LICENSE_THREE.txt`). Video files are rendered views of the previous and new C trials. The encoder is not distributed in the archive.
