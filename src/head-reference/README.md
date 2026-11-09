# Isolated anatomical head trial

Three pairs of bald heads for visual review. This is not integrated into the game. The three variants share the same source meshes and differ only by modest width, depth and jaw scaling; they are not three independent sculpts or likenesses of the supplied photographs. The photos informed the intended human proportions, not a reconstruction from photo data. The female base has not been fitted to the earlier female photo reference.

`anatomical-heads.json` is derived from [MakeHuman Community](https://github.com/makehumancommunity/makehuman) `data/3dobjs/base.obj` and the `caucasian-female-young` and `caucasian-male-young` targets. These assets are released as [CC0](https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md); no MakeHuman program code is included. The head/neck region was extracted, simplified to about 2,200 triangles per head, lightly smoothed and cut on a flat plane. Eyes are separate embedded meshes. Material is neutral; hair and textures are absent. This is a study, not a finished game asset: it has not been fitted to the game's skeleton, clothing or animation.

Run Vite and open `/src/head-reference/` for the interactive scene. Captures are in `docs/previews/reference-heads/`.
