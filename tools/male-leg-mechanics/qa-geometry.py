#!/usr/bin/env python3
"""Sampled FCL intersections of posed hip, hand and lower-leg subsets.

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
                'crouchwalk-before', 'crouchwalk-after', 'crouchidle', 'enter', 'exit')
    return next((value for value in prefixes if name.startswith(value)), name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('samples', type=Path)
    args = parser.parse_args()
    data = json.loads(args.samples.read_text())
    base = np.array(data['base']).reshape(-1, 3)
    _, welded = np.unique(np.round(base, 6), axis=0, return_inverse=True)
    groups = {key: collision_group(value, welded) for key, value in data['groups'].items()}
    hip_faces = groups['hip'][0]
    lower_faces = np.concatenate((groups['lowerL'][0], groups['lowerR'][0]))
    def areas(vertices, faces):
        p = vertices[faces]
        return np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1) * .5
    reference_area, lower_reference = areas(base, hip_faces), areas(base, lower_faces)
    good, lower_good = reference_area > 1e-10, lower_reference > 1e-10
    metrics = collections.defaultdict(lambda: collections.defaultdict(list))
    bad = []
    for name, state in data['states'].items():
        vertices = np.frombuffer(base64.b64decode(state['binary']), dtype='<f4').reshape(-1, 3).astype(float)
        objects = {key: collision_object(group, vertices) for key, group in groups.items()}
        tests = {'hip': len(contacts(objects['hip'], objects['hip'], groups['hip'], groups['hip'], True))}
        for side in ('left', 'right'):
            tests[side + '_self'] = len(contacts(objects[side], objects[side], groups[side], groups[side], True))
            tests[side + '_body'] = len(contacts(objects[side], objects['body'], groups[side], groups['body']))
        tests['lower_left_self'] = len(contacts(objects['lowerL'], objects['lowerL'], groups['lowerL'], groups['lowerL'], True))
        tests['lower_right_self'] = len(contacts(objects['lowerR'], objects['lowerR'], groups['lowerR'], groups['lowerR'], True))
        tests['lower_cross'] = len(contacts(objects['lowerL'], objects['lowerR'], groups['lowerL'], groups['lowerR']))
        area, lower_area = areas(vertices, hip_faces), areas(vertices, lower_faces)
        tests['area_ratio'] = float(np.min(area[good] / reference_area[good]))
        tests['lower_area_ratio'] = float(np.min(lower_area[lower_good] / lower_reference[lower_good]))
        tests['floor_mm'] = 1000 * state['floor']
        tests['ik_mm'] = 1000 * state['ik']
        for key, value in tests.items():
            metrics[section(name)][key].append((value, name))
        contact_keys = ('hip', 'left_self', 'left_body', 'right_self', 'right_body', 'lower_left_self', 'lower_right_self', 'lower_cross')
        if not (name.startswith('run-before') or name.startswith('walk-before') or name.startswith('crouchwalk-before')) and any(tests[k] for k in contact_keys):
            bad.append((name, {k: v for k, v in tests.items() if v and k in contact_keys}))
    for group, items in metrics.items():
        print(f"{group}: {len(items['hip'])} samples")
        for key, values in items.items():
            val, sample = (min(values) if key.endswith('area_ratio') else max(values))
            print(f'  {key}: worst={val:.4f} at {sample}')
    if bad:
        print('Unexpected sampled contacts:', *bad[:20], sep='\n')
        raise AssertionError(f'{len(bad)} samples with selected surface contacts; first 20 shown')
    for group in ('walk', 'run', 'crouchwalk'):
        old_area = min(v for v, _ in metrics[group + '-before']['area_ratio'])
        new_area = min(v for v, _ in metrics[group + '-after']['area_ratio'])
        # A coarse collapse alarm, not a claim that the new mesh is smoother.
        # Report the previous result too: this trial can compress more than it.
        if new_area < .30:
            raise AssertionError(f'Excessive sampled compression in {group}: old={old_area}, new={new_area}')
        old_lower = min(v for v, _ in metrics[group + '-before']['lower_area_ratio'])
        new_lower = min(v for v, _ in metrics[group + '-after']['lower_area_ratio'])
        if new_lower < .20:
            raise AssertionError(f'Excessive sampled lower-leg compression in {group}: old={old_lower}, new={new_lower}')
        print(f'CHECK {group}: smallest hip-triangle area ratio: previous={old_area:.4f}, trial={new_area:.4f}; threshold=.30')
        print(f'CHECK {group}: smallest lower-leg area ratio: previous={old_lower:.4f}, trial={new_lower:.4f}; threshold=.20')
    print('PASS: no non-neighbouring selected hip, lower-leg or hand/body contacts in tested new poses and transitions')
    print('NOTE: these are sampled triangle subsets, not a guarantee for every surface, phase or device; compression may have worsened.')


if __name__ == '__main__':
    main()
