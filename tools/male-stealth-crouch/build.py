#!/usr/bin/env python3
"""Build an independent offline hand and stealth-crouch trial without changing earlier releases."""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT = ROOT / 'work/male-stealth-crouch'
PREVIOUS = ROOT / 'work/male-full-body-motion'
SOURCE = PREVIOUS / 'BladesOfWar_Proba_Hodby_i_Bega.zip'
SOURCE_ZIP_SHA = '0ea157fccd1bfcad896cb8ce664bc7a3b176f3d83ad2f8d1a74fcc19e055ab92'
SOURCE_MODEL_SHA = '3fc6aecd2d60b85261f9604b514dc54ea6003329020fedb2adad76a1e0119fa5'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '539257a8ad078e4793f8cab6a0cb26e31bba6af0d6bc1d4ef4a3defe9d64ee06',
}
CROUCH_GUARD_SHA = '6f6def18282574bc50e584c574d04e21d62a05426aa0aa3ef08ed69e2ec3bca7'
MARKER = '<!-- Blades of War: independent hand and stealth-crouch trial -->'
MODEL = 'male_stealth_crouch.glb'
ARCHIVE = 'BladesOfWar_Kisti_i_Stealth.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = '''# Blades of War — кисти, движение и стелс

## Открыть

Распакуйте `BladesOfWar_Kisti_i_Stealth.zip` целиком и откройте `index.html`
в современном браузере с WebGL. Интернет не нужен. Для ссылки «Скачать модель»
файл `male_stealth_crouch.glb` должен лежать рядом с HTML.

Сразу показана ходьба сбоку. Можно выбрать шаг или бег на месте, разные ракурсы,
паузу и фазу цикла. **Прошлая** — последняя проба ходьбы и бега; **Новая**
сохраняет их движения, но добавляет форму кистей и коррекцию бёдер. Остальные
кнопки сравнения показывают более старые пробы. Фаза и камера сохраняются.
Присед является новым и одинаковым для всех вариантов сравнения.

## Стелс и управление

Клавиша **C** или кнопка **Присесть · C** прямо на сцене переключает присед.
В режиме управления персонаж может стоять в приседе или медленно идти к точке,
по WASD либо стрелкам. Во время приседа Shift и кнопка бега не ускоряют его;
после выхода из приседа прежний выбор скорости возвращается. В режимах шага и
бега на месте C включает ходьбу в приседе. Повторное нажатие C / кнопки
поднимает персонажа. Переходы смешиваются плавно.

Щелчок или касание земли — идти к точке; Shift + щелчок — бежать. WASD или
стрелки — движение относительно экрана, Shift — бег, Esc — остановить.
Перетаскивание мышью или пальцем вращает камеру. **В начало** возвращает к
колодцу и отменяет присед. На крупных ракурсах колодец временно скрыт.

## Что изменено и ограничения

Руки слегка собраны, но не сжаты в кулаки. Пальцы не имеют отдельных костей:
форма получена корректирующей morph-целью, а не самостоятельной анимацией
каждого сустава. Кисти, запястья и предплечья не получили добавочного осевого
поворота. Длина ног и базовая сетка не менялись. Между шарнирами рига бедро
и голень измерены примерно как 21,5% и 20,7% роста модели; в одной таблице
средних мужских сегментов приведены 23,2% и 24,7%. Игровые шарниры не обязаны
совпадать с анатомическими точками, а таблица основана на ограниченных выборках,
поэтому это не прямое доказательство ошибки. При беге сильный сгиб колена и
ракурс дополнительно сокращают видимый силуэт. Удлинять модель на глаз я не стал.

В предыдущем беге на отдельных фазах найдены складка и самопересечения у верхней
части бедра. Добавлены две локальные позовые формы для этой области. Проверки
выборочные: это не доказательство отсутствия всех дефектов или пересечений.
Присед и ходьба в нём — новые процедурные циклы, а не запись человека.
В просмотрщике есть ограниченная вертикальная подгонка стоп при смешивании;
горизонтального foot-lock и физики нет, скольжение возможно. В стороннем
GLB-просмотрщике runtime-подгонка не запустится. Предыдущие архивы сохранены.

