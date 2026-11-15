#!/usr/bin/env python3
"""Verify the brow-only edit, unchanged animation/geometry and offline ZIP."""
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


def normalized_metadata(document: dict) -> dict:
    result = copy.deepcopy(document)
    result['asset'].pop('generator', None)
    for view in result['bufferViews']:
        view.pop('byteOffset', None)
    result['bufferViews'][build.SKIN_VIEW].pop('byteLength', None)
    result['buffers'][0].pop('byteLength', None)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument('--result', type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'preceding fist trial')
    model = (args.result / build.MODEL_NAME).read_bytes()
    old, before = build.helpers.read_glb(source)
    new, after = build.helpers.read_glb(model)
    require(normalized_metadata(old) == normalized_metadata(new),
            'Geometry, material, animation or other GLB metadata changed')
    for index in range(len(old['bufferViews'])):
        if index != build.SKIN_VIEW:
            require(build.view_bytes(old, before, index) == build.view_bytes(new, after, index),
                    f'Unexpected binary change to view {index}')
    print('PASS: geometry, normals, UVs, ears, hand morphs, blink, clips, materials and eye texture are byte-identical')

    old_png = build.view_bytes(old, before, build.SKIN_VIEW)
    new_png = build.view_bytes(new, after, build.SKIN_VIEW)
    require(build.shift_brows(old_png) == new_png, 'New image is not the verified brow reconstruction')
    old_skin = np.asarray(Image.open(io.BytesIO(old_png)).convert('RGB'))
    new_skin = np.asarray(Image.open(io.BytesIO(new_png)).convert('RGB'))
    diff = np.any(old_skin != new_skin, axis=2)
    yy, xx = np.where(diff)
    require(600 < len(xx) < 900 and xx.min() >= 824 and xx.max() < 854
            and yy.min() >= 456 and yy.max() < 600, 'Texture changes extend beyond the brow patches')
    require(np.count_nonzero(yy < 528) > 200 and np.count_nonzero(yy > 528) > 200,
            'Both brow patches must change')
    # On this model's existing UV island increasing U points down the face.
    positions = build.helpers.accessor(new, after, 0)
    uvs = build.helpers.accessor(new, after, 2)
    faces = np.concatenate([build.helpers.accessor(new, after, index).reshape(-1, 3) for index in (3, 13)])
    coords, valid = build.motion.relief.uv_positions(positions, uvs, faces)
    ys = np.arange(470, 591)
    slopes = []
    for x in (836, 838, 840, 842):
        selected = valid[ys, x] & valid[ys, x + 1]
        slopes.extend((coords[ys[selected], x + 1, 1] - coords[ys[selected], x, 1]).tolist())
    median = float(np.median(slopes))
    require(median < -.001, 'Increasing texture U does not point down on the brow surface')
    print(f'PASS: {len(xx)} changed skin texels only at x={xx.min()}..{xx.max()}, y={yy.min()}..{yy.max()}; '
          f'additional shift {build.EXTRA_SHIFT_PIXELS:.2f} px, median vertical scale {median * 1000:.2f} mm/px')

    archive_path = args.result / build.ARCHIVE_NAME
    with zipfile.ZipFile(archive_path) as archive:
        require(archive.testzip() is None, 'Corrupt archive')
        require(archive.namelist() == ['BladesOfWar_Showcase.html', build.MODEL_NAME, 'README.txt',
                                       'LICENSE_MAKEHUMAN_ASSETS.md'], 'Unexpected archive contents')
        html = archive.read('BladesOfWar_Showcase.html')
        require(archive.read(build.MODEL_NAME) == model, 'Archive model differs')
        require(html == build.make_showcase(model, args.well_archive), 'Viewer or well bundle differs')
        require(base64.b64encode(model) in html, 'Embedded model differs')
        require(archive.read('README.txt') == build.ARCHIVE_README.encode('utf-8'), 'Archive notes differ')
        require('не боевой риг' in build.ARCHIVE_README and 'самопересечения' in build.ARCHIVE_README,
                'Known limitations missing')
    print('PASS: archive contains exact model, unchanged well/engine, offline viewer and limitations')
    if args.rebuild:
        rebuilt = build.build_model(source)
        require(rebuilt == model, 'Rebuilt GLB differs')
        require(build.make_archive(rebuilt, build.make_showcase(rebuilt, args.well_archive)) == archive_path.read_bytes(),
                'Rebuilt archive differs')
        print('PASS: model and ZIP rebuild byte-for-byte')


if __name__ == '__main__':
    main()
