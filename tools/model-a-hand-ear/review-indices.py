#!/usr/bin/env python3
"""Print hand-only triangle indices for honest, labelled review renders."""
from __future__ import annotations

import json
import numpy as np
import build

source = build.motion.checked(build.DEFAULT_SOURCE, build.SOURCE_SHA256, 'approved motion model')
doc, binary = build.helpers.read_glb(source)
p = build.helpers.accessor(doc, binary, 0).astype(float)
uv = build.helpers.accessor(doc, binary, 2)
rig = build.motion.checked(build.motion.DEFAULT_RIG, build.motion.RIG_SHA256, 'reference hand rig')
_, _, _, names, joints, weights, *_ = build.motion.rig_inputs(rig, p, uv)
faces = np.concatenate([build.helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
faces = faces[np.all(faces < build.motion.ORIGINAL_VERTICES, axis=1)]
result = {}
for side in ('L', 'R'):
    ids = [i for i, name in enumerate(names) if name.endswith('_' + side)
           and name.startswith(('wrist', 'metacarpal', 'finger'))]
    w = (weights * np.isin(joints, ids)).sum(axis=1)
    selected = faces[(w[faces].mean(axis=1) > .25) & (p[faces][:, :, 1].mean(axis=1) < .842)]
    result[side] = selected.reshape(-1).tolist()
print(json.dumps(result, separators=(',', ':')))
