# Nose shape trial

Static comparison based on the right-hand pre-bridge figures of `neck-return-trial`. Left is the previous face, right is a small nose-only surface-shape experiment for both sexes. It adds a modest bridge, rounded tip and alar volume; the female and male have slightly different projection. All head triangles are subdivided once to give the nose more samples; original geometry is unchanged and interpolated original normals are retained away from the nose as much as possible. Existing UV texture is retained: nostril marks are painted, not modeled as cavities. The existing jaw, mouth, body and restored neck shape are not intentionally modified. The change is deliberately subtle, not claimed as a finished likeness to references.

The prior head uses a CC0 MakeHuman-derived contour reference, see `../head-reference/README.md`; the user-provided face anatomy images were consulted for front/profile form. The overlapping head-neck junction remains visible and animation is not tested. Hair, ears and beard are hidden in the study. No game models, previous versions or editor presets are replaced.

Vite URL `/src/nose-form-trial/`, screenshots `docs/previews/nose-form-trial/`, structural check `node tests/nose-form-trial.mjs` (not an artistic evaluation).
