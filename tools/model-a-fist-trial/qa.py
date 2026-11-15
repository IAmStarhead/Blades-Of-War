#!/usr/bin/env python3
"""Check preservation, local morphs and the standalone archive of the fist trial."""
from __future__ import annotations

import argparse
import base64
import copy
import zipfile
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def view_bytes(document: dict, binary: bytes, index: int) -> bytes:
    view = document['bufferViews'][index]
    offset = view.get('byteOffset', 0)
    return bytes(binary[offset:offset + view['byteLength']])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument('--result', type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument('--well-archive', type=Path, default=build.previous.refinement.DEFAULT_WELL)
    parser.add_argument('--rebuild', action='store_true', help='also verify deterministic model and archive rebuilding')
    args = parser.parse_args()
    source = build.previous.motion.checked(args.source, build.SOURCE_SHA256, 'previous hand/ear model')
    model = (args.result / build.MODEL_NAME).read_bytes()
    old, before = build.previous.helpers.read_glb(source)
    new, after = build.previous.helpers.read_glb(model)

    for key in ('nodes', 'meshes', 'materials', 'images', 'textures', 'samplers', 'scenes', 'scene', 'animations'):
        require(new.get(key) == old.get(key), f'Unexpected structural change to {key}')
    require('skins' not in new, 'A skeleton was unexpectedly added')
    targets = new['meshes'][0]['primitives'][0]['targets']
    require(new['meshes'][0]['extras']['targetNames'] == build.previous.TARGET_NAMES,
            'Hand target names changed')
    changed_accessors = {item[kind] for item in targets for kind in ('POSITION', 'NORMAL')}
    changed_views = {new['accessors'][index]['bufferView'] for index in changed_accessors}
    # All GLB metadata must remain identical too, except the generator label
    # and recalculated min/max bounds on the revised morph accessors.
    old_metadata, new_metadata = copy.deepcopy(old), copy.deepcopy(new)
    old_metadata['asset'].pop('generator', None)
    new_metadata['asset'].pop('generator', None)
    for index in changed_accessors:
        for field in ('min', 'max'):
            old_metadata['accessors'][index].pop(field, None)
            new_metadata['accessors'][index].pop(field, None)
    require(old_metadata == new_metadata, 'Unexpected change to GLB metadata outside the hand morph bounds')
    require(len(before) == len(after) and len(old['bufferViews']) == len(new['bufferViews']),
            'The binary layout unexpectedly changed')
    for i in range(len(old['bufferViews'])):
        if i not in changed_views:
            require(view_bytes(old, before, i) == view_bytes(new, after, i),
                    f'Unrelated buffer view {i} changed')
    positions = build.previous.helpers.accessor(new, after, 0)
    require(np.array_equal(positions, build.previous.helpers.accessor(old, before, 0)),
            'Neutral positions, including the ears and open hands, changed')
    print('PASS: previous neutral mesh, ear geometry, UVs, materials, textures, eyes, blink and clips unchanged')

    _, representatives, inverse = np.unique(positions, axis=0, return_index=True, return_inverse=True)
    hand_region = (np.abs(positions[:, 0]) > .14) & (positions[:, 1] > .65) & (positions[:, 1] < .86)
    # Match both position and base normal, so coincident UV-seam duplicates
    # with different normals are paired with the corresponding mirrored side.
    base_normals = build.previous.helpers.accessor(new, after, 1)
    left = np.flatnonzero(hand_region & (positions[:, 0] > 0))
    right = np.flatnonzero(hand_region & (positions[:, 0] < 0))
    require(len(left) == len(right) and len(left) > 100, 'Unexpected hand region size')
    reflection = np.array([-1., 1., 1.])
    match_error, match = cKDTree(np.column_stack((positions[right] * reflection, base_normals[right] * reflection))).query(
        np.column_stack((positions[left], base_normals[left])))
    require(float(match_error.max()) < 1e-7, 'Rest hand regions are not mirrored')
    for name, target in zip(build.previous.TARGET_NAMES, targets):
        pos = build.previous.helpers.accessor(new, after, target['POSITION'])
        normal = build.previous.helpers.accessor(new, after, target['NORMAL'])
        require(pos.shape == normal.shape == positions.shape and np.isfinite(pos).all() and np.isfinite(normal).all(),
                f'Invalid morph arrays for {name}')
        changed = np.any(pos != 0., axis=1) | np.any(normal != 0., axis=1)
        require(np.all(hand_region[changed]), f'{name} changes a vertex outside the hands')
        disagreement = np.linalg.norm(pos - pos[representatives[inverse]], axis=1)
        require(float(disagreement.max()) < 1e-7, f'{name} separates a welded UV seam')
        for label, values in (('position', pos), ('normal', normal)):
            mismatch = np.linalg.norm(values[left] - values[right[match]] * reflection, axis=1)
            require(float(mismatch.max()) < 1e-7, f'{name} {label} correction differs between mirrored hands')
    previous_end = build.previous.helpers.accessor(old, before, targets[0]['POSITION'])
    revised_end = build.previous.helpers.accessor(new, after, targets[0]['POSITION'])
    difference = np.linalg.norm(revised_end - previous_end, axis=1)
    for sign, side in ((1, 'L'), (-1, 'R')):
        require(np.count_nonzero((difference > 1e-6) & (sign * positions[:, 0] > .14)) > 100,
                f'{side} hand was not substantively revised')
    print(f'PASS: all four morphs are local, seam-consistent and mirrored; end-pose change max {difference.max()*1000:.2f} mm')

    archive_path = args.result / build.ARCHIVE_NAME
    with zipfile.ZipFile(archive_path) as archive:
        require(archive.testzip() is None, 'Corrupt archive')
        require(archive.namelist() == ['BladesOfWar_Showcase.html', build.MODEL_NAME, 'README.txt',
                                       'LICENSE_MAKEHUMAN_ASSETS.md'], 'Unexpected archive contents')
        html = archive.read('BladesOfWar_Showcase.html')
        require(archive.read(build.MODEL_NAME) == model, 'Archive GLB differs from delivered model')
        require(html == build.make_showcase(model, args.well_archive), 'Viewer/model/well bundle mismatch')
        require(base64.b64encode(model) in html, 'Embedded GLB differs')
        require(archive.read('README.txt') == build.ARCHIVE_README.encode('utf-8'), 'Archive notes differ')
        require('Скелета нет' in build.ARCHIVE_README and 'самопересечения' in build.ARCHIVE_README,
                'Known limitations missing')
    print('PASS: offline archive embeds the exact model, previous well, usage notes and asset license')
    if args.rebuild:
        rig = build.previous.motion.checked(build.previous.motion.DEFAULT_RIG,
                                            build.previous.motion.RIG_SHA256, 'reference hand rig')
        rebuilt = build.build_model(source, rig)
        require(rebuilt == model, 'A second model build is not byte-identical')
        require(build.make_archive(rebuilt, build.make_showcase(rebuilt, args.well_archive)) == archive_path.read_bytes(),
                'A second archive build is not byte-identical')
        print('PASS: model and archive rebuild byte-for-byte')


if __name__ == '__main__':
    main()
