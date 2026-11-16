#!/usr/bin/env python3
"""Build separate face-detail revisions of four women; preserve all prior GLBs.

The central study has a lighter complexion and less elongated head. Each study
has individually shaped eyes, brows, ears and lips. Eve and the baked two-hand
morph/animation are retained; no skeleton is added.
"""
from __future__ import annotations
import argparse
import copy
import dataclasses
import importlib.util
import io
import math
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('_women_variants_v2', ROOT / 'tools/women-variants-v2/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous women study')
v2 = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = v2
spec.loader.exec_module(v2)
eye, motion, helpers, refinement = v2.eye, v2.motion, v2.helpers, v2.refinement
old = v2.old
SOURCE, SOURCE_SHA256 = v2.SOURCE, v2.SOURCE_SHA256
ORIGINAL_COUNT = v2.ORIGINAL_COUNT
OUTPUT = ROOT / 'work/character-model-search/women-variants-v3'
ARCHIVE_NAME = 'five_women_face_details_and_well.zip'


@dataclass(frozen=True)
class Brow:
    arch: float
    length: float
    thickness: float
    slope: float
    shift: float
    colour: tuple[int, int, int]
    opacity: float


@dataclass(frozen=True)
class Variant:
    key: str
    label: str
    filename: str
    scale: float
    base: v2.Variant
    eyes: tuple[float, float, float]  # width, height and outward-corner slope
    lips: tuple[float, float]         # mouth width and height
    ears: tuple[float, float, float, float]  # height, flare, depth, earlobe length (metres)
    brows: Brow


def make_base(key: str, filename: str, **changes) -> v2.Variant:
    previous = next(v for v in v2.VARIANTS if v.key == key)
    inner = dataclasses.replace(previous.base, filename=filename)
    return dataclasses.replace(previous, filename=filename, base=inner, **changes)


VARIANTS = [
    Variant('north', 'Северянка', 'woman_north_v3.glb', 1.05,
        make_base('north', 'woman_north_v3.glb'),
        (.02, .06, -.03), (.06, -.12), (.08, .0015, .06, .0015),
        Brow(4.5, 48., 1.30, .7, 2.5, (108, 75, 58), .55)),
    Variant('central', 'Централка', 'woman_central_v3.glb', 1.,
        make_base('central', 'woman_central_v3.glb', skin=(215, 185, 170), head=(.005, -.025, -.015)),
        (-.08, .13, -.02), (.03, .04), (-.08, -.0005, -.02, -.0015),
        Brow(2.8, 42., .90, 1.1, 2.2, (78, 53, 42), .62)),
    Variant('east', 'Японский мотив', 'woman_east_asian_v3.glb', .95,
        make_base('east', 'woman_east_asian_v3.glb'),
        (.08, -.10, .05), (-.07, .02), (-.03, -.0005, .03, .001),
        Brow(1.5, 47., 1.03, .5, 2.8, (53, 37, 30), .68)),
    Variant('africa', 'Африканка', 'woman_african_v3.glb', 1.02,
        make_base('africa', 'woman_african_v3.glb'),
        (.10, .09, .04), (.08, .08), (.06, .002, -.04, .003),
        Brow(3.5, 50., 1.45, .7, 2.5, (48, 32, 26), .76)),
]

