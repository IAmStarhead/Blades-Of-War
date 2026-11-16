#!/usr/bin/env python3
"""Build four visibly distinct adult women from Eve, preserving the prior studies.

Local head/face and torso shapes and individual skin/iris colours vary. The
original arm-weighted vertices, hands and lower legs stay fixed in local space;
height is a uniform root scale, not a separate limb redesign.
"""
from __future__ import annotations
import argparse
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
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('_women_first_study', ROOT / 'tools/women-variants/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous study')
old = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = old
spec.loader.exec_module(old)
eye, motion, helpers, refinement = old.eye, old.motion, old.helpers, old.refinement
SOURCE, SOURCE_SHA256 = old.SOURCE, old.SOURCE_SHA256
ORIGINAL_COUNT = old.ORIGINAL_COUNT
OUTPUT = ROOT / 'work/character-model-search/women-variants-v2'
ARCHIVE_NAME = 'five_women_comparison_and_well.zip'
DATA = HERE / 'targets'


@dataclass(frozen=True)
class Variant:
    key: str
    label: str
    filename: str
    scale: float
    skin: tuple[int, int, int]       # RGB of the original neutral skin patch
    iris: tuple[float, float, float] # tint of blue iris pigment, not sclera
    head: tuple[float, float, float] # local width, height and depth fractions
    torso: tuple[float, float, float] # waist width, rib width, depth fractions
    mouth: tuple[float, float]      # smooth width and height variations
    bust: float                     # smooth forward sculpt, in metres
    extra_face: dict[str, float]
    base: old.Variant


VARIANTS = [
    Variant('north', 'Северянка', 'woman_north_v2.glb', 1.05,
        (235, 210, 197), (.75, .96, .80), (.04, .06, .015), (.15, .075, .09), (.06, -.08), .012,
        {'eyes/l-eye-height1-incr.target': .35, 'eyes/r-eye-height1-incr.target': .35,
         'mouth/mouth-upperlip-volume-decr.target': .20},
        old.Variant('north', 'Северянка', 'woman_north_v2.glb', 1.05,
            {'cheek/l-cheek-bones-incr.target': .65, 'cheek/r-cheek-bones-incr.target': .65,
             'cheek/l-cheek-volume-incr.target': .30, 'cheek/r-cheek-volume-incr.target': .30,
             'chin/chin-width-incr.target': .55, 'chin/chin-prominent-incr.target': .25,
             'nose/nose-scale-horiz-incr.target': .45}, 0., .50)),
    Variant('central', 'Централка', 'woman_central_v2.glb', 1.,
        (190, 151, 132), (1.0, .78, .43), (-.065, .035, -.015), (-.17, -.07, -.075), (-.08, -.08), 0.,
        {'eyes/l-eye-height1-incr.target': .20, 'eyes/r-eye-height1-incr.target': .20,
         'mouth/mouth-lowerlip-volume-decr.target': .20},
        old.Variant('central', 'Централка', 'woman_central_v2.glb', 1.,
            {'cheek/l-cheek-volume-decr.target': .55, 'cheek/r-cheek-volume-decr.target': .55,
             'chin/chin-width-decr.target': .60, 'chin/chin-prominent-decr.target': .18,
             'mouth/mouth-scale-horiz-decr.target': .35,
             'existing/nose/nose-scale-horiz-decr.target': .40}, 0., -.45,
            chest_reduction=.008, chest_contract=.10)),
    Variant('east', 'Японский мотив', 'woman_east_asian_v2.glb', .95,
        (210, 175, 157), (.90, .64, .43), (.04, -.045, -.01), (-.085, -.045, -.05), (-.04, -.04), .008,
        {'eyes/l-eye-height1-decr.target': .10, 'eyes/r-eye-height1-decr.target': .10},
        old.Variant('east', 'Японский мотив', 'woman_east_asian_v2.glb', .95,
            {'cheek/l-cheek-volume-incr.target': .45, 'cheek/r-cheek-volume-incr.target': .45,
             'chin/chin-width-decr.target': .45, 'chin/chin-prominent-decr.target': .32,
             'nose/nose-scale-depth-decr.target': .35, 'nose/nose-point-up.target': .25,
             'eyes/l-eye-epicanthus-in.target': .35, 'eyes/r-eye-epicanthus-in.target': .35,
             'eyes/l-eye-eyefold-down.target': .18, 'eyes/r-eye-eyefold-down.target': .18},
            0., .10)),
    Variant('africa', 'Африканка', 'woman_african_v2.glb', 1.02,
        (115, 75, 57), (.76, .52, .32), (.025, -.015, .015), (.07, .045, .06), (.18, .20), .008,
        {'eyes/l-eye-height1-incr.target': .45, 'eyes/r-eye-height1-incr.target': .45,
         'nose/nose-nostrils-width-incr.target': .30},
        old.Variant('africa', 'Африканка', 'woman_african_v2.glb', 1.02,
            {'cheek/l-cheek-bones-incr.target': .40, 'cheek/r-cheek-bones-incr.target': .40,
             'cheek/l-cheek-volume-incr.target': .50, 'cheek/r-cheek-volume-incr.target': .50,
             'chin/chin-width-incr.target': .15, 'chin/chin-prominent-decr.target': .20,
             'nose/nose-scale-horiz-incr.target': .60, 'nose/nose-scale-depth-decr.target': .20},
            0., .30)),
]

