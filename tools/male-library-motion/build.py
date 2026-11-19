#!/usr/bin/env python3
"""Build a reversible, offline library-motion trial without touching the input."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT = ROOT / 'work/male-library-motion'
INPUT = ROOT / 'work/male-deep-crouch/BladesOfWar_Glubokiy_Prisyed.zip'
INPUT_ZIP_SHA = 'd847402dfd0ead280fcd24f97cbfe7e7d466c83c7cc96884afd975effd8037bf'
INPUT_MODEL_SHA = '6375e7980e1b7119d9245a9796854dd8d52ae7272ad3f6a0473f59a2f561f0ca'
SOURCE_SHA = {
    'AnimationLibrary_Godot_Standard.gltf': '0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765',
    'AnimationLibrary_Godot_Standard.bin': '6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c',
    'LICENSE_CC0_QUATERNIUS.txt': 'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499',
    'MIRROR_README.md': '370e6ff244ef43b269f936be7d630a77a3eb7ed8bbc3315ffcae5b327b814fcb',
}
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')
MODEL = 'male_library_motion.glb'
ARCHIVE = 'BladesOfWar_Hodba_i_Beg.zip'
MARKER = '<!-- Blades of War: independent retargeted library-motion trial -->'

README = """# Blades of War — библиотечные ходьба и бег

Распакуйте архив и откройте `index.html` в браузере с WebGL. Страница автономна:
модель встроена в HTML. Файл GLB должен лежать рядом для кнопки его скачивания.
Стартовый вид — ходьба сбоку. Выберите «Бег на месте», ракурс «Сзади» или
«Таз и бёдра»; пауза, замедление и ползунок позволяют рассмотреть отдельные
фазы. «Прошлая проба» переключает на форму, веса и движения предыдущей
доставки, не перезаписывая её. Фазы разных циклов не обязательно совпадают
по позе. Для движения по сцене: WASD / стрелки, Shift — бег, C — присед;
на телефоне выберите скорость кнопкой и коснитесь земли.

Ходьба и бег получены ретаргетом готовых игровых циклов Quaternius Universal
Animation Library Standard: `Walk_Loop` → `Library_Walk`, `Jog_Fwd_Loop` →
`Library_Run`. `Idle_Loop` → `Library_Idle` также включён в GLB; в витрине
для покоя сохранены ранее выбранные варианты дыхания. Кости исходного рига
были переведены относительно их исходной и целевой bind-поз, а не скопированы
напрямую. В беге уменьшен размах бёдер до 65% исходного ретаргета, чтобы
избежать чрезмерного сгиба на этой сетке; руки немного отведены от корпуса,
сглажен шов цикла. Добавлены корректирующие morph-формы тазобедренных сгибов
и коленей; объём ног увеличен, прежняя форма ягодиц ослаблена, а часть весов
кожи уточнена. Это изменение сетки и skinning, не симуляция мышц.
Оригинальные кости, остальные клипы и морфы оставлены в GLB. Присед в этой
пробе отдельно не переработан: в витрине используются прежние анимации
`Deep_Crouch_Idle/Walk` на изменённой сетке, и деформацию в них ещё нужно оценить.

Для импорта используйте `Library_Walk` и `Library_Run` вместе с анимированными
morph-формами. В отдельных циклах высота корня скорректирована и записана в
GLB; фазы полёта исходного бега оставлены. В витрине дополнительно есть защита
от ухода стоп ниже пола при смешивании; она не записана в GLB. Жёсткой фиксации
стоп по горизонтали и физики нет, поэтому скольжение возможно. Смешивание и
переходы в присед в движке нужно настроить и проверить самостоятельно.
Старые клипы в новом GLB используют новую поверхность; точная старая форма
и веса при сравнении восстанавливаются только в витрине (или из старого GLB).
Проба требует визуального одобрения, особенно при сильном сгибе; тесты не
доказывают анатомическую правильность и не проверяют каждый движок или телефон.

## Источник анимаций и лицензии

Quaternius, Universal Animation Library, Standard (2025); официальный источник:
https://quaternius.com/packs/universalanimationlibrary.html
и https://quaternius.itch.io/universal-animation-library. Страницы данного
набора указывают CC0 1.0. Использована версия из стороннего зеркала
https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e,
которое сообщает о загрузке Standard с itch.io 10 июня 2025 и также содержит
CC0; см. `LICENSE_CC0_QUATERNIUS.txt` и контрольные суммы в build-info.
Сам Quaternius не является автором этого зеркала. На общем сайте также есть
отдельная Quaternius Asset License, запрещающая самостоятельную раздачу
ассетов, выпущенных под ней: https://quaternius.com/license.html. Она не
совпадает с CC0, указанной на странице данного набора; перед самостоятельным
распространением следует перепроверить условия конкретной полученной версии.

