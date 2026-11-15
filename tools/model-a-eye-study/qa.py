#!/usr/bin/env python3
"""Check the eye-only change against the approved brows, including reproducibility."""
from __future__ import annotations

import argparse
import base64
import copy
import io
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def normalized(document: dict) -> dict:
    result = copy.deepcopy(document)
    result['asset'].pop('generator', None)
    for view in result['bufferViews']:
        view.pop('byteOffset', None)
    result['bufferViews'][build.EYE_VIEW].pop('byteLength', None)
    result['buffers'][0].pop('byteLength', None)
    for i in (8, 16, 17):
        result['accessors'][i].pop('min', None)
        result['accessors'][i].pop('max', None)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument('--reference', type=Path, default=build.DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    parser.add_argument('--result', type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'approved brow study')
    reference = build.motion.checked(args.reference, build.REFERENCE_SHA256, 'reference eye texture')
    model = (args.result / build.MODEL_NAME).read_bytes()
    old, before = build.helpers.read_glb(source)
    new, after = build.helpers.read_glb(model)
    require(normalized(old) == normalized(new), 'Unexpected metadata changes')
    changed_views = {9, 10, 18, 19}
    for index in range(len(old['bufferViews'])):
        if index not in changed_views:
            require(build.brow.view_bytes(old, before, index) == build.brow.view_bytes(new, after, index),
                    f'Unexpected changed buffer view {index}')
    print('PASS: body, face, brows, ears, eyes geometry, UVs, normals, hands, fist morphs, blink face and animation data are byte-identical')

    old_image = np.asarray(Image.open(io.BytesIO(build.brow.view_bytes(old, before, 9))).convert('RGB'))
    new_image = np.asarray(Image.open(io.BytesIO(build.brow.view_bytes(new, after, 9))).convert('RGB'))
    diff = np.any(old_image != new_image, axis=2)
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    require(85_000 < int(diff.sum()) < 100_000, 'Unexpected number of changed eye texels')
    require(not np.any(diff & (radius <= 132)) and not np.any(diff & (radius >= 350)),
            'The iris, pupil or other regions changed')
    require(np.count_nonzero(diff & (yy < 512)) > 30_000 and np.count_nonzero(diff & (yy > 512)) > 30_000,
            'Both sclera patches were not treated')
    print(f'PASS: {diff.sum():,} blue-stained sclera texels corrected; iris/pupil and all other texels unchanged')

    p0 = build.helpers.accessor(old, before, 8)
    p1 = build.helpers.accessor(new, after, 8)
    distance = np.linalg.norm(p1.astype(float) - p0.astype(float), axis=1)
    require(distance.max() < .001, 'Eyelid ribbon moved too far')
    require(np.array_equal(p0[:, 0], p1[:, 0]), 'Eyelid strip x-positions changed')
    lids = p1.reshape(2, 61, 7, 3)
    move = build.helpers.accessor(new, after, 16).reshape(2, 61, 7, 3)
    narrow = build.helpers.accessor(new, after, 17).reshape(2, 61, 7, 3)
    for b in np.linspace(0, 1, 11):
        pose = lids + b * move + min(1, 2 * b) * narrow
        require(np.all(pose[:, :, -1, 1] > pose[:, :, 0, 1]), f'Ribbon inverted at blink={b}')
    print(f'PASS: eyelid x/indices/normals unchanged; maximum line displacement {distance.max()*1000:.3f} mm; '
          'non-inverted row widths at 11 blink weights')

    archive_path = args.result / build.ARCHIVE_NAME
    with zipfile.ZipFile(archive_path) as archive:
        require(archive.testzip() is None, 'Corrupt ZIP')
        require(archive.namelist() == ['BladesOfWar_Showcase.html', build.MODEL_NAME, 'README.txt',
                                       'LICENSE_MAKEHUMAN_ASSETS.md'], 'Unexpected ZIP entries')
        html = archive.read('BladesOfWar_Showcase.html')
        require(archive.read(build.MODEL_NAME) == model and base64.b64encode(model) in html, 'Wrong embedded GLB')
        require(html == build.make_showcase(model, args.well_archive), 'Unexpected viewer or well')
        require(archive.read('README.txt') == build.ARCHIVE_README.encode('utf-8'), 'Unexpected archive notes')
    if args.rebuild:
        rebuilt = build.build_model(source, reference)
        require(rebuilt == model, 'Rebuilt GLB differs')
        require(build.make_archive(rebuilt, build.make_showcase(rebuilt, args.well_archive)) == archive_path.read_bytes(),
                'Rebuilt ZIP differs')
        print('PASS: GLB and ZIP rebuilt byte-for-byte')
    print('PASS: ZIP embeds exact model and offline showcase')


if __name__ == '__main__':
    main()
