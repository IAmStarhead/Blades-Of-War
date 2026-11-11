# Upper ear spot / overlap-strip diagnostic

Left recreates `ear-old-front-new-profile-trial` (63cb14d). Right omits newly generated upper root-strip segments whose midpoint is in a limited y/z region on both ears and sexes. Original ear triangles, facial features, and lower lobes are not removed. The unchanged remainder of the strip still overlaps the head: it is not a weld.

A three-quarter raycast near a female dark area hit several newly appended root-strip faces, but this alone did not establish the cause of the complete spot. Omitting some strip segments makes the dot lighter in the female enlarged crop and in male profile; the dot does not disappear reliably, and in male front a new conspicuous light spot appears. Removing a strip segment can expose a gap: this is an unsuccessful diagnostic, not a defect-free repair or candidate for integration. The other ear seams and white artifacts remain. The reference-frame dependency on `female-chin-forward-trial` is retained from the preceding comparison; full animation is untested. Original game models are unchanged.

Screenshots at `docs/previews/ear-profile-speck-check-trial/`. `node tests/ear-profile-speck-check-trial.mjs` checks synthetic strip omission and unchanged original vertices, not actual surface closure, visual quality or animation. Source provenance: `../head-reference/README.md`.
