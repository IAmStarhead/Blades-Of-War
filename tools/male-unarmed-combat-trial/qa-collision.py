#!/usr/bin/env python3
"""Report discrete contacts between selected hand, foot and body regions.

Uses NumPy and python-fcl. Samples come from this trial's export-collision.mjs,
which evaluates the actual Three.js morphs and skinning. Self-collisions of a
closed fist are intentionally not tested. These selected pairs are not a proof
of collision-free movement and do not measure depth.
"""
from __future__ import annotations
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('qa_geometry', ROOT / 'tools/male-deep-crouch/qa-geometry.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('samples', type=Path, help='scratch JSON from export-collision-samples.mjs')
parser.add_argument('--report', type=Path, help='optional small JSON report')
parser.add_argument('--strict', action='store_true', help='fail if any selected contacts are found')
args = parser.parse_args()
data = json.loads(args.samples.read_text())
base = np.asarray(data['base']).reshape(-1, 3)
_, welded = np.unique(np.round(base, 6), axis=0, return_inverse=True)
keys = ('handL', 'handR', 'footL', 'footR', 'hip', 'kneeL', 'kneeR', 'torso', 'head')
groups = {key: qa.collision_group(data['groups'][key], welded) for key in keys}
# Closed fists have intentional neighbouring finger contacts; avoid a huge,
# misleading self-collision test. Check selected non-adjacent body regions.
# These pairs and samples do not cover the whole mesh.
tests = [
    ('handL', 'hip'), ('handR', 'hip'), ('handL', 'kneeL'), ('handR', 'kneeR'),
    ('handL', 'kneeR'), ('handR', 'kneeL'), ('handL', 'handR'),
    ('handL', 'footL'), ('handL', 'footR'), ('handR', 'footL'), ('handR', 'footR'),
    ('footL', 'footR'), ('kneeL', 'kneeR'),
    ('handL', 'torso'), ('handR', 'torso'), ('handL', 'head'), ('handR', 'head'),
]
stats = {a if a == b else f'{a}-{b}': {'poses': 0, 'pairs': 0, 'max': 0, 'examples': []} for a, b in tests}
for name, raw in data['states'].items():
    vertices = np.frombuffer(base64.b64decode(raw), dtype='<f4').reshape(-1, 3).astype(float)
    objects = {key: qa.collision_object(groups[key], vertices) for key in keys}
    for a, b in tests:
        found = qa.contacts(objects[a], objects[b], groups[a], groups[b], a == b)
        stat = stats[a if a == b else f'{a}-{b}']
        if found:
            stat['poses'] += 1
            stat['pairs'] += len(found)
            stat['max'] = max(stat['max'], len(found))
            if len(stat['examples']) < 4:
                stat['examples'].append({'name': name, 'pose': data['poses'][name], 'pairs': len(found)})
for name, result in stats.items():
    print(f"{name:14} contact poses {result['poses']}/{data['count']}, pairs {result['pairs']}, max {result['max']}")
report = {'htmlSha256': data.get('htmlSha256'), 'count': data['count'], 'vertices': len(data['sourceVertexIds']),
          'scope': 'Only selected hand, foot, hip, knee, torso and head surfaces and discrete poses; not all body regions or motion. Contact depth is not measured.',
          'method': data['method'], 'tests': stats}
if args.report:
    target = args.report.resolve()
    allowed = (ROOT / 'work/male-unarmed-combat-trial/collision-report.json').resolve()
    if target != allowed and (target == ROOT or ROOT in target.parents):
        raise SystemExit('Refusing to replace an unrelated repository artifact')
    target.write_text(json.dumps(report, indent=2) + '\n')
print('Sampled regions:', 'contacts found' if any(x['poses'] for x in stats.values()) else 'no contacts found')
if args.strict and any(x['poses'] for x in stats.values()):
    raise SystemExit(1)
