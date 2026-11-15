#!/usr/bin/env python3
"""Build three separate adult woman shape studies from Eve's eye trial.

Only localized facial, breast and buttock shapes are changed in local space;
all height differences are explicit uniform root scales. The shared hand/eye
animations are retained, not claimed to be a complete game rig.
"""
from __future__ import annotations

import argparse
import base64
import copy
import importlib.util
import io
import json
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree
import trimesh

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('_eve_eye_study_for_variants', ROOT / 'tools/model-a-eye-study/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load eye-study builder')
eye = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = eye
spec.loader.exec_module(eye)
motion, helpers, refinement = eye.motion, eye.helpers, eye.refinement
spec = importlib.util.spec_from_file_location('_eve_revision_for_variants', ROOT / 'tools/model-a-revision/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load prior chest subdivision builder')
revision = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = revision
spec.loader.exec_module(revision)

SOURCE = eye.DEFAULT_OUTPUT / eye.MODEL_NAME
SOURCE_SHA256 = '69d3818596d67037445a87fcc89e6aeacccf035a97c218cf139d117444139d10'
OUTPUT = ROOT / 'work/character-model-search/women-variants'
ARCHIVE_NAME = 'four_women_studies_and_well.zip'
DATA = HERE / 'targets'
ORIGINAL_COUNT = 14517


@dataclass(frozen=True)
class Variant:
    key: str
    label: str
    filename: str
    scale: float
    face: dict[str, float]
    chest_increase: float         # max-minus-average breast-shape target weight
    butt: float                   # positive: increase target, negative: decrease target
    chest_reduction: float = 0.   # maximum forward-depth reduction, in metres
    chest_contract: float = 0.    # fractional contraction in the breast plane
    brown_iris: bool = False


VARIANTS = [
    Variant('north', 'Северянка · проба', 'woman_north_trial.glb', 1.05,
            {'cheek/l-cheek-bones-incr.target': .50, 'cheek/r-cheek-bones-incr.target': .50,
             'cheek/l-cheek-volume-incr.target': .24, 'cheek/r-cheek-volume-incr.target': .24,
             'chin/chin-width-incr.target': .55, 'chin/chin-prominent-incr.target': .25,
             'nose/nose-scale-horiz-incr.target': .65}, .24, .55),
    Variant('central', 'Централка · проба', 'woman_central_trial.glb', 1.0,
            {'cheek/l-cheek-volume-decr.target': .48, 'cheek/r-cheek-volume-decr.target': .48,
             'chin/chin-width-decr.target': .52, 'chin/chin-prominent-decr.target': .18,
             'mouth/mouth-scale-horiz-decr.target': .32,
             'existing/nose/nose-scale-horiz-decr.target': .38}, 0., -.55,
            chest_reduction=.008, chest_contract=.10),
    Variant('east', 'Японский мотив · проба', 'woman_east_asian_trial.glb', .95,
            {'cheek/l-cheek-volume-incr.target': .28, 'cheek/r-cheek-volume-incr.target': .28,
             'chin/chin-width-decr.target': .36, 'chin/chin-prominent-decr.target': .28,
             'nose/nose-scale-depth-decr.target': .32, 'nose/nose-point-up.target': .24,
             'eyes/l-eye-epicanthus-in.target': .35, 'eyes/r-eye-epicanthus-in.target': .35,
             'eyes/l-eye-eyefold-down.target': .18, 'eyes/r-eye-eyefold-down.target': .18},
            .225, .10, brown_iris=True),
]

