#!/usr/bin/env python3
"""Make a separate, restrained eye/upper-lid-line correction of approved Eve."""
from __future__ import annotations

import argparse
import copy
import importlib.util
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter1d

ROOT = Path(__file__).resolve().parents[2]
BROW_TOOLS = ROOT / 'tools/model-a-brow-study'
sys.path.insert(0, str(BROW_TOOLS))
spec = importlib.util.spec_from_file_location('_eve_brow_study', BROW_TOOLS / 'build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous brow study')
brow = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = brow
spec.loader.exec_module(brow)
motion, helpers, refinement = brow.motion, brow.helpers, brow.refinement

DEFAULT_SOURCE = ROOT / 'work/character-model-search/selected-a/brow-study/female_A_brows_lower.glb'
SOURCE_SHA256 = '87db24775e0ab3f82e0511ebed8077ae443cabf8b3aa75003fbccd79e0dcd356'
DEFAULT_REFERENCE = motion.DEFAULT_RIG
REFERENCE_SHA256 = motion.RIG_SHA256
DEFAULT_OUTPUT = ROOT / 'work/character-model-search/selected-a/eye-study'
MODEL_NAME = 'female_A_eyes_refined.glb'
ARCHIVE_NAME = 'female_A_eyes_refined_and_well.zip'
EYE_VIEW = 9
# Linear calibration of the clean, matching-UV source eye's sclera to the
# existing Eve texture, fitted on unaltered sclera away from the blue patches.
SCLERA_SCALE = np.array([.86768069, .86826312, .86842249])
SCLERA_OFFSET = np.array([-30.22497501, -30.35488662, -30.39175361])

ARCHIVE_README = """Blades Of War — Ева: отдельная проба белка и линии ресниц

Распакуйте ZIP и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Выберите «Женщина А» и «Лицо крупно»; мышь вращает
камеру, колесо меняет масштаб. На телефоне вращайте пальцем, масштабируйте
двумя пальцами.

Голубые пятна на белке заменены подходящими по цвету участками совпадающей
старой текстуры глаз из проекта. Сама голубая радужка не менялась. Верхняя
линия ресниц чуть расширена и плавнее сведена на концах. Это прежняя
непрерывная линия, не отдельные волоски и не новые вытянутые стрелки.
За основу взята последняя проба с одобренными бровями. Тело, лицо, уши,
кожа, кисти и их морфы не изменены; старые файлы сохранены отдельно.

Проверьте «Моргнуть», «Закрыть глаза», «Кулаки» и ползунок: линия век
подогнана к прежнему морфу моргания. В GLB клипы Blink_Once, Fists_Close и
Fists_Open; скелета нет. Для ручного управления см. страницу пробы в проекте.
Сжатие кистей — предварительный парный морф, не боевой риг. Исходная
открытая сетка имеет локальные самопересечения у оснований больших пальцев;
прошлые проверки были выборочными. Волосы не добавлены. Колодец и свет прежние.

Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal; полный текст лицензии —
LICENSE_MAKEHUMAN_ASSETS.md. Внешние фотографии в модель не включались.
"""


def cleaned_eye(current_png: bytes, reference_png: bytes) -> bytes:
    before = np.asarray(Image.open(io.BytesIO(current_png)).convert('RGB'))
    original = np.asarray(Image.open(io.BytesIO(reference_png)).convert('RGB'))
    if before.shape != (1024, 1024, 3) or original.shape != before.shape:
        raise ValueError('Unexpected eye texture dimensions')
    rgb = before.astype(np.float64)
    # In the reference, unaffected areas correspond to the same individual
    # texture. Match its tonal range, retaining the existing iris and all
    # unaffected pixels rather than swapping the whole texture.
    match = np.clip(np.rint(original.astype(np.float64) * SCLERA_SCALE + SCLERA_OFFSET), 0, 255)
    yy, xx = np.mgrid[:1024, :1024]
    radius = np.minimum(np.hypot(xx - 721, yy - 305), np.hypot(xx - 296, yy - 728))
    delta = rgb - match
    mask = ((radius > 132) & (radius < 350)
            & (delta[:, :, 2] - delta[:, :, 0] > 4)
            & (delta[:, :, 2] > 0) & (delta[:, :, 0] < 0))
    if not 85_000 < int(mask.sum()) < 100_000:
        raise ValueError('Unexpected blue-sclera mask')
    result = before.copy()
    result[mask] = match[mask].astype(np.uint8)
    out = io.BytesIO()
    Image.fromarray(result, 'RGB').save(out, format='PNG', optimize=True)
    return out.getvalue()


