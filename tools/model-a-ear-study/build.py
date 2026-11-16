#!/usr/bin/env python3
"""Create a separate, reproducible ear-shape trial from the eye-study GLB.

This does not overwrite the source, add topology, copy reference photographs or
invent a rig. The symmetric sculpt is limited to the auricle and its root;
UVs, texture, indices, eyes, hands, morphs and animation clips remain intact.
"""
from __future__ import annotations

import argparse
import base64
import copy
import importlib.util
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter1d
from scipy.sparse import coo_matrix
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'tools/model-a-eye-study'))
spec = importlib.util.spec_from_file_location('_ear_source_eye', ROOT / 'tools/model-a-eye-study/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the prior eye-study builder')
eye = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = eye
spec.loader.exec_module(eye)
sys.path.insert(0, str(ROOT / 'tools/model-a-hand-ear'))
import ears  # noqa: E402

motion, helpers, refinement = eye.motion, eye.helpers, eye.refinement
SOURCE = eye.DEFAULT_OUTPUT / eye.MODEL_NAME
SOURCE_SHA256 = '69d3818596d67037445a87fcc89e6aeacccf035a97c218cf139d117444139d10'
EAR_ANCESTOR = ROOT / 'work/character-model-search/selected-a/motion-study/female_A_motion.glb'
EAR_ANCESTOR_SHA256 = '713cb5004612bb3c4707406ec863147a17a6b23e68e192e99177f5b469b313f7'
OUTPUT = ROOT / 'work/character-model-search/selected-a/ear-study'
MODEL_NAME = 'female_A_ears_refined.glb'
ARCHIVE_NAME = 'female_A_ears_refined_and_well.zip'
TARGET_HASHES = {
    'l-ear-shape-round.target': '813cb1832d81a454a406a072ffec1ed5db721b373d74cd05ea70d469ff1eef20',
    'r-ear-shape-round.target': 'eda8ed17cb3c732d3482081ac91723e6bf80d0e1deb654346aa1a13b09ba839c',
    'l-ear-flap-decr.target': 'f45356aa2b841811641d12c45f7d89bc1e778cb2f0abd04010100e1826e862e5',
    'r-ear-flap-decr.target': '38552ada19aa4d0b3b23075db35ffdf621f4eb82a2f5929a0b6e48bfa0d0d60f',
}

ARCHIVE_README = """Blades Of War — отдельная проба формы ушей героини

Распакуйте ZIP и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Витрина начинается с лица; кнопки «Левое ухо» и «Правое
ухо» показывают уши сбоку. Мышь вращает камеру, колесо меняет масштаб;
на телефоне используйте пальцы. Исходная версия отдельно сохранена в проекте.

female_A_ears_refined.glb — та же модель с локально изменёнными ушами и
небольшим плавным переходом к голове. Волнистость фронтального контура
уменьшена; сами уши чуть раскрыты наружу. Внутренний рельеф не заменяли
плоской формой. Это художественная проба, её вид ещё нужно оценить.

Текстуры, остальные части модели, топология, глаза, морфы и клипы сохранены.
В GLB нет волос, одежды, скелета и полноценного боевого рига. Имеются
предварительные морфы и клипы Blink_Once, Fists_Close, Fists_Open. Парный
сгиб кистей не заменяет независимый риг пальцев. В исходной сетке открытых
кистей имеются локальные самопересечения у больших пальцев; проверки
выборочные и не гарантируют отсутствие проблем во всех будущих позах.

Кулаки при значении f=0..1: Fists=f;
FistQuarterCorrection=max(0,1-abs(f-.25)/.25);
FistHalfCorrection=max(0,1-abs(f-.50)/.25);
FistThreeQuarterCorrection=max(0,1-abs(f-.75)/.25).
Моргание b=0..1: face_blink.Blink=b; upper_eyelid_line.Blink=b;
upper_eyelid_line.BlinkLineNarrow=min(1,2*b).
Основа и формы MakeHuman/MPFB2 assets — CC0 1.0 Universal; см. лицензию.
Фотографии актрис служили только ориентирами и в модель не включены.
"""


def smooth(values: np.ndarray, lo: float, hi: float) -> np.ndarray:
    t = np.clip((values - lo) / (hi - lo), 0., 1.)
    return t * t * (3 - 2 * t)


def ear_fade(points: np.ndarray) -> np.ndarray:
    """Smoothly reach zero *inside* the protected ear neighbourhood."""
    x, y, z = np.asarray(points, dtype=np.float64).T
    return (smooth(abs(x), .061, .069) * smooth(y, 1.506, 1.516)
            * (1 - smooth(y, 1.588, 1.597)) * smooth(z, -.023, -.011)
            * (1 - smooth(z, .053, .064)))


