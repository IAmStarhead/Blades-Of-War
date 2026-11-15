#!/usr/bin/env python3
"""Make a separate, texture-only brow adjustment of the latest model A trial."""
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

ROOT = Path(__file__).resolve().parents[2]
FIST_TOOLS = ROOT / 'tools/model-a-fist-trial'
sys.path.insert(0, str(FIST_TOOLS))
spec = importlib.util.spec_from_file_location('_model_a_fist_trial', FIST_TOOLS / 'build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the preceding fist trial builder')
trial = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = trial
spec.loader.exec_module(trial)
motion = trial.previous.motion
helpers = trial.previous.helpers
refinement = trial.previous.refinement

DEFAULT_SOURCE = ROOT / 'work/character-model-search/selected-a/fist-refinement-trial/female_A_fist_trial.glb'
SOURCE_SHA256 = 'd09710c1232708cfbbcba9054de3f928bece523f39a1c10e2605552f3e976539'
DEFAULT_OUTPUT = ROOT / 'work/character-model-search/selected-a/brow-study'
MODEL_NAME = 'female_A_brows_lower.glb'
ARCHIVE_NAME = 'female_A_brows_lower_and_well.zip'
SKIN_VIEW = 8
# The previous pass already shifted the brow by 1.25 texels. Repeat the same
# small amount in the direction previously verified as down on this UV island.
EXTRA_SHIFT_PIXELS = 1.25

ARCHIVE_README = """Blades Of War — Ева А: отдельная проба рисунка бровей

Распакуйте ZIP и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Выберите «Женщина А» и ракурс «Лицо крупно»; мышь
вращает камеру, колесо меняет масштаб. На телефоне вращайте пальцем,
масштабируйте двумя пальцами.

В модели female_A_brows_lower.glb рисунок обеих бровей немного опущен на
существующей текстуре кожи. Геометрия и рельеф лица не изменены. За основу
взята последняя отдельная проба кистей: уши, открытые руки, формы и клипы
кулаков и моргания сохранены. Прежние модели и архивы не перезаписаны.
Причёска не добавлена. Это проба для визуальной оценки.

Флажок «Кулаки» и ползунок сгиба работают как в предыдущей пробе. Это
запечённый парный сгиб, а не боевой риг или анимация удара; скелета нет.
На некоторых ракурсах сгиб остаётся округлым, а хват неплотным. В исходной
открытой сетке есть локальные самопересечения у основания больших пальцев;
проверки пересечений выборочные, не гарантия для всей сетки и всех моментов.

Для ручного управления сгибом f=0..1 задайте все четыре веса тела:
  Fists = f
  FistQuarterCorrection = max(0, 1 - abs(f - 0.25) / 0.25)
  FistHalfCorrection = max(0, 1 - abs(f - 0.50) / 0.25)
  FistThreeQuarterCorrection = max(0, 1 - abs(f - 0.75) / 0.25)
Клипы: Blink_Once, Fists_Close и Fists_Open. Для моргания:
face_blink.Blink = b, upper_eyelid_line.Blink = b,
upper_eyelid_line.BlinkLineNarrow = min(1, 2*b). Удержание позы и
автоматическое повторение зависят от движка или кода витрины.

Свет и процедурный колодец прежние; отдельного GLB колодца здесь нет.
Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal; полный текст лицензии —
LICENSE_MAKEHUMAN_ASSETS.md. Внешние фотографии в модель не включались.
"""


def view_bytes(document: dict, binary: bytes, index: int) -> bytes:
    view = document['bufferViews'][index]
    start = view.get('byteOffset', 0)
    return bytes(binary[start:start + view['byteLength']])


def original_skin() -> bytes:
    source = refinement.original_model(refinement.DEFAULT_SOURCE)
    document, binary = helpers.read_glb(source)
    if document['images'][0] != {'bufferView': SKIN_VIEW, 'mimeType': 'image/png'}:
        raise ValueError('Unexpected original skin image')
    return view_bytes(document, binary, SKIN_VIEW)