def refine_lid(document: dict, binary: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    old = helpers.accessor(document, binary, 8).astype(np.float64).reshape(2, 61, 7, 3)
    positions = helpers.accessor(document, binary, 0).astype(np.float64)
    faces = np.concatenate([helpers.accessor(document, binary, i).reshape(-1, 3) for i in (3, 13)])
    new = old.copy()
    for side in range(2):
        centers = (old[side, :, 0, 1] + old[side, :, -1, 1]) / 2
        smoothed = gaussian_filter1d(centers, sigma=0.85, mode='nearest')
        for row in range(61):
            # A tiny inner taper avoids a blunt cap; the already-tapered outer
            # tip stays short, without reintroducing the discarded wing.
            inner = np.array([.13, .42, .72, .95])[row] if row < 4 else 1.0
            scale = 1.12 * inner
            # Do not slide the extreme tips across a discontinuous eye/skin
            # depth boundary. Slightly smooth the interior only.
            end_fade = min(1., row / 4, (60 - row) / 6)
            center = centers[row] + .35 * end_fade * (smoothed[row] - centers[row])
            old_y, old_z = old[side, row, :, 1], old[side, row, :, 2]
            new_y = center + (old_y - centers[row]) * scale
            # Following the existing strip by interpolation avoids jumping
            # between the separate eye and skin surfaces at their boundary.
            new_z = np.interp(new_y, old_y, old_z)
            for edge in (0, -1):
                neighbor = 1 if edge == 0 else -2
                outside = new_y < old_y[0] if edge == 0 else new_y > old_y[-1]
                slope = (old_z[edge] - old_z[neighbor]) / (old_y[edge] - old_y[neighbor])
                new_z[outside] = old_z[edge] + slope * (new_y[outside] - old_y[edge])
            new[side, row, :, 1] = new_y
            new[side, row, :, 2] = new_z
    lids = np.ascontiguousarray(new.reshape(-1, 3), dtype='<f4')
    blink = helpers.accessor(document, binary, 14).astype(np.float64)
    move, narrow = motion.lid_deltas(positions, faces, lids.astype(np.float64), blink)
    return lids, move.astype('<f4'), narrow.astype('<f4')


def update(document: dict, views: list[bytearray], accessor: int, values: np.ndarray) -> None:
    a = document['accessors'][accessor]
    data = np.ascontiguousarray(values, dtype='<f4')
    vi = a['bufferView']
    if len(data) != a['count'] or data.nbytes != len(views[vi]) or a.get('byteOffset', 0):
        raise ValueError(f'Unexpected accessor layout {accessor}')
    views[vi] = bytearray(data.tobytes())
    if 'min' in a:
        a['min'] = data.min(axis=0).astype(float).tolist()
    if 'max' in a:
        a['max'] = data.max(axis=0).astype(float).tolist()


def build_model(source: bytes, reference: bytes) -> bytes:
    doc, binary = helpers.read_glb(source)
    ref, ref_binary = motion.read_any_glb(reference)
    if (len(doc['bufferViews']) != 33 or doc['images'][1] != {'bufferView': EYE_VIEW, 'mimeType': 'image/png'}
            or [a['name'] for a in doc['animations']] != ['Blink_Once', 'Fists_Close', 'Fists_Open']):
        raise ValueError('Unexpected brow study layout')
    ref_eye = next(m for m in ref['meshes'] if m['name'] == 'female_eyes')['primitives'][0]
    ref_uv = motion.rig_accessor(ref, ref_binary, ref_eye['attributes']['TEXCOORD_0'])
    if not np.array_equal(helpers.accessor(doc, binary, 6), ref_uv):
        raise ValueError('Reference eye UVs do not match the approved model')
    texture_index = ref['materials'][ref_eye['material']]['pbrMetallicRoughness']['baseColorTexture']['index']
    image_index = ref['textures'][texture_index]['source']
    clean_png = brow.view_bytes(ref, ref_binary, ref['images'][image_index]['bufferView'])
    result = copy.deepcopy(doc)
    views = [bytearray(brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
    views[EYE_VIEW] = bytearray(cleaned_eye(views[EYE_VIEW], clean_png))
    lids, move, narrow = refine_lid(doc, binary)
    for index, array in [(8, lids), (16, move), (17, narrow)]:
        update(result, views, index, array)
    result['asset']['generator'] = 'BladesOfWar Eve separate eye/upper-lid correction trial'
    return refinement.pack_glb(result, views)


def make_showcase(model: bytes, well_archive: Path) -> bytes:
    html = brow.make_showcase(model, well_archive).decode('utf-8')
    replacements = {
        'Blades of War — проба рисунка бровей': 'Blades of War — проба глаз Евы',
        'Ева · проба рисунка бровей + колодец': 'Ева · проба глаз + колодец',
        'Женщина А · проба рисунка бровей': 'Женщина А · проба глаз',
    }
    for old, new in replacements.items():
        if html.count(old) != 1:
            raise ValueError(f'Unexpected showcase template: {old!r}')
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
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--reference', type=Path, default=DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    protected = {DEFAULT_SOURCE.parent.resolve(), brow.DEFAULT_SOURCE.parent.resolve(),
                 brow.trial.DEFAULT_SOURCE.parent.resolve(), motion.DEFAULT_SOURCE.parent.resolve()}
    inputs = {args.source.resolve(), args.reference.resolve(), args.well_archive.resolve()}
    outputs = {(args.output / MODEL_NAME).resolve(), (args.output / ARCHIVE_NAME).resolve()}
    if args.output.resolve() in protected or inputs & outputs:
        parser.error('Refusing to overwrite a prior study or an input')
    source = motion.checked(args.source, SOURCE_SHA256, 'approved brow study')
    reference = motion.checked(args.reference, REFERENCE_SHA256, 'reference eye texture')
    model = build_model(source, reference)
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f'GLB {len(model)} bytes SHA-256 {motion.sha256(model)}')
    print(f'ZIP {len(archive)} bytes SHA-256 {motion.sha256(archive)}')


if __name__ == '__main__':
    main()