def ancestry(source_p: np.ndarray, source_n: np.ndarray, source_uv: np.ndarray,
             source_faces: np.ndarray, ancestor: bytes) -> np.ndarray:
    """Reconstruct and verify the exact subdivision ancestry of the 2310 ear vertices."""
    doc, binary = helpers.read_glb(ancestor)
    p = helpers.accessor(doc, binary, 0)
    n = helpers.accessor(doc, binary, 1)
    uv = helpers.accessor(doc, binary, 2)
    faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
    built = ears.build_ears(p, n, uv, faces, refinement)
    points, normals, tex, triangles, _, endpoints, _ = built
    if (len(p) != 15866 or endpoints.shape != (2310, 2)
            or endpoints.max() >= motion.ORIGINAL_VERTICES
            or not np.array_equal(points, source_p) or not np.array_equal(normals, source_n)
            or not np.array_equal(tex, source_uv) or not np.array_equal(triangles, source_faces)):
        raise ValueError('Eye-study ear topology does not match its verified ancestry')
    return endpoints


def target_delta(name: str, count: int, endpoints: np.ndarray) -> np.ndarray:
    """Map the checked MakeHuman ear target, then interpolate subdivided edges."""
    mapping = refinement.vertex_map(motion.ORIGINAL_VERTICES)
    native = np.zeros((19158, 3), dtype=np.float64)
    for side in ('l', 'r'):
        filename = f'{side}-ear-{name}.target'
        path = refinement.DATA / 'targets/ears' / filename
        motion.checked(path, TARGET_HASHES[filename], 'MakeHuman ear target')
        rows = np.loadtxt(path, dtype=np.float64)
        ids = rows[:, 0].astype(np.int64)
        if np.any(ids != rows[:, 0]) or len(np.unique(ids)) != len(ids) or ids.min() < 0 or ids.max() >= len(native):
            raise ValueError(f'Invalid target {filename}')
        # MakeHuman uses decimetres; this model uses metres.
        native[ids] += rows[:, 1:4] * .1
    delta = np.zeros((count, 3), dtype=np.float64)
    delta[:len(mapping)] = native[mapping]
    delta[15866:] = (delta[endpoints[:, 0]] + delta[endpoints[:, 1]]) * .5
    return delta


def topology(points: np.ndarray, faces: np.ndarray):
    """One vertex per welded position so UV duplicates always move together."""
    _, representatives, groups = np.unique(points, axis=0, return_index=True, return_inverse=True)
    tri = groups[faces]
    edges = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    rows = np.concatenate([edges[:, 0], edges[:, 1]])
    cols = np.concatenate([edges[:, 1], edges[:, 0]])
    matrix = coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(representatives),) * 2).tocsr()
    degree = np.asarray(matrix.sum(axis=1)).ravel()
    matrix = matrix.multiply(1 / np.maximum(degree, 1)[:, None]).tocsr()
    return representatives, groups, edges, matrix