ARCHIVE_README = """Blades Of War — Ева и три предварительные женские пробы

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. В блоке «Персонаж» переключайте Еву, северянку,
централку и восточный образ. «Лицо крупно», ракурсы спереди/сбоку/сзади,
«Моргнуть», «Закрыть глаза», «Кулаки» и ползунок помогают сравнивать.
Мышь вращает сцену, колесо меняет масштаб; на телефоне вращайте пальцем,
масштабируйте двумя. Первый запуск каждой модели может занять несколько секунд.

Ева — отдельная базовая женщина, не закреплённая за конкретным народом.
В других трёх взрослых пробах изменены участки лица, груди и ягодиц;
остальная форма тела и поза в локальных координатах сохранены. Рост задан
равномерным масштабом ВСЕГО персонажа относительно Евы: северянка 105%,
централка 100%, восточный образ 95%; конечности поэтому тоже физически
масштабируются, но их пропорции и локальная геометрия не переделываются.
Темно-карие радужки восточного образа — выбор для этой одной пробы, а не
обязательный признак народа. Цвет кожи, брови и причёска пока не подбирались;
все три сохранили текстуру кожи Евы, волосы не добавлялись.

Важно: тело и конечности остались от Евы. Поэтому впечатление худощавости
централки и крепкого телосложения северянки пока ограничено; для более
заметного различия корпуса/мускулатуры понадобится отдельное согласование.
Это не этнографические портреты и не единые стандарты внешности народов.

Моргание и парный сгиб кистей унаследованы; есть клипы Blink_Once,
Fists_Close, Fists_Open, но скелета нет. Тестирование в конкретном движке,
одежда и анимации боя не готовы. Кулак остаётся пробным, с известными
ограничениями; исходная открытая сетка имеет локальные самопересечения у
оснований больших пальцев. Предыдущие версии модели не перезаписаны.
Колодец и свет прежние; отдельного GLB колодца нет.

Для ручного управления сгибом f=0..1 задать четыре веса тела:
  Fists = f
  FistQuarterCorrection = max(0, 1 - abs(f - 0.25) / 0.25)
  FistHalfCorrection = max(0, 1 - abs(f - 0.50) / 0.25)
  FistThreeQuarterCorrection = max(0, 1 - abs(f - 0.75) / 0.25)
Моргание: face_blink.Blink = b, upper_eyelid_line.Blink = b,
upper_eyelid_line.BlinkLineNarrow = min(1, 2*b).

Основа и отдельные формы: MakeHuman/MPFB2 assets, CC0 1.0 Universal;
полный текст — LICENSE_MAKEHUMAN_ASSETS.md. Стоковые фотографии в модель
или архив не включались; ссылки и оговорки об источниках — в репозитории.
"""


