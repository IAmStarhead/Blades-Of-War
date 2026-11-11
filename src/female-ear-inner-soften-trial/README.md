# Female inner-ear smoothing trial

Left matches `ear-root-mesh-repair-trial` (183ded6). Right relaxes interior vertices in a tapered ellipsoidal region of each female ear before recreating the same upper-root overlap strip; ten small neighbour-averaging passes, each capped at .00025 local units. Open-boundary vertices are held fixed, and lobe, ear indices, head, male ears and game originals are unchanged. A local differential normal adjustment preserves the baseline normal field outside the deformation.

The difference is subtle, especially front-on; in the enlarged three-quarter image the inner surface is somewhat softer but a dark, uneven boundary and the edge below the lobe remain. It is not a welded head/ear or a finished anatomical ear. The strip still overlaps the head and may show lines from other angles; full animation is untested. Do not integrate without review.

Open `/src/female-ear-inner-soften-trial/` in Vite; comparison images and enlarged crops in `docs/previews/female-ear-inner-soften-trial/`. `node tests/female-ear-inner-soften-trial.mjs` checks synthetic boundary preservation, indices, finite normals and step limit; visual quality requires review. Ear origin: `../head-reference/README.md`.
