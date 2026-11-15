#!/usr/bin/env python3
"""Build a separate model A fist trial without changing the approved ear study."""
from __future__ import annotations

import argparse
import copy
import importlib.util
import io
import sys
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PREVIOUS_TOOLS = ROOT / 'tools/model-a-hand-ear'
sys.path.insert(0, str(PREVIOUS_TOOLS))
spec = importlib.util.spec_from_file_location('_model_a_previous_hand_ear', PREVIOUS_TOOLS / 'build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous hand/ear builder')
previous = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = previous
spec.loader.exec_module(previous)
import hands  # noqa: E402
import deform  # noqa: E402

DEFAULT_SOURCE = ROOT / 'work/character-model-search/selected-a/hand-ear-study/female_A_hands_ears.glb'
SOURCE_SHA256 = '443a06634ec5d6d8dcee27f956022b511fc7012b4c3323e1320f15ec90d74707'
DEFAULT_OUTPUT = ROOT / 'work/character-model-search/selected-a/fist-refinement-trial'
MODEL_NAME = 'female_A_fist_trial.glb'
ARCHIVE_NAME = 'female_A_fist_trial_and_well.zip'

ARCHIVE_README = """Blades Of War — отдельная проба сгиба пальцев модели А

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Выберите «Женщина А» и нужный ракурс кисти. Флажок
«Кулаки» плавно переключает обе кисти, ползунок показывает промежуточные
формы. Мышь вращает камеру, колесо меняет масштаб; на телефоне вращайте
пальцем и масштабируйте двумя.

Это проба, а не утверждение об идеальной анатомии: петли мизинцев уменьшены,
но сгиб ещё округлый, а хват остаётся неплотным с некоторых ракурсов. Уши,
нейтральная открытая поза, лицо, моргание, текстура и остальная модель взяты
из предыдущей пробы без изменений. Предыдущие файлы не перезаписаны.

В GLB есть клипы Blink_Once, Fists_Close и Fists_Open. Скелета нет. Для
ручного управления степенью сгиба f=0..1 задайте четыре веса тела:
  Fists = f
  FistQuarterCorrection = max(0, 1 - abs(f - 0.25) / 0.25)
  FistHalfCorrection = max(0, 1 - abs(f - 0.50) / 0.25)
  FistThreeQuarterCorrection = max(0, 1 - abs(f - 0.75) / 0.25)
Моргание: face_blink.Blink = b, upper_eyelid_line.Blink = b,
upper_eyelid_line.BlinkLineNarrow = min(1, 2*b). Удержание конечной позы
и автоматическое повторение зависят от движка или кода витрины.

В исходной открытой сетке есть локальные самопересечения у основания больших
пальцев. Проверка пересечений выборочная, не гарантия для всей сетки и всех
моментов. Это заранее запечённая парная анимация, не физическая симуляция и
не риг с независимым управлением пальцами. Колодец и свет прежние; отдельного
GLB колодца в архиве нет. Волосы не добавлены.

Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal; полный текст лицензии —
LICENSE_MAKEHUMAN_ASSETS.md. Внешние фотографии в модель не включались.
"""


def build_model(source: bytes, rig: bytes) -> bytes:
    document, binary = previous.helpers.read_glb(source)
    body = document['meshes'][0]
    if (len(document['accessors']) != 31 or len(document['bufferViews']) != 33
            or body['extras']['targetNames'] != previous.TARGET_NAMES
            or [item['name'] for item in document['animations']]
            != ['Blink_Once', 'Fists_Close', 'Fists_Open']):
        raise ValueError('Unexpected previous hand/ear model layout')
    positions = previous.helpers.accessor(document, binary, 0).astype(np.float64)
    normals = previous.helpers.accessor(document, binary, 1).astype(np.float64)
    uvs = previous.helpers.accessor(document, binary, 2)
    faces = np.concatenate([previous.helpers.accessor(document, binary, i).reshape(-1, 3)
                            for i in (3, 13)])
    fitted = hands.FittedHands(previous.motion, rig, positions, uvs)
    keys = deform.key_shapes(fitted, hands)
    normal_keys = [np.zeros_like(normals)] + [
        previous.refinement.updated_normals(positions, positions + displacement, normals, faces).astype(np.float64) - normals
        for displacement in keys[1:]
    ]
    result = copy.deepcopy(document)
    views = [bytearray(binary[item.get('byteOffset', 0):item.get('byteOffset', 0) + item['byteLength']])
             for item in result['bufferViews']]
    for index, target in enumerate(result['meshes'][0]['primitives'][0]['targets']):
        if index == 0:
            position_delta, normal_delta = keys[-1], normal_keys[-1]
        else:
            fraction = index / 4.
            position_delta = keys[index] - fraction * keys[-1]
            normal_delta = normal_keys[index] - fraction * normal_keys[-1]
        previous.update_accessor(result, views, target['POSITION'], position_delta)
        previous.update_accessor(result, views, target['NORMAL'], normal_delta)
    result['asset']['generator'] = 'BladesOfWar model A separate fist refinement trial'
    return previous.refinement.pack_glb(result, views)


def make_showcase(model: bytes, well_archive: Path) -> bytes:
    html = previous.make_showcase(model, well_archive).decode('utf-8')
    replacements = {
        'Blades of War — проба кистей и ушей Евы': 'Blades of War — отдельная проба сгиба пальцев',
        'Ева · проба хвата и ушей + колодец': 'Ева · отдельная проба сгиба пальцев + колодец',
        'Женщина А · проба хвата и ушей': 'Женщина А · проба сгиба пальцев',
        'Мягкий хват. Флажок или ползунок возвращает исходные открытые кисти.':
            'Проба мягкого хвата: флажок или ползунок возвращает исходные открытые кисти.',
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
        ('LICENSE_MAKEHUMAN_ASSETS.md', (previous.refinement.DATA / 'LICENSE.ASSETS.md').read_bytes()),
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
    parser.add_argument('--rig', type=Path, default=previous.motion.DEFAULT_RIG)
    parser.add_argument('--well-archive', type=Path, default=previous.refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    protected = {DEFAULT_SOURCE.parent.resolve(), previous.DEFAULT_SOURCE.parent.resolve()}
    if args.output.resolve() in protected:
        parser.error('Refusing to write the trial into either previous study directory')
    source = previous.motion.checked(args.source, SOURCE_SHA256, 'previous hand/ear model')
    rig = previous.motion.checked(args.rig, previous.motion.RIG_SHA256, 'reference hand rig')
    model = build_model(source, rig)
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f'GLB {len(model)} bytes SHA-256 {previous.motion.sha256(model)}')
    print(f'ZIP {len(archive)} bytes SHA-256 {previous.motion.sha256(archive)}')


if __name__ == '__main__':
    main()
