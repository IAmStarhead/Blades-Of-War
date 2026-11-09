# Appearance workbench — partial prototype

Separate from the previous editor and game characters. Uses the CC0-derived neutral-study pair (see `../body-study/README.md` for attribution). Height scales the whole figure; build changes selected body volumes and muscle changes upper-arm volume; these are simple experimental geometric deformations, not simulated weight or anatomical muscle. Bust is female-only and skin color changes the material. All modifications recompute from a saved posed base; no accumulative drift. Arms remain the static neutral-study pose. JSON export is schema version 2 and is not automatically imported into the game or previous editor.

The loose short tunic is a temporary separate mesh to cover the body, not an accurate medieval garment, not rigged, and not selectable. It does not adapt fully to extremes. There is no rig, posing, face controls/animation, scars, hair, beard, equipment selection, age or body-weight simulation. This is not a complete character editor. These require additional assets and tests. Previous standards/editor remain unchanged.

Open `/src/appearance-workbench/` via Vite. JSON download must be sent to the chat by the user; it is not automatically remembered.
