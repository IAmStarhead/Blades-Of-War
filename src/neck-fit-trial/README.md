# Neck fit trial — static comparison, unfinished

On the left is the preceding higher `neck-transition-trial` bridge. On the right a lower body ring is used instead, as in the earlier `neck-bridge-trial`, and the bridge boundary normals are interpolated from the body ring. This reduces the projecting collar-like edge, but reintroduces a short-looking stiff neck and a noticeable transition under the jaw. It is a compromise, not an anatomical or production-ready solution. Face shape, lip texture and body proportions are inherited from `head-refinement-trial`.

The body and head are still separate meshes with distinct materials; the connecting band is rigidly attached to the head and does not share topology or skin weights with the body. Animation and head turns are not validated. The fixed ring indices assume the original north figure's topology. The trial only changes copies: original models and earlier trials are preserved and nothing is integrated. Hair and ears are hidden in the trial. See `../head-reference/README.md` for the CC0 source used for the prior jaw contour.

Vite URL `/src/neck-fit-trial/`, screenshots `docs/previews/neck-fit-trial/`, structural check `node tests/neck-fit-trial.mjs`. Technical checks do not assess artistic quality or animated deformation.