def smooth(lo: float, hi: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def load_target(name: str, mapping: np.ndarray, manifest: dict[str, str]) -> np.ndarray:
    if name.startswith('existing/'):
        path = refinement.DATA / 'targets' / name.removeprefix('existing/')
        # These files were already used by, and checked into, the prior study.
        expected = {'nose/nose-scale-horiz-decr.target':
                    '1227e6f513d202585e40045fe4234778597bb591ac492e7f9313347cd9a9f2ec',
                    'buttocks/buttocks-volume-decr.target':
                    'cbead3b5ea8fb4726e77b2ef16d8c4fa3df54ed3787338bc9bc8271cd400dcc9'}
        relative = name.removeprefix('existing/')
        if relative not in expected or motion.sha256(path.read_bytes()) != expected[relative]:
            raise ValueError(f'Unexpected existing target {name}')
    else:
        path = DATA / name
        if name not in manifest or motion.sha256(path.read_bytes()) != manifest[name]:
            raise ValueError(f'Unexpected target {path}')
    rows = np.loadtxt(path, dtype=np.float64)
    indices = rows[:, 0].astype(np.int64)
    if np.any(indices != rows[:, 0]) or len(np.unique(indices)) != len(indices) or indices.min() < 0 or indices.max() >= 19158:
        raise ValueError(f'Invalid target indices {path}')
    native = np.zeros((19158, 3), dtype=np.float64)
    native[indices] = rows[:, 1:4] * .1
    return native[mapping]


def subdivided_endpoints() -> np.ndarray:
    source = motion.checked(revision.DEFAULT_SOURCE, revision.SOURCE_SHA256, 'pre-subdivision refined model')
    doc, binary = helpers.read_glb(source)
    original = helpers.accessor(doc, binary, 0)
    normals = helpers.accessor(doc, binary, 1)
    uvs = helpers.accessor(doc, binary, 2)
    faces = helpers.accessor(doc, binary, 3).reshape(-1, 3)
    if len(original) != ORIGINAL_COUNT:
        raise ValueError('Unexpected pre-subdivision vertex count')
    mapping = refinement.vertex_map(len(original))
    deformed = (original + revision.breast_delta(mapping)).astype('<f4')
    transported = refinement.updated_normals(original, deformed, normals, faces)
    _, _, _, _, _, endpoints = revision.subdivide_breasts(original, deformed, transported, uvs, faces)
    if endpoints.shape != (1349, 2) or endpoints.max() >= ORIGINAL_COUNT:
        raise ValueError('Unexpected breast-subdivision ancestry')
    return endpoints


def arm_weights(reference: bytes, uvs: np.ndarray) -> np.ndarray:
    rig, binary = motion.read_any_glb(reference)
    rig_uv = motion.rig_accessor(rig, binary, 2)
    if not np.array_equal(uvs[:ORIGINAL_COUNT], rig_uv):
        raise ValueError('Source rig UV order differs')
    joints = motion.rig_accessor(rig, binary, 3)
    weights = motion.rig_accessor(rig, binary, 4)
    names = [rig['nodes'][i]['name'] for i in rig['skins'][0]['joints']]
    arm = np.array([name.startswith(('shoulder', 'upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal'))
                    for name in names])
    return (weights * arm[joints]).sum(axis=1)


def fit_lid_to_face(positions: np.ndarray, faces: np.ndarray, lids: np.ndarray,
                    displacement: np.ndarray) -> np.ndarray:
    """Move the old strip with a smoothed barycentric sampling of the eyelid."""
    selected = ((positions[faces][:, :, 1].max(1) > 1.550)
                & (positions[faces][:, :, 1].min(1) < 1.580)
                & (np.abs(positions[faces][:, :, 0]).min(1) < .060)
                & (positions[faces][:, :, 2].max(1) > .09))
    subset = faces[selected]
    mesh = trimesh.Trimesh(vertices=positions, faces=subset, process=False)
    closest, distance, triangle = trimesh.proximity.closest_point_naive(mesh, lids)
    if distance.max() > .004:
        raise ValueError('The upper-lid strip is too far from the source eyelid')
    bary = trimesh.triangles.points_to_barycentric(positions[subset[triangle]], closest)
    raw = np.einsum('ij,ijk->ik', bary, displacement[subset[triangle]])
    centers = raw.reshape(2, 61, 7, 3)[:, :, 3, :]
    centers = gaussian_filter1d(centers, 1, axis=1, mode='nearest')
    shift = np.repeat(centers[:, :, None, :], 7, axis=2).reshape(-1, 3)
    if np.linalg.norm(shift, axis=1).max() > .002:
        raise ValueError('Unexpectedly large eyelid displacement')
    return np.ascontiguousarray(lids + shift, dtype='<f4')


def color_iris(raw: bytes) -> bytes:
    image = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).copy()
    if image.shape != (1024, 1024, 3):
        raise ValueError('Unexpected eye texture')
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    rgb = image.astype(np.float64)
    # Keep pupil, outer sclera and dark iris linework untouched. Only the
    # existing blue iris pigment is tinted; luminosity detail remains visible.
    mask = ((radius < 128) & (rgb[:, :, 2] > rgb[:, :, 0] + 4)
            & (rgb[:, :, 2] > rgb[:, :, 1] + 2) & (rgb[:, :, 2] > 25))
    if not 20_000 < int(mask.sum()) < 100_000:
        raise ValueError('Unexpected iris selection')
    lum = .30 * rgb[:, :, 0] + .59 * rgb[:, :, 1] + .11 * rgb[:, :, 2]
    brown = np.stack([lum * .90 + 2, lum * .64, lum * .43], axis=2)
    image[mask] = np.clip(np.rint(brown[mask]), 0, 255).astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(image, 'RGB').save(out, format='PNG', optimize=True)
    return out.getvalue()


