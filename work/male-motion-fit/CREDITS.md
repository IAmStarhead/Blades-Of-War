# Credits and modifications

## Selected walk and run, and standing calibration pose

**Open Motion Project — ACCAD / The Ohio State University**, licensed under [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/). Primary dataset and attribution: <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>.

The unmodified BVH recordings and their adjacent notices in `sources/` come from the independently maintained [rywible/wrela mirror, commit `3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb`](https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets). The mirror identifies them as `Male2_B3_Walk.bvh`, `Male2_C3_Run.bvh`, and `Male2_B1_StandToWalk.bvh` from the [Male 2 BVH archive](https://accad.osu.edu/sites/accad.osu.edu/files/Male2_bvh.zip). It identifies the first frame of the latter as the actor's standing reference; the BVH offsets without that pose do not provide a standing calibration.

- `accad_male2_walk.bvh`: SHA-256 `6cf2fcba98c7dc5c827896edccc16a8a9444350a8833a24e8ac7f6267c81cab3`. The fitted loop uses zero-based frames 271–391 at 120 Hz.
- `accad_male2_run.bvh`: SHA-256 `ef33bc8c0c3472f35cb01f494265bdf383dcff006efbe88d0762ab1572f0021c`. The fitted loop uses zero-based frames 11–34 at 30 Hz.
- `accad_male2_stand_to_walk.bvh`: SHA-256 `deb6cf43aa2faaaccd734853dff8567736a49126e1263aee532478d49beea7c6`. Only the first frame supplies the calibration pose.

**Changes in this trial:** extracted and looped fragments, reoriented and scaled the motion for the character, retargeted to another hierarchy, removed average horizontal travel, slightly spread arms, reduced the run's thigh rotation to 90%, smoothed the cycle seams, made a small baked swing-foot lift and calibrated vertical root clearance. The animated GLB and videos therefore contain adapted motion, not the unchanged recordings. The original source files are included without modification. CC BY 3.0 is not CC0; retain the author, license link, source and modification notice when redistributing these derived motions.

## Character and viewer

The trial's body, face, ears, 52-bone rig, skin weights and previous gait clips are copied from `work/male-rig-rebuild/male_rig_rebuild.glb` (SHA-256 `8c92f19a522d287ea8bd3fb2a683b27cc7bdc36b0adc4f3aa7ca7de86d11755c`). Body and rig use MakeHuman assets marked CC0; see `LICENSE_MAKEHUMAN.md`. The retained face/ears and earlier animations have their own inherited notices in `LICENSE_CC0_ASSETS.md`; the CC BY motion attribution above is additional, not a replacement.

Viewer: Three.js, MIT license, `LICENSE_THREE.txt`. Video files are rendered views of this same trial. The encoder is not distributed in the archive.
