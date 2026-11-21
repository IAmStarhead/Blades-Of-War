# Transition trial

This trial uses the exact `male_hands_airfoot_trial.glb` (SHA-256 `576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf`) without changing its contents. The viewer phase-locks and blends those clips at runtime; the vertical floor guard and transition are not baked into the GLB. The inherited credits are below.

---

# Credits and modifications

This follow-up starts from `work/male-gait-limbs/male_feet_arms_trial.glb`, SHA-256 `9dd20ca505bf5194cd9ab3bf0034343cd134db400a4b907cd0a51caad32ef83e`. It adds gentle walking finger rotations and adjusts only the running feet while they are raised behind the body. The other animation tracks, clip timing, rest pose, body, rig and skin are retained. Toes inherit their parents' changed motion; wrists and arms keep the previous motion. No horizontal foot lock was added. The preceding feet-and-arms trial itself came from `work/male-game-gait/male_game_gait_trial.glb`, SHA-256 `844de26eb624dcb6b630157dda1227b6be2c54e4654c35d086c74149be26f45a`.

## Motion source

**Quaternius — Animated Human Low Poly (2017)**. The creator's [OpenGameArt listing](https://opengameart.org/content/animated-human-low-poly) names walk and run among the included animations and identifies the pack as [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The original input was the `assets/models/character.glb` conversion in [dfayd0/n3d2 at commit `9f2ccc2770d69a49b63e5d5184a1206cf547ef76`](https://github.com/dfayd0/n3d2/tree/9f2ccc2770d69a49b63e5d5184a1206cf547ef76/assets/models). That mirror attributes the character to Quaternius, states CC0, and describes an FBX→glTF conversion. Its SHA-256 is `ce4d543e82e455d5a1253798c9759f12b9eec74929ddbca464447eeaa3a42c5d`. The mirror's converted file has not been byte-compared with the original OpenGameArt archive. The source is preserved in this repository at `tools/male-game-gait/source/character.glb`.

The earlier game-gait trial retargeted, reshaped, vertically adjusted and looped `Human Armature|Walk` and `Human Armature|Run` for this character; its run timing was lengthened by 10%. The previous follow-up adjusted the feet and walking upper arms; the present one adjusts the walking fingers and rear-flight foot angles as described above. These clips are adaptations, not unchanged stock animations. The source's separate character mesh is not in the delivered GLB.

## Character and inherited fitting

The body, rig, inverse binds, textures and skin weights were inherited via the previous game-gait trial from `work/male-gait-refine/male_gait_C_refined.glb` (SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`).

That earlier C model's shoulder and hip skin fitting was developed against motions from **Open Motion Project — ACCAD / The Ohio State University**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>. Inherited attribution is retained conservatively: the earlier C used `Male2_B3_Walk`, `Male2_C3_Run` and the first frame of `Male2_B1_StandToWalk`, as documented in `work/male-gait-refine/CREDITS.md`. The motion fragments were looped, reoriented, retargeted and adjusted; the shared skin weights were also adjusted. The current GLB does not contain those old animation tracks.

The body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); the inherited face and ears have the CC0 notice in `LICENSE_CC0_ASSETS.md`. Viewer: Three.js, MIT (`LICENSE_THREE.txt`). The videos render this adapted character; no encoder is distributed. These notices do not determine the license of the entire game.
