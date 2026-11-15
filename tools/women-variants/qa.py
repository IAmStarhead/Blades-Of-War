#!/usr/bin/env python3
"""Validate local changes, explicit height scaling, shared motion and offline package."""
from __future__ import annotations
import argparse
import base64
import copy
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

import build
import showcase


def require(value: bool, message: str) -> None:
    if not value:
        raise AssertionError(message)


def normalized(document: dict) -> dict:
    doc = copy.deepcopy(document)
    doc['asset'].pop('generator', None)
    doc['asset'].pop('extras', None)
    doc['nodes'][0].pop('scale', None)
    for view in doc['bufferViews']:
        view.pop('byteOffset', None)
    doc['bufferViews'][build.eye.EYE_VIEW].pop('byteLength', None)
    doc['buffers'][0].pop('byteLength', None)
    for i in (0, 8, 16, 17):
        doc['accessors'][i].pop('min', None)
        doc['accessors'][i].pop('max', None)
    return doc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.SOURCE)
    parser.add_argument('--reference', type=Path, default=build.eye.DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    parser.add_argument('--result', type=Path, default=build.OUTPUT)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'Eve eye study')
    reference = build.motion.checked(args.reference, build.eye.REFERENCE_SHA256, 'auxiliary weight source')
    before, source_binary = build.helpers.read_glb(source)
    p = build.helpers.accessor(before, source_binary, 0).astype(np.float64)
    n = build.helpers.accessor(before, source_binary, 1)
    uv = build.helpers.accessor(before, source_binary, 2)
    faces = np.concatenate([build.helpers.accessor(before, source_binary, i).reshape(-1, 3) for i in (3, 13)])
    arms = build.arm_weights(reference, uv)
    protected = np.zeros(len(p), dtype=bool)
    protected[:build.ORIGINAL_COUNT] = arms > 1e-8
    protected |= p[:, 1] <= .835
    hand = np.linalg.norm(build.helpers.accessor(before, source_binary, 11), axis=1) > 1e-8
    _, groups = np.unique(p, axis=0, return_inverse=True)
    original_triangles = p[faces]
    original_normal = np.cross(original_triangles[:, 1] - original_triangles[:, 0],
                               original_triangles[:, 2] - original_triangles[:, 0])
    original_area = np.linalg.norm(original_normal, axis=1)
    valid = original_area > 1e-13
    chest_front = (valid & (original_triangles[:, :, 1].mean(1) > 1.10)
                   & (original_triangles[:, :, 1].mean(1) < 1.31)
                   & (original_triangles[:, :, 2].mean(1) > .10)
                   & (np.abs(original_triangles[:, :, 0]).mean(1) < .16))
    original_eye = np.asarray(Image.open(io.BytesIO(build.eye.brow.view_bytes(before, source_binary, 9))).convert('RGB'))
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    models = {'eve': source}
    for variant in build.VARIANTS:
        model = (args.result / variant.filename).read_bytes()
        models[variant.key] = model
        doc, binary = build.helpers.read_glb(model)
        require(normalized(doc) == normalized(before), f'{variant.key}: unexpected metadata change')
        root_scale = doc['nodes'][0].get('scale', [1, 1, 1])
        require(root_scale == [variant.scale] * 3, f'{variant.key}: scale not uniform/correct')
        allowed_views = {0, 1, 17}
        if variant.brown_iris:
            allowed_views.add(9)
        if any(name.startswith('eyes/') for name in variant.face):
            allowed_views.update({10, 18, 19})
        for i in range(len(before['bufferViews'])):
            if i not in allowed_views:
                require(build.eye.brow.view_bytes(before, source_binary, i) == build.eye.brow.view_bytes(doc, binary, i),
                        f'{variant.key}: unexpected changed binary view {i}')
        q = build.helpers.accessor(doc, binary, 0).astype(np.float64)
        nn = build.helpers.accessor(doc, binary, 1)
        delta = np.linalg.norm(q - p, axis=1)
        changed = delta > 1e-8
        require(np.count_nonzero(changed) > 800, f'{variant.key}: shape did not change enough to test')
        require(not np.any(changed[protected]), f'{variant.key}: protected arm/leg vertex changed')
        require(np.array_equal(nn[protected], n[protected]), f'{variant.key}: protected arm/leg normals changed')
        require(np.array_equal(q[hand], p[hand]) and np.array_equal(nn[hand], n[hand]),
                f'{variant.key}: local hand geometry/normals changed')
        in_regions = (((p[:, 1] > .835) & (p[:, 1] < 1.09))
                      | ((p[:, 1] > 1.06) & (p[:, 1] < 1.40))
                      | ((p[:, 1] > 1.448) & (p[:, 1] < 1.60)))
        require(not np.any(changed & ~in_regions), f'{variant.key}: positions changed outside selected regions')
        low = np.full((groups.max() + 1, 3), np.inf)
        high = np.full_like(low, -np.inf)
        np.minimum.at(low, groups, q - p)
        np.maximum.at(high, groups, q - p)
        seam = np.linalg.norm(high - low, axis=1).max()
        require(seam < 1e-7, f'{variant.key}: previously welded vertices separated by {seam} m')
        triangles = q[faces]
        new_normal = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        new_area = np.linalg.norm(new_normal, axis=1)
        dot = (new_normal * original_normal).sum(axis=1)
        require(not np.any(valid & (dot <= 0)), f'{variant.key}: a nondegenerate triangle reversed >90 degrees')
        require(not np.any(valid & (new_area < original_area * .10)), f'{variant.key}: triangle nearly collapsed')
        if variant.chest_reduction:
            # Large sudden face-normal changes in this region exposed a bad
            # constrained reduction even though it passed collision checks.
            # This is a regression guard, not a substitute for visual review.
            cosines = dot[chest_front] / (original_area[chest_front] * new_area[chest_front])
            max_angle = np.degrees(np.arccos(np.clip(cosines, -1., 1.))).max()
            require(max_angle < 25., f'{variant.key}: abrupt chest face-normal change: {max_angle:.1f} degrees')
            print(f'PASS {variant.key}: selected front-chest face normals changed at most {max_angle:.1f}°')

        iris = np.asarray(Image.open(io.BytesIO(build.eye.brow.view_bytes(doc, binary, 9))).convert('RGB'))
        pixel_diff = np.any(iris != original_eye, axis=2)
        if variant.brown_iris:
            require(20_000 < np.count_nonzero(pixel_diff) < 100_000 and not np.any(pixel_diff & (radius >= 128)),
                    f'{variant.key}: tint extends outside the iris')
            require(not np.any(pixel_diff & (radius < 30))
                    and not np.any(pixel_diff & (original_eye.max(axis=2) <= 5)), f'{variant.key}: pupil changed')
        else:
            require(not np.any(pixel_diff), f'{variant.key}: eye pixels changed unexpectedly')
        lids = build.helpers.accessor(doc, binary, 8).reshape(2, 61, 7, 3)
        lid_move = build.helpers.accessor(doc, binary, 16).reshape(2, 61, 7, 3)
        lid_narrow = build.helpers.accessor(doc, binary, 17).reshape(2, 61, 7, 3)
        for b in np.linspace(0, 1, 11):
            pose = lids + b * lid_move + min(1., 2 * b) * lid_narrow
            require(np.all(pose[:, :, -1, 1] > pose[:, :, 0, 1]), f'{variant.key}: inverted eyelid row at {b}')
        print(f'PASS {variant.key}: {changed.sum():,} local vertices changed, max {delta.max()*1000:.2f} mm; '
              f'height={1.675*variant.scale:.4f} m; hands, arm-influenced original vertices and '
              f'lower region preserved locally; welds, triangles, eye selection and 11 eyelid weights verified')

    archive_path = args.result / build.ARCHIVE_NAME
    with zipfile.ZipFile(archive_path) as archive:
        require(archive.testzip() is None, 'Corrupt archive')
        expected = ['BladesOfWar_Showcase.html', build.eye.MODEL_NAME,
                    *[v.filename for v in build.VARIANTS], 'README.txt', 'LICENSE_MAKEHUMAN_ASSETS.md']
        require(archive.namelist() == expected, 'Unexpected ZIP contents')
        html = archive.read('BladesOfWar_Showcase.html')
        for key, filename in [('eve', build.eye.MODEL_NAME), *[(v.key, v.filename) for v in build.VARIANTS]]:
            require(archive.read(filename) == models[key], f'Wrong {key} GLB in ZIP')
            require(base64.b64encode(models[key]) in html, f'Wrong {key} GLB in viewer')
        require(html == showcase.make_showcase(models, args.well_archive, build), 'Viewer or well differs')
        require(archive.read('README.txt') == build.ARCHIVE_README.encode('utf-8'), 'Wrong archive notes')
    print('PASS: ZIP contains all four exact models and their offline interactive viewer')
    if args.rebuild:
        regenerated = build.build_variants(source, reference)
        for key in regenerated:
            require(regenerated[key] == models[key], f'{key}: non-reproducible GLB')
        require(build.make_archive(models, showcase.make_showcase(models, args.well_archive, build)) == archive_path.read_bytes(),
                'Non-reproducible ZIP')
        print('PASS: all model and archive bytes rebuild exactly')


if __name__ == '__main__':
    main()
