#!/usr/bin/env python3
"""Selected hip-triangle self-contact sampling; not a full collision guarantee.

Requires numpy and python-fcl. Run qa-hip-export.mjs first. Only the specified
triangles and sampled moments are considered; adjacency is ignored, and contact
depth, other body regions, separate head meshes and intervals are not checked.
"""
import base64
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('geometry_qa', ROOT / 'tools/male-deep-crouch/qa-geometry.py')
q = importlib.util.module_from_spec(spec)
spec.loader.exec_module(q)
data = json.loads(Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/bow-posture-hip-samples.json').read_text())
base = np.array(data['base']).reshape(-1, 3)
_, welds = np.unique(np.round(base, 6), axis=0, return_inverse=True)
group = q.collision_group(data['faces'], welds)
for mode in ('walk', 'run'):
    hits = []
    for i in range(data['count']):
        vertices = np.frombuffer(base64.b64decode(data['states'][f'{mode}-{i}']), dtype='<f4').reshape(-1, 3).astype(float)
        obj = q.collision_object(group, vertices)
        hits.append(len(q.contacts(obj, obj, group, group, True)))
    print(f'{mode}: {sum(x > 0 for x in hits)}/{data["count"]} sampled phases with selected hip-triangle contacts; maximum {max(hits)}')
    if any(hits):
        raise AssertionError(f'Selected hip surface had contacts: {mode}')
print('NOTE: excludes other surfaces, face/ears, penetration depth, other animations, and time between samples.')
