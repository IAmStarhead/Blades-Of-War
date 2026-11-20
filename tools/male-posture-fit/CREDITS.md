# Credits and modifications

## Selected walk, run and standing calibration

**Open Motion Project — ACCAD / The Ohio State University**, licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Primary dataset and attribution: <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>.

The unmodified BVH recordings and their adjacent notices in `sources/` come from the [rywible/wrela mirror at commit `3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb`](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets). The mirror identifies them as `Male2_B3_Walk.bvh`, `Male2_C3_Run.bvh`, and `Male2_B1_StandToWalk.bvh` from the [Male 2 BVH archive](https://accad.osu.edu/sites/accad.osu.edu/files/Male2_bvh.zip). Its first stand-to-walk frame supplies the standing calibration pose.

- `accad_male2_walk.bvh`: SHA-256 `6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3`; zero-based frames 271–391 at 120 Hz.
- `accad_male2_run.bvh`: SHA-256 `ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c`; zero-based frames 11–34 at 30 Hz.
- `accad_male2_stand_to_walk.bvh`: SHA-256 `deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6`; first frame used for calibration.

**Changes:** extracted and looped fragments, reoriented and scaled the movement, retargeted it to another hierarchy, removed average horizontal travel, spread the arms, reduced the run's thigh rotation, smoothed the loop seams, lifted the swing foot slightly and calibrated vertical clearance. This revision additionally removes the fixed torso-direction alignment bias, compensates limb rotations, readjusts vertical root clearance and changes a localized set of hip skin weights. Both GLBs and videos are adaptations, not the unchanged recordings. CC BY 3.0 is not CC0: retain author, license link, source and modification notice when redistributing them.

## Character and viewer

The previous comparison model is an exact copy of `work/male-motion-fit/male_motion_C_trial.glb` (SHA-256 `b52a204a294ff7bf11e60b3da1be385eb406bdcd732e90d1e8240760f772270e`). The new trial uses its body, face, ears, geometry and 52-joint rig; 200 central hip skin weights and two C animations are changed. The joint locations and bind matrices are unchanged. Body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); retained face/ears have inherited notices in `LICENSE_CC0_ASSETS.md`. The CC BY motion attribution is additional.

Viewer: Three.js, MIT license (`LICENSE_THREE.txt`). Video files are rendered views of the previous and new trial. The encoder is not distributed in the archive.
