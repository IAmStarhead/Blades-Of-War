#!/usr/bin/env python3
"""Check selected hip/leg and hand/body triangle pairs using python-fcl.

Input comes from qa-geometry-export.mjs. Adjacent faces sharing a welded bind
vertex are ignored. The test is limited to specified body regions and discrete
poses and does not establish overall anatomical correctness.
"""
from __future__ import annotations
import base64
import collections
import json
import sys
import numpy as np
import fcl

path = sys.argv[1] if len(sys.argv) > 1 else '/tmp/bow-library-geometry.json'
D = json.load(open(path, encoding='utf-8'))
base = np.array(D['base']).reshape(-1, 3)
_, weld = np.unique(np.round(base, 6), axis=0, return_inverse=True)


def group(a):
    faces = np.array(a, np.int32).reshape(-1, 3)
    ids, loc = np.unique(faces, return_inverse=True)
    return faces, ids, loc.reshape(-1, 3).astype(np.int32), weld[faces]


groups = {k: group(v) for k, v in D['groups'].items()}


def obj(g, vertices):
    faces, ids, local, _ = g
    model = fcl.BVHModel()
    model.beginModel(len(ids), len(faces))
    model.addSubModel(np.ascontiguousarray(vertices[ids]), local)
    model.endModel()
    return fcl.CollisionObject(model)


def hits(a, b, ga, gb, same=False):
    result = fcl.CollisionResult()
    fcl.collide(a, b, fcl.CollisionRequest(num_max_contacts=100000, enable_contact=True), result)
    contacts = result.contacts
    if not contacts:
        return set()
    i = np.array([x.b1 for x in contacts])
    j = np.array([x.b2 for x in contacts])
    valid = ~np.any(ga[3][i, :, None] == gb[3][j, None, :], axis=(1, 2))
    if same:
        valid &= i != j
    return {tuple(sorted((int(x), int(y)))) if same else (int(x), int(y)) for x, y in zip(i[valid], j[valid])}


def area(vertices, faces):
    x = vertices[faces]
    return np.linalg.norm(np.cross(x[:, 1] - x[:, 0], x[:, 2] - x[:, 0]), axis=1) * .5


F = groups['hip'][0]
base_area = area(base, F)
good = base_area > 1e-10
metrics = collections.defaultdict(list)
for key, data in D['states'].items():
    v = np.frombuffer(base64.b64decode(data), dtype='<f4').reshape(-1, 3).astype(float)
    if not np.isfinite(v).all():
        raise ValueError('Non-finite vertices: ' + key)
    o = {k: obj(groups[k], v) for k in ['unified', 'body', 'left', 'right']}
    result = {
        'hip_legs': len(hits(o['unified'], o['unified'], groups['unified'], groups['unified'], True)),
        'left_body': len(hits(o['body'], o['left'], groups['body'], groups['left'])),
        'right_body': len(hits(o['body'], o['right'], groups['body'], groups['right'])),
        'min_hip_area_ratio': float((area(v, F)[good] / base_area[good]).min()),
    }
    category = '-'.join(key.split('-')[:2])
    metrics[category].append((key, result))

failed = False
for name, rows in metrics.items():
    contacts = [r for r in rows if any(r[1][k] for k in ('hip_legs', 'left_body', 'right_body'))]
    min_ratio = min(r[1]['min_hip_area_ratio'] for r in rows)
    # Heuristic regression floor, not a measure of attractive anatomy.
    limit = .28 if name in ('walk-steady', 'run-steady') else .13
    failed |= bool(contacts) or min_ratio < limit
    print(name, 'poses', len(rows), 'poses with selected contacts', len(contacts),
          'max hip/leg contacts', max(r[1]['hip_legs'] for r in rows),
          'max hand/body contacts', max(max(r[1]['left_body'], r[1]['right_body']) for r in rows),
          'min hip area ratio', round(min_ratio, 5), '(threshold', limit, ')')
    if contacts:
        print(' examples:', contacts[:4])
print('NOTE: selected regions and discrete samples only; excluded neighboring faces. Visual review remains necessary.')
if failed:
    raise SystemExit('Selected contacts or excessive triangle compression were found')
