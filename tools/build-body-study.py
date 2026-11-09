#!/usr/bin/env python3
"""Derive the isolated body-study meshes from MakeHuman CC0 asset files.

Requires numpy, trimesh and fast-simplification. Example:
python tools/build-body-study.py --base base.obj --female female.target --male male.target
See src/body-study/README.md for asset provenance.
"""
import argparse
import json
import numpy as np
import trimesh

parser = argparse.ArgumentParser()
parser.add_argument('--base', required=True)
parser.add_argument('--female', required=True)
parser.add_argument('--male', required=True)
parser.add_argument('--output', default='src/body-study/bodies.json')
args = parser.parse_args()
vertices, faces, group = [], [], ''
with open(args.base, encoding='utf8') as source:
    for line in source:
        if line.startswith('v '):
            vertices.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('g '):
            group = line[2:].strip()
        elif line.startswith('f ') and group == 'body':
            ids = [int(token.split('/')[0]) - 1 for token in line.split()[1:]]
            for i in range(1, len(ids) - 1):
                faces.append([ids[0], ids[i], ids[i + 1]])
base, faces = np.asarray(vertices), np.asarray(faces)
output = {}
for sex in ('female', 'male'):
    positions = base.copy()
    with open(getattr(args, sex), encoding='utf8') as target:
        for line in target:
            fields = line.split()
            if len(fields) == 4 and fields[0].isdigit():
                positions[int(fields[0])] += [float(x) for x in fields[1:]]
    mesh = trimesh.Trimesh(vertices=positions, faces=faces, process=True)
    mesh = mesh.simplify_quadric_decimation(face_count=16000)
    output[sex] = {
        'positions': np.round(mesh.vertices, 5).flatten().tolist(),
        'indices': mesh.faces.flatten().tolist(),
    }
with open(args.output, 'w', encoding='utf8') as dest:
    json.dump(output, dest, separators=(',', ':'))