def build_variants(source: bytes, reference: bytes) -> dict[str, bytes]:
    doc, binary = helpers.read_glb(source)
    if len(doc['accessors']) != 31 or len(doc['bufferViews']) != 33 or doc['nodes'][0]['name'] != 'Female_anatomical_body':
        raise ValueError('Unexpected eye-study layout')
    positions = helpers.accessor(doc, binary, 0).astype(np.float64)
    normals = helpers.accessor(doc, binary, 1).astype(np.float64)
    uv = helpers.accessor(doc, binary, 2)
    faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
    if len(positions) != 18176:
        raise ValueError('Unexpected body topology')
    endpoints = subdivided_endpoints()
    mapping = refinement.vertex_map(ORIGINAL_COUNT)
    arms = arm_weights(reference, uv)
    # Preserve normal data on all arm-influenced vertices and below the
    # buttock transition, including any welded UV duplicates.
    protected = positions[:, 1] <= .835
    protected[:ORIGINAL_COUNT] |= arms > 1e-8
    keys = np.column_stack([np.round(positions * 1e6).astype(np.int64), np.round(normals * 100).astype(np.int64)])
    _, groups = np.unique(keys, axis=0, return_inverse=True)
    protected_groups = np.bincount(groups, weights=protected.astype(np.int32)) > 0
    protected = protected_groups[groups]
    manifest = json.loads((DATA / 'manifest.json').read_text())
    p = positions[:ORIGINAL_COUNT]
    y, z = p[:, 1], p[:, 2]
    # Most facial targets taper before the eyelids. A small optional eyelid
    # target on the east study is handled separately together with the strip.
    face_gate = smooth(1.448, 1.465, y) * (1 - smooth(1.545, 1.558, y))
    eye_gate = smooth(1.53, 1.54, y) * (1 - smooth(1.59, 1.60, y))
    # Targets have influences near the armpits. Preserve every vertex with
    # any auxiliary arm/hand influence, and taper the breast displacement
    # over the nearby surface instead of making a hard mask at the boundary.
    no_arm = (arms <= 1e-8).astype(np.float64)
    arm_tree = cKDTree(p[arms > 1e-8])
    distance_to_arm, _ = arm_tree.query(p)
    chest_gate = no_arm * smooth(.005, .035, distance_to_arm) * smooth(1.06, 1.12, y)
    # For a modest reduction use a broad, smooth sculpt field, evaluated at
    # both original and subdivided vertices. Reversing the older cup target
    # against a fixed arm boundary produced visible dimples; this softer
    # field fades to zero before reaching protected arm-influenced vertices.
    full_distance, _ = arm_tree.query(positions)
    px, py, pz = np.abs(positions[:, 0]), positions[:, 1], positions[:, 2]
    chest_sculpt = (np.exp(-.5 * ((px - .095) / .050) ** 2 - .5 * ((py - 1.208) / .055) ** 2)
                    * smooth(.075, .145, pz) * smooth(.005, .045, full_distance)
                    * smooth(1.06, 1.12, py) * (1 - smooth(1.30, 1.35, py))
                    * smooth(.005, .025, px) * (1 - smooth(.14, .175, px)))
    # Limit glute deltas to the back of the pelvis, above the legs. Fading
    # avoids a hard seam at the buttock-to-thigh transition.
    # Preserve the central cleft; symmetric volume targets otherwise cause
    # the two nearby inner surfaces to intersect in Eve's existing mesh.
    butt_gate = (no_arm * smooth(.835, .915, y) * (1 - smooth(1.035, 1.09, y))
                 * (1 - smooth(-.025, .025, z)) * smooth(.008, .025, np.abs(p[:, 0])))
    maxcup = revision.mapped_target(revision.MAX_TARGET, revision.MAX_TARGET_SHA256, mapping)
    avgcup = revision.mapped_target(revision.AVG_TARGET, revision.AVG_TARGET_SHA256, mapping)
    butt_more = load_target('buttocks/buttocks-volume-incr.target', mapping, manifest)
    butt_less = load_target('existing/buttocks/buttocks-volume-decr.target', mapping, manifest)
    outputs = {}
    for variant in VARIANTS:
        original_delta = np.zeros((ORIGINAL_COUNT, 3), dtype=np.float64)
        for name, weight in variant.face.items():
            gate = eye_gate if name.startswith('eyes/') else face_gate
            original_delta += load_target(name, mapping, manifest) * (weight * gate[:, None])
        original_delta += variant.chest_increase * (maxcup - avgcup) * chest_gate[:, None]
        original_delta += ((variant.butt * butt_more) if variant.butt >= 0 else (-variant.butt * butt_less)) * butt_gate[:, None]
        if np.any(original_delta[arms > 1e-8] != 0):
            raise ValueError('Variant modifies arm-influenced vertices')
        delta = np.zeros_like(positions)
        delta[:ORIGINAL_COUNT] = original_delta
        delta[ORIGINAL_COUNT:ORIGINAL_COUNT + len(endpoints)] = original_delta[endpoints].mean(axis=1)
        delta[:, 2] -= variant.chest_reduction * chest_sculpt
        delta[:, 0] -= variant.chest_contract * np.sign(positions[:, 0]) * (px - .095) * chest_sculpt
        delta[:, 1] -= variant.chest_contract * (py - 1.208) * chest_sculpt
        new_positions = (positions + delta).astype('<f4')
        # Use float64 geometry when transporting normals so mathematically
        # unchanged hands/legs retain their original float32 normals exactly.
        precise_positions = new_positions.astype(np.float64)
        new_normals = refinement.updated_normals(positions, precise_positions, normals, faces)
        new_normals[protected] = normals[protected]
        # Preserve the original blink displacement, and transport its normals
        # only if nearby facial surface normals changed.
        blink = helpers.accessor(doc, binary, 14).astype(np.float64)
        new_blink_normals = (refinement.updated_normals(precise_positions, precise_positions + blink, new_normals, faces)
                             .astype(np.float64) - new_normals.astype(np.float64)).astype('<f4')
        result = copy.deepcopy(doc)
        views = [bytearray(eye.brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
        for index, values in ((0, new_positions), (1, new_normals), (15, new_blink_normals)):
            eye.update(result, views, index, values)
        if any(name.startswith('eyes/') for name in variant.face):
            old_lids = helpers.accessor(doc, binary, 8).astype(np.float64)
            new_lids = fit_lid_to_face(positions, faces, old_lids, delta)
            lid_blink, lid_narrow = motion.lid_deltas(precise_positions, faces, new_lids.astype(np.float64), blink)
            for index, values in ((8, new_lids), (16, lid_blink), (17, lid_narrow)):
                eye.update(result, views, index, values)
        if variant.brown_iris:
            views[eye.EYE_VIEW] = bytearray(color_iris(bytes(views[eye.EYE_VIEW])))
        if variant.scale != 1:
            result['nodes'][0]['scale'] = [variant.scale] * 3
        result['asset']['generator'] = f'BladesOfWar separate adult woman shape trial: {variant.key}'
        result['asset']['extras'] = {'study': variant.label, 'uniformHeightScale': variant.scale,
                                     'base': 'Eve eye study; not a complete rig'}
        outputs[variant.key] = refinement.pack_glb(result, views)
    return outputs


def make_archive(models: dict[str, bytes], html: bytes) -> bytes:
    entries = [('BladesOfWar_Showcase.html', html), (eye.MODEL_NAME, models['eve'])]
    entries.extend((variant.filename, models[variant.key]) for variant in VARIANTS)
    entries.extend([('README.txt', ARCHIVE_README.encode('utf-8')),
                    ('LICENSE_MAKEHUMAN_ASSETS.md', (refinement.DATA / 'LICENSE.ASSETS.md').read_bytes())])
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
    parser.add_argument('--reference', type=Path, default=eye.DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--models-only', action='store_true')
    args = parser.parse_args()
    protected = {SOURCE.parent.resolve(), eye.DEFAULT_SOURCE.parent.resolve(),
                 eye.brow.DEFAULT_SOURCE.parent.resolve(), eye.brow.trial.DEFAULT_SOURCE.parent.resolve(),
                 motion.DEFAULT_SOURCE.parent.resolve()}
    inputs = {args.source.resolve(), args.reference.resolve(), args.well_archive.resolve()}
    output_names = [ARCHIVE_NAME, *[v.filename for v in VARIANTS]]
    outputs = {(args.output / name).resolve() for name in output_names}
    if args.output.resolve() in protected or inputs & outputs:
        parser.error('Refusing to overwrite a previous study or input file')
    source = motion.checked(args.source, SOURCE_SHA256, 'Eve eye study')
    reference = motion.checked(args.reference, eye.REFERENCE_SHA256, 'auxiliary weight source')
    models = {'eve': source, **build_variants(source, reference)}
    args.output.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        model = models[variant.key]
        (args.output / variant.filename).write_bytes(model)
        print(f'{variant.key}: {len(model)} bytes SHA-256 {motion.sha256(model)}', flush=True)
    if not args.models_only:
        from showcase import make_showcase
        html = make_showcase(models, args.well_archive, sys.modules[__name__])
        archive = make_archive(models, html)
        (args.output / ARCHIVE_NAME).write_bytes(archive)
        print(f'ZIP: {len(archive)} bytes SHA-256 {motion.sha256(archive)}', flush=True)


if __name__ == '__main__':
    main()
