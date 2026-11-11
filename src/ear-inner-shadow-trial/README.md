# Inner ear shadow trial

Independent comparison: left is the accepted ear-skin-color-balance baseline (including the uncut female lobe); right adds a soft localized vertex-color tint inside each ear for both figures. Geometry, indices, faces, neck and game assets are not altered. The tint is static rather than a dynamic cast shadow. Ear and scalp still overlap, which can hide part of the tint; the visible result is subtle and the attachment remains unfinished. Full animation has not been verified.

Anatomical reference: [Muusart, ear side-view shading](https://muusart.com/blog/draw-an-ear-from-the-side/) describes the deepest shading around the ear opening/concha and soft transitions under the cartilage. [Stelava, light and shadow](https://www.stelava.com/blogs/wall-art/mastering-the-art-of-drawing-ears-a-complete-step-by-step-tutorial) describes a recessed concha and raised antihelix. This trial suggests that depth without outlining the rim or darkening the lobe. The original ear geometry comes from the CC0 source documented in `../head-reference/README.md`.

Run via Vite at `/src/ear-inner-shadow-trial/`; screenshots are in `docs/previews/ear-inner-shadow-trial/`. `node tests/ear-inner-shadow-trial.mjs` tests localization, finite colors and unchanged positions/indices; it does not evaluate appearance.