ARCHIVE_README = """Blades Of War — Ева и четыре пробы: индивидуальные черты лица

Распакуйте ZIP и откройте BladesOfWar_Showcase.html в браузере с WebGL;
интернет не нужен. Сначала пять моделей стоят рядом на общем полу и шкале
роста. Кнопки «Сравнить лица» и «Сравнить уши» выравнивают головы и показывают
черты рядом; это не сравнение роста. Чтобы вернуться — «Сравнить рост».
Выберите модель для отдельного крупного плана. Мышь вращает камеру, колесо
масштабирует; на телефоне используйте пальцы.

Централке осветлены кожа и изменены пропорции головы. У всех четырёх новых
проб индивидуально изменены форма глаз, рисунок бровей, уши и губы. Брови —
рисунок на текстуре, не отдельные волоски. Ева и старые файлы сохранены.
Это художественные персонажи, а не правила внешности народов или регионов.
Волосы и одежда не добавлены. Различия роста — равномерный масштаб всей
фигуры; руки и область ниже y=0,835 м сохранены в локальной форме. Изменение
ягодиц плавно переходит в верхнюю часть бедра. Колодец прежний.

Костей в экспортированных пальцах нет. Кулак — запечённое изменение вершин
(морф Fists и три промежуточные поправки); клипы плавно меняют их веса.
Обе руки сгибаются вместе. Нужен отдельный скелетный риг для независимой
анимации суставов, хвата предметов и боя. Моргание и кулак предварительные:
в исходных сетках есть контакты пальцев и век, при изменении глаз добавляются
и меняются контакты глаз с окружающей кожей. Выборочные проверки и кадры
не гарантируют отсутствия пересечений во всех позах. Проверяйте в движке.

Управление кистями f=0..1: Fists=f;
FistQuarterCorrection=max(0,1-abs(f-.25)/.25);
FistHalfCorrection=max(0,1-abs(f-.50)/.25);
FistThreeQuarterCorrection=max(0,1-abs(f-.75)/.25).
Моргание: face_blink.Blink=b; upper_eyelid_line.Blink=b;
upper_eyelid_line.BlinkLineNarrow=min(1,2*b).

Основа и отдельные формы: MakeHuman/MPFB2 assets, CC0 1.0 Universal;
лицензия — LICENSE_MAKEHUMAN_ASSETS.md. Фотографии не включены.
"""


