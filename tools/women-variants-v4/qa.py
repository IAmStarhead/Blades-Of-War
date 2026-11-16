#!/usr/bin/env python3
"""Verify the v4 studies, intended v3 changes, protected geometry and offline ZIP."""
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

V3_HASHES = {
    'north': 'b11246e360494e52378440ed1c99e1aa1b891dd7559416dd9529b3d7a005a142',
    'central': 'dc38128603a19f295f4c33e6c40d1ae338254ccd27f53fa7c88f5036e10fcadb',
    'east': '790493eb5926a80d41fbe6cfad76e4de7160ae39b572c255c059516105ba72d4',
    'africa': 'bc9c1c4b4954eb808aaa91fc06ad9a909542a190585de0b98706d9823abbaae3',
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
    # The skin/eye PNGs vary in length, and the blink patch has been
    # repartitioned between the body and face index buffers.
    for index in (3, 8, 9, 15):
        doc['bufferViews'][index].pop('byteLength', None)
    for index in (3, 13):
        doc['accessors'][index].pop('count', None)
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
    parser.add_argument('--previous', type=Path, default=build.v3.OUTPUT)
    parser.add_argument('--models-only', action='store_true')
    parser.add_argument('--rebuild', action='store_true')
    args = parser.parse_args()
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'Eve eye study')
    reference = build.motion.checked(args.reference, build.eye.REFERENCE_SHA256, 'auxiliary weight source')
    doc0, bin0 = build.helpers.read_glb(source)
    p = build.helpers.accessor(doc0, bin0, 0).astype(float)
    n = build.helpers.accessor(doc0, bin0, 1)
    uv = build.helpers.accessor(doc0, bin0, 2)
    faces = np.concatenate([build.helpers.accessor(doc0, bin0, i).reshape(-1, 3) for i in (3, 13)])
    arms = build.old.arm_weights(reference, uv)
    protected = p[:, 1] <= .835
    protected[:build.ORIGINAL_COUNT] |= arms > 1e-8
    hand = np.linalg.norm(build.helpers.accessor(doc0, bin0, 11), axis=1) > 1e-8
    _, groups = np.unique(p, axis=0, return_inverse=True)
    tri0 = p[faces]
    normal0 = np.cross(tri0[:, 1] - tri0[:, 0], tri0[:, 2] - tri0[:, 0])
    area0 = np.linalg.norm(normal0, axis=1)
    valid = area0 > 1e-13
    chest = (valid & (tri0[:, :, 1].mean(1) > 1.10) & (tri0[:, :, 1].mean(1) < 1.31)
             & (tri0[:, :, 2].mean(1) > .10) & (np.abs(tri0[:, :, 0]).mean(1) < .16))
    x, y, z = p.T
    cheek = ((np.abs(x) > .035) & (np.abs(x) < .075) & (y > 1.51) & (y < 1.545) & (z > .075))
    nose = ((np.abs(x) < .023) & (y > 1.51) & (y < 1.56) & (z > .105))
    hip = ((np.abs(x) > .06) & (np.abs(x) < .16) & (y > .90) & (y < 1.0) & (z < -.02) & ~protected)
    butt = ((np.abs(x) > .025) & (np.abs(x) < .13) & (y > .88) & (y < .99) & (z < -.04) & ~protected)
    bust = ((np.abs(x) > .06) & (np.abs(x) < .14) & (y > 1.16) & (y < 1.25) & (z > .135) & ~protected)
    old_eye = build.eye.brow.view_bytes(doc0, bin0, 9)
    raw_brow = build.eye.brow.original_skin()
    brow_mask = np.zeros((1024, 1024), dtype=bool); brow_mask[456:600, 824:854] = True
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    source_eye = np.asarray(Image.open(io.BytesIO(old_eye)).convert('RGB'))
    source_skin = build.eye.brow.view_bytes(doc0, bin0, 8)
    lid_source = build.helpers.accessor(doc0, bin0, 8).astype(float)
    lid_source_blink = build.helpers.accessor(doc0, bin0, 16).astype(float)
    lid_source_narrow = build.helpers.accessor(doc0, bin0, 17).astype(float)
    lid_faces = build.motion.rig_accessor(doc0, bin0, 10).reshape(-1, 3)
    manifest = json.loads((build.DATA / 'manifest.json').read_text())
    expected_targets = set(build.EAST_EYE_TARGETS) | {f'macrodetails/{name}-female-young.target'
                                                       for name in ('african', 'asian', 'caucasian')}
    require(set(manifest) == expected_targets, 'The v4 target manifest does not match the target set')
    mapping = build.refinement.vertex_map(build.ORIGINAL_COUNT)
    for name in manifest:
        build.load_target(name, mapping, manifest)
    require(not doc0.get('skins') and not any('skin' in node for node in doc0['nodes']), 'Unexpected skeleton')
    for mesh in doc0['meshes']:
        for primitive in mesh['primitives']:
            require(not any(k.startswith(('JOINTS_', 'WEIGHTS_')) for k in primitive['attributes']), 'Unexpected joint data')
    models = {'eve': source}
    shapes, brows = {'eve': p}, []
    for variant in build.VARIANTS:
        data = (args.result / variant.filename).read_bytes()
        models[variant.key] = data
        doc, binary = build.helpers.read_glb(data)
        q = build.helpers.accessor(doc, binary, 0).astype(float)
        nn = build.helpers.accessor(doc, binary, 1)
        shapes[variant.key] = q
        require(normalized(doc) == normalized(doc0), f'{variant.key}: unexpected glTF structure')
        require(not doc.get('skins') and not any('skin' in node for node in doc['nodes']), f'{variant.key}: skeleton added')
        require(doc['nodes'][0].get('scale', [1, 1, 1]) == [variant.scale] * 3, f'{variant.key}: scale differs')
        allowed_views = {0, 1, 3, 4, 5, 8, 9, 10, 11, 15, 16, 17, 18, 19}
        for i in range(len(doc0['bufferViews'])):
            if i not in allowed_views:
                require(build.eye.brow.view_bytes(doc0, bin0, i) == build.eye.brow.view_bytes(doc, binary, i),
                        f'{variant.key}: changed protected binary view {i}')
        body_faces = build.helpers.accessor(doc, binary, 3).reshape(-1, 3)
        animated_faces = build.helpers.accessor(doc, binary, 13).reshape(-1, 3)
        partitioned = np.concatenate((body_faces, animated_faces))
        def sorted_faces(f):
            return f[np.lexsort((f[:, 2], f[:, 1], f[:, 0]))]
        require(partitioned.shape == faces.shape and np.array_equal(sorted_faces(partitioned), sorted_faces(faces)),
                f'{variant.key}: missing, duplicated, or rewound body triangle')
        body_vertices, animated_vertices = np.unique(body_faces), np.unique(animated_faces)
        blink = build.helpers.accessor(doc, binary, 14).astype(float)
        blink_normal = build.helpers.accessor(doc, binary, 15)
        require(not np.any(blink[body_vertices]) and not np.any(blink_normal[body_vertices]),
                f'{variant.key}: Blink would tear or shade the static body/face boundary')
        for index in (11, 12, 25, 26, 27, 28, 29, 30):
            require(not np.any(build.helpers.accessor(doc, binary, index)[animated_vertices]),
                    f'{variant.key}: Fist morph influences the independent blink patch')
        require(np.array_equal(q[protected], p[protected]), f'{variant.key}: protected limb position changed')
        require(np.array_equal(nn[protected], n[protected]), f'{variant.key}: protected limb normal changed')
        require(np.array_equal(q[hand], p[hand]) and np.array_equal(nn[hand], n[hand]), f'{variant.key}: hand changed')
        low = np.full((groups.max() + 1, 3), np.inf); high = np.full_like(low, -np.inf)
        np.minimum.at(low, groups, q - p); np.maximum.at(high, groups, q - p)
        seam = np.linalg.norm(high - low, axis=1).max()
        require(seam < 1e-7, f'{variant.key}: split seam {seam} m')
        # Equal displacement at welded duplicates, plus zero motion on the
        # static body, guarantees these seams stay together for linear Blink.
        blink_low = np.full_like(low, np.inf); blink_high = np.full_like(low, -np.inf)
        np.minimum.at(blink_low, groups, blink); np.maximum.at(blink_high, groups, blink)
        blink_seam = np.linalg.norm(blink_high - blink_low, axis=1).max()
        require(blink_seam < 1e-7, f'{variant.key}: blink splits a welded seam by {blink_seam} m')
        tr = q[faces]
        normal = np.cross(tr[:, 1] - tr[:, 0], tr[:, 2] - tr[:, 0])
        area = np.linalg.norm(normal, axis=1)
        dot = (normal * normal0).sum(axis=1)
        require(not np.any(valid & (dot <= 0)), f'{variant.key}: body triangle rotated more than 90 degrees')
        require(not np.any(valid & (area < area0 * .1)), f'{variant.key}: nearly collapsed body triangle')
        for pos_idx, face_idx in ((4, 7), (8, 10)):
            orig = build.helpers.accessor(doc0, bin0, pos_idx).astype(float)
            curr = build.helpers.accessor(doc, binary, pos_idx).astype(float)
            idx = build.motion.rig_accessor(doc0, bin0, face_idx).reshape(-1, 3)
            a, b = orig[idx], curr[idx]
            an = np.cross(a[:, 1] - a[:, 0], a[:, 2] - a[:, 0])
            bn = np.cross(b[:, 1] - b[:, 0], b[:, 2] - b[:, 0])
            aa, bb = np.linalg.norm(an, axis=1), np.linalg.norm(bn, axis=1)
            good = aa > 1e-14
            require(not np.any(good & ((an * bn).sum(axis=1) <= 0)), f'{variant.key}: reversed eye/line face')
            require(not np.any(good & (bb < aa * .1)), f'{variant.key}: nearly collapsed eye/line face')
        angle = np.degrees(np.arccos(np.clip(dot[chest] / (area0[chest] * area[chest]), -1, 1))).max()
        require(angle < 25, f'{variant.key}: abrupt chest normal change {angle:.1f} degrees')
        for index in (1, 5, 9):
            lengths = np.linalg.norm(build.helpers.accessor(doc, binary, index).astype(float), axis=1)
            require(np.all(np.isfinite(lengths)) and np.all(np.abs(lengths - 1) < 1e-4), f'{variant.key}: invalid normals')
        lids = build.helpers.accessor(doc, binary, 8).astype(float).reshape(2, 61, 7, 3)
        move = build.helpers.accessor(doc, binary, 16).astype(float).reshape(2, 61, 7, 3)
        narrow = build.helpers.accessor(doc, binary, 17).astype(float).reshape(2, 61, 7, 3)
        for b in np.linspace(0, 1, 11):
            pose = lids + b * move + min(1, 2 * b) * narrow
            require(np.all(pose[:, :, -1, 1] > pose[:, :, 0, 1]), f'{variant.key}: inverted line at {b}')
            # Compare each nondegenerate ribbon face with Eve at the *same*
            # animation weight; the narrowing intentionally changes its area.
            ref = lid_source + b * lid_source_blink + min(1, 2 * b) * lid_source_narrow
            r, t = ref[lid_faces], pose.reshape(-1, 3)[lid_faces]
            rn = np.cross(r[:, 1] - r[:, 0], r[:, 2] - r[:, 0])
            tn = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
            ra, ta = np.linalg.norm(rn, axis=1), np.linalg.norm(tn, axis=1)
            good = ra > 1e-14
            require(not np.any(good & ((rn * tn).sum(axis=1) <= 0))
                    and not np.any(good & (ta < .1 * ra)),
                    f'{variant.key}: rotated/collapsed lid-line triangle at {b}')
        skin = build.eye.brow.view_bytes(doc, binary, 8)
        tinted = build.v2.tint_skin(source_skin, variant.base.skin)
        a = np.asarray(Image.open(io.BytesIO(skin)).convert('RGB'))
        t = np.asarray(Image.open(io.BytesIO(tinted)).convert('RGB'))
        changed = np.any(a != t, axis=2)
        require(not np.any(changed & ~brow_mask) and 200 < changed.sum() < 1500, f'{variant.key}: unexpected brow patch')
        require(skin == build.v3.repaint_brows(tinted, source_skin, variant.base.skin, variant.brows),
                f'{variant.key}: incorrect brow style')
        brows.append(build.v3.styled_brow_image(raw_brow, variant.brows)[456:600, 824:854])
        iris = build.eye.brow.view_bytes(doc, binary, 9)
        expected_iris = old_eye if variant.key == 'central' else build.v2.tint_iris(old_eye, variant.base.iris)
        require(iris == expected_iris, f'{variant.key}: unexpected iris texture')
        eye_image = np.asarray(Image.open(io.BytesIO(iris)).convert('RGB'))
        pixel_diff = np.any(eye_image != source_eye, axis=2)
        require(not np.any(pixel_diff & ((radius >= 128) | (radius < 30)))
                and not np.any(pixel_diff & (source_eye.max(axis=2) <= 5)), f'{variant.key}: pupil/sclera changed')
        if variant.key in V3_HASHES:
            prior = next(v for v in build.v3.VARIANTS if v.key == variant.key)
            prev_bytes = build.motion.checked(args.previous / prior.filename, V3_HASHES[variant.key], f'{variant.key} v3')
            prev_doc, prev_bin = build.helpers.read_glb(prev_bytes)
            oldp = build.helpers.accessor(prev_doc, prev_bin, 0).astype(float)
            if variant.key in ('north', 'africa'):
                width_change = np.mean(np.abs(q[cheek, 0]) - np.abs(oldp[cheek, 0]))
                require(width_change < -.0025, f'{variant.key}: cheek volume did not decrease as intended')
                print(f'PASS {variant.key}: selected cheek mean width {width_change*1000:.2f} mm per side vs v3')
            if variant.key == 'central':
                tip = q[357, 2] - oldp[357, 2]
                width = np.mean(np.abs(q[nose, 0]) - np.abs(oldp[nose, 0]))
                hip_width = np.mean(np.abs(q[hip, 0]) - np.abs(oldp[hip, 0]))
                butt_depth = np.mean(q[butt, 2] - oldp[butt, 2])
                breast_depth = np.mean(q[bust, 2] - oldp[bust, 2])
                require(tip < -.005 and width < -.00015, 'Central: nose is not thinner and less projecting vs v3')
                require(hip_width < -.008 and butt_depth > .006 and breast_depth < -.0014,
                        'Central: hips, butt or bust did not decrease vs v3')
                print(f'PASS central v3→v4: nose tip {tip*1000:.2f} mm, nose half-width {width*1000:.2f} mm; '
                      f'hip half-width {hip_width*1000:.2f} mm, butt {butt_depth*1000:+.2f} mm forward, '
                      f'breast {breast_depth*1000:.2f} mm; blue iris matches Eve')
            if variant.key == 'east':
                oldeyes = build.helpers.accessor(prev_doc, prev_bin, 4).astype(float)
                neweyes = build.helpers.accessor(doc, binary, 4).astype(float)
                eye_height_change = np.ptp(neweyes[:, 1]) - np.ptp(oldeyes[:, 1])
                region = ((x > .012) & (x < .055) & (y > 1.54) & (y < 1.59) & (z > .085))
                matrix = np.column_stack([oldp[region], np.ones(region.sum())])
                fitted = matrix @ np.linalg.lstsq(matrix, q[region], rcond=None)[0]
                residual = np.sqrt(np.mean(np.sum((q[region] - fitted) ** 2, axis=1)))
                require(eye_height_change > .001 and residual > .0002,
                        'Japanese-motif eye region did not gain distinct non-affine contour')
                print(f'PASS Japanese motif: eyeball height +{eye_height_change*1000:.2f} mm vs v3; '
                      f'non-affine eye-region RMS {residual*1000:.2f} mm')
        height = (q[:, 1].max() - q[:, 1].min()) * variant.scale
        print(f'PASS {variant.key}: {height*100:.1f} cm; protected limbs/morphs, '
              f'neutral/blink weld {seam*1000:.5f}/{blink_seam*1000:.5f} mm; '
              f'{len(animated_faces)} animated face triangles; chest normal {angle:.1f}°; '
              f'11 lid-line positions; {changed.sum()} brow pixels')
    for i in range(len(brows)):
        for j in range(i):
            require(np.count_nonzero(np.any(brows[i] != brows[j], axis=2)) > 100, 'Two brow designs are identical')
    for key in V3_HASHES:
        require(np.linalg.norm(shapes['spain'] - shapes[key], axis=1).max() > .005,
                f'Spanish study duplicates {key}')
    # Compare corresponding selected regions in the shared local frame. This
    # checks a relative sculpt, not an anatomical circumference or volume.
    central = shapes['central']
    for key, other in shapes.items():
        if key == 'central':
            continue
        require(np.mean(np.abs(central[hip, 0])) < np.mean(np.abs(other[hip, 0]))
                and np.mean(central[butt, 2]) > np.mean(other[butt, 2])
                and np.mean(central[bust, 2]) < np.mean(other[bust, 2]),
                f'Central: selected hip/butt/bust is not the most restrained relative to {key}')
    print('PASS: central selected hip, posterior projection and bust are smallest in the common local frame')
    print('PASS: distinct brow designs and an independent Spanish character; prior v3 hashes unchanged')
    if not args.models_only:
        archive_path = args.result / build.ARCHIVE_NAME
        with zipfile.ZipFile(archive_path) as archive:
            require(archive.testzip() is None, 'Corrupt ZIP')
            expected = ['BladesOfWar_Showcase.html', build.eye.MODEL_NAME, *[v.filename for v in build.VARIANTS],
                        'README.txt', 'LICENSE_MAKEHUMAN_ASSETS.md']
            require(archive.namelist() == expected, 'Unexpected ZIP contents')
            html = archive.read('BladesOfWar_Showcase.html')
            for key, filename in [('eve', build.eye.MODEL_NAME), *[(v.key, v.filename) for v in build.VARIANTS]]:
                require(archive.read(filename) == models[key], f'{key}: wrong model in ZIP')
                require(base64.b64encode(models[key]) in html, f'{key}: wrong model in viewer')
            require(html == showcase.make_showcase(models, args.well_archive, build), 'Viewer/well does not match')
            require(archive.read('README.txt') == build.ARCHIVE_README.encode('utf-8'), 'Wrong archive notes')
        print('PASS: ZIP contains six exact models and their offline viewer')
    if args.rebuild:
        rebuilt = build.build_variants(source, reference)
        for key in rebuilt:
            require(rebuilt[key] == models[key], f'{key}: non-reproducible GLB')
        if not args.models_only:
            require(build.make_archive(models, showcase.make_showcase(models, args.well_archive, build)) == archive_path.read_bytes(),
                    'Non-reproducible ZIP')
        print('PASS: five GLBs and ZIP reproduce byte-for-byte')


if __name__ == '__main__':
    main()
