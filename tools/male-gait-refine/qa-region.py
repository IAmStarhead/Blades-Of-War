#!/usr/bin/env python3
"""Report sampled shoulder/hip FCL contacts and low triangle-area quantiles.

Requires numpy and python-fcl. Triangles sharing a welded vertex are excluded.
This checks only selected subsets and instants, not penetration depth, the
whole character, other clips, other poses or the time between samples.
"""
from __future__ import annotations
import argparse
import base64
import importlib.util
import json
from pathlib import Path
import numpy as np

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('geometry', root / 'tools/male-deep-crouch/qa-geometry.py')
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('samples', type=Path)
parser.add_argument('--strict', action='store_true', help='fail if any selected sample has a contact')
args = parser.parse_args()
data = json.loads(args.samples.read_text())
base = np.asarray(data['base']).reshape(-1, 3)
_, welded = np.unique(np.round(base, 6), axis=0, return_inverse=True)
groups = {key: qa.collision_group(value, welded) for key, value in data['groups'].items()}

def area(vertices, group):
    p = vertices[group[0]]
    return np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1) * .5

rest = {key: area(base, group) for key, group in groups.items()}
hits_found = False
for mode in ('walk', 'run'):
    for key, group in groups.items():
        counts, ratios = [], []
        for i in range(data['count']):
            vertices = np.frombuffer(base64.b64decode(data['states'][f'{mode}-{i}']), dtype='<f4').reshape(-1, 3).astype(float)
            obj = qa.collision_object(group, vertices)
            counts.append(len(qa.contacts(obj, obj, group, group, True)))
            good = rest[key] > 1e-10
            ratios.append(np.quantile(area(vertices, group)[good] / rest[key][good], .01))
        hits_found |= any(counts)
        print(f'{mode:4} {key:10}: contact phases {sum(x > 0 for x in counts)}/{len(counts)}, '
              f'pair total {sum(counts)}, max pairs {max(counts)}; worst per-pose 1% area ratio {min(ratios):.3f}')
print('NOTE: subset and sampled phases only; zero sampled contacts is not a whole-body or all-time guarantee.')
if args.strict and hits_found:
    raise SystemExit('Selected sampled region contacts found')
