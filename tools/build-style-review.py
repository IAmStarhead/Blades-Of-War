#!/usr/bin/env python3
"""Simplify the saved body-study meshes for the isolated style comparison.
Requires numpy, trimesh and fast-simplification; run from repository root.
"""
import json
import numpy as np
import trimesh

with open('src/body-study/bodies.json', encoding='utf8') as source:
    original = json.load(source)
output = {}
for sex in ('female', 'male'):
    body = original[sex]
    mesh = trimesh.Trimesh(
        vertices=np.asarray(body['positions']).reshape(-1, 3),
        faces=np.asarray(body['indices']).reshape(-1, 3), process=False,
    ).simplify_quadric_decimation(face_count=9500)
    if not mesh.is_watertight:
        raise ValueError(f'{sex} simplified mesh is not watertight')
    output[sex] = {
        'positions': np.round(mesh.vertices, 5).flatten().tolist(),
        'indices': mesh.faces.flatten().tolist(),
    }
with open('src/style-review/styled-bodies.json', 'w', encoding='utf8') as target:
    json.dump(output, target, separators=(',', ':'))
