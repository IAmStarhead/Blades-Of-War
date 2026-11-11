# Facial planes experiment

Separate visual comparison from the accepted female-chin-forward version (left). Right adds broad symmetric, bounded geometric changes to temple/side of skull and cheek, under-eye and beside-nose areas, with adjusted normals. It does not change the ear geometry or tint; ears remain separate meshes. Face texture, body and accepted chin are unchanged. No original game assets or presets are replaced.

This is not a finished sculpt: some vertical shading appears under the eye and around the nose; the side of the head can reveal the separate ear junction in profile. Difference is subtle from some views, and ear interiors were not revised. These are reasons not to integrate it without visual review. `node tests/facial-planes-neck-trial.mjs` checks bounded changes and finite normals; `npm run verify` passed 232/232. Neither establishes visual quality.

The neck seam has NOT been fixed in this trial. It uses the accepted neck rather than the previous failed normal-blending experiment; separate rigid head and skinned body still intersect. The comparisons include static turn and tilt poses, not an animation-cycle validation. A true continuous connection requires compatible topology and skinning; previous automatic bridges produced collars, so no new bridge is claimed here.

Open `/src/facial-planes-neck-trial/` in Vite; PNGs are in `docs/previews/facial-planes-neck-trial/`.
