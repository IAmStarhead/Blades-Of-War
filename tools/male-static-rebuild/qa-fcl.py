#!/usr/bin/env python3
"""Limited static-pose collision tests; this is not a whole-model proof.

Requires numpy, scipy, networkx, trimesh and python-fcl. Checks selected donor
regions reproduced in the final GLB and the final new neck bridge. Shared
vertices are excluded so ordinary surface adjacency is not reported as a hit.
"""
import argparse
import json
from pathlib import Path

import fcl
import numpy as np
from scipy.spatial import cKDTree
import trimesh
import mesh

ROOT = Path(__file__).resolve().parents[2]
CAP = 500_000


def collision_object(points, faces):
    ids, inverse = np.unique(faces, return_inverse=True)
    local = inverse.reshape(-1, 3).astype('i4')
    model = fcl.BVHModel()
    model.beginModel(len(ids), len(faces))
    model.addSubModel(np.ascontiguousarray(points[ids], dtype='f8'), local)
    model.endModel()
    return fcl.CollisionObject(model)


def check(points, groups, a, b, welded):
    faces_a, faces_b = groups[a], groups[b]
    first = collision_object(points, faces_a)
    second = collision_object(points, faces_b)
    result = fcl.CollisionResult()
    count = fcl.collide(first, second, fcl.CollisionRequest(num_max_contacts=CAP, enable_contact=True), result)
    if count >= CAP:
        raise AssertionError(f'Contact limit reached for {a}/{b}')
    hits = set()
    for contact in result.contacts:
        i, j = int(contact.b1), int(contact.b2)
        if np.intersect1d(welded[faces_a[i]], welded[faces_b[j]]).size:
            continue
        if a == b and i == j:
            continue
        hits.add(tuple(sorted((i, j))) if a == b else (i, j))
    if hits:
        examples = []
        for i, j in list(hits)[:5]:
            examples.append((points[faces_a[i]].mean(axis=0).tolist(), points[faces_b[j]].mean(axis=0).tolist()))
        raise AssertionError(f'{a}/{b}: {len(hits)} non-neighboring triangle contacts; examples {examples}')
    print(f'PASS {a} / {b}: 0 non-neighboring triangle contacts ({len(faces_a)} / {len(faces_b)} faces)')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', nargs='?', type=Path, default=ROOT/'work/male-static-rebuild/male_static_rebuild.glb')
    args = parser.parse_args()
    loaded = trimesh.load(args.model, force='scene', process=False)
    body = loaded.geometry['New body']
    final_points = np.asarray(body.vertices, dtype=float)
    final_faces = np.asarray(body.faces, dtype=int)
    if final_points.shape != (14703, 3) or final_faces.shape != (28196, 3):
        raise AssertionError('Unexpected published mesh')
    donor, faces, _ = mesh.make_body()
    weights = json.loads((mesh.SOURCES/'default_weights.mhw').read_text(encoding='utf-8'))['weights']
    total = np.zeros(len(donor))
    arrays = {}
    for name, values in weights.items():
        values = np.asarray(values)
        array = np.zeros(len(donor))
        array[values[:, 0].astype(int)] = values[:, 1]
        arrays[name] = array
        total += array
    for name in arrays:
        arrays[name] /= total
    scores = {}
    for side in ['L', 'R']:
        for kind, prefix in [
            ('hand', ('wrist', 'finger', 'metacarpal')),
            ('arm', ('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal')),
            ('leg', ('upperleg', 'lowerleg', 'foot', 'toe')),
        ]:
            weight = sum((array for name, array in arrays.items() if name.endswith('.'+side) and name.startswith(prefix)), np.zeros(len(donor)))
            scores[kind+side] = np.mean(weight[faces], axis=1)
    center = donor[faces].mean(axis=1)
    trunklegs = (center[:, 1]>.6) & (center[:, 1]<1.42) & (scores['armL']<.25) & (scores['armR']<.25)
    groups = {
        'left hand': faces[scores['handL']>.5],
        'right hand': faces[scores['handR']>.5],
        'left arm': faces[(scores['armL']>.5) & (center[:, 1]<1.4)],
        'right arm': faces[(scores['armR']>.5) & (center[:, 1]<1.4)],
        'torso and upper legs': faces[trunklegs],
        'left leg and foot': faces[scores['legL']>.5],
        'right leg and foot': faces[scores['legR']>.5],
        'pelvis and upper legs': faces[(center[:, 1]>.5) & (center[:, 1]<1.05) & (scores['armL']<.25) & (scores['armR']<.25)],
        'shoulders': faces[(donor[faces][:, :, 1].min(axis=1)>1.23) & (donor[faces][:, :, 1].max(axis=1)<1.50)],
    }
    # The parts tested in the original posed donor must also be present in the
    # delivered, clipped GLB; otherwise they would not test the actual shape.
    selected = np.unique(np.concatenate([group.ravel() for group in groups.values()]))
    distance, _ = cKDTree(final_points).query(donor[selected], k=1)
    if distance.max() > 2e-6:
        raise AssertionError(f'Published geometry does not match posed donor: {distance.max()} m')
    print(f'PASS: {len(selected)} tested donor vertices match the published GLB within {distance.max():.9f} m')
    _, welded = np.unique(np.round(donor, 7), axis=0, return_inverse=True)
    for a, b in [
        ('left hand', 'torso and upper legs'), ('right hand', 'torso and upper legs'),
        ('left arm', 'torso and upper legs'), ('right arm', 'torso and upper legs'),
        ('left hand', 'left hand'), ('right hand', 'right hand'),
        ('left leg and foot', 'right leg and foot'), ('left leg and foot', 'left leg and foot'),
        ('right leg and foot', 'right leg and foot'), ('pelvis and upper legs', 'pelvis and upper legs'),
        ('shoulders', 'shoulders'),
    ]:
        check(donor, groups, a, b, welded)
    donor_count, nape_count = 18370, 1594
    lower, nape, bridge = (final_faces[:donor_count], final_faces[donor_count:donor_count+nape_count],
                           final_faces[donor_count+nape_count:])
    join_groups = {'join': bridge, 'adjacent donor': lower[final_points[lower][:, :, 1].max(axis=1)>1.48], 'retained nape': nape}
    weld_identity = np.arange(len(final_points))
    for a, b in [('join', 'join'), ('join', 'adjacent donor'), ('join', 'retained nape')]:
        check(final_points, join_groups, a, b, weld_identity)
    print('NOTE: selected regions in one static pose only; adjacent faces, retained head overlap, animation and entire-model watertightness are not covered.')


if __name__ == '__main__':
    main()
