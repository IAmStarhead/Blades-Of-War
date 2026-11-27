# Credits and changes — unarmed combat trial

This is an independent animation experiment, not a licence for the whole game.
The scene embeds the unchanged accepted model and the unaltered previous
well. No weapon, opponent, hit detection or other combat asset is added.

## Unarmed animation sources

**Quaternius — Universal Animation Library Standard**: the author identifies
this particular pack as [CC0 1.0](https://quaternius.com/packs/universalanimationlibrary.html).
The `Punch_Jab` and `Punch_Cross` inputs are from the independent
[J-Ponzo mirror, commit e24c23cf2a1323488a3faa226ea7ea21f644b73e](https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e).
The source glTF SHA-256 is
`0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765`;
the BIN is `6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c`.
The mirror is not the author and this copy has not been byte-compared with the
original archive. The pack's [CC0 text](LICENSE_QUATERNIUS_CC0.txt) is included;
other Quaternius packs may have different terms.

**Kick**: Quaternius Universal Animation Library / KinemIQ, via the
[GKEET project's retargeted Kick.glb](https://github.com/titamone120-design/-GKEET-game/blob/c1681201e7dcde753524af9bd8c44567dbd9022e/www/models/Kick.glb),
SHA-256 `3939578c4029acbd529fd433689858b542b438d01be8783f30686b01d509c262`.
Its embedded copyright and the upstream
[notice](https://github.com/titamone120-design/-GKEET-game/blob/c1681201e7dcde753524af9bd8c44567dbd9022e/www/models/CC0-LICENSE.txt)
identify the motion as CC0 and say it was retargeted onto the KinemIQ rig and
resampled at 30 fps. This copy is not a verified original Quaternius archive.

For this trial we **changed** these inputs: retargeted them again to the
52-bone character, adapted the fingers, blended the start and end to a common
guard, vertically adjusted the soles, mirrored the kick for the other side,
lowered the kick toward body height, and slowed the fastest part of the kick
(the final clip is about 1.52 s). The ordinary walk's original leg, hip and
root timing is reused for combat walking with a guarded, stabilized upper body;
its playback rate follows travel. Blends and a vertical floor guard are applied
at runtime. These are experimental adaptations, not untouched source clips,
real contact physics or an anatomical claim.

## Character, scene, ordinary movement and code

The exact `male_leg_volume_trial.glb`, SHA-256
`eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484`,
contains the earlier `Walk_Game_Trial` and `Run_Game_Trial`, originally based
on **Quaternius — Animated Human Low Poly**, CC0. The human body uses MakeHuman
assets, and earlier skin fitting involved **ACCAD / The Ohio State University**
motion, CC BY 3.0. Detailed provenance and changes are retained in
[INHERITED_CREDITS.md](INHERITED_CREDITS.md); the crouch described at the start
of that historical notice belongs to older scenes and is not enabled here.
See the included [MakeHuman notice](LICENSE_MAKEHUMAN.md) and
[CC0 asset text](LICENSE_CC0_ASSETS.md). The unchanged well source SHA-256 is
`62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5`.

The viewer uses [Three.js](https://threejs.org/) under its
[MIT licence](LICENSE_THREE.txt). Source code, pinned dependencies, retargeting
inputs, reports and rebuild scripts are in the
[project branch](https://github.com/IAmStarhead/Blades-Of-War/tree/arena/4319905c-blades-of-war/tools/male-unarmed-combat-trial).
The project's [code](LICENSE.CODE.md) and [asset](LICENSE.ASSETS.md) licence
texts are included and do not replace third-party terms. The optional video is
a fixed-step render of this same trial, not footage of a person.
