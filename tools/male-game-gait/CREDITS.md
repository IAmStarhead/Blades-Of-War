# Credits and modifications

## New motion source

**Quaternius — Animated Human Low Poly (2017)**. The creator's [OpenGameArt listing](https://opengameart.org/content/animated-human-low-poly) names walk and run among the included animations and identifies the pack as [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

The input used here is the `assets/models/character.glb` conversion in [dfayd0/n3d2 at commit `9f2ccc2770d69a49b63e5d5184a1206cf547ef76`](https://github.com/dfayd0/n3d2/tree/9f2ccc2770d69a49b63e5d5184a1206cf547ef76/assets/models). That mirror attributes the character to Quaternius, states CC0, and describes an FBX→glTF conversion. Its SHA-256 is `ce4d543e82e455d5a1253798c9759f12b9eec74929ddbca464447eeaa3a42c5d`. The mirror's converted file has not been byte-compared with the original OpenGameArt archive. In this repository the source is preserved at `tools/male-game-gait/source/character.glb`.

**Changes:** `Human Armature|Walk` and `Human Armature|Run` were retargeted from the source bind reference to the existing character, reshaped at the limbs and clavicles, vertically adjusted, and looped; the run timing was lengthened by 10%. Average horizontal travel is absent. These clips are adaptations, not unchanged stock animations. The source's separate character mesh is not used in the delivered GLB.

## Character and inherited fitting

The character mesh, rig, inverse binds, textures and skin weights are retained from `work/male-gait-refine/male_gait_C_refined.glb` (SHA-256 `c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013`). Its prior walk and run channels and their unused accessors were removed from this GLB; the new walk and run come from the Quaternius source above.

That earlier C model's shoulder and hip skin fitting was developed against motions from **Open Motion Project — ACCAD / The Ohio State University**, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), <https://accad.osu.edu/research/motion-lab/mocap-system-and-data>. Inherited attribution and source details are retained conservatively: the previous C used `Male2_B3_Walk`, `Male2_C3_Run` and the first frame of `Male2_B1_StandToWalk`, as documented in `work/male-gait-refine/CREDITS.md`. The motion fragments were looped, reoriented, retargeted and adjusted; the shared skin weights were also adjusted. The current GLB does not contain those old animation tracks.

The body and rig use MakeHuman assets marked CC0 (`LICENSE_MAKEHUMAN.md`); the inherited face and ears have the CC0 notice in `LICENSE_CC0_ASSETS.md`. Viewer: Three.js, MIT (`LICENSE_THREE.txt`). The videos are renders of this adapted character; no encoder is distributed. These notices do not determine the license of the entire game.