def profile(points: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Rightmost projected surface in a fixed 30-degree portrait camera.

    Used only to shape the mesh, not to paint the before/after images. All
    triangles contribute, so the actual head occluding part of the ear counts.
    """
    focal = 900 / (2 * np.tan(np.deg2rad(15)))
    x, y, z = points.T
    projected = np.stack((500 + focal * x / (.60 - z),
                          450 - focal * (y - 1.56) / (.60 - z)), axis=1)
    xy = projected[faces]
    scan = np.arange(430., 566., .5)
    outline = []
    for row in scan:
        intersections = []
        for i in range(3):
            a, b = xy[:, i, :], xy[:, (i + 1) % 3, :]
            dy = b[:, 1] - a[:, 1]
            t = np.divide(row - a[:, 1], dy, out=np.zeros_like(dy), where=abs(dy) > 1e-10)
            intersections.append(np.where((t >= 0) & (t <= 1) & (abs(dy) > 1e-10),
                                          a[:, 0] + t * (b[:, 0] - a[:, 0]), -1))
        right = float(np.max(intersections))
        if not 700 < right < 760:
            raise ValueError('Unexpected head outline in sculpt camera')
        outline.append(right)
    return scan, np.asarray(outline)


def sculpt(source: np.ndarray, faces: np.ndarray, endpoints: np.ndarray) -> np.ndarray:
    """Smooth the native target field, adjust the rim, and soften the tips."""
    p = np.asarray(source, dtype=np.float64)
    reps, groups, edges, matrix = topology(p, faces)
    raw = (.35 * target_delta('shape-round', len(p), endpoints)
           - .45 * target_delta('flap-decr', len(p), endpoints))
    field = raw[reps].copy()
    for _ in range(10):
        field = .4 * field + .6 * (matrix @ field)
    q = p + field[groups] * ear_fade(p)[:, None]

    # Mild non-shrinking Taubin passes on the ear area. This operates on the
    # welded topology, while the unrelated parts of the body have zero weight.
    unique = q[reps].copy()
    x, y, z = unique.T
    gate = (smooth(abs(x), .065, .076) * smooth(y, 1.508, 1.525)
            * (1 - smooth(y, 1.566, 1.583)) * smooth(z, -.025, -.004)
            * (1 - smooth(z, .050, .070)))
    for _ in range(8):
        for strength in (.40, -.405):
            total = np.zeros_like(unique)
            count = np.zeros(len(unique))
            np.add.at(total, edges[:, 0], unique[edges[:, 1]])
            np.add.at(total, edges[:, 1], unique[edges[:, 0]])
            np.add.at(count, edges[:, 0], 1)
            np.add.at(count, edges[:, 1], 1)
            laplacian = total / np.maximum(count[:, None], 1) - unique
            unique += strength * gate[:, None] * laplacian
    q = unique[groups]

    # Guide the front edge toward a modest, gently curved rim. A small
    # depth-corrected x displacement is spread over the ear, not just its
    # silhouette vertices, to avoid a hard edge or flattened inner folds.
    focal = 900 / (2 * np.tan(np.deg2rad(15)))
    anchor_y = [430, 435, 440, 450, 460, 470, 480, 490, 500, 510, 520, 530, 540, 550, 560, 565]
    anchor_x = [735, 736, 737, 737.8, 738.0, 737.9, 737.4, 736.8, 736.0,
                735.0, 734.0, 733.0, 732.0, 730.8, 729.2, 727.8]
    scan, _ = profile(q, faces)
    target = PchipInterpolator(anchor_y, anchor_x)(scan)
    for _ in range(3):
        _, outline = profile(q, faces)
        error = gaussian_filter1d(target - outline, sigma=5)
        x, y, z = q.T
        screen_y = 450 - focal * (y - 1.56) / (.60 - z)
        gate = (smooth(abs(x), .067, .077) * smooth(y, 1.51, 1.522)
                * (1 - smooth(y, 1.568, 1.581)) * smooth(z, -.025, -.005)
                * (1 - smooth(z, .052, .069)))
        end_fade = smooth(screen_y, 430, 447) * (1 - smooth(screen_y, 555, 569))
        dx = np.interp(screen_y, scan, error, left=0, right=0) * (.60 - z) / focal * gate * end_fade
        q = q.copy()
        q[:, 0] += np.sign(x) * dx

    # A few restrained local passes at the upper rim and lobe only. The rest
    # of the auricle, including its visible folds, keeps the preceding detail.
    unique = q[reps].copy()
    x, y, z = unique.T
    upper = smooth(y, 1.552, 1.562) * (1 - smooth(y, 1.571, 1.580))
    lower = smooth(y, 1.511, 1.520) * (1 - smooth(y, 1.528, 1.536))
    gate = (np.maximum(upper, lower) * smooth(abs(x), .066, .075)
            * smooth(z, -.020, -.003) * (1 - smooth(z, .049, .062)) * ear_fade(p[reps]))
    for _ in range(5):
        unique += .40 * gate[:, None] * (matrix @ unique - unique)
    q = unique[groups]

    # The source ear positions are exactly mirrored. Average tiny topological
    # smoothing differences so the new shape is symmetric, including UV seams.
    mirror = p * [-1, 1, 1]
    distance, opposite = cKDTree(p).query(mirror)
    delta = q - p
    changed = np.any(delta != 0, axis=1)
    if np.any(distance[changed] > 1e-10):
        raise ValueError('An edited source vertex has no symmetric counterpart')
    delta = .5 * (delta + delta[opposite] * [-1, 1, 1])
    result = np.ascontiguousarray(p + delta, dtype='<f4')
    changed = np.any(result != p, axis=1)
    displacement = np.linalg.norm(result.astype(np.float64) - p, axis=1)
    if not np.any(changed) or np.any(changed & ~ears.ear_neighbourhood(p)):
        raise ValueError('Sculpt escaped the ear neighbourhood')
    if not np.all(np.isfinite(result)) or displacement.max() > .006:
        raise ValueError('Sculpt contains invalid or unexpectedly large displacements')
    if not np.array_equal(result, result[reps[groups]]):
        raise ValueError('Sculpt separated coincident UV vertices')
    before, after = p[faces], result.astype(np.float64)[faces]
    n0 = np.cross(before[:, 1] - before[:, 0], before[:, 2] - before[:, 0])
    n1 = np.cross(after[:, 1] - after[:, 0], after[:, 2] - after[:, 0])
    area0, area1 = np.linalg.norm(n0, axis=1), np.linalg.norm(n1, axis=1)
    valid = area0 > 1e-13
    if np.any(valid & ((n0 * n1).sum(axis=1) <= 0)) or np.any(valid & (area1 < .35 * area0)):
        raise ValueError('Sculpt rotated or collapsed a source triangle')
    return result


def build_model(source: bytes, ancestor: bytes) -> bytes:
    doc, binary = helpers.read_glb(source)
    if (len(doc['accessors']) != 31 or len(doc['bufferViews']) != 33
            or [clip['name'] for clip in doc['animations']] != ['Blink_Once', 'Fists_Close', 'Fists_Open']):
        raise ValueError('Unexpected eye-study GLB layout')
    p = helpers.accessor(doc, binary, 0)
    n = helpers.accessor(doc, binary, 1)
    uv = helpers.accessor(doc, binary, 2)
    faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
    endpoints = ancestry(p, n, uv, faces, ancestor)
    q = sculpt(p, faces, endpoints)
    normals = refinement.updated_normals(p.astype(np.float64), q.astype(np.float64), n.astype(np.float64), faces)
    # At the neighbourhood boundary normal-deltas are below one thousandth;
    # preserve the prior normals exactly outside that boundary.
    normals[~ears.ear_neighbourhood(p)] = n[~ears.ear_neighbourhood(p)]
    changed = np.any(q != p, axis=1) | np.any(normals != n, axis=1)
    for index in (11, 12, 14, 15, 25, 26, 27, 28, 29, 30):
        if np.any(helpers.accessor(doc, binary, index)[changed]):
            raise ValueError(f'Existing morph {index} unexpectedly reaches the edited ear')
    result = copy.deepcopy(doc)
    views = [bytearray(eye.brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
    eye.update(result, views, 0, q)
    eye.update(result, views, 1, normals)
    result['asset']['generator'] = 'BladesOfWar separate ear shape trial'
    return refinement.pack_glb(result, views)


def make_showcase(model: bytes, well_archive: Path) -> bytes:
    html = eye.make_showcase(model, well_archive).decode('utf-8')
    replacements = {
        'Blades of War — проба глаз Евы': 'Blades of War — проба ушей героини',
        'Ева · проба глаз + колодец': 'Героиня · проба ушей + колодец',
        'Женщина А · проба глаз': 'Женщина А · проба ушей',
        'Мягкий свет для Евы': 'Мягкий свет для героини',
        "mode: 'pair', view: 'front'": "mode: 'female', view: 'face'",
    }
    for old, new in replacements.items():
        if html.count(old) != 1:
            raise ValueError(f'Unexpected eye-showcase template: {old!r}')
        html = html.replace(old, new, 1)
    return html.encode('utf-8')


def make_archive(model: bytes, html: bytes) -> bytes:
    entries = [('BladesOfWar_Showcase.html', html), (MODEL_NAME, model),
               ('README.txt', ARCHIVE_README.encode('utf-8')),
               ('LICENSE_MAKEHUMAN_ASSETS.md', (refinement.DATA / 'LICENSE.ASSETS.md').read_bytes())]
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compresslevel=9)
    return out.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--ancestor', type=Path, default=EAR_ANCESTOR)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    args = parser.parse_args()
    inputs = {args.source.resolve(), args.ancestor.resolve(), args.well_archive.resolve()}
    outputs = {(args.output / MODEL_NAME).resolve(), (args.output / ARCHIVE_NAME).resolve()}
    protected = {eye.DEFAULT_OUTPUT.resolve(), eye.brow.DEFAULT_OUTPUT.resolve(),
                 (ROOT / 'work/character-model-search/selected-a/hand-ear-study').resolve()}
    if inputs & outputs or args.output.resolve() in protected:
        parser.error('Refusing to overwrite an input or prior study')
    source = motion.checked(args.source, SOURCE_SHA256, 'eye-study model')
    ancestor = motion.checked(args.ancestor, EAR_ANCESTOR_SHA256, 'ear-subdivision ancestor')
    model = build_model(source, ancestor)
    html = make_showcase(model, args.well_archive)
    archive = make_archive(model, html)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f'GLB {len(model)} bytes, SHA-256 {motion.sha256(model)}')
    print(f'ZIP {len(archive)} bytes, SHA-256 {motion.sha256(archive)}')


if __name__ == '__main__':
    main()