def styled_brow_image(raw: bytes, style: Brow) -> np.ndarray:
    """Reconstruct the approved underlying skin and paint a custom brow pair.

    The narrow UV patch and the same antialiased painted-brow method were used
    by the approved Eve. Only the two brow islands are replaced in the result.
    """
    image = Image.open(io.BytesIO(raw)).convert('RGB')
    if image.size != (1024, 1024):
        raise ValueError('Unexpected original skin texture')
    pixels = np.asarray(image).copy()
    before = pixels.copy()
    for y0, y1 in [(470, 520), (537, 591)]:
        for y in range(y0, y1):
            for x in range(832, 846):
                fade = min(1, max(0, (x - 831) / 2), max(0, (846 - x) / 2),
                           max(0, (y - (y0 - 1)) / 2), max(0, (y1 - y) / 2))
                skin = pixels[y, 829].astype(float) + (pixels[y, 832].astype(float) - pixels[y, 829].astype(float)) * (x - 829) / 3
                pixels[y, x] = np.rint((1 - fade) * before[y, x].astype(float) + fade * np.clip(skin, 0, 255)).astype('uint8')
    image = Image.fromarray(pixels, 'RGB').convert('RGBA')
    scale, ox, oy, width, height = 6, 824, 456, 30, 144
    overlay = Image.new('RGBA', (width * scale, height * scale))
    draw = ImageDraw.Draw(overlay)
    center = .5168333 * 1024
    for side in (1, -1):
        left, right = [], []
        for t in np.linspace(0, 1, 151):
            y = center + side * (515 - style.length * t - center)
            x = 841.3 - style.arch * math.sin(math.pi * t ** 1.35) + style.slope * t + style.shift
            head = helpers.smoothstep(t / .16)
            tail = helpers.smoothstep((1 - t) / .21)
            radius = .67 * (1.85 + .30 * (1 - t)) * style.thickness * head * tail
            left.append((round((x - radius - ox) * scale), round((y - oy) * scale)))
            right.append((round((x + radius - ox) * scale), round((y - oy) * scale)))
        draw.polygon(left + right[::-1], fill=(*style.colour, round(255 * style.opacity)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(.48 * scale)).resize((width, height), Image.Resampling.LANCZOS)
    image.alpha_composite(overlay, (ox, oy))
    return np.asarray(image.convert('RGB'))


def repaint_brows(current_png: bytes, source_skin: bytes, colour: tuple[int, int, int], style: Brow) -> bytes:
    current = np.asarray(Image.open(io.BytesIO(current_png)).convert('RGB')).copy()
    source = np.asarray(Image.open(io.BytesIO(source_skin)).convert('RGB'))
    raw = eye.brow.original_skin()
    previous = motion.brows_with_offset(raw, motion.BROW_SHIFT_PIXELS + eye.brow.EXTRA_SHIFT_PIXELS)
    x0, y0, x1, y1 = 824, 456, 854, 600
    if not np.array_equal(source[y0:y1, x0:x1], previous[y0:y1, x0:x1]):
        raise ValueError('Approved brow patch differs from its verified reconstruction')
    expected = np.asarray(Image.open(io.BytesIO(v2.tint_skin(source_skin, colour))).convert('RGB'))
    if not np.array_equal(current, expected):
        raise ValueError('Skin tint does not match the v2 derivation')
    custom = styled_brow_image(raw, style)[y0:y1, x0:x1].astype(np.float64)
    tint = np.asarray(colour, dtype=np.float64) / [222., 195., 177.]
    current[y0:y1, x0:x1] = np.clip(np.rint(custom * tint), 0, 255).astype('uint8')
    dest = io.BytesIO()
    Image.fromarray(current, 'RGB').save(dest, format='PNG', optimize=True)
    return dest.getvalue()


def warp_features(points: np.ndarray, variant: Variant) -> np.ndarray:
    """A smooth, symmetric field in the pre-head coordinates of this model."""
    p = np.asarray(points, dtype=np.float64)
    w, h, d = variant.base.head
    linear = np.array([1 + w, 1 + h, 1 + d])
    x = p[:, 0] / linear[0]
    y = (p[:, 1] + 1.56 * h) / linear[1]
    z = (p[:, 2] + .015 * d) / linear[2]
    ax = np.abs(x)
    side = np.sign(x)
    sm = old.smooth
    delta = np.zeros_like(p)

    # The full eyeball and nearby lid ribbon are within the constant part of
    # this field. The field tapers into the rest of the face without a seam.
    ex, ey = ax - .0298, y - 1.56435
    egate = ((1 - sm(.017, .033, np.abs(ex))) * (1 - sm(.017, .034, np.abs(ey)))
             * sm(.060, .090, z))
    ew, eh, slope = variant.eyes
    delta[:, 0] += side * ex * ew * egate
    delta[:, 1] += (ey * eh + ex * slope) * egate

    # Transform both sides of the closed mouth together, rather than moving
    # an isolated lip surface through its neighbour.
    mgate = (np.exp(-.5 * (x / .038) ** 2 - .5 * ((y - 1.501) / .020) ** 2)
             * sm(.07, .11, z) * sm(1.46, 1.475, y) * (1 - sm(1.53, 1.54, y)))
    mw, mh = variant.lips
    delta[:, 0] += x * mw * mgate
    delta[:, 1] += (y - 1.501) * mh * mgate

    # Ears and surrounding attachment change together, with a soft falloff
    # into the head. The per-ear detail topology and UVs are not replaced.
    ear_gate = (sm(.064, .077, ax) * sm(1.505, 1.520, y) * (1 - sm(1.605, 1.615, y))
                * sm(-.02, -.005, z) * (1 - sm(.055, .075, z)))
    ear_height, flare, ear_depth, lobe_length = variant.ears
    delta[:, 0] += side * flare * ear_gate
    delta[:, 1] += (y - 1.558) * ear_height * ear_gate
    delta[:, 2] += (z - .022) * ear_depth * ear_gate
    # Individually adjust the lower lobe rather than just scaling an identical
    # ear. Move the adjacent skin with the lobe and taper the field smoothly.
    lobe = (sm(.060, .068, ax) * sm(1.510, 1.519, y) * (1 - sm(1.534, 1.544, y))
            * sm(.016, .026, z) * (1 - sm(.044, .054, z)))
    delta[:, 1] -= lobe_length * lobe
    delta[:, 2] += .15 * lobe_length * lobe
    return p + delta * linear


def build_variants(source: bytes, reference: bytes) -> dict[str, bytes]:
    saved = v2.VARIANTS
    try:
        v2.VARIANTS = [v.base for v in VARIANTS]
        bases = v2.build_variants(source, reference)
    finally:
        v2.VARIANTS = saved
    source_doc, source_bin = helpers.read_glb(source)
    source_skin = eye.brow.view_bytes(source_doc, source_bin, 8)
    outputs = {}
    for variant in VARIANTS:
        doc, binary = helpers.read_glb(bases[variant.key])
        p = helpers.accessor(doc, binary, 0).astype(np.float64)
        normals = helpers.accessor(doc, binary, 1).astype(np.float64)
        faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
        q = np.ascontiguousarray(warp_features(p, variant), dtype='<f4')
        precise = q.astype(np.float64)
        new_normals = refinement.updated_normals(p, precise, normals, faces)
        # All changes are in the head, but force the protected limbs to retain
        # their exact byte-level normals even at coincident split vertices.
        source_positions = helpers.accessor(source_doc, source_bin, 0).astype(np.float64)
        arm = old.arm_weights(reference, helpers.accessor(source_doc, source_bin, 2))
        protected = source_positions[:, 1] <= .835
        protected[:ORIGINAL_COUNT] |= arm > 1e-8
        new_normals[protected] = normals[protected]
        blink_old = helpers.accessor(doc, binary, 14).astype(np.float64)
        blink = np.ascontiguousarray(warp_features(p + blink_old, variant) - warp_features(p, variant), dtype='<f4')
        blink_normals = (refinement.updated_normals(precise, precise + blink, new_normals, faces).astype(float)
                         - new_normals.astype(float)).astype('<f4')
        eyes_old = helpers.accessor(doc, binary, 4).astype(float)
        eyes = np.ascontiguousarray(warp_features(eyes_old, variant), dtype='<f4')
        eye_faces = helpers.accessor(doc, binary, 7).reshape(-1, 3)
        eye_normals = refinement.updated_normals(eyes_old, eyes.astype(float), helpers.accessor(doc, binary, 5), eye_faces)
        lids_old = helpers.accessor(doc, binary, 8).astype(float)
        lids = np.ascontiguousarray(warp_features(lids_old, variant), dtype='<f4')
        lid_faces = motion.rig_accessor(doc, binary, 10).reshape(-1, 3)
        lid_normals = refinement.updated_normals(lids_old, lids.astype(float), helpers.accessor(doc, binary, 9), lid_faces)
        lid_blink, lid_narrow = motion.lid_deltas(precise, faces, lids.astype(float), blink.astype(float))
        result = copy.deepcopy(doc)
        views = [bytearray(eye.brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
        for index, values in ((0, q), (1, new_normals), (4, eyes), (5, eye_normals),
                              (8, lids), (9, lid_normals), (14, blink), (15, blink_normals),
                              (16, lid_blink), (17, lid_narrow)):
            eye.update(result, views, index, values)
        views[8] = bytearray(repaint_brows(bytes(views[8]), source_skin, variant.base.skin, variant.brows))
        result['asset']['generator'] = f'BladesOfWar individual facial features study v3: {variant.key}'
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
    protected = {SOURCE.parent.resolve(), old.OUTPUT.resolve(), v2.OUTPUT.resolve(),
                 eye.DEFAULT_SOURCE.parent.resolve(), eye.brow.DEFAULT_SOURCE.parent.resolve(),
                 eye.brow.trial.DEFAULT_SOURCE.parent.resolve(), motion.DEFAULT_SOURCE.parent.resolve()}
    output_paths = {(args.output / f).resolve() for f in [ARCHIVE_NAME, *[v.filename for v in VARIANTS]]}
    if args.output.resolve() in protected or output_paths & {args.source.resolve(), args.reference.resolve(), args.well_archive.resolve()}:
        parser.error('Refusing to overwrite a prior study or an input')
    source = motion.checked(args.source, SOURCE_SHA256, 'Eve eye study')
    reference = motion.checked(args.reference, eye.REFERENCE_SHA256, 'auxiliary weight source')
    models = {'eve': source, **build_variants(source, reference)}
    args.output.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        model = models[variant.key]
        (args.output / variant.filename).write_bytes(model)
        doc, binary = helpers.read_glb(model)
        p = helpers.accessor(doc, binary, 0)
        height = (p[:, 1].max() - p[:, 1].min()) * variant.scale
        print(f'{variant.key}: {len(model)} bytes; height {height:.4f} m; SHA-256 {motion.sha256(model)}', flush=True)
    if not args.models_only:
        from showcase import make_showcase
        html = make_showcase(models, args.well_archive, sys.modules[__name__])
        archive = make_archive(models, html)
        (args.output / ARCHIVE_NAME).write_bytes(archive)
        print(f'ZIP: {len(archive)} bytes SHA-256 {motion.sha256(archive)}', flush=True)


if __name__ == '__main__':
    main()