def shift_brows(current_png: bytes) -> bytes:
    raw = original_skin()
    previous = motion.brows_with_offset(raw, motion.BROW_SHIFT_PIXELS)
    shifted = motion.brows_with_offset(raw, motion.BROW_SHIFT_PIXELS + EXTRA_SHIFT_PIXELS)
    image = Image.open(io.BytesIO(current_png))
    if image.size != (1024, 1024) or image.mode != 'RGB':
        raise ValueError('Unexpected skin texture')
    current = np.asarray(image).copy()
    mask = np.any(previous != shifted, axis=2)
    yy, xx = np.where(mask)
    if not (600 < len(xx) < 900 and xx.min() >= 824 and xx.max() < 854
            and yy.min() >= 456 and yy.max() < 600):
        raise ValueError('Unexpected brow change mask')
    if not np.array_equal(current[mask], previous[mask]):
        raise ValueError('Previous skin no longer matches the verified brow reconstruction')
    current[mask] = shifted[mask]
    result = io.BytesIO()
    Image.fromarray(current, 'RGB').save(result, format='PNG', optimize=True)
    return result.getvalue()


def build_model(source: bytes) -> bytes:
    document, binary = helpers.read_glb(source)
    if (len(document['bufferViews']) != 33
            or document['images'][0] != {'bufferView': SKIN_VIEW, 'mimeType': 'image/png'}
            or [item['name'] for item in document['animations']]
            != ['Blink_Once', 'Fists_Close', 'Fists_Open']):
        raise ValueError('Unexpected previous trial layout')
    result = copy.deepcopy(document)
    views = [bytearray(view_bytes(document, binary, index)) for index in range(len(document['bufferViews']))]
    views[SKIN_VIEW] = bytearray(shift_brows(views[SKIN_VIEW]))
    result['asset']['generator'] = 'BladesOfWar model A painted brow adjustment trial'
    return refinement.pack_glb(result, views)


def make_showcase(model: bytes, well_archive: Path) -> bytes:
    html = trial.make_showcase(model, well_archive).decode('utf-8')
    replacements = {
        'Blades of War — отдельная проба сгиба пальцев': 'Blades of War — проба рисунка бровей',
        'Ева · отдельная проба сгиба пальцев + колодец': 'Ева · проба рисунка бровей + колодец',
        'Женщина А · проба сгиба пальцев': 'Женщина А · проба рисунка бровей',
    }
    for old, new in replacements.items():
        if html.count(old) != 1:
            raise ValueError(f'Unexpected showcase template: {old!r}')
        html = html.replace(old, new, 1)
    return html.encode('utf-8')


def make_archive(model: bytes, html: bytes) -> bytes:
    entries = [
        ('BladesOfWar_Showcase.html', html),
        (MODEL_NAME, model),
        ('README.txt', ARCHIVE_README.encode('utf-8')),
        ('LICENSE_MAKEHUMAN_ASSETS.md', (refinement.DATA / 'LICENSE.ASSETS.md').read_bytes()),
    ]
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compresslevel=9)
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    protected = {DEFAULT_SOURCE.parent.resolve(), trial.DEFAULT_SOURCE.parent.resolve(),
                 trial.previous.DEFAULT_SOURCE.parent.resolve(), motion.DEFAULT_SOURCE.parent.resolve()}
    inputs = {args.source.resolve(), args.well_archive.resolve(), refinement.DEFAULT_SOURCE.resolve()}
    outputs = {(args.output / MODEL_NAME).resolve(), (args.output / ARCHIVE_NAME).resolve()}
    if args.output.resolve() in protected or inputs & outputs:
        parser.error('Refusing to overwrite a previous study directory or input file')
    source = motion.checked(args.source, SOURCE_SHA256, 'preceding fist trial')
    model = build_model(source)
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f'GLB {len(model)} bytes SHA-256 {motion.sha256(model)}')
    print(f'ZIP {len(archive)} bytes SHA-256 {motion.sha256(archive)}')


if __name__ == '__main__':
    main()
