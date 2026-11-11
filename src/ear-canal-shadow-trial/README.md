# Canal entrance shading trial

The earlier broad inner-bowl tint was not what was requested. Both comparison columns here start from the accepted ear color-balance baseline, with uncut female lobe. The right column adds a small painted indication near the entrance of the auditory canal rather than shading the whole bowl: on the female ear, vertex colors; on the male, a cloned head texture because the head overlaps the ear there. No actual hole is cut, no geometry or indices are changed, and the marks do not react to the light source.

The female mark is visible but its exact placement remains subjective; the male effect is barely visible, partially occluded by the overlapping geometry. This is not a finished anatomical canal or a welded ear. The symmetric male UV marks may appear differently on opposite sides. Full animation is not tested. The original game models are unchanged.

Preview `/src/ear-canal-shadow-trial/` in Vite; images under `docs/previews/ear-canal-shadow-trial/`. `node tests/ear-canal-shadow-trial.mjs` checks localization and topology for the female tint, not visual placement or the male canvas texture. Ear source: `../head-reference/README.md`.
