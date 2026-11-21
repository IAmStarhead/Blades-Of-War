#!/usr/bin/env python3
"""Compare sampled hand/foot triangle intersections with the prior model.

Inputs come from tools/male-game-gait/qa-export.mjs with the same phase count.
Requires numpy and python-fcl. This only checks selected surface triangles and
sampled instants; adjacent welded triangles, full containment, penetration depth,
other regions and times between samples are not covered.
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
parser.add_argument('before', type=Path)
parser.add_argument('after', type=Path)
args = parser.parse_args()
old = json.loads(args.before.read_text())
new = json.loads(args.after.read_text())
assert old['count'] == new['count'] == 64
assert old['base'] == new['base'] and old['groups'] == new['groups'] and old['states'].keys() == new['states'].keys()
base = np.asarray(new['base']).reshape(-1, 3)
_, weld = np.unique(np.round(base, 6), axis=0, return_inverse=True)
keys = ('handL', 'handR', 'footL', 'footR', 'hip', 'kneeL', 'kneeR')
groups = {k: qa.collision_group(new['groups'][k], weld) for k in keys}

def vertices(data, name):
    return np.frombuffer(base64.b64decode(data['states'][name]), dtype='<f4').reshape(-1, 3).astype(float)

def area(points, group):
    p = points[group[0]]
    return np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1) * .5

reference = {k: area(base, groups[k]) for k in ('handL', 'handR', 'footL', 'footR')}
results = collections.defaultdict(lambda: {'before_phases': 0, 'after_phases': 0, 'new_pairs': 0, 'after_pairs': 0, 'area_p01_min': 1.0})
bad = []
for mode in ('walk', 'run'):
    for i in range(new['count']):
        name = f'{mode}-{i}'
        a, b = vertices(old, name), vertices(new, name)
        objects_a = {k: qa.collision_object(groups[k], a) for k in ('handL', 'handR', 'footL', 'footR')}
        objects_b = {k: qa.collision_object(groups[k], b) for k in keys}
        # Compare self-intersections in both hands and feet against baseline.
        for key in ('handL', 'handR', 'footL', 'footR'):
            group, obj = groups[key], objects_b[key]
            after = qa.contacts(obj, obj, group, group, True)
            before = qa.contacts(objects_a[key], objects_a[key], group, group, True)
            stats = results[(mode, key)]
            stats['before_phases'] += bool(before); stats['after_phases'] += bool(after); stats['after_pairs'] += len(after)
            novel = after - before
            stats['new_pairs'] += len(novel)
            # Require hands to be clear even if their baseline had a contact.
            if novel or (key.startswith('hand') and after): bad.append((name, key, len(novel), len(after)))
            good = reference[key] > 1e-10
            stats['area_p01_min'] = min(stats['area_p01_min'], float(np.quantile(area(b, group)[good] / reference[key][good], .01)))
            if mode == 'walk' and key.startswith('foot'):
                assert after == before, f'Unchanged walking-foot collision pairs differ: {name} {key}'
        # Arm-to-torso is checked in qa-deform.py. Also check hands against
        # the selected hip/upper-thigh and knee subsets during walking.
        if mode == 'walk':
            for hand, other in (('handL', 'hip'), ('handR', 'hip'), ('handL', 'kneeL'), ('handR', 'kneeR')):
                found = qa.contacts(objects_b[hand], objects_b[other], groups[hand], groups[other])
                results[(mode, hand + '-' + other)]['after_phases'] += bool(found)
                if found: bad.append((name, hand + '-' + other, len(found)))
for (mode, key), stat in sorted(results.items()):
    if '-' in key:
        print(f'{mode:4} {key:13}: after contact phases {stat["after_phases"]} of 64 (before not tested)')
    else:
        print(f'{mode:4} {key:13}: before/after contact phases {stat["before_phases"]}/{stat["after_phases"]} of 64; '
              f'after pairs {stat["after_pairs"]}, novel pairs {stat["new_pairs"]}; worst per-pose p01 area ratio {stat["area_p01_min"]:.3f}')
if bad:
    print('New selected contacts:', *bad[:20], sep='\n')
    raise SystemExit(f'FAIL: {len(bad)} selected sampled poses have new contacts')
print('PASS: no new selected hand/foot contacts; walking foot contact pairs match the previous GLB exactly.')
print('NOTE: selected triangles and off-key phases only, not continuous or whole-body proof.')
