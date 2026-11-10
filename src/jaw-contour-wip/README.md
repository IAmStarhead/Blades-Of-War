# Contour transfer study — unfinished, do not integrate

This internal trial starts with the original game head and the isolated `jaw-construction-wip` clone, then samples lower facial contours from the CC0 MakeHuman-derived `head-balance` mesh using outward-in ray intersections and blends a smoothed displacement field onto the existing game geometry. It does not attach the reference head. The original game UV coordinates, head/face texture and upper head are retained. Ears are omitted on trial only. Source and licence details: `../head-reference/README.md`.

This is not a completed head or an anatomical retopology: the profile still lacks a clean jaw-to-neck transition, the chin remains problematic, and surface and shading distortions persist. The mouth remains predominantly texture, hair and beard are hidden, and rig/animation have not been tested. It has not been integrated into game/editor and no interim screenshots are published. All original characters, models, and previous studies are unchanged.

Use Vite at `/src/jaw-contour-wip/` for continued work. The canvas patch used on the trial female texture is an independent copy, not the game texture.
