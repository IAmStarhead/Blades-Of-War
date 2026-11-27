# Credits and changes — separate natural-motion trial

This delivery is a modified research/game animation trial. It does not change the previous scene or its model and does not purport to license the whole game. Crouching is disabled here.

## Recorded movement: 100STYLE

**The 100STYLE Dataset - Ian Mason**, by Ian Mason, Sebastian Starke and Taku Komura, [project page](https://www.ianxmason.com/100style/), [dataset](https://zenodo.org/records/8127870), [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/) ([legal code](https://creativecommons.org/licenses/by/4.0/legalcode)). The source is Xsens inertial motion capture at 60 fps, from one actor performing styles; it is not a universal anatomical standard. No endorsement by the authors is implied.

We use files from the [ae3d 100STYLE fixture mirror](https://github.com/aether-lang-dev/ae3d/blob/57c3c340b405c8e1155dada8dabad3daadbf0266/tests/fixtures/people/README.md), preserving the motion data as 60 fps BVH inputs before further editing:

- `neutral_fw.bvh`, SHA-256 `fb0aeb4ab1bb4c56beddd1a8be2f7c08715a30b84b01afa483cd2688d8d7fcc7`, is Neutral_FW original frames 1836–1974; this trial uses local frames 28–112 for the walk loop.
- `neutral_fr.bvh`, SHA-256 `3dd4b51d154407896c12e9f9101316cd36b64c5f7e3712e6e38dc5a9c0e856ac`, is a cut of the [full Neutral_FR](https://github.com/aether-lang-dev/ae3d/tree/57c3c340b405c8e1155dada8dabad3daadbf0266/tests/fixtures/people/100style/whole), original frames 480–577; the run loop uses local 21–69 (original 501–549).
- `neutral_arrive.bvh`, SHA-256 `5b90fda4aa1d6978b5bcfe30795f2a59855a0ad5c00f6b73f9a8c06316cb66be`, is Neutral_ID original frames 1745–2102; this trial uses local 138–240 for the walking stop.
- `neutral_idle.bvh`, SHA-256 `157d16771f59d05870d16394ef3b786835ec30b33dfc435016d54899fa6d4513`, is a cut of the full Neutral_ID, original frames 760–1050; the idle loop uses local 40–240 (original 800–1000).

The trial **changes** these recordings: retargets joint directions onto a different 52-bone character, removes root yaw and horizontal travel, cuts and crossfades cycles, limits torso/head tilt, slightly widens the arms to fit the target body, calibrates feet and height, and raises the running toes during swing. The walking stop is retimed and has a mirrored variant. Finger pose comes from the existing model. The controller selects a starting phase, blends the clips and applies a vertical floor guard and existing knee-volume morphs. These are not unaltered mocap performances or a contact-physics simulation.

## Recorded run stop: CMU

The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.

The source is CMU subject/trial **104_56**, a run-to-stop recording, [BVH conversion mirrored by una-dinosauria/cmu-mocap](https://github.com/una-dinosauria/cmu-mocap/blob/09a07f54f3bbb58797325f009282d0b2048a2871/data/104/104_56.bvh), SHA-256 `a6ce9a6c822da5a1a767481718ca3f18e571ca44692d99ed4331b3e31471d848`. The 120 fps BVH is a conversion of the original CMU data attributed to Bruce Hahne. Local BVH frames 100–270 are retargeted as described above, sampled at 60 fps, retimed, foot-roll calibrated and mirrored. The resulting stopping animation is blended with other motion; it is not the untouched recording.

The [current CMU database terms](https://mocap.cs.cmu.edu/) permit research and commercial use but prohibit direct resale of the data, even converted; consult CMU's current conditions for further use. This notice and the restriction are not a CC BY or CC0 licence grant.

## Research pictures and video links

The optional `study.html` includes four existing research sheets:

- `evidence/people-walk.jpg`: Mike Caiola / Credence Management Solutions, wgvp **OWN03**, selected frames 11.8/12.0/12.2/12.4 s from the [two-camera video](https://github.com/mikecredence/wgvp/blob/5cbedd1e2f75addb88f44b059ce8a88e30ce4a34/examples/two_camera/OWN03/SP/OWN03_SP.mp4); [description and consent](https://github.com/mikecredence/wgvp/blob/5cbedd1e2f75addb88f44b059ce8a88e30ce4a34/examples/README.md); source SHA-256 `3c84100a75b04459f210842041d0cdeaf61a02f0b73a2aaf7d9211208f4b1669`. The frames were cropped, resized and assembled; the repository is [AGPL-3.0](LICENSE_WGVP_AGPL-3.0.txt).
- `evidence/people-run.jpg`: **zzzhushi / GaitLab**, Copyright © 2026 zzzhushi, [MIT](LICENSE_GAITLAB_MIT.txt). [Male side](https://github.com/zzzhushi/running-gait-analysis/blob/14cb02910007fcbabc70a5585e2206a0d3e3fca7/tests/data/male_side.mp4), SHA-256 `84f2de8ccfc8ddaad7be42ad6c46c68226d3f6b0a13a986d57528e451afc0ce2`; [female rear](https://github.com/zzzhushi/running-gait-analysis/blob/14cb02910007fcbabc70a5585e2206a0d3e3fca7/tests/data/female_rear_view.mp4), SHA-256 `06c70e3423a66ce9d41808845540b5367ba29cb873b87720a507bc8eaeb7271e`; [description and consent](https://github.com/zzzhushi/running-gait-analysis/blob/14cb02910007fcbabc70a5585e2206a0d3e3fca7/tests/data/README.md). Frames were extracted, cropped, resized and assembled. They are different people and unsynchronized videos.
- `evidence/reference-walk-12.jpg` shows selected rendered frames of HumanMotionCraft's retargeted [Walk 12](https://github.com/YalKouassi/HumanMotionCraft/blob/5eda21e0be7e2c9912b204eabb1a5d79ecd90d06/assets/library/animations/Locomotion/Walk%2012.clip.json), from 100STYLE, on its separate mannequin. `evidence/reference-run-9.jpg` shows its [Run 9](https://github.com/YalKouassi/HumanMotionCraft/blob/5eda21e0be7e2c9912b204eabb1a5d79ecd90d06/assets/library/animations/Locomotion/Run%209.clip.json), from CMU. These are source examples on a different model, **not** this trial's animations or footage of a person.

HumanMotionCraft's [attribution](https://github.com/YalKouassi/HumanMotionCraft/blob/5eda21e0be7e2c9912b204eabb1a5d79ecd90d06/ATTRIBUTION.md) traces the mannequin to **Anny**, Copyright © 2025 NAVER Corporation, [Apache-2.0](LICENSE_ANNY_APACHE-2.0.txt), itself from MakeHuman MPFB2, CC0 1.0. HumanMotionCraft is independent of NAVER; its full [NOTICE](NOTICE_HUMANMOTIONCRAFT.txt) is included. The mannequin is only shown in the reference images, not embedded in this scene.

`movement.mp4` is a fixed-step render of this new scene, not a real-person video; its floor dots and labels are added for the recording only. The real-person source videos above are linked, not embedded.

## Character, other assets and code

The interactive scene embeds the unchanged `work/male-leg-volume/male_leg_volume_trial.glb`, SHA-256 `eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484`, and unchanged well `tools/male-rig-trial/well-source.mjs`, SHA-256 `62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5`. The GLB still contains its previous Quaternius gait data even though the new controller plays the adapted motions above. The model uses MakeHuman assets; Quaternius — Animated Human Low Poly supplies the embedded gait and finger pose, CC0; older skin fitting involved ACCAD / The Ohio State University motion, CC BY 3.0. Further provenance and changes are retained in [INHERITED_CREDITS.md](INHERITED_CREDITS.md); its opening crouch sections describe older scenes, not this one. Included notices: [MakeHuman](LICENSE_MAKEHUMAN.md), [CC0 assets](LICENSE_CC0_ASSETS.md), [Quaternius](LICENSE_QUATERNIUS_CC0.txt).

Viewer: [Three.js](https://threejs.org/), [MIT](LICENSE_THREE.txt). The [project source repository](https://github.com/IAmStarhead/Blades-Of-War/tree/arena/4319905c-blades-of-war) contains the corresponding source, the pinned npm dependencies and the retargeting inputs under `tools/male-natural-motion-trial/`, plus the referenced model and shared viewer modules. The repository's code and asset licence texts are included as [LICENSE.CODE.md](LICENSE.CODE.md) and [LICENSE.ASSETS.md](LICENSE.ASSETS.md); they do not supersede the third-party terms above.
