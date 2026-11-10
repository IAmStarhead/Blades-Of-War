# Head / neck bridge — visual experiment, not production-ready

Comparison on cloned original game figures: the left is the previous `jaw-neck-trial`, the right tests a physical bridging surface between the reshaped head and the body neck. The trial trims top neck triangles from the cloned torso and adds a band from a remaining head ring to an interpolated body ring. The head texture clone is adjusted near the bridge to reduce the skin-colour discontinuity. This is not an exact vertex weld or a unified skinned mesh: the body ring has 20 segments and the head uses 64 interpolated vertices, and the bridge is attached rigidly to the head bone. The head and torso retain separate materials. There is no demonstrated compatibility with animation or head rotation.

The reference-derived jaw contour and provenance are described in `../jaw-reference-trial/README.md`. The original game models and all previous heads are unchanged; no integration into game/editor. The neck looks too short and stiff in this test and a horizontal transition remains visible, so this is not a finished solution. Hair, beard and ears remain hidden in the visual trial.

Open `/src/neck-bridge-trial/` through Vite. Screenshots are in `docs/previews/neck-bridge-trial/`. `tests/neck-bridge-trial.mjs` checks cloned inputs, finite geometry and height alignment only, not visual quality or animation.
