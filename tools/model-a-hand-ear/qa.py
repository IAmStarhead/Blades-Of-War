#!/usr/bin/env python3
"""Verify locality, unchanged assets, morphs, clips and the standalone archive."""
from __future__ import annotations

import argparse
import base64
import zipfile
from pathlib import Path

import numpy as np

import build
import ears
import hands


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def view_bytes(document: dict, binary: bytes, index: int) -> bytes:
    view = document['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return bytes(binary[start:start + view['byteLength']])


def check_weld(positions: np.ndarray, delta: np.ndarray, label: str) -> None:
    _, representatives, groups = np.unique(positions, axis=0, return_index=True, return_inverse=True)
    disagreement = np.linalg.norm(delta - delta[representatives[groups]], axis=1)
    require(float(disagreement.max()) < 1e-7, f'{label} separates coincident vertices')


def check_model(source: bytes, model: bytes) -> None:
    old, before = build.helpers.read_glb(source)
    new, after = build.helpers.read_glb(model)
    for key in ('nodes', 'materials', 'images', 'textures', 'samplers', 'scenes', 'scene'):
        require(new.get(key) == old.get(key), f'Unexpected change to {key}')
    require('skins' not in new and len(new['meshes']) == 4, 'Unexpected skeleton or mesh count')
    require(new['meshes'][1:] == old['meshes'][1:], 'Eyes, eyelid line or blink mesh structure changed')
    # Texture PNGs, eyes, eyelid geometry and both eyelid morphs remain exact.
    for i in (4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 19, 20, 21, 22):
        require(view_bytes(old, before, i) == view_bytes(new, after, i), f'Unrelated buffer view {i} changed')
    oldp = build.helpers.accessor(old, before, 0)
    oldn = build.helpers.accessor(old, before, 1)
    olduv = build.helpers.accessor(old, before, 2)
    p = build.helpers.accessor(new, after, 0)
    n = build.helpers.accessor(new, after, 1)
    uv = build.helpers.accessor(new, after, 2)
    original_count = len(oldp)
    changed = np.any(p[:original_count] != oldp, axis=1)
    normal_changed = np.any(n[:original_count] != oldn, axis=1)
    require(0 < changed.sum() < 1000 and np.all(ears.ear_neighbourhood(oldp[changed])),
            'Base geometry changed outside the ears')
    require(np.all(ears.ear_neighbourhood(oldp[normal_changed])), 'Normals changed outside the ears')
    require(np.array_equal(uv[:original_count], olduv), 'Existing UV coordinates changed')
    require(len(p) > original_count and np.all(ears.ear_neighbourhood(p[original_count:])),
            'New vertices extend outside the ear patches')
    displacement = np.linalg.norm(p[:original_count] - oldp, axis=1)
    require(displacement.max() < .002, 'Ear displacement unexpectedly large')
    require(np.allclose(p[:original_count][changed & (oldp[:, 0] > 0)][:, 0].max(),
                        -p[:original_count][changed & (oldp[:, 0] < 0)][:, 0].min(), atol=1e-7),
            'Ear edits unexpectedly asymmetric')
    old_faces = np.concatenate([build.helpers.accessor(old, before, i).reshape(-1, 3) for i in (3, 13)])
    new_faces = np.concatenate([build.helpers.accessor(new, after, i).reshape(-1, 3) for i in (3, 13)])
    expected = ears.build_ears(oldp, oldn, olduv, old_faces, build.refinement)
    exp_p, exp_n, exp_uv, exp_faces, parents, endpoints, selected = expected
    require(np.array_equal(p, exp_p) and np.array_equal(n, exp_n) and np.array_equal(uv, exp_uv)
            and np.array_equal(new_faces, exp_faces), 'Export does not match the ear-only construction')
    require(np.array_equal(new_faces[~selected[parents]], old_faces[~selected]),
            'A face outside the edited ear patch was changed or split')
    require(np.array_equal(uv[original_count:], (olduv[endpoints[:, 0]] + olduv[endpoints[:, 1]]) * .5),
            'New ear UVs do not interpolate the original edge')
    require(np.array_equal(build.helpers.accessor(new, after, 13), build.helpers.accessor(old, before, 13)),
            'Blink-face indices changed')
    # The resulting body remains closed after welding coincident UV seams.
    _, welded = np.unique(p, axis=0, return_inverse=True)
    faces = welded[new_faces]
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    _, edge_counts = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    require(np.all(edge_counts == 2), 'Body has a hole, T-junction or non-manifold edge after ear subdivision')
    xyz = p[new_faces].astype(float)
    child_normal = np.cross(xyz[:, 1] - xyz[:, 0], xyz[:, 2] - xyz[:, 0])
    parent_xyz = p[:original_count][old_faces].astype(float)
    parent_normal = np.cross(parent_xyz[:, 1] - parent_xyz[:, 0], parent_xyz[:, 2] - parent_xyz[:, 0])
    require(np.all(np.linalg.norm(child_normal, axis=1) > 1e-13)
            and np.all(np.einsum('ij,ij->i', child_normal, parent_normal[parents]) > 0),
            'Ear subdivision produced a zero-area or reversed triangle')
    print(f'PASS: {changed.sum()} original ear vertices moved (max {displacement.max()*1000:.2f} mm); '
          f'{len(p)-original_count} new vertices, {len(new_faces)-len(old_faces)} added triangles')
    print(f'PASS: {len(old_faces)-selected.sum()} non-ear-patch faces have identical indices; '
          'closed welded surface, unchanged UVs, positions and normals outside the ear neighbourhood')
    print('PASS: open hands, body, face, eyes, brows, textures, materials, lid geometry and scene nodes unchanged')

    body, face, line = (new['meshes'][i] for i in (0, 3, 2))
    require(body['extras']['targetNames'] == build.TARGET_NAMES and body['weights'] == [0] * 4,
            'Unexpected hand targets or nonzero neutral weight')
    require(face['extras']['targetNames'] == ['Blink'] and line['extras']['targetNames'] == ['Blink', 'BlinkLineNarrow'],
            'Blink target names changed')
    face_indices = build.helpers.accessor(new, after, 13).reshape(-1, 3)
    face_vertices = np.unique(face_indices)
    body_vertices = np.unique(build.helpers.accessor(new, after, 3))
    target_arrays = []
    for name, target in zip(build.TARGET_NAMES, body['primitives'][0]['targets']):
        position = build.helpers.accessor(new, after, target['POSITION'])
        normal = build.helpers.accessor(new, after, target['NORMAL'])
        require(position.shape == normal.shape == p.shape, f'{name} has wrong dimensions')
        require(not np.any(position[face_vertices]) and not np.any(normal[face_vertices]), f'{name} affects face')
        nonzero = np.any(position != 0, axis=1) | np.any(normal != 0, axis=1)
        require(np.all((abs(p[nonzero, 0]) > .14) & (p[nonzero, 1] < .86) & (p[nonzero, 1] > .65)),
                f'{name} affects geometry outside the hands')
        require(not np.any(position[original_count:]) and not np.any(normal[original_count:]), f'{name} affects ears')
        check_weld(p, position, name)
        target_arrays.append(position)
    for index in (14, 15):
        old_morph = build.helpers.accessor(old, before, index)
        new_morph = build.helpers.accessor(new, after, index)
        require(np.array_equal(new_morph[:original_count], old_morph) and not np.any(new_morph[original_count:]),
                f'Blink accessor {index} changed')
        require(not np.any(new_morph[body_vertices]), 'Blink affects the body partition')
    require(np.linalg.norm(target_arrays[0], axis=1).max() > .06, 'Grip target is unexpectedly empty')
    require(new['animations'][0] == old['animations'][0], 'Blink clip structure changed')
    animations = {clip['name']: clip for clip in new['animations']}
    require(set(animations) == {'Blink_Once', 'Fists_Close', 'Fists_Open'}, 'Unexpected clip names')
    require({c['target']['node'] for c in animations['Blink_Once']['channels']} == {3, 4}
            and all({c['target']['node'] for c in animations[name]['channels']} == {1}
                    for name in ('Fists_Close', 'Fists_Open')), 'Blink and hands are not independently targeted')
    for name, reverse in [('Fists_Close', False), ('Fists_Open', True)]:
        sampler = animations[name]['samplers'][0]
        times = build.helpers.accessor(new, after, sampler['input']).ravel()
        values = build.helpers.accessor(new, after, sampler['output']).reshape(-1, 4)
        desired = np.linspace(0, 1, 9)
        if reverse:
            desired = 1 - desired
        expected_weights = np.vstack([hands.correction_weights(x) for x in desired])
        require(len(times) == len(values) == 9 and times[0] == 0 and np.isclose(times[-1], .35)
                and np.all(np.diff(times) > 0) and np.allclose(values, expected_weights, atol=1e-7),
                f'{name} does not follow the corrective hand path')
    print('PASS: four hand morphs are local and seam-consistent; blink unchanged; independent, reversible clips')


def check_archive(model: bytes, result: Path, well_zip: Path) -> None:
    with zipfile.ZipFile(result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, 'Corrupt archive')
        require(archive.namelist() == ['BladesOfWar_Showcase.html', build.MODEL_NAME, 'README.txt',
                                       'LICENSE_MAKEHUMAN_ASSETS.md'], 'Unexpected archive contents')
        html = archive.read('BladesOfWar_Showcase.html')
        require(archive.read(build.MODEL_NAME) == model, 'Archive GLB differs from delivered model')
        require(html == build.make_showcase(model, well_zip), 'Archive HTML differs from template/model/well')
        require(base64.b64encode(model) in html, 'Embedded GLB differs')
        require(build.refinement.well_engine_bundle(well_zip).encode() in html, 'Original well/engine bundle changed')
        readme = archive.read('README.txt').decode('utf-8')
        require('Скелета в GLB нет' in readme and 'FistHalfCorrection' in readme
                and 'самопересечения' in readme,
                'Archive lacks the morph controls, no-rig limitation or known source intersections')
    print('PASS: offline ZIP contains the exact GLB, original well/engine, usage notes and CC0 license')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument('--result', type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'approved motion model')
    model = (args.result / build.MODEL_NAME).read_bytes()
    check_model(source, model)
    check_archive(model, args.result, args.well_archive)


if __name__ == '__main__':
    main()
