#!/usr/bin/env python3
"""Regression checks for the ear-only GLB, fixed portrait and offline archive."""
from __future__ import annotations

import argparse
import base64
import copy
import zipfile
from pathlib import Path

import fcl
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def without_generator(document: dict) -> dict:
    result = copy.deepcopy(document)
    result['asset'].pop('generator', None)
    return result


def collision_pairs(positions: np.ndarray, faces: np.ndarray, groups: np.ndarray) -> set[tuple[int, int]]:
    vertices, indices = np.unique(faces, return_inverse=True)
    indices = indices.reshape(-1, 3).astype(np.int32)
    model = fcl.BVHModel()
    model.beginModel(len(vertices), len(indices))
    model.addSubModel(np.ascontiguousarray(positions[vertices], dtype=np.float64), indices)
    model.endModel()
    obj = fcl.CollisionObject(model)
    request = fcl.CollisionRequest(num_max_contacts=100_000, enable_contact=True)
    result = fcl.CollisionResult()
    fcl.collide(obj, obj, request, result)
    require(len(result.contacts) < request.num_max_contacts, 'FCL contact limit reached')
    welded = groups[faces]
    pairs = set()
    for contact in result.contacts:
        i, j = int(contact.b1), int(contact.b2)
        if i != j and not np.intersect1d(welded[i], welded[j]).size:
            pairs.add(tuple(sorted((i, j))))
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, default=build.OUTPUT)
    parser.add_argument('--source', type=Path, default=build.SOURCE)
    parser.add_argument('--ancestor', type=Path, default=build.EAR_ANCESTOR)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'eye-study model')
    ancestor = build.motion.checked(args.ancestor, build.EAR_ANCESTOR_SHA256, 'ear-subdivision ancestor')
    data = (args.result / build.MODEL_NAME).read_bytes()
    old, before = build.helpers.read_glb(source)
    new, after = build.helpers.read_glb(data)
    require(without_generator(old) == without_generator(new), 'Unexpected glTF metadata or structural changes')
    for index in range(len(old['bufferViews'])):
        if index not in (0, 1):
            require(build.eye.brow.view_bytes(old, before, index) == build.eye.brow.view_bytes(new, after, index),
                    f'Unexpected change to protected bufferView {index}')
    require(not old.get('skins') and not new.get('skins'), 'Unexpected skeleton')
    p = build.helpers.accessor(old, before, 0).astype(np.float64)
    q = build.helpers.accessor(new, after, 0).astype(np.float64)
    n0 = build.helpers.accessor(old, before, 1)
    n1 = build.helpers.accessor(new, after, 1)
    faces = np.concatenate([build.helpers.accessor(old, before, i).reshape(-1, 3) for i in (3, 13)])
    require(p.shape == q.shape == (18176, 3) and len(faces) == 34074, 'Body topology changed')
    changed = np.any(p != q, axis=1)
    changed_n = np.any(n0 != n1, axis=1)
    neighbourhood = build.ears.ear_neighbourhood(p)
    require(2500 < changed.sum() < 3500 and not np.any(changed & ~neighbourhood)
            and not np.any(changed_n & ~neighbourhood), 'Geometry or normals changed outside the ears/root')
    displacement = np.linalg.norm(q - p, axis=1)
    require(displacement.max() < .006 and np.all(np.isfinite(q)), 'Unexpected ear displacement')
    require(np.all(np.abs(np.linalg.norm(n1.astype(float), axis=1) - 1) < 1e-4), 'Invalid normals')
    for index in (11, 12, 14, 15, 25, 26, 27, 28, 29, 30):
        morph = build.helpers.accessor(old, before, index)
        require(not np.any(morph[changed | changed_n]), f'Morph {index} reaches edited ear or normal')
    face_vertices = np.unique(build.helpers.accessor(old, before, 13))
    require(not np.any(changed[face_vertices] | changed_n[face_vertices]), 'Edit reaches the independently blinking face')
    print(f'PASS: {changed.sum()} ear/root vertices moved, max {displacement.max()*1000:.3f} mm; '
          'outside positions and normals unchanged')
    print('PASS: indices/UVs/textures/materials/eyes/face/limbs and every morph/animation buffer are byte-identical')

    _, representatives, groups = np.unique(p, axis=0, return_index=True, return_inverse=True)
    require(np.array_equal(q, q[representatives[groups]]), 'Previously welded UV vertices split')
    tri = groups[faces]
    edges = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    _, count = np.unique(np.sort(edges, axis=1), axis=0, return_counts=True)
    require(np.all(count == 2), 'Welded body has an open or nonmanifold edge')
    mirror = p * [-1, 1, 1]
    distance, opposite = cKDTree(p).query(mirror)
    symmetric = np.linalg.norm((q - p) - (q - p)[opposite] * [-1, 1, 1], axis=1)
    require(distance[changed].max() < 1e-10 and symmetric[changed].max() < 1e-7, 'Ear edits are not symmetric')
    xyz0, xyz1 = p[faces], q[faces]
    a = np.cross(xyz0[:, 1] - xyz0[:, 0], xyz0[:, 2] - xyz0[:, 0])
    b = np.cross(xyz1[:, 1] - xyz1[:, 0], xyz1[:, 2] - xyz1[:, 0])
    size0, size1 = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    valid = size0 > 1e-13
    dot = np.einsum('ij,ij->i', a, b)
    require(not np.any(valid & (dot <= 0)), 'A triangle changed orientation by 90 degrees or more')
    require(not np.any(valid & (size1 < .45 * size0)), 'A triangle collapsed to less than 45% of its old area')
    affected = valid & np.any(changed[faces], axis=1)
    angle = np.rad2deg(np.arccos(np.clip(dot[affected] / (size0[affected] * size1[affected]), -1, 1)))
    min_ratio = np.min(size1[affected] / size0[affected])
    require(angle.max() < 65, 'Unexpectedly large triangle normal rotation')
    print(f'PASS: closed welded surface; symmetric edits; min affected triangle area {min_ratio:.3f}×; '
          f'max face-normal rotation {angle.max():.2f}°')

    # This is a single fixed front projection, not a claim of beauty or a
    # proof of smoothness from every possible viewpoint.
    rows, old_outline = build.profile(p, faces)
    _, new_outline = build.profile(q, faces)
    selection = (rows >= 450) & (rows <= 555)
    def roughness(outline):
        residual = outline - gaussian_filter1d(outline, sigma=8)
        return float(np.sqrt(np.mean(residual[selection] ** 2)))
    r0, r1 = roughness(old_outline), roughness(new_outline)
    require(r1 < r0 * .5, 'The sampled front contour did not become smoother')
    print(f'PASS: fixed portrait mid-rim high-frequency residual {r0:.3f} -> {r1:.3f} pixels')

    for side in (1, -1):
        x, y, z = p.T
        inside = (side*x > .055) & (y > 1.497) & (y < 1.612) & (z > -.040) & (z < .080)
        subset = faces[np.any(inside[faces], axis=1)]
        old_pairs = collision_pairs(p, subset, groups)
        new_pairs = collision_pairs(q, subset, groups)
        require(not (new_pairs - old_pairs), f'New ear/adjacent-skin self-contacts on side {side}')
        print(f'PASS: side {side:+d}, {len(subset)} local triangles, '
              f'non-adjacent FCL contacts {len(old_pairs)} -> {len(new_pairs)}')

    with zipfile.ZipFile(args.result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, 'Archive CRC failure')
        require(archive.namelist() == ['BladesOfWar_Showcase.html', build.MODEL_NAME, 'README.txt',
                                      'LICENSE_MAKEHUMAN_ASSETS.md'], 'Unexpected archive contents')
        html = archive.read('BladesOfWar_Showcase.html')
        require(archive.read(build.MODEL_NAME) == data, 'Archive GLB differs from delivered GLB')
        require(html == build.make_showcase(data, args.well_archive), 'HTML differs from the checked viewer template')
        require(base64.b64encode(data) in html, 'Viewer embeds the wrong GLB')
        require('скелета' in archive.read('README.txt').decode('utf-8'), 'Archive omits rig limitation')
    print('PASS: self-contained ZIP, correct embedded GLB, usage and CC0 asset license')
    if args.rebuild:
        rebuilt = build.build_model(source, ancestor)
        require(rebuilt == data, 'GLB is not reproducible')
        require(build.make_archive(rebuilt, build.make_showcase(rebuilt, args.well_archive))
                == (args.result / build.ARCHIVE_NAME).read_bytes(), 'ZIP is not reproducible')
        print('PASS: GLB and ZIP reproduced byte-for-byte')
    print('NOTE: local FCL checks and portrait sampling are not a proof of all future poses or artistic quality.')


if __name__ == '__main__':
    main()
