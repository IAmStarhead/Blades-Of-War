#!/usr/bin/env python3
"""Create a separate hand-grip and ear-softening study of the approved model A.

The previous motion study is the verified source and is never overwritten. At
rest only the two ears are changed; the original open hands are byte-identical.
The new grip and its intermediate corrections are exported as glTF morphs.
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

import ears
import hands

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / 'work/character-model-search/selected-a/motion-study/female_A_motion.glb'
DEFAULT_OUTPUT = ROOT / 'work/character-model-search/selected-a/hand-ear-study'
SOURCE_SHA256 = '713cb5004612bb3c4707406ec863147a17a6b23e68e192e99177f5b469b313f7'
MODEL_NAME = 'female_A_hands_ears.glb'
ARCHIVE_NAME = 'female_A_hands_ears_and_well.zip'
TARGET_NAMES = ['Fists', 'FistQuarterCorrection', 'FistHalfCorrection', 'FistThreeQuarterCorrection']

spec = importlib.util.spec_from_file_location('_model_a_motion_study', ROOT / 'tools/model-a-motion/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the verified motion builder')
motion = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = motion
spec.loader.exec_module(motion)
helpers = motion.helpers
refinement = motion.previous

ARCHIVE_README = """Blades Of War — отдельная проба кистей и ушей модели А

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Мышь вращает камеру, колесо меняет масштаб, правая
кнопка сдвигает сцену; на телефоне вращайте пальцем и масштабируйте двумя.
Кнопки крупных ракурсов показывают лицо, кисти и уши. Флажок «Кулаки»
включает сжатие; ползунок позволяет вручную рассмотреть промежуточные позы.

female_A_hands_ears.glb — отдельный вариант предыдущей пробы. Открытая
геометрия рук, лицо, глаза, брови, текстура, моргание и линия век сохранены.
Форма каждого уха лишь слегка сглажена, в самом ухе добавлены полигоны.
Для сжатия индивидуально подогнуты суставы и большой палец обеих кистей.
Это мягкий хват, а не физическая симуляция или универсальный риг предметов.
У основания больших пальцев в исходной открытой сетке уже есть локальные
самопересечения; открытая кисть сохранена, а в проверенных положениях они
расходятся в начале сгиба. Проверка выборочная, не гарантия для всех поз.

Есть те же клипы Blink_Once, Fists_Close и Fists_Open. Клипы кистей используют
четыре морф-цели тела: Fists и три корректировки промежуточных поз. Для
ручного управления ползунком f=0..1 задайте телу веса в таком порядке:
  Fists = f
  FistQuarterCorrection = max(0, 1 - abs(f - 0.25) / 0.25)
  FistHalfCorrection = max(0, 1 - abs(f - 0.50) / 0.25)
  FistThreeQuarterCorrection = max(0, 1 - abs(f - 0.75) / 0.25)
При f=0 все веса нулевые; при f=1 равен единице только Fists. Управление
морганием прежнее: face_blink.Blink = b, upper_eyelid_line.Blink = b,
upper_eyelid_line.BlinkLineNarrow = min(1, 2*b). Скелета в GLB нет.
Названия морфов и воспроизведение клипов зависят от игрового импортёра;
автоморгание и фиксация позы реализуются кодом витрины или игры.

