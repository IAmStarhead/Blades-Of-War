# Higher neck transition experiment — not accepted

Isolated side-by-side follow-up to `head-refinement-trial`: the left uses that trial; the right trims only the highest ring of the copied body neck and constructs a surface between the next (higher than in `neck-bridge-trial`) body ring and the head underside. Ring coordinates are interpolated, not an actual shared-vertex weld. The face shapes and lips are kept from the prior trial; neck width is retained, not deliberately shortened. The test uses the known original north figure's tube layout and is not a generic topology algorithm.

This is not an improvement to present as finished: in profile there is still a sharp horizontal step at the rear of the neck and under-jaw shading is awkward. Separate head/body materials and skinning remain; the bridge is rigidly head-attached and has not been tested in animation. Do not integrate. Hair and ears are hidden on the trial copies. The original game characters and earlier trials are untouched. See `../head-reference/README.md` for the CC0 reference source used for the existing jaw deformation.

Open `/src/neck-transition-trial/` with Vite; screenshots are in `docs/previews/neck-transition-trial/`. The automated check validates matching ring coordinates and isolation, not visual quality or animation.