ARCHIVE_README = """Blades Of War — Ева и четыре отдельные женские пробы

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Выберите персонажа или нажмите «Сравнить рост», чтобы
увидеть все пять моделей на общем уровне. Мышь вращает камеру; на телефоне
вращайте пальцем и масштабируйте двумя. Есть ракурсы и управление морфами.

Ева остаётся базовой женщиной и не заменяется. В других взрослых пробах
заметнее различаются черты лица, цвет кожи и глаз, объём талии и корпуса;
добавлен отдельный африканский образ. Цвет кожи нанесён также на конечности,
чтобы не возникало цветового шва. Это индивидуальные художественные образы,
а не единые этнические стандарты или описания внешности всех людей народа.
Волосы и одежда не добавлены. Форма исходных вершин с весами рук, кисти и
нижняя область тела сохранены локально; переход ягодиц к верхней части бедра
может меняться. Разница роста задана равномерным масштабом ВСЕГО персонажа.

Моргание и пробный парный сгиб кистей сохранены. Клипы Blink_Once,
Fists_Close, Fists_Open присутствуют, но скелета, боевого рига и анимации
удара нет. В исходной открытой сетке есть локальные контакты у больших
пальцев, а при моргании — контакты век. В промежуточном моргании найдены
и новые пары треугольников относительно Евы; это предварительная анимация.
Контакты глаза и кожи также меняются. Выборочные проверки не доказывают
отсутствия всех пересечений; совместимость с одеждой и движком проверять.
Колодец и свет прежние; отдельного GLB колодца нет.

Для ручного управления сгибом f=0..1 задать четыре веса тела:
Fists=f; FistQuarterCorrection=max(0,1-abs(f-0.25)/0.25);
FistHalfCorrection=max(0,1-abs(f-0.50)/0.25);
FistThreeQuarterCorrection=max(0,1-abs(f-0.75)/0.25).
Моргание: face_blink.Blink=b, upper_eyelid_line.Blink=b,
upper_eyelid_line.BlinkLineNarrow=min(1,2*b).

Основа и отдельные формы: MakeHuman/MPFB2 assets, CC0 1.0 Universal;
лицензия — LICENSE_MAKEHUMAN_ASSETS.md. Фотографии в архив не включены.
"""


def load_target(name: str, mapping: np.ndarray, manifest: dict[str, str]) -> np.ndarray:
    path = DATA / name
    if name not in manifest or motion.sha256(path.read_bytes()) != manifest[name]:
        raise ValueError(f'Unexpected target {name}')
    rows = np.loadtxt(path, dtype=np.float64)
    idx = rows[:, 0].astype(np.int64)
    if np.any(rows[:, 0] != idx) or len(np.unique(idx)) != len(idx) or idx.min() < 0 or idx.max() >= 19158:
        raise ValueError(f'Invalid target {name}')
    native = np.zeros((19158, 3), dtype=np.float64)
    native[idx] = rows[:, 1:4] * .1
    return native[mapping]