Свет и колодец витрины не изменены; отдельного GLB колодца здесь нет.
Причёска не согласована и не добавлена. Предыдущие версии не перезаписаны.
Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal; LICENSE_MAKEHUMAN_ASSETS.md.
"""


def update_accessor(document: dict, views: list[bytearray], index: int, value: np.ndarray) -> None:
    accessor = document['accessors'][index]
    dtype = {5123: '<u2', 5125: '<u4', 5126: '<f4'}[accessor['componentType']]
    array = np.ascontiguousarray(value, dtype=dtype)
    if accessor['type'] == 'SCALAR':
        array = array.reshape(-1, 1)
    views[accessor['bufferView']] = bytearray(array.tobytes())
    accessor['count'] = int(len(array))
    if 'min' in accessor:
        accessor['min'] = array.min(axis=0).astype(float).tolist()
        accessor['max'] = array.max(axis=0).astype(float).tolist()


def append_accessor(document: dict, views: list[bytearray], array: np.ndarray,
                    kind: str, bounds: bool = False) -> int:
    array = np.ascontiguousarray(array, dtype='<f4')
    if kind == 'SCALAR':
        array = array.reshape(-1, 1)
    view = len(views)
    views.append(bytearray(array.tobytes()))
    data_view = {'buffer': 0, 'byteLength': len(views[-1])}
    if kind == 'VEC3':
        data_view['target'] = 34962
    document['bufferViews'].append(data_view)
    accessor = {'bufferView': view, 'componentType': 5126, 'count': len(array), 'type': kind}
    if bounds:
        accessor['min'] = array.min(axis=0).astype(float).tolist()
        accessor['max'] = array.max(axis=0).astype(float).tolist()
    document['accessors'].append(accessor)
    return len(document['accessors']) - 1


def inverse_smoothstep(value: float) -> float:
    lo, hi = 0., 1.
    for _ in range(55):
        mid = (lo + hi) / 2
        if mid * mid * (3 - 2 * mid) < value:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def build_model(source: bytes, rig_data: bytes) -> bytes:
    source_document, binary = helpers.read_glb(source)
    if (len(source_document['accessors']) != 25 or len(source_document['bufferViews']) != 27
            or source_document['meshes'][0]['extras']['targetNames'] != ['Fists']
            or [animation['name'] for animation in source_document['animations']]
            != ['Blink_Once', 'Fists_Close', 'Fists_Open']):
        raise ValueError('Unexpected source motion-study layout')
    positions = helpers.accessor(source_document, binary, 0)
    normals = helpers.accessor(source_document, binary, 1)
    uvs = helpers.accessor(source_document, binary, 2)
    body_faces = helpers.accessor(source_document, binary, 3).reshape(-1, 3)
    face_faces = helpers.accessor(source_document, binary, 13).reshape(-1, 3)
    all_faces = np.concatenate([body_faces, face_faces])
    points, new_normals, new_uvs, triangles, parents, endpoints, selected = ears.build_ears(
        positions, normals, uvs, all_faces, refinement)
    if np.any(selected[len(body_faces):]):
        raise ValueError('The ear patch touched the independent blink face')
    new_body = triangles[parents < len(body_faces)]
    new_face = triangles[parents >= len(body_faces)]
    if not np.array_equal(new_face, face_faces):
        raise ValueError('The blink face was unexpectedly changed')

    document = copy.deepcopy(source_document)
    views = [bytearray(binary[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']])
             for v in document['bufferViews']]
    for index, array in [(0, points), (1, new_normals), (2, new_uvs),
                         (3, new_body), (13, new_face)]:
        update_accessor(document, views, index, array)
    # Both the existing facial morphs and any new ear vertices are untouched.
    for index in (14, 15):
        previous = helpers.accessor(source_document, binary, index)
        extra = (previous[endpoints[:, 0]] + previous[endpoints[:, 1]]) * .5
        if np.any(extra != 0):
            raise ValueError('Ear subdivision reached the blink morph')
        update_accessor(document, views, index, np.vstack([previous, extra]))

    fitted = hands.FittedHands(motion, rig_data, points, new_uvs)
    morphs = hands.morph_targets(fitted, new_normals, triangles, refinement)
    update_accessor(document, views, 11, morphs[0][0])
    update_accessor(document, views, 12, morphs[0][1])
    body = document['meshes'][0]
    primitive = body['primitives'][0]
    for position, normal in morphs[1:]:
        primitive['targets'].append({'POSITION': append_accessor(document, views, position, 'VEC3', bounds=True),
                                     'NORMAL': append_accessor(document, views, normal, 'VEC3')})
    body['weights'] = [0] * len(TARGET_NAMES)
    body['extras']['targetNames'] = TARGET_NAMES.copy()

    # Quarter boundaries are explicit keyframes, so linear glTF interpolation
    # produces exactly the same piecewise morph path as the viewer's slider.
    values = np.linspace(0, 1, 9)
    times = np.array([inverse_smoothstep(x) * .35 for x in values])
    times[0], times[-1] = 0, .35
    close = np.vstack([hands.correction_weights(v) for v in values]).reshape(-1, 1)
    opening = np.vstack([hands.correction_weights(1 - v) for v in values]).reshape(-1, 1)
    for index, array in [(21, times), (22, close), (23, times), (24, opening)]:
        update_accessor(document, views, index, array)
    document['asset']['generator'] = 'BladesOfWar model A grip and ear study'
    return refinement.pack_glb(document, views)


def make_showcase(model: bytes, well_archive: Path) -> bytes:
    template = (HERE / 'viewer.template.html').read_text('utf-8')
    bundle = '/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/'
    placeholder = '__FEMALE_DATA_URI__'
    if template.count(bundle) != 1 or template.count(placeholder) != 1:
        raise ValueError('Unexpected viewer template')
    uri = 'data:model/gltf-binary;base64,' + base64.b64encode(model).decode('ascii')
    return template.replace(bundle, refinement.well_engine_bundle(well_archive), 1).replace(placeholder, uri, 1).encode('utf-8')


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
    parser.add_argument('--rig', type=Path, default=motion.DEFAULT_RIG)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = motion.checked(args.source, SOURCE_SHA256, 'approved motion-study model')
    rig = motion.checked(args.rig, motion.RIG_SHA256, 'reference hand rig')
    model = build_model(source, rig)
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f'GLB {len(model)} bytes SHA-256 {motion.sha256(model)}')
    print(f'ZIP {len(archive)} bytes SHA-256 {motion.sha256(archive)}')


if __name__ == '__main__':
    main()