GLB содержит 13 morph-целей, старые клипы включают отрицательные веса morph;
совместимость с каждым движком не проверялась. На низком FPS подшаги контроллера
сохраняют ход времени, но не добавляют кадров; задержки более 250 мс ограничены.

## Ориентиры и лицензии

Просмотрены фотографии расслабленных кистей, кадры реального бега, а также
отдельные кадры приседа из Quaternius и MocapAtlas. Дополнительно изучены
[анатомия кисти](https://jcdr.net/ReadXMLFile.aspx?id=13677),
[движение в приседе](https://onlinelibrary.wiley.com/doi/full/10.1002/ajpa.24834)
и [пропорции сегментов](https://accessphysiotherapy.mhmedical.com/content.aspx?bookid=445&sectionid=41288127).
Данные этих референсов в модель не перенесены. Project Zomboid — общий игровой
ориентир; его ассеты и анимации не используются. Старые клипы содержат
адаптации [CMU mocap](https://mocap.cs.cmu.edu/), проект финансировался NSF
EIA-0196217; CMU запрещает прямую перепродажу данных, даже конвертированных.
Условия CMU, BVH-конверсия Брюса Хана, CC0 и MIT приведены в файлах LICENSE.
'''


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_sources() -> tuple[bytes, dict[str, bytes]]:
    archive = SOURCE.read_bytes()
    if sha(archive) != SOURCE_ZIP_SHA:
        raise ValueError('Previous ZIP differs from the verified last trial')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model = z.read('male_full_body_motion.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_full_body_motion.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-full-body-motion' / file).read_bytes()) != digest:
            raise ValueError('Previous shared code changed: ' + file)
        expected = CROUCH_GUARD_SHA if file == 'floor-guard.mjs' else digest
        if sha((HERE / file).read_bytes()) != expected:
            raise ValueError('Unexpected trial code: ' + file)
    return model, licenses


def build(output: Path) -> None:
    output = output.resolve()
    own = DEFAULT.resolve()
    if output == ROOT or (ROOT in output.parents and output != own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page = output / 'index.html'
    names = (MODEL, ARCHIVE, 'README.md', 'build-info.json', *INHERITED)
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output / name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    source, licenses = read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-stealth-crouch-') as name:
        temp = Path(name)
        old, new, script = temp / 'previous.glb', temp / MODEL, temp / 'viewer.js'
        old.write_bytes(source)
        result = subprocess.run(['node', str(HERE / 'author.mjs'), str(old), str(new)], cwd=ROOT,
                                check=True, capture_output=True, text=True)
        info = json.loads(result.stdout)
        rigged = new.read_bytes()
        if old.read_bytes() != source or info['sourceSha256'] != SOURCE_MODEL_SHA or info['outputSha256'] != sha(rigged):
            raise ValueError('Unexpected source or generated model')
        subprocess.run([str(HERE / 'node_modules/.bin/esbuild'), str(HERE / 'viewer.mjs'), '--bundle', '--minify',
                        '--format=iife', '--target=es2020', '--outfile=' + str(script)], cwd=ROOT,
                       check=True, capture_output=True)
        bundle = script.read_text(encoding='utf-8')
    if '</script' in bundle.lower():
        raise ValueError('Viewer bundle contains a script terminator')
    template = (HERE / 'viewer.template.html').read_text(encoding='utf-8')
    for key, value in {'__MODEL__': base64.b64encode(rigged).decode('ascii'), '__BUNDLE__': bundle}.items():
        if template.count(key) != 1:
            raise ValueError(f'Expected one marker {key}')
        template = template.replace(key, value, 1)
    html = (MARKER + '\n' + template).encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,') != 1:
        raise ValueError('Expected one embedded model')
    files = [('index.html', html), (MODEL, rigged), ('README.md', README.encode('utf-8'))]
    files += [(name, licenses[name]) for name in INHERITED]
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for file, data in files:
            entry = zipfile.ZipInfo(file, date_time=(2026, 11, 14, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data, compresslevel=9)
    archive = result.getvalue()
    info.update({'sourceZipSha256': SOURCE_ZIP_SHA, 'sharedCodeSha256': CODE_SHA,
                 'crouchGuardSha256': CROUCH_GUARD_SHA,
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
