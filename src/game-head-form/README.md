# Game head shape and ears — isolated trial

This compares the original game's procedural head (left) with an altered clone (right) on copies of the same game characters. It changes the forehead, cheeks and back-of-skull profile and replaces the positions of the old ear disc vertices. Existing head topology, face texture, eye drawing, body, skeleton, clothes, animations, and original character code are not modified. Hair and beard remain hidden. The algorithm checks the expected input geometry layout before changing it.

This is an unfinished experiment, not a convincingly human head or a finished ear: the profile change is modest and the new ear surface is too flat and can be barely visible at some angles. It does not establish animation or hairstyle compatibility. No changes were made to gameplay or editor.

Run Vite and open `/src/game-head-form/`. Screenshots: `docs/previews/game-head-form/`.
