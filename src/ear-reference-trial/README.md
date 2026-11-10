# Anatomical ear extraction experiment — unfinished

Static comparison: left is the rejected `ear-anatomy-trial`, right attempts to extract only ear regions from the CC0 MakeHuman-derived head mesh used by `head-balance` and fit them to copies of the original game figures. The whole reference head is not attached. The reference asset provenance and CC0 license are documented in `../head-reference/README.md`. The nose and pre-bridge neck are inherited from `straight-nose-trial`.

This is **not an approved or production-ready ear**. The ear region is selected from a simplified continuous head by triangle position, so cropped borders and isolated/jagged triangles are visible, and portions may intersect the game head. It is a separate attachment, not welded, with a fixed material. Ear/head shape and colour still need fitting; lighting and poses can expose more issues. The user rejected previous flat/ring-like ears; this experiment has not solved seamless integration. Only static views and basic finite geometry/UI were checked, not game animation. Existing game characters, previous heads and studies are unchanged.

Vite URL `/src/ear-reference-trial/`, screenshots `docs/previews/ear-reference-trial/`.