def tint_skin(raw: bytes, colour: tuple[int, int, int]) -> bytes:
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    if image.size != (1024, 1024):
        raise ValueError('Unexpected skin image')
    pixels = np.asarray(image, dtype=np.float64)
    # The neutral patch in Eve's atlas is approximately [222,195,177]. A
    # channel-wise tint changes the entire skin atlas consistently, including
    # hands/feet, while preserving its painted detail and UV layout.
    tint = np.asarray(colour, dtype=np.float64) / [222., 195., 177.]
    out = np.clip(np.rint(pixels * tint), 0, 255).astype(np.uint8)
    dest = io.BytesIO()
    Image.fromarray(out, 'RGB').save(dest, format='PNG', optimize=True)
    return dest.getvalue()


def tint_iris(raw: bytes, pigment: tuple[float, float, float]) -> bytes:
    image = np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).copy()
    if image.shape != (1024, 1024, 3):
        raise ValueError('Unexpected eye image')
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    rgb = image.astype(np.float64)
    mask = ((radius < 128) & (rgb[:, :, 2] > rgb[:, :, 0] + 4)
            & (rgb[:, :, 2] > rgb[:, :, 1] + 2) & (rgb[:, :, 2] > 25))
    if not 20_000 < int(mask.sum()) < 100_000:
        raise ValueError('Unexpected iris selection')
    lum = .30 * rgb[:, :, 0] + .59 * rgb[:, :, 1] + .11 * rgb[:, :, 2]
    tint = np.stack([lum * p for p in pigment], axis=2)
    image[mask] = np.clip(np.rint(tint[mask]), 0, 255).astype(np.uint8)
    dest = io.BytesIO()
    Image.fromarray(image, 'RGB').save(dest, format='PNG', optimize=True)
    return dest.getvalue()


def reshape_head(points: np.ndarray, v: Variant) -> np.ndarray:
    q = points.astype(np.float64).copy()
    # Smooth into the neck; all eyeballs and blinking vertices are above the
    # transition and undergo the same affine transform as their eyelids.
    gate = old.smooth(1.415, 1.465, q[:, 1])
    w, h, d = v.head
    q[:, 0] += points[:, 0] * w * gate
    q[:, 1] += (points[:, 1] - 1.56) * h * gate
    q[:, 2] += (points[:, 2] - .015) * d * gate
    return q


def reshape_mouth(points: np.ndarray, v: Variant) -> np.ndarray:
    p = points.astype(np.float64)
    x, y, z = p[:, 0], p[:, 1], p[:, 2]
    # Warp both the outside and the inside of the mouth together. Applying an
    # unrelated lip-volume target to Eve's existing lip seam caused contacts;
    # this smooth, bounded mapping preserves the order of nearby surfaces.
    gate = (np.exp(-.5 * (x / .038) ** 2 - .5 * ((y - 1.501) / .020) ** 2)
            * old.smooth(.07, .11, z) * old.smooth(1.46, 1.475, y)
            * (1 - old.smooth(1.53, 1.54, y)))
    width, height = v.mouth
    q = p.copy()
    q[:, 0] += x * width * gate
    q[:, 1] += (y - 1.501) * height * gate
    return q


def reshape_torso(points: np.ndarray, arm_tree: cKDTree, v: Variant) -> np.ndarray:
    p = points.astype(np.float64)
    y = p[:, 1]
    distance, _ = arm_tree.query(p)
    # A C1 spatial taper protects arm-weighted surface and avoids the sharp
    # armpit/breast boundary that produced creases in an earlier draft.
    gate = (old.smooth(.008, .050, distance) * old.smooth(.86, .96, y)
            * (1 - old.smooth(1.12, 1.22, y)))
    waist = np.exp(-.5 * ((y - 1.035) / .075) ** 2)
    rib = np.exp(-.5 * ((y - 1.175) / .065) ** 2)
    depth = np.exp(-.5 * ((y - 1.06) / .14) ** 2)
    a, b, c = v.torso
    q = p.copy()
    q[:, 0] += p[:, 0] * (a * waist + b * rib) * gate
    q[:, 2] += (p[:, 2] - .015) * c * depth * gate
    return q


