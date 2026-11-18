#!/usr/bin/env python3
"""Sampled FCL intersections of posed hip and hand surface subsets.

Requires NumPy and python-fcl. Pair contacts sharing a welded vertex are
neighbours of the same surface and are excluded. This measures crossings,
not watertightness, all instants, all body parts, or physical penetration depth.
Run qa-geometry-export.mjs first; the input is a scratch file, not a deliverable.
"""
from __future__ import annotations
import argparse
import base64
import collections
import json
from pathlib import Path
import fcl
import numpy as np


def collision_group(indices: list[int], welded: np.ndarray):
    faces = np.array(indices, dtype=np.int32).reshape(-1, 3)
    ids, index = np.unique(faces, return_inverse=True)
    return faces, ids, index.reshape(-1, 3).astype(np.int32), welded[faces]


def collision_object(group, vertices):
    faces, ids, local, _ = group
    model = fcl.BVHModel()
    model.beginModel(len(ids), len(faces))
    model.addSubModel(np.ascontiguousarray(vertices[ids]), local)
    model.endModel()
    return fcl.CollisionObject(model)


def contacts(a, b, ga, gb, same=False):
    wa, wb = ga[3], gb[3]
    request = fcl.CollisionRequest(num_max_contacts=100_000, enable_contact=True)
    result = fcl.CollisionResult()
    fcl.collide(a, b, request, result)
    records = result.contacts
    if len(records) >= request.num_max_contacts:
        raise AssertionError('Contact cap reached; test would be incomplete')
    if not records:
        return set()
    first = np.array([c.b1 for c in records])
    second = np.array([c.b2 for c in records])
    valid = ~np.any(wa[first, :, None] == wb[second, None, :], axis=(1, 2))
    if same:
        valid &= first != second
    return {tuple(sorted((int(a), int(b)))) if same else (int(a), int(b))
            for a, b in zip(first[valid], second[valid])}


def section(name: str) -> str:
    prefixes = ('walk-before', 'walk-after', 'run-before', 'run-after',
                'crouchwalk', 'crouchidle', 'enter', 'exit')
    return next((value for value in prefixes if name.startswith(value)), name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('samples', type=Path)
    args = parser.parse_args()
    data = json.loads(args.samples.read_text())
    base = np.array(data['base']).reshape(-1, 3)
    _, welded = np.unique(np.round(base, 6), axis=0, return_inverse=True)
    groups = {key: collision_group(value, welded) for key, value in data['groups'].items()}
    selected_faces = base[groups['hip'][0]]
    reference_area = np.linalg.norm(np.cross(selected_faces[:, 1] - selected_faces[:, 0],
                                             selected_faces[:, 2] - selected_faces[:, 0]), axis=1) * .5
    good = reference_area > 1e-10
    metrics = collections.defaultdict(lambda: collections.defaultdict(list))
    bad = []
    for name, state in data['states'].items():
        vertices = np.frombuffer(base64.b64decode(state['binary']), dtype='<f4').reshape(-1, 3).astype(float)
        objects = {key: collision_object(group, vertices) for key, group in groups.items()}
        tests = {'hip': len(contacts(objects['hip'], objects['hip'], groups['hip'], groups['hip'], True))}
        for side in ('left', 'right'):
            tests[side + '_self'] = len(contacts(objects[side], objects[side], groups[side], groups[side], True))
            tests[side + '_body'] = len(contacts(objects[side], objects['body'], groups[side], groups['body']))
        triangles = vertices[groups['hip'][0]]
        area = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                       triangles[:, 2] - triangles[:, 0]), axis=1) * .5
        tests['area_ratio'] = float(np.min(area[good] / reference_area[good]))
        tests['floor_mm'] = 1000 * state['floor']
        tests['ik_mm'] = 1000 * state['ik']
        for key, value in tests.items():
            metrics[section(name)][key].append((value, name))
        if not name.startswith('run-before') and any(tests[k] for k in ('hip', 'left_self', 'left_body', 'right_self', 'right_body')):
            bad.append((name, {k: v for k, v in tests.items() if v and k in ('hip', 'left_self', 'left_body', 'right_self', 'right_body')}))
    for group, items in metrics.items():
        print(f"{group}: {len(items['hip'])} samples")
        for key, values in items.items():
            val, sample = (min(values) if key == 'area_ratio' else max(values))
            print(f'  {key}: worst={val:.4f} at {sample}')
    if bad:
        print('Unexpected sampled contacts:', *bad[:20], sep='\n')
        raise AssertionError(f'{len(bad)} samples with selected surface contacts; first 20 shown')
    old_peak = max(v for v, _ in metrics['run-before']['hip'])
    new_peak = max(v for v, _ in metrics['run-after']['hip'])
    if old_peak < 1 or new_peak != 0:
        raise AssertionError(f'Expected sampled improvement in the known old hip fold: old={old_peak}, new={new_peak}')
    print(f'PASS: selected hip contacts: old run peak {old_peak}, revised run peak {new_peak}; '
          'no non-neighbouring hand/body contacts in tested new poses and transitions')
    print('NOTE: these are sampled triangle subsets, not a guarantee for every surface, phase or device.')


if __name__ == '__main__':
    main()
