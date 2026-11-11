# Upper ear rounding trial

Left is the partial-patch restoration from `ear-front-repair-trial`. Right relaxes the existing upper ear mesh only, gradually above local y=.087; eight bounded neighbour-average steps and a local differential normal adjustment. Both male and copied female ears are affected, including both sides. The lower lobe vertices, ear indices, head mesh, faces and original game models are not modified. No triangles are added or removed in this pass.

Static frontal images show softened upper contours but remaining angular edges, a light horizontal strip and the ear/head separation. Profile still shows a small rear fragment; the upper contour has changed slightly. The ears are separate intersecting meshes, not welded. This is not a fully smooth or finished result and no full animation cycle was tested. PNGs for front, profiles, three-quarter, light and static turn/tilt are in `docs/previews/ear-front-rounding-trial/`; compare in Vite at `/src/ear-front-rounding-trial/`.

`node tests/ear-front-rounding-trial.mjs` checks a synthetic mesh for preserved indices, untouched lower vertices and finite normals; it does not validate appearance or animation. Source ear provenance: `../head-reference/README.md`.
