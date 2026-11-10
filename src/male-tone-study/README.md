# Male tone study (experimental)

Run Vite and open `/src/male-tone-study/`. Independent scene: newly generated section-based head and simple ellipsoid body parts, no game character or prior study assets. Controls change angle, light, distance and disable the painted face. Original models remain untouched.

The toon material uses a linearly filtered eight-value gradient ramp and directional + ambient light. Canvas face texture uses soft radial tonal patches and deliberately simple dark eyes and mouth; the shadows on the texture do not move with the light. There is no screen-space blur, outline, shadow map, rig, animation or production model. Ears and body are placeholders. Lighting is approximate and the simple primitive joints are visible. The result is not anatomically or artistically finished; the low-detail body looks assembled, ears lack anatomy, neck joins are crude, and the facial tones/eyes still read as schematic. More work is needed before any integration.

Desktop and mobile Chromium screenshots cover frontal, three-quarter and profile, full body, face without paint and opposite light. `npm run verify`: 232/232; this does not assess artistic quality or model deformation. Visual inspiration: https://reddit.com/r/projectzomboid/comments/1v1nd3r/lf_mods_that_add_more_female_vanilla_face_options (may show custom/modded options; no assets copied).
