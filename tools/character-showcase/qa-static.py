#!/usr/bin/env python3
"""Check static invariants, seams, skin matrices and the untouched well code."""
import argparse
import base64
import io
import json
import re
import struct
import zipfile
from pathlib import Path

import numpy as np
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--showcase', type=Path, default=ROOT / 'work/character-showcase/prototype')
parser.add_argument('--source', type=Path, default=ROOT / 'BladesOfWar_Adam_Eve_Showcase (3).zip')
args = parser.parse_args()


def load(data):
    if data[:4] != b'glTF':
        raise ValueError('Not a GLB')
    size, kind = struct.unpack_from('<II', data, 12)
    if kind != 0x4E4F534A:
        raise ValueError('Expected JSON chunk')
    doc = json.loads(data[20:20 + size])
    bin_start = 20 + size + 8

    def get(index):
        accessor = doc['accessors'][index]
        view = doc['bufferViews'][accessor['bufferView']]
        if view.get('byteStride') or accessor.get('sparse'):
            raise ValueError('Expected contiguous accessors')
        dtype = {5121: 'u1', 5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']]
        columns = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[accessor['type']]
        offset = bin_start + view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
        return np.frombuffer(data, dtype=dtype, count=accessor['count'] * columns, offset=offset).reshape(-1, columns)
    return doc, get


def world_matrices(doc):
    nodes = doc['nodes']
    parents = {child: i for i, node in enumerate(nodes) for child in node.get('children', [])}
    result = {}

    def world(i):
        if i not in result:
            node = nodes[i]
            if 'matrix' in node:
                raise ValueError('Unexpected matrix node')
            matrix = np.eye(4)
            matrix[:3, :3] = Rotation.from_quat(node.get('rotation', [0, 0, 0, 1])).as_matrix() @ np.diag(node.get('scale', [1, 1, 1]))
            matrix[:3, 3] = node.get('translation', [0, 0, 0])
            result[i] = world(parents[i]) @ matrix if i in parents else matrix
        return result[i]
    return [world(i) for i in range(len(nodes))]


html = (args.showcase / 'BladesOfWar_Showcase.html').read_text(encoding='utf-8')
with zipfile.ZipFile(args.source) as archive:
    original_html = archive.read('BladesOfWar_Showcase.html').decode('utf-8')
    def well_block(text):
        return text[text.index('function ip('):text.index('const FEMALE_URI =')]
    if well_block(html) != well_block(original_html):
        raise AssertionError('The original well implementation changed')
    print('Well implementation: byte-for-byte unchanged')

    for var, filename, expected_lashes in [('FEMALE_URI', 'female_fixed.glb', 26), ('MALE_URI', 'male_fixed.glb', 22)]:
        source = archive.read('assets/models/' + filename)
        data = (args.showcase / 'assets/models' / filename).read_bytes()
        embedded = re.search(r'const ' + var + r'\s*=\s*"data:model/gltf-binary;base64,([^\"]+)";', html)
        if not embedded or base64.b64decode(embedded.group(1)) != data:
            raise AssertionError(f'Embedded GLB differs: {filename}')
        original, original_get = load(source)
        doc, get = load(data)
        if doc.get('animations') or original.get('animations'):
            raise AssertionError(f'Unexpected animation clips in {filename}')
        if len(doc['meshes'][0]['primitives'][0]['targets']) != 7:
            raise AssertionError(f'Missing body morphs in {filename}')
        lashes = doc['meshes'][-1]['primitives'][0]
        if len(get(lashes['indices'])) // 3 != expected_lashes or len(lashes['targets']) != 7:
            raise AssertionError(f'Unexpected eyelash geometry in {filename}')
        weights = get(4)
        if np.max(np.abs(weights.sum(axis=1) - 1)) > 1e-5:
            raise AssertionError(f'Skin weights not normalized: {filename}')
        worlds = world_matrices(doc)
        skin = doc['skins'][0]
        inverse = get(skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
        residual = max(np.max(np.abs(worlds[node] @ inv - np.eye(4))) for node, inv in zip(skin['joints'], inverse))
        if residual > 1e-5:
            raise AssertionError(f'Inverse bind mismatch: {filename}, {residual}')
        # Use the source topology to group coincident UV-seam vertices, then
        # check that their repaired rest positions and all seven deltas agree.
        initial = original_get(0)
        _, groups = np.unique(np.round(initial * 1e6).astype(np.int64), axis=0, return_inverse=True)
        counts = np.bincount(groups)
        max_delta = 0.0
        for index in [0, *range(6, 13)]:
            values = get(index).astype(float)
            sums = np.zeros((len(counts), 3))
            np.add.at(sums, groups, values)
            means = sums / counts[:, None]
            max_delta = max(max_delta, float(np.linalg.norm(values - means[groups], axis=1).max()))
        if max_delta > 2e-6:
            raise AssertionError(f'Seam mismatch: {filename}, {max_delta}m')
        print(f'{filename}: embedded identical; 7 morphs; {expected_lashes} lashes; 0 animation clips; bind residual {residual:.2g}; seam max {max_delta * 1000:.5f} mm')
