# Male ear margin masking experiment — incomplete

Left reproduces `ear-skin-trial`'s right-hand result. On the right a per-vertex alpha-test mask is applied to the upper rear part of the male ear mesh near the head surface; positions, indices and skin-colour sampling are unchanged. The female is unchanged between the copies. This is a visual mask, not a weld or deletion of geometry. Ear geometry derives from CC0 MakeHuman assets, see `../head-reference/README.md`; game characters and earlier trials are unchanged.

The margin is still visible, and a mask can introduce a hard edge or other rendering artifacts. The interior retains pale and dark discontinuities. This experiment is not a finished repair or a recommended production solution. In particular, it has not been tested under varied lighting, with hair, or in animation; sharing the head parent does not prove motion compatibility. The head and ear remain separate meshes.

Browser checks at desktop and mobile exercise controls, compare head/body/ear vertex positions and ear indices, check that female colours remain unchanged, ensure male alpha is finite and nontrivial, and confirm both ears share the head parent. `npm run verify` passes 232 tests. They do not verify artistic quality or animation. PNG comparisons and enlarged crops are under `docs/previews/ear-final-trial/`.