Старые клипы включают адаптации CMU mocap, финансирование NSF EIA-0196217;
CMU запрещает прямую перепродажу данных, включая конвертированные. Условия
CMU, BVH-конверсия Брюса Хана, прочие CC0 и MIT — в остальных файлах лицензий.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sources() -> tuple[bytes, dict[str, bytes]]:
    for name, digest in SOURCE_SHA.items():
        if sha((HERE / 'source' / name).read_bytes()) != digest:
            raise ValueError('Library source differs from verified copy: ' + name)
    archive = INPUT.read_bytes()
    if sha(archive) != INPUT_ZIP_SHA:
        raise ValueError('Previous archive differs from verified delivery')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous archive CRC failed')
        old = z.read('male_deep_crouch.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(old) != INPUT_MODEL_SHA or (INPUT.parent / 'male_deep_crouch.glb').read_bytes() != old:
        raise ValueError('Previous model differs from verified archive')
    licenses['LICENSE_CC0_QUATERNIUS.txt'] = (HERE / 'source/LICENSE_CC0_QUATERNIUS.txt').read_bytes()
    return old, licenses


def build(output: Path) -> None:
    output = output.resolve()
    own = DEFAULT.resolve()
    if output == ROOT or (ROOT in output.parents and output != own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page = output / 'index.html'
    names = (MODEL, ARCHIVE, 'README.md', 'build-info.json', *INHERITED, 'LICENSE_CC0_QUATERNIUS.txt')
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output / name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    old, licenses = sources()
    with tempfile.TemporaryDirectory(prefix='bow-library-motion-') as name:
        temp = Path(name)
        source, model, script = temp / 'previous.glb', temp / MODEL, temp / 'viewer.js'
        source.write_bytes(old)
        env = dict(os.environ)
        for key in ('BOW_LEG_THICKNESS', 'BOW_POSTERIOR_TRANSFER', 'BOW_RUMP_RETAIN'):
            env.pop(key, None)
        result = subprocess.run(['node', str(HERE / 'author.mjs'), str(source), str(model)],
                                cwd=ROOT, check=True, capture_output=True, text=True, env=env)
        info = json.loads(result.stdout)
        rigged = model.read_bytes()
        if source.read_bytes() != old or info['sourceSha256'] != INPUT_MODEL_SHA or info['outputSha256'] != sha(rigged):
            raise ValueError('Unexpected source or generated model')
        subprocess.run([str(HERE / 'node_modules/.bin/esbuild'), str(HERE / 'viewer.mjs'), '--bundle', '--minify',
                        '--format=iife', '--target=es2020', '--outfile=' + str(script)],
                       cwd=ROOT, check=True, capture_output=True)
        bundle = script.read_text(encoding='utf-8')
    if '</script' in bundle.lower():
        raise ValueError('Viewer bundle contains a script terminator')
    template = (HERE / 'viewer.template.html').read_text(encoding='utf-8')
    for key, value in {'__MODEL__': base64.b64encode(rigged).decode('ascii'), '__BUNDLE__': bundle}.items():
        if template.count(key) != 1:
            raise ValueError('Expected one marker: ' + key)
        template = template.replace(key, value, 1)
    html = (MARKER + '\n' + template).encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,') != 1:
        raise ValueError('Expected one embedded model')
    files = [('index.html', html), (MODEL, rigged), ('README.md', README.encode('utf-8'))]
    files += list(licenses.items())
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file, data in files:
            entry = zipfile.ZipInfo(file, date_time=(2026, 11, 14, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data, compresslevel=9)
    archive = stream.getvalue()
    info.update({'sourceZipSha256': INPUT_ZIP_SHA, 'librarySourceSha256': SOURCE_SHA,
                 'libraryMirrorCommit': 'e24c23cf2a1323488a3faa226ea7ea21f644b73e',
                 'pageSha256': sha(html), 'archiveSha256': sha(archive)})
    output.mkdir(parents=True, exist_ok=True)
    for file, data in files:
        (output / file).write_bytes(data)
    (output / ARCHIVE).write_bytes(archive)
    (output / 'build-info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / '.gitattributes').write_text('index.html -whitespace\nCMU_BVH_READMEFIRST.txt -whitespace\n', encoding='utf-8')
    print(f'GLB: {len(rigged)} bytes, SHA-256 {sha(rigged)}')
    print(f'Offline HTML: {len(html)} bytes, SHA-256 {sha(html)}')
    print(f'ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}')
    print(f'Output: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT)
    build(parser.parse_args().output)
