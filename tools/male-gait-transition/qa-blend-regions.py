#!/usr/bin/env python3
"""Check selected hand/foot self and hand/hip/knee surfaces in blend samples.

Requires NumPy and python-fcl. Only these triangles and discrete poses are
covered; adjacent welded faces, enclosed surfaces and depth are not measured.
The inherited walking foot has known local self contacts, so feet are reported
rather than silently declared clear. Use --strict-hands to reject hand hits.
"""
from __future__ import annotations
import argparse
import base64
import collections
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('qa_geometry', ROOT / 'tools/male-deep-crouch/qa-geometry.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('samples', type=Path)
parser.add_argument('--strict-hands', action='store_true')
args = parser.parse_args()
data = json.loads(args.samples.read_text())
base = np.asarray(data['base']).reshape(-1, 3)
_, weld = np.unique(np.round(base, 6), axis=0, return_inverse=True)
keys = ('handL', 'handR', 'footL', 'footR', 'hip', 'kneeL', 'kneeR')
groups = {k: qa.collision_group(data['groups'][k], weld) for k in keys}
tests = [(key, key) for key in ('handL', 'handR', 'footL', 'footR')] + [
    ('handL', 'hip'), ('handR', 'hip'), ('handL', 'kneeL'), ('handR', 'kneeR')]
stats = collections.defaultdict(lambda: {'poses': 0, 'pairs': 0, 'max': 0, 'examples': []})
for name, raw in data['states'].items():
    vertices = np.frombuffer(base64.b64decode(raw), dtype='<f4').reshape(-1, 3).astype(float)
    objects = {k: qa.collision_object(groups[k], vertices) for k in keys}
    for a, b in tests:
        found = qa.contacts(objects[a], objects[b], groups[a], groups[b], a == b)
        key = a if a == b else f'{a}-{b}'
        stat = stats[key]
        if found:
            stat['poses'] += 1
            stat['pairs'] += len(found)
            stat['max'] = max(stat['max'], len(found))
            if len(stat['examples']) < 4:
                stat['examples'].append((name, data['poses'][name], len(found)))
for key, stat in sorted(stats.items()):
    print(f'{key:13}: contact poses {stat["poses"]}/{data["count"]}, total pairs {stat["pairs"]}, max {stat["max"]}, examples {stat["examples"]}')
if args.strict_hands and any(stat['poses'] for key, stat in stats.items() if key.startswith('hand')):
    raise SystemExit('FAIL: selected hand surfaces have sampled contacts')
print('PASS selected hands' if args.strict_hands else 'Reported selected contacts')
print('NOTE: feet are reported separately; sampled intersections do not measure depth or visual prominence.')
