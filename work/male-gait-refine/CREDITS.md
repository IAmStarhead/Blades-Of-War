# Credits and modifications

## Selected walk, run and standing calibration

**Open Motion Project — ACCAD / The Ohio State University**, licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Primary dataset and attribution: <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>.

The unmodified BVH recordings and their adjacent notices in `sources/` come from the [rywible/wrela mirror at commit `3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb`](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets). The mirror identifies them as `Male2_B3_Walk.bvh`, `Male2_C3_Run.bvh`, and `Male2_B1_StandToWalk.bvh` from the [Male 2 BVH archive](https://accad.osu.edu/sites/accad.osu.edu/files/Male2_bvh.zip). Its first stand-to-walk frame supplies the standing calibration pose.

- `accad_male2_walk.bvh`: SHA-256 `6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3`; zero-based frames 271–391 at 120 Hz.
- `accad_male2_run.bvh`: SHA-256 `ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c`; zero-based frames 11–34 at 30 Hz.
- `accad_male2_stand_to_walk.bvh`: SHA-256 `deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6`; first frame used for calibration.

**Changes:** extracted and looped fragments, reoriented and scaled the movement, retargeted it to another hierarchy, removed average horizontal travel, spread the arms, reduced the run's thigh rotation, smoothed the loop seams, lifted the swing foot and calibrated vertical clearance. The previous posture trial removed a fixed torso-direction alignment bias, compensated limb rotations and modified central hip weights. This revision further adjusts the spine, shoulder and upper-arm orientations, distributes an outward foot turn over the foot and shin, and adjusts shoulder and upper-thigh skin weights. Both GLBs and all videos are adaptations, not the unchanged recordings. CC BY 3.0 is not CC0: retain author, license link, source and modification notice when redistributing them.

## Character and viewer

The comparison model is an exact copy of `work/male-posture-fit/male_posture_C_trial.glb` (SHA-256 `c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847`). The new trial retains its body, face, ears, geometry and 52-joint rig; selected shoulder and thigh weights and two C clips change. Joint locations and bind matrices are unchanged. Body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); retained face/ears have inherited notices in `LICENSE_CC0_ASSETS.md`. The CC BY motion attribution is additional.

Viewer: Three.js, MIT license (`LICENSE_THREE.txt`). Video files are rendered views of the previous and new trials. The encoder is not distributed in the archive.
