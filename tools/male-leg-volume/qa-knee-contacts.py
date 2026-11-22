#!/usr/bin/env python3
"""Compare before/after FCL knee surface crossings in discrete viewer poses.

Only selected knee triangles and listed times are tested. Shared welded
vertices are excluded; collision depth, enclosure, and other surfaces or
instants are not checked. Requires NumPy and python-fcl.
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
parser.add_argument('samples', type=Path)
parser.add_argument('--report', type=Path)
args = parser.parse_args()
data = json.loads(args.samples.read_text())
base = np.asarray(data['base']).reshape(-1, 3)
_, weld = np.unique(np.round(base, 6), axis=0, return_inverse=True)
groups = {k: qa.collision_group(data['groups'][k], weld) for k in ('kneeL', 'kneeR')}

def triangle_areas(vertices, faces):
    p = vertices[faces]
    return .5 * np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1)

rest_areas = {key: triangle_areas(base, g[0]) for key, g in groups.items()}
valid = {key: a > 1e-10 for key, a in rest_areas.items()}
report = {key: {'poses': 0, 'beforeHitPoses': 0, 'afterHitPoses': 0, 'newHitPoses': 0,
                'beforePairs': 0, 'afterPairs': 0, 'newPairs': 0, 'minimumAreaRatioBefore': 1., 'minimumAreaRatioAfter': 1.,
                'examples': []} for key in groups}
for state in data['states']:
    vertices = {mode: np.frombuffer(base64.b64decode(state[mode]), dtype='<f4').reshape(-1, 3).astype(float)
                for mode in ('before', 'after')}
    for key, group in groups.items():
        found = {}
        for mode in ('before', 'after'):
            obj = qa.collision_object(group, vertices[mode])
            found[mode] = qa.contacts(obj, obj, group, group, True)
        new = found['after'] - found['before']
        r = report[key]
        r['poses'] += 1
        r['beforeHitPoses'] += bool(found['before']); r['afterHitPoses'] += bool(found['after']); r['newHitPoses'] += bool(new)
        r['beforePairs'] += len(found['before']); r['afterPairs'] += len(found['after']); r['newPairs'] += len(new)
        for mode in ('before', 'after'):
            a = triangle_areas(vertices[mode], group[0]); ratio = a[valid[key]] / rest_areas[key][valid[key]]
            field = 'minimumAreaRatio' + mode.title(); r[field] = min(r[field], float(np.min(ratio)))
        if new and len(r['examples']) < 10:
            r['examples'].append({'pose': state['metadata'], 'newPairs': len(new)})
assert data['count'] == len(data['states']) == 577
for key, r in report.items():
    print(f"{key}: {r['poses']} paired poses, hit poses before/after/new "
          f"{r['beforeHitPoses']}/{r['afterHitPoses']}/{r['newHitPoses']}; "
          f"pairs before/after/new {r['beforePairs']}/{r['afterPairs']}/{r['newPairs']}; "
          f"minimum triangle area ratio {r['minimumAreaRatioBefore']:.4f}/{r['minimumAreaRatioAfter']:.4f}")
    if r['newHitPoses']:
        print('New contact examples:', r['examples'])
        raise AssertionError('Corrected knee has new sampled non-neighbouring contacts')
    if r['minimumAreaRatioAfter'] < .30 or r['minimumAreaRatioAfter'] < r['minimumAreaRatioBefore'] - 1e-5:
        raise AssertionError('The worst sampled knee triangle area fell below the baseline or the 30% threshold')
if args.report:
    args.report.write_text(json.dumps(report, indent=2) + '\n')
print('PASS: no new non-neighbouring knee triangle crossings; worst sampled triangle area is at least 30% of rest and not worse than the baseline minimum.')
print('NOTE: selected surface triangles only; no continuous-time or whole-body collision guarantee.')
