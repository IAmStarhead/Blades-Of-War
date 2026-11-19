#!/usr/bin/env python3
"""Build the separate, reversible gait-polish trial from the delivered ZIP."""
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
DEFAULT = ROOT / 'work/male-gait-polish'
INPUT = ROOT / 'work/male-library-motion/BladesOfWar_Hodba_i_Beg.zip'
INPUT_ZIP_SHA = '8b55bc818cb9944a904194664e1029930a7b9fed3944fae57aba4c4c70a78981'
INPUT_MODEL_SHA = '14fb12a55c690b3919a66c07d3e9715da568fa13bbf7e945538bf0ab4a4b8cd0'
MODEL = 'male_gait_polish.glb'
ARCHIVE = 'BladesOfWar_Proba_Pravok_Hodby_i_Bega.zip'
LICENSES = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md',
            'LICENSE_THREE.txt', 'LICENSE_CC0_QUATERNIUS.txt')
MARKER = '<!-- Blades of War: reversible gait-polish trial -->'

README = """# Blades of War — отдельная проба правок ходьбы и бега

Распакуйте архив и откройте `index.html` в браузере с поддержкой WebGL.
Модель уже встроена в HTML, интернет не нужен. На Android можно открыть HTML
из распакованной папки в браузере. Для кнопки скачивания GLB файл
`male_gait_polish.glb` должен находиться рядом с HTML.

Для сравнения выберите «Новая правка» или «Прошлая версия»: вторая — именно
предыдущая проба Quaternius, понравившийся бег сохранён. Сравнение использует
одинаковую фазу и скорость. «Шаг / Бег на месте», ракурсы спереди/сбоку/сзади,
«Таз и бёдра», «Лицо крупно», «Шея сбоку», пауза и ползунок позволяют рассмотреть движение.
Присед оставлен прежним, но поверхность таза новой версии меняется и в нём.
Предыдущий архив и модель отдельно не перезаписаны.

## Что сделано

Ходьба и бег по-прежнему основаны на готовых `Walk_Loop` и `Jog_Fwd_Loop`
из Quaternius Universal Animation Library Standard 2025, адаптированных к
данному ригу; это не нетронутые оригиналы. В ходьбе чуть уменьшено разведение
рук, смягчено вращение предплечий и кистей; ноги и корпус оставлены из прошлой
библиотечной пробы. В беге сохранены цикл, скорость, ноги, руки и движение
корпуса; вращение между шеей и головой перераспределено, чтобы уменьшить
видимую боковую деформацию нижней части лица. Отдельной кости челюсти нет.

Небольшая локальная коррекция поверхности смягчает переход в области паха и
заднего контура; толщина ног, веса кожи, скелет и топология не менялись.
Разница в форме умеренная, и она ещё требует вашей визуальной оценки, особенно
в сильном сгибе и приседе: автоматические тесты не доказывают правильность
анатомии. Локальные тени и складки в этих позах могут оставаться заметными.

Клипы новой пробы — `Polish_Walk` и `Polish_Run`; прошлые `Library_Walk` и
`Library_Run` сохранены. Внешний GLB-просмотрщик покажет старые клипы на
новой поверхности; для точной старой модели используйте предыдущий GLB или
кнопку сравнения в этом просмотрщике. Кости, ключи ног и опорная форма стоп
не менялись. Скорости 1,0 и 3,5 м/с приблизительные; горизонтальной фиксации
стоп и физики нет, возможны скольжение и складки. Коррекция пола и переходов
в присед работает только во встроенном просмотрщике, не запечена в GLB.

## Источники и лицензии

Quaternius Universal Animation Library, Standard 2025: страницы
https://quaternius.com/packs/universalanimationlibrary.html и
https://quaternius.itch.io/universal-animation-library указывают CC0 1.0.
Использовано стороннее зеркало
https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e
(README указывает загрузку с itch.io 10 июня 2025). Общая Quaternius Asset
License на https://quaternius.com/license.html отличается и запрещает
самостоятельную раздачу ассетов, выпущенных под ней; перед распространением
проверьте условия именно полученной версии. Текст CC0 включён в архив.

Старые клипы содержат адаптации CMU mocap (финансирование NSF EIA-0196217);
CMU запрещает прямую перепродажу данных, включая конвертированные. Условия
CMU, сведения о BVH-конверсии Брюса Хана, лицензии модели, ушей и Three.js
находятся в остальных файлах лицензий.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sources() -> tuple[bytes, dict[str, bytes]]:
    archive = INPUT.read_bytes()
    if sha(archive) != INPUT_ZIP_SHA:
        raise ValueError('Unexpected previous archive')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous archive failed CRC')
        model = z.read('male_library_motion.glb')
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(model) != INPUT_MODEL_SHA or (INPUT.parent / 'male_library_motion.glb').read_bytes() != model:
        raise ValueError('Previous model does not match the archive')
    return model, licenses


def build(output: Path) -> None:
    output = output.resolve()
    own = DEFAULT.resolve()
    if output == ROOT or (ROOT in output.parents and output != own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page = output / 'index.html'
    names = (MODEL, ARCHIVE, 'README.md', 'build-info.json', *LICENSES)
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output / name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    previous, licenses = sources()
    with tempfile.TemporaryDirectory(prefix='bow-gait-polish-') as tempdir:
        temp = Path(tempdir)
        old, model, bundle = temp / 'previous.glb', temp / MODEL, temp / 'viewer.js'
        old.write_bytes(previous)
        result = subprocess.run(['node', str(HERE / 'author.mjs'), str(old), str(model)],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        info = json.loads(result.stdout)
        rigged = model.read_bytes()
        if old.read_bytes() != previous or info['sourceSha256'] != INPUT_MODEL_SHA or info['outputSha256'] != sha(rigged):
            raise ValueError('Model authoring failed verification')
        esbuild = ROOT / 'tools/male-library-motion/node_modules/.bin/esbuild'
        env = dict(os.environ, NODE_PATH=str(ROOT / 'tools/male-library-motion/node_modules'))
        subprocess.run([str(esbuild), str(HERE / 'viewer.mjs'), '--bundle', '--minify',
                        '--format=iife', '--target=es2020', '--outfile=' + str(bundle)],
                       cwd=ROOT, check=True, capture_output=True, env=env)
        script = bundle.read_text(encoding='utf-8')
    if '</script' in script.lower():
        raise ValueError('Viewer contains a script terminator')
    template = (HERE / 'viewer.template.html').read_text(encoding='utf-8')
    for key, value in {'__MODEL__': base64.b64encode(rigged).decode('ascii'), '__BUNDLE__': script}.items():
        if template.count(key) != 1:
            raise ValueError('Expected one template marker: ' + key)
        template = template.replace(key, value, 1)
    html = (MARKER + '\n' + template).encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,') != 1:
        raise ValueError('Expected one embedded model')
    files = [('index.html', html), (MODEL, rigged), ('README.md', README.encode('utf-8'))]
    files.extend(licenses.items())
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files:
            entry = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data, compresslevel=9)
    archive = stream.getvalue()
    info.update({'sourceZipSha256': INPUT_ZIP_SHA, 'pageSha256': sha(html), 'archiveSha256': sha(archive)})
    output.mkdir(parents=True, exist_ok=True)
    for name, data in files:
        (output / name).write_bytes(data)
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