def sculpt_bust(points: np.ndarray, arm_tree: cKDTree, v: Variant) -> np.ndarray:
    # A broad, smooth forward field keeps the breast projection distinct
    # without the hard lower-breast normal rotation of the earlier target.
    p = points.astype(np.float64)
    x, y, z = p.T
    distance, _ = arm_tree.query(p)
    ax = np.abs(x)
    field = (np.exp(-.5 * ((ax - .095) / .050) ** 2 - .5 * ((y - 1.208) / .055) ** 2)
             * old.smooth(.075, .145, z) * old.smooth(.005, .045, distance)
             * old.smooth(1.06, 1.12, y) * (1 - old.smooth(1.30, 1.35, y))
             * old.smooth(.005, .025, ax) * (1 - old.smooth(.14, .175, ax)))
    q = p.copy()
    q[:, 2] += v.bust * field
    return q


def build_variants(source: bytes, reference: bytes) -> dict[str, bytes]:
    # Reuse the tested prior target mapping and breast/buttock preparation,
    # without ever writing over its output files.
    saved = old.VARIANTS
    try:
        old.VARIANTS = [v.base for v in VARIANTS]
        bases = old.build_variants(source, reference)
    finally:
        old.VARIANTS = saved
    src_doc, src_bin = helpers.read_glb(source)
    uv = helpers.accessor(src_doc, src_bin, 2)
    source_positions = helpers.accessor(src_doc, src_bin, 0).astype(np.float64)
    arms = old.arm_weights(reference, uv)
    arm_tree = cKDTree(source_positions[:ORIGINAL_COUNT][arms > 1e-8])
    mapping = refinement.vertex_map(ORIGINAL_COUNT)
    manifest = json.loads((DATA / 'manifest.json').read_text())
    source_skin = eye.brow.view_bytes(src_doc, src_bin, 8)
    source_eye = eye.brow.view_bytes(src_doc, src_bin, 9)
    outputs = {}
    for variant in VARIANTS:
        doc, binary = helpers.read_glb(bases[variant.key])
        p = helpers.accessor(doc, binary, 0).astype(np.float64)
        normals = helpers.accessor(doc, binary, 1).astype(np.float64)
        faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
        target_delta = np.zeros_like(p)
        y = p[:ORIGINAL_COUNT, 1]
        face_gate = old.smooth(1.448, 1.465, y) * (1 - old.smooth(1.545, 1.558, y))
        eye_gate = old.smooth(1.53, 1.54, y) * (1 - old.smooth(1.59, 1.60, y))
        for name, weight in variant.extra_face.items():
            gate = eye_gate if name.startswith('eyes/') else face_gate
            target_delta[:ORIGINAL_COUNT] += load_target(name, mapping, manifest) * (weight * gate[:, None])
        lid = helpers.accessor(doc, binary, 8).astype(np.float64)
        if any(name.startswith('eyes/') for name in variant.extra_face):
            lid = old.fit_lid_to_face(p, faces, lid, target_delta).astype(np.float64)
        moved = reshape_mouth(p + target_delta, variant)
        moved = reshape_torso(moved, arm_tree, variant)
        moved = sculpt_bust(moved, arm_tree, variant)
        new_positions = np.ascontiguousarray(reshape_head(moved, variant), dtype='<f4')
        precise = new_positions.astype(np.float64)
        keys = np.column_stack([np.round(p * 1e6).astype(np.int64), np.round(normals * 100).astype(np.int64)])
        _, groups = np.unique(keys, axis=0, return_inverse=True)
        protected = p[:, 1] <= .835
        protected[:ORIGINAL_COUNT] |= arms > 1e-8
        protected = (np.bincount(groups, weights=protected.astype(np.int32)) > 0)[groups]
        new_normals = refinement.updated_normals(p, precise, normals, faces)
        new_normals[protected] = normals[protected]
        # Eyelids are above the head transition. While closing, fade local
        # eyelid sculpting toward Eve's transformed closed-eye geometry; this
        # keeps the new neutral eye shape but avoids compounding it with the
        # inherited blink. The fade is applied symmetrically to welded vertices.
        linear = 1. + np.asarray(variant.head)
        x0, y0, z0 = source_positions.T
        eye_fade = (old.smooth(1.53, 1.545, y0) * (1 - old.smooth(1.59, 1.605, y0))
                    * old.smooth(.05, .09, z0) * (1 - old.smooth(.065, .09, np.abs(x0))))
        blink = (helpers.accessor(src_doc, src_bin, 14).astype(np.float64) * linear
                 + (reshape_head(source_positions, variant) - precise) * eye_fade[:, None])
        blink_normals = (refinement.updated_normals(precise, precise + blink, new_normals, faces).astype(np.float64)
                         - new_normals.astype(np.float64)).astype('<f4')
        lids = np.ascontiguousarray(reshape_head(lid, variant), dtype='<f4')
        lid_normals = refinement.normalize(helpers.accessor(doc, binary, 9).astype(np.float64) / linear).astype('<f4')
        lid_blink, lid_narrow = motion.lid_deltas(precise, faces, lids.astype(np.float64), blink)
        eyes = reshape_head(helpers.accessor(doc, binary, 4), variant).astype('<f4')
        eye_normals = refinement.normalize(helpers.accessor(doc, binary, 5).astype(np.float64) / linear).astype('<f4')
        result = copy.deepcopy(doc)
        views = [bytearray(eye.brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
        for index, values in ((0, new_positions), (1, new_normals), (4, eyes), (5, eye_normals),
                              (8, lids), (9, lid_normals), (14, blink), (15, blink_normals),
                              (16, lid_blink), (17, lid_narrow)):
            eye.update(result, views, index, values)
        views[8] = bytearray(tint_skin(source_skin, variant.skin))
        views[9] = bytearray(tint_iris(source_eye, variant.iris))
        result['asset']['generator'] = f'BladesOfWar adult woman individual study v2: {variant.key}'
        result['asset']['extras'] = {'study': variant.label, 'uniformHeightScale': variant.scale,
                                     'base': 'Eve eye study; no skeleton'}
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
    protected = {SOURCE.parent.resolve(), old.OUTPUT.resolve(), eye.DEFAULT_SOURCE.parent.resolve(),
                 eye.brow.DEFAULT_SOURCE.parent.resolve(), eye.brow.trial.DEFAULT_SOURCE.parent.resolve(),
                 motion.DEFAULT_SOURCE.parent.resolve()}
    output_paths = {(args.output / f).resolve() for f in [ARCHIVE_NAME, *[v.filename for v in VARIANTS]]}
    if args.output.resolve() in protected or output_paths & {args.source.resolve(), args.reference.resolve(), args.well_archive.resolve()}:
        parser.error('Refusing to overwrite a prior study or an input')
    source = motion.checked(args.source, SOURCE_SHA256, 'Eve eye study')
    reference = motion.checked(args.reference, eye.REFERENCE_SHA256, 'auxiliary weight source')
    models = {'eve': source, **build_variants(source, reference)}
    args.output.mkdir(parents=True, exist_ok=True)
    for v in VARIANTS:
        model = models[v.key]
        (args.output / v.filename).write_bytes(model)
        doc, binary = helpers.read_glb(model)
        p = helpers.accessor(doc, binary, 0)
        height = (p[:, 1].max() - p[:, 1].min()) * v.scale
        print(f'{v.key}: {len(model)} bytes; height {height:.4f} m; SHA-256 {motion.sha256(model)}', flush=True)
    if not args.models_only:
        from showcase import make_showcase
        html = make_showcase(models, args.well_archive, sys.modules[__name__])
        archive = make_archive(models, html)
        (args.output / ARCHIVE_NAME).write_bytes(archive)
        print(f'ZIP: {len(archive)} bytes SHA-256 {motion.sha256(archive)}', flush=True)


if __name__ == '__main__':
    main()
