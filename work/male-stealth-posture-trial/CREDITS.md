# Credits and changes — stealth posture trial

This is a separate animation experiment, not a new motion-capture recording or a licence for the entire game. The previous trial and the embedded character model remain unchanged.

## 100STYLE / HumanMotionCraft

The crouch-walk starts from the previously published adaptation of **100STYLE**, Ian Mason, Sebastian Starke and Taku Komura, <https://www.ianxmason.com/100style/> and <https://zenodo.org/records/8127870>, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The motion capture is one actor's deliberately styled performance, not an anatomical norm.

The preceding trial used HumanMotionCraft's retargeted [Crouch walk 7](https://github.com/YalKouassi/HumanMotionCraft/blob/5eda21e0be7e2c9912b204eabb1a5d79ecd90d06/assets/library/animations/Locomotion/Crouch%20walk%207.clip.json), selected and crossfaded part of the take, transferred it to a different rig, slowed it and modified foot pitch and support. Its idle was constructed from mirrored directions, not captured. Full provenance, hashes, the HumanMotionCraft notices and descriptions of these changes are in [the previous trial's credits](../male-leg-human-trial/CREDITS.md).

For **this** trial we further lowered the pelvis, applied a two-bone ankle-target fit, widened and staggered the idle feet, and reposed torso, head and arms. Finger tracks are taken from the character's existing walking clip. These changes are baked into new crouch clips; runtime blending, floor correction and knee-volume morphs add further modifications. The before/after images and video show renders of the two adapted trials, not original 100STYLE footage.

## Character, motion and viewer

The scene embeds the unchanged `work/male-leg-volume/male_leg_volume_trial.glb` (SHA-256 `eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484`) and the unchanged procedural well `tools/male-rig-trial/well-source.mjs` (SHA-256 `62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5`). Inherited MakeHuman, CC0, Quaternius and other character/motion attributions and licence texts are retained with the [previous trial](../male-leg-human-trial/INHERITED_CREDITS.md).

Viewer: [Three.js](https://threejs.org/), [MIT licence](../male-leg-human-trial/LICENSE_THREE.txt). The comparison screenshots and video were generated from the project scenes; the floor markers are present only in the video.
