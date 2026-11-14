#!/usr/bin/env python3
"""Measure selected triangle-pair contacts in browser-exported posed meshes.

This is a targeted regression, not a proof that an entire mesh is intersection-free.
Run qa-browser.mjs with --capture first; see README for dependencies.
"""
import argparse
import json
import struct
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--poses', type=Path, required=True, help='JSON written by qa-browser.mjs --capture')
parser.add_argument('--showcase', type=Path, default=ROOT / 'work/character-showcase/prototype')
args = parser.parse_args()


def load_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError(f'Invalid GLB header: {path}')
    size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A:
        raise ValueError('Expected JSON chunk')
    document = json.loads(data[20:20 + size])
    binary_start = 20 + size + 8

    def accessor(index):
        a = document['accessors'][index]
        view = document['bufferViews'][a['bufferView']]
        if view.get('byteStride') or a.get('sparse'):
            raise ValueError('This regression expects contiguous accessors')
        dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[a['componentType']]
        columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        offset = binary_start + view.get('byteOffset', 0) + a.get('byteOffset', 0)
        return np.frombuffer(data, dtype=dtype, count=a['count'] * columns, offset=offset).reshape(-1, columns)
    return document, accessor


def collide(vertices, rest, first, second):
    manager = trimesh.collision.CollisionManager()
    manager.add_object('first', trimesh.Trimesh(vertices=vertices, faces=first, process=False))
    _, contacts = manager.in_collision_single(trimesh.Trimesh(vertices=vertices, faces=second, process=False), return_data=True)
    clean = []
    for contact in contacts:
        a = first[contact.index('first')]
        b = second[contact.index('__external')]
        # Ignore shared vertices and the UV-split duplicates of those vertices.
        if set(a) & set(b):
            continue
        if np.any(np.linalg.norm(rest[a, None] - rest[b][None, :], axis=2) < 1e-6):
            continue
        clean.append(contact)
    return len(clean), max((item.depth for item in clean), default=0.0) * 1000


poses = json.loads(args.poses.read_text())
if len(poses) != 20:
    raise ValueError(f'Expected 20 solo poses, got {len(poses)}')
results = []
for mode, filename in [('eve', 'female_fixed.glb'), ('adam', 'male_fixed.glb')]:
    document, get = load_glb(args.showcase / 'assets/models' / filename)
    rest = get(0).astype(float)
    faces, joints, weights = get(5).reshape(-1, 3), get(3), get(4)
    names = [document['nodes'][index]['name'] for index in document['skins'][0]['joints']]

    def group(side, prefixes):
        ids = [i for i, name in enumerate(names) if name.endswith('_' + side) and name.startswith(prefixes)]
        return (weights * np.isin(joints, ids)).sum(axis=1)

    for pose in (p for p in poses if p['mode'] == mode):
        vertices = np.asarray(pose['positions']).reshape(-1, 3)
        if len(vertices) != len(rest) or not np.isfinite(vertices).all():
            raise ValueError(f'Bad posed positions: {mode}/{pose["race"]}/{pose["hand"]}')
        label = f'{mode}/{pose["race"]}/{pose["hand"]}'
        side_faces = {}
        for side in ['L', 'R']:
            thumb = group(side, ('finger1_',))
            fingers = group(side, ('finger2_', 'finger3_', 'finger4_', 'finger5_'))
            distal = group(side, tuple(f'finger{digit}_{segment}' for digit in range(2, 6) for segment in (2, 3)))
            palm = group(side, ('wrist', 'metacarpal'))
            hand = group(side, ('wrist', 'metacarpal', 'finger'))
            leg = group(side, ('upperleg', 'lowerleg', 'pelvis'))
            selected = lambda value, threshold: faces[value[faces].mean(axis=1) > threshold]
            side_faces[side] = selected(leg, .6)
            for name, first, second in [
                ('thumb/fingers', selected(thumb, .6), selected(fingers, .6)),
                ('distal-fingers/palm', selected(distal, .6), selected(palm, .75)),
                ('hand/leg', selected(hand, .6), selected(leg, .6)),
            ]:
                count, depth = collide(vertices, rest, first, second)
                results.append({'pose': label, 'side': side, 'test': name, 'contacts': count, 'max_depth_mm': depth})
            for digit in range(2, 5):
                first = selected(group(side, (f'finger{digit}_',)), .6)
                second = selected(group(side, (f'finger{digit + 1}_',)), .6)
                count, depth = collide(vertices, rest, first, second)
                results.append({'pose': label, 'side': side, 'test': 'adjacent-fingers', 'contacts': count, 'max_depth_mm': depth})
        leg_l, leg_r = (side_faces[s] for s in ['L', 'R'])
        # Restrict the inter-leg check to the thigh/calf region, away from the joined pelvis.
        leg_l = leg_l[(vertices[leg_l, 1].mean(axis=1) > .5) & (vertices[leg_l, 1].mean(axis=1) < .85)]
        leg_r = leg_r[(vertices[leg_r, 1].mean(axis=1) > .5) & (vertices[leg_r, 1].mean(axis=1) < .85)]
        count, depth = collide(vertices, rest, leg_l, leg_r)
        results.append({'pose': label, 'side': 'L/R', 'test': 'opposite-legs', 'contacts': count, 'max_depth_mm': depth})

for name in ['thumb/fingers', 'distal-fingers/palm', 'adjacent-fingers', 'hand/leg', 'opposite-legs']:
    subset = [item for item in results if item['test'] == name]
    hits = [item for item in subset if item['contacts']]
    deepest = max((item['max_depth_mm'] for item in subset), default=0)
    print(f'{name}: {len(subset)} checks; {len(hits)} with contacts; max depth {deepest:.3f} mm')
    for item in hits:
        print(' ', item['pose'], item['side'], item['contacts'], f'{item["max_depth_mm"]:.3f} mm')
print('Scope: selected skin-weighted triangles and tested static poses only.')
# Allow numerical touching of up to 0.05 mm, but fail on significant penetration.
if any(item['max_depth_mm'] > .05 for item in results):
    raise SystemExit('Significant contact detected in a selected region')
