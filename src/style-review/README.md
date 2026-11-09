# Style and proportion comparison

This is an isolated, static comparison alongside the existing game well, not a character editor or a replacement for the existing characters. Left is the untouched body-study standard. Three view modes compare:

* **Woman: style trial:** right uses approximately 9,500 triangles and a Lambert material, plus a local adjustment that gently raises the pelvis and upper legs and reduces hip width and posterior projection. Eyes/brows remain temporary guides.
* **Woman: proportions only:** right uses the original 16,000-triangle topology and original material, with exactly the same local proportion adjustment. Feet and upper torso remain fixed vertically; the pose and silhouette changes are only a provisional sculptural experiment.
* **Man:** right uses the simplified 9,500-triangle mesh and Lambert material; no intentional male proportion deformation is applied. Decimation may cause small surface differences.

The original body study and the game well are not edited. Both sides share the same scene lighting, but use different material models in the style comparison, so appearance differences are not caused by shape alone. The style trial is deliberately subtle, not a complete art direction. The meshes derive from CC0 MakeHuman assets; see `../body-study/README.md` for attribution and limitations. `tools/build-style-review.py` reproduces the additional mesh simplification; the woman adjustment runs separately in `proportions.js`. The body study remains static and has no rig or animations.

Run Vite and open `/src/style-review/`; the browser captures are under `docs/previews/style-review/`.
