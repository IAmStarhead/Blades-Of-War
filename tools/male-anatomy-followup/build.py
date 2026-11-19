#!/usr/bin/env python3
"""Build an isolated reversible anatomy follow-up from the last delivered ZIP."""
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
DEFAULT = ROOT / 'work/male-anatomy-followup'
INPUT = ROOT / 'work/male-torso-relaxed/BladesOfWar_Proba_Torsa_i_Hodby.zip'
INPUT_ZIP_SHA = '40c6508a12d065c20b5c61b129f28b9ca5572e34887136088f3c87b1bdf5e375'
INPUT_MODEL_SHA = '79feb676a09aa801a557ee4a63b3887b7e627b79db3f899535e7fe864b09d81f'
MODEL = 'male_anatomy_followup.glb'
ARCHIVE = 'BladesOfWar_Proba_Torsa_i_Taza.zip'
LICENSES = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md',
            'LICENSE_THREE.txt', 'LICENSE_CC0_QUATERNIUS.txt')
MARKER = '<!-- Blades of War: reversible anatomy follow-up trial -->'

README = """# Blades of War — отдельная проба уточнения торса и таза

Распакуйте архив и откройте `index.html` в браузере с WebGL. Модель встроена в
HTML, интернет не нужен. На Android откройте HTML из распакованной папки в
браузере. Для кнопки скачивания GLB файл `male_anatomy_followup.glb` должен
находиться рядом с HTML.

## Как сравнить

«Последняя проба» — именно торс и таз из архива `BladesOfWar_Proba_Torsa_i_Hodby.zip`,
который Вы смотрели последним. «Новая правка» — эта проба. Между ними
переключается только поверхность: на обеих сторонах та же `Torso_Walk` с
руками ближе к телу, тот же `Polish_Run`, присед и одна и та же фаза. Чтобы
сравнить, выберите «Шаг на месте» или «Бег на месте», остановите ползунок на
нужной фазе, выберите «Торс и руки» или «Таз и бёдра» и поворачивайте камеру.
Те же кнопки работают на телефоне; перетаскивание тоже поворачивает камеру.

## Что изменено и что осталось

Мы уменьшили усиление округлости груди, заднего объёма таза и контраста с
животом из предыдущей пробы. В основу поверхности вернули более раннюю форму,
локально скорректировали переходы и умеренно сгладили центр таза. Полный
откат задней части сделал центральную складку заметнее, поэтому в её центре
частично сохранена поверхность последней пробы. Изменения не микроскопические:
отдельные точки смещены до 43 мм относительно последней пробы. Ниже перехода
к бёдрам, на кистях и лице форму не меняли. Изменяется только поверхность: скелет,
веса кожи, топология, текстуры, существующие коррекции и все анимационные
ключи оставлены прежними. Исправление челюсти сохранено. Понравившиеся
движения ног и бега сохранены; при этом силуэт таза в них, конечно, меняется.

**Ограничение:** тёмная складка между тазом и бёдрами всё ещё заметна в ряде
поз. Сглаживание и частичный откат не устранили её; это компромиссная, обратимая
проба для Вашей оценки, а не объявление анатомии исправленной. Сравните её в
движении и при необходимости остановите на проблемной фазе.

Мы также проверили перенос готовых вариантов ходьбы в приседе, но полученные
позы дали пересечения кожи или слишком разведённые руки; стопы и стык цикла
тоже нуждаются в доработке. Поэтому новая анимация стелса в этот архив **не
включена**: здесь остаётся прежний экспериментальный присед. Он не является
готовым решением. Фиксации стоп по горизонтали и физики нет; возможно
скольжение. Коррекция пола и переходов работает только в этом просмотрщике,
не запечена в GLB.

Архив и модель последней пробы не изменены. Внешний просмотрщик применяет
новую поверхность ко всем клипам GLB; чтобы увидеть точную предыдущую форму
вне HTML, используйте предыдущий GLB. Если захотите, сравним и уточним
оставшиеся складки после Вашей оценки.

## Источники и условия

Анимации и модель унаследованы из предыдущей пробы. Готовые циклы ходьбы и
бега адаптированы из Quaternius Universal Animation Library Standard 2025;
страницы https://quaternius.com/packs/universalanimationlibrary.html и
https://quaternius.itch.io/universal-animation-library указывают CC0 1.0.
Использовано зеркало https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e .
Позднее опубликованная общая лицензия Quaternius отличается; перед
распространением проверьте условия именно полученной версии. В архиве есть
текст CC0 и сведения о модели, ушах и Three.js.

Некоторые унаследованные клипы содержат CMU mocap: The data used in this
project was obtained from mocap.cs.cmu.edu. The database was created with
funding from NSF EIA-0196217. CMU разрешает использовать данные в коммерческих
продуктах, но запрещает прямую перепродажу данных, даже после конверсии:
https://mocap.cs.cmu.edu/ и https://mocap.cs.cmu.edu/faqs.php . Условия и
README конверсии Брюса Хана прилагаются. Новые проверенные кандидаты CMU и
KayKit в эту модель не включены.
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
        model = z.read('male_torso_relaxed.glb')
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(model) != INPUT_MODEL_SHA or (INPUT.parent / 'male_torso_relaxed.glb').read_bytes() != model:
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
    with tempfile.TemporaryDirectory(prefix='bow-anatomy-followup-') as tempdir:
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
