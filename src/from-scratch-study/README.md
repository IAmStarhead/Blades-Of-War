# From-scratch figure experiment (not production-ready)

Two static experimental meshes generated from mathematical implicit fields in `build.py`, not based on the existing body models or the uploaded GLBs. Their volumes blend into a single extracted surface; the eyes and brows in the viewer are separate simple colored meshes. Marching cubes and automatic simplification create approximately 6,500 triangles per body. The viewer applies a stepped toon-lighting ramp without textures.

This is a rough procedural attempt, **not** an anatomically complete or manually retopologized low-poly model: faces and mouths are poorly defined, ears and feet are rudimentary, proportions and pose need work. There is no rig, clothing, animation, morph targets, or editor integration. It does not replace any saved model or standard.

Open `/src/from-scratch-study/` through Vite; screenshots are under `docs/previews/from-scratch-study/`. To regenerate the JSON, run `python src/from-scratch-study/build.py` with numpy, scipy, scikit-image and fast-simplification installed. The inputs are defined in the script; reference images are used as visual direction only.
