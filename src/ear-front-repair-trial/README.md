# Ear front-view repair trial

In earlier front-view screenshots, visible breaks already occurred; they did not start with the first/last comparison. In this comparison the left retains the latest male-ear-artifact trial. Right retains more of the source ear patch: the earlier `trimRearFlap` removed faces below y=.081, while the partial trim removes them only below y=.075. Both female ears copy their corresponding male ear shape as in the prior trial, so the same change applies to both sexes. This brings back some original polygons rather than painting over the opening. Faces and neck are not intentionally changed.

The dark horizontal openings are reduced in frontal static views, but a light horizontal strip and angular upper edges remain. Some rear material returns and can be visible in profile, particularly on the opposite side. Ear and head remain separate overlapping meshes; this is not a weld and is not a completed fix. Female lobe is not cropped. The ear-shading and head-neck seams remain experimental; full animation is untested. Not integrated into game.

View `/src/ear-front-repair-trial/` under Vite. Screenshots include front, profiles, three-quarter and two static head poses for both sexes. `node tests/ear-front-repair-trial.mjs` checks the partial trim with synthetic triangles and unchanged vertex positions; visual and animation quality require review.
