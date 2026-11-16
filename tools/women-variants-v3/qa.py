#!/usr/bin/env python3
"""Check the v3 facial changes, protected limbs, morphs and offline ZIP."""
from __future__ import annotations

import argparse
import base64
import copy
import io
import json
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

import build
import showcase


V2_HASHES = {
    'north': '0711263e3c84365cf3795e3fd34055cfa5e15bf558a6e0647ab4b1cf881d836d',
    'central': '568e7d92e2d583d79400d9b2ae9e2443ef0aab2732e8b0d550914f6f5982d566',
    'east': '32be24d813e01d6854ebd14fc85e1cf8ee86043f70b544702e15c73543b6ee55',
    'africa': 'e0856f962059ad6569a950903d26be9fe1406013004707c1c8cf15458a2d0eeb',
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def normalized(document: dict) -> dict:
    doc = copy.deepcopy(document)
    doc['asset'].pop('generator', None)
    doc['asset'].pop('extras', None)
    doc['nodes'][0].pop('scale', None)
    for view in doc['bufferViews']:
        view.pop('byteOffset', None)
    for index in (8, 9):
        doc['bufferViews'][index].pop('byteLength', None)
    doc['buffers'][0].pop('byteLength', None)
    for index in (0, 4, 8, 14, 16, 17):
        doc['accessors'][index].pop('min', None)
        doc['accessors'][index].pop('max', None)
    return doc


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.SOURCE)
    parser.add_argument('--reference', type=Path, default=build.eye.DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=build.refinement.DEFAULT_WELL)
    parser.add_argument('--result', type=Path, default=build.OUTPUT)
    parser.add_argument('--previous', type=Path, default=build.v2.OUTPUT)
    parser.add_argument('--rebuild', action='store_true')
    parser.add_argument('--models-only', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'Eve eye study')
    reference = build.motion.checked(args.reference, build.eye.REFERENCE_SHA256, 'auxiliary weight source')
    before, source_bin = build.helpers.read_glb(source)
    p = build.helpers.accessor(before, source_bin, 0).astype(np.float64)
    n = build.helpers.accessor(before, source_bin, 1)
    uv = build.helpers.accessor(before, source_bin, 2)
    faces = np.concatenate([build.helpers.accessor(before, source_bin, i).reshape(-1, 3) for i in (3, 13)])
    arms = build.old.arm_weights(reference, uv)
    protected = np.zeros(len(p), dtype=bool)
    protected[:build.ORIGINAL_COUNT] = arms > 1e-8
    protected |= p[:, 1] <= .835
    hand = np.linalg.norm(build.helpers.accessor(before, source_bin, 11), axis=1) > 1e-8
    _, groups = np.unique(p, axis=0, return_inverse=True)
    tri = p[faces]
    original_normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    original_area = np.linalg.norm(original_normal, axis=1)
    valid = original_area > 1e-13
    chest = (valid & (tri[:, :, 1].mean(1) > 1.10) & (tri[:, :, 1].mean(1) < 1.31)
             & (tri[:, :, 2].mean(1) > .10) & (np.abs(tri[:, :, 0]).mean(1) < .16))
    source_skin = build.eye.brow.view_bytes(before, source_bin, 8)
    source_eye = build.eye.brow.view_bytes(before, source_bin, 9)
    old_eye = np.asarray(Image.open(io.BytesIO(source_eye)).convert('RGB'))
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    manifest = json.loads((build.v2.DATA / 'manifest.json').read_text())
    used = {name for variant in build.VARIANTS for name in variant.base.extra_face}
    require(set(manifest) == used, 'Target manifest must describe exactly the inherited targets in use')
    for name, checksum in manifest.items():
        require(build.motion.sha256((build.v2.DATA / name).read_bytes()) == checksum, f'Target checksum mismatch: {name}')
    require(not before.get('skins') and not any('skin' in node for node in before['nodes']), 'Eve unexpectedly has a skeleton')
    for mesh in before['meshes']:
        for primitive in mesh['primitives']:
            require(not any(k.startswith(('JOINTS_', 'WEIGHTS_')) for k in primitive['attributes']), 'Unexpected joint attributes')
    mouth_region = ((np.abs(p[:, 0]) < .043) & (p[:, 1] > 1.48) & (p[:, 1] < 1.522) & (p[:, 2] > .085))
    ear_region = ((np.abs(p[:, 0]) > .068) & (p[:, 1] > 1.51) & (p[:, 1] < 1.605)
                  & (p[:, 2] > -.02) & (p[:, 2] < .07))
    head_region = p[:, 1] > 1.46
    brow_mask = np.zeros((1024, 1024), dtype=bool)
    brow_mask[456:600, 824:854] = True
    raw_skin = build.eye.brow.original_skin()

    models = {'eve': source}
    colours, brow_shapes = [], []
    for variant in build.VARIANTS:
        model = (args.result / variant.filename).read_bytes()
        models[variant.key] = model
        doc, binary = build.helpers.read_glb(model)
        prior = next(v for v in build.v2.VARIANTS if v.key == variant.key)
        prior_bytes = build.motion.checked(args.previous / prior.filename, V2_HASHES[variant.key], f'{variant.key} v2')
        prior_doc, prior_bin = build.helpers.read_glb(prior_bytes)
        prior_p = build.helpers.accessor(prior_doc, prior_bin, 0).astype(np.float64)
        require(normalized(doc) == normalized(before), f'{variant.key}: unexpected metadata change')
        require(not doc.get('skins') and not any('skin' in node for node in doc['nodes']),
                f'{variant.key}: unexpected skeleton')
        require(doc['nodes'][0].get('scale', [1, 1, 1]) == [variant.scale] * 3,
                f'{variant.key}: height scale is not uniform/correct')
        allowed_views = {0, 1, 4, 5, 8, 9, 10, 11, 16, 17, 18, 19}
        for i in range(len(before['bufferViews'])):
            if i not in allowed_views:
                require(build.eye.brow.view_bytes(before, source_bin, i) == build.eye.brow.view_bytes(doc, binary, i),
                        f'{variant.key}: unexpected changed binary view {i}')
        q = build.helpers.accessor(doc, binary, 0).astype(np.float64)
        nn = build.helpers.accessor(doc, binary, 1)
        delta = np.linalg.norm(q - p, axis=1)
        changed = delta > 1e-8
        require(np.count_nonzero(changed) > 4_000, f'{variant.key}: insufficient shape change to test')
        require(not np.any(changed[protected]), f'{variant.key}: protected arm/leg vertex changed')
        require(np.array_equal(nn[protected], n[protected]), f'{variant.key}: protected arm/leg normal changed')
        require(np.array_equal(q[hand], p[hand]) and np.array_equal(nn[hand], n[hand]),
                f'{variant.key}: local hand geometry/normals changed')
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
        require(not np.any(valid & (dot <= 0)), f'{variant.key}: nondegenerate triangle turned more than 90 degrees')
        require(not np.any(valid & (new_area < original_area * .10)), f'{variant.key}: triangle nearly collapsed')
        # The separately stored eyeballs and lid ribbon are deformed too;
        # check their triangle orientation/area, not just the body mesh.
        for position_index, face_index in ((4, 7), (8, 10)):
            reference_points = build.helpers.accessor(before, source_bin, position_index).astype(float)
            current_points = build.helpers.accessor(doc, binary, position_index).astype(float)
            indices = build.motion.rig_accessor(before, source_bin, face_index).reshape(-1, 3)
            before_tri, after_tri = reference_points[indices], current_points[indices]
            a = np.cross(before_tri[:, 1] - before_tri[:, 0], before_tri[:, 2] - before_tri[:, 0])
            b = np.cross(after_tri[:, 1] - after_tri[:, 0], after_tri[:, 2] - after_tri[:, 0])
            aa, bb = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
            good = aa > 1e-14
            require(not np.any(good & (np.sum(a * b, axis=1) <= 0)),
                    f'{variant.key}: eye/line triangle reversed in accessor {position_index}')
            require(not np.any(good & (bb < aa * .10)),
                    f'{variant.key}: eye/line triangle nearly collapsed in accessor {position_index}')
        cosine = dot[chest] / (original_area[chest] * new_area[chest])
        chest_angle = np.degrees(np.arccos(np.clip(cosine, -1., 1.))).max()
        require(chest_angle < 25., f'{variant.key}: abrupt front-chest normal change {chest_angle:.1f}°')
        for index in (1, 5, 9):
            lengths = np.linalg.norm(build.helpers.accessor(doc, binary, index).astype(float), axis=1)
            require(np.all(np.isfinite(lengths)) and np.all(np.abs(lengths - 1) < 1e-4),
                    f'{variant.key}: unexpected normal lengths in accessor {index}')
        base_eyes = build.v2.reshape_head(build.helpers.accessor(before, source_bin, 4), variant.base).astype('<f4')
        expected_eyes = build.warp_features(base_eyes.astype(float), variant)
        current_eyes = build.helpers.accessor(doc, binary, 4).astype(float)
        require(np.max(np.abs(current_eyes - expected_eyes)) < 2e-7,
                f'{variant.key}: eyeball/head transforms disagree')
        old_eyes = build.helpers.accessor(prior_doc, prior_bin, 4).astype(float)
        eye_diff = np.linalg.norm(current_eyes - old_eyes, axis=1).max()
        ear_diff = np.linalg.norm(q[ear_region] - prior_p[ear_region], axis=1).max()
        lip_diff = np.linalg.norm(q[mouth_region] - prior_p[mouth_region], axis=1).max()
        require(min(eye_diff, ear_diff, lip_diff) > .0003,
                f'{variant.key}: an intended eye, ear or lip region did not differ from v2')

        skin = build.eye.brow.view_bytes(doc, binary, 8)
        tinted = build.v2.tint_skin(source_skin, variant.base.skin)
        actual = np.asarray(Image.open(io.BytesIO(skin)).convert('RGB'))
        expected_tint = np.asarray(Image.open(io.BytesIO(tinted)).convert('RGB'))
        pixels_changed = np.any(actual != expected_tint, axis=2)
        require(not np.any(pixels_changed & ~brow_mask), f'{variant.key}: brow repaint escaped its UV patch')
        require(250 < int(pixels_changed.sum()) < 1500, f'{variant.key}: brow repaint unexpectedly small or large')
        require(skin == build.repaint_brows(tinted, source_skin, variant.base.skin, variant.brows),
                f'{variant.key}: brow texture does not match its intended style')
        colours.append(actual)
        brow_shapes.append(build.styled_brow_image(raw_skin, variant.brows)[456:600, 824:854])
        require(not np.array_equal(actual, np.asarray(Image.open(io.BytesIO(source_skin)).convert('RGB'))),
                f'{variant.key}: skin tint did not change')
        if variant.key == 'central':
            prior_skin = np.asarray(Image.open(io.BytesIO(build.eye.brow.view_bytes(prior_doc, prior_bin, 8))).convert('RGB'))
            prior_head = np.ptp(prior_p[head_region], axis=0)
            new_head = np.ptp(q[head_region], axis=0)
            require(np.all(actual.mean(axis=(0, 1)) > prior_skin.mean(axis=(0, 1)) + 20),
                    'Central: the skin atlas was not visibly lightened')
            require(new_head[0] > prior_head[0] * 1.05 and new_head[1] < prior_head[1] * .97,
                    'Central: head did not become wider and shorter relative to v2')
            print(f'PASS central v2 → v3: head bbox {prior_head[0]*1000:.1f}×{prior_head[1]*1000:.1f} → '
                  f'{new_head[0]*1000:.1f}×{new_head[1]*1000:.1f} mm; all skin atlas channels lighter')
        eye = build.eye.brow.view_bytes(doc, binary, 9)
        require(eye == build.v2.tint_iris(source_eye, variant.base.iris), f'{variant.key}: unexpected iris tint')
        iris = np.asarray(Image.open(io.BytesIO(eye)).convert('RGB'))
        pixel_diff = np.any(iris != old_eye, axis=2)
        require(20_000 < int(pixel_diff.sum()) < 100_000 and not np.any(pixel_diff & (radius >= 128)),
                f'{variant.key}: tint extends outside the iris')
        require(not np.any(pixel_diff & (radius < 30)) and not np.any(pixel_diff & (old_eye.max(axis=2) <= 5)),
                f'{variant.key}: pupil changed')

        lids = build.helpers.accessor(doc, binary, 8).reshape(2, 61, 7, 3)
        lid_move = build.helpers.accessor(doc, binary, 16).reshape(2, 61, 7, 3)
        lid_narrow = build.helpers.accessor(doc, binary, 17).reshape(2, 61, 7, 3)
        for b in np.linspace(0, 1, 11):
            pose = lids + b * lid_move + min(1., 2 * b) * lid_narrow
            require(np.all(pose[:, :, -1, 1] > pose[:, :, 0, 1]), f'{variant.key}: inverted eyelid row at {b}')
        height = (q[:, 1].max() - q[:, 1].min()) * variant.scale
        print(f'PASS {variant.key}: {changed.sum():,} local vertices changed; {height*100:.1f} cm; '
              f'protected limbs and hand morphs unchanged; weld max {seam*1000:.5f} mm; '
              f'front chest normal change {chest_angle:.1f}°; 11 lid weights; '
              f'v2 → v3 max eye/ear/lip shift {eye_diff*1000:.2f}/{ear_diff*1000:.2f}/{lip_diff*1000:.2f} mm; '
              f'{pixels_changed.sum()} eyebrow pixels')
    for i in range(len(colours)):
        for j in range(i):
            require(not np.array_equal(colours[i], colours[j]), 'Two variants have identical skin images')
            require(np.count_nonzero(np.any(brow_shapes[i] != brow_shapes[j], axis=2)) > 100,
                    'Two variants have unexpectedly identical brow styles')

    if not args.models_only:
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
        print('PASS: ZIP embeds five exact models and their offline comparison viewer')
    if args.rebuild:
        rebuilt = build.build_variants(source, reference)
        for key in rebuilt:
            require(rebuilt[key] == models[key], f'{key}: non-reproducible GLB')
        if not args.models_only:
            require(build.make_archive(models, showcase.make_showcase(models, args.well_archive, build)) == archive_path.read_bytes(),
                    'Non-reproducible ZIP')
        print('PASS: all requested model and archive bytes rebuild exactly')


if __name__ == '__main__':
    main()
