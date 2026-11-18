#!/usr/bin/env python3
"""Build a separate offline shoulder, hip and running review without changing prior releases."""
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
DEFAULT = ROOT / 'work/male-motion-review'
PREVIOUS = ROOT / 'work/male-stealth-crouch'
SOURCE = PREVIOUS / 'BladesOfWar_Kisti_i_Stealth.zip'
SOURCE_ZIP_SHA = 'c4681c1143ed5eb118674bce1bf8f9356665df703ec5eff2b7f5480a06e23ec0'
SOURCE_MODEL_SHA = 'a9b2587d8d5b7977aed04a06540cd1b4882a47a2af4491767a7f5ae34e1828e9'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '6f6def18282574bc50e584c574d04e21d62a05426aa0aa3ef08ed69e2ec3bca7',
}
MARKER = '<!-- Blades of War: independent shoulder and hip motion review -->'
MODEL = 'male_motion_review.glb'
ARCHIVE = 'BladesOfWar_Plechi_Bedra_Beg.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = """# Blades of War — плечи, бёдра и бег

Распакуйте `BladesOfWar_Plechi_Bedra_Beg.zip` целиком и откройте `index.html`:
сеть не нужна, требуется браузер с WebGL. Кнопка «Скачать модель» работает,
если `male_motion_review.glb` лежит рядом. Предыдущая проба сохранена отдельно.

Сравните «Новая» и «Прошлая» в шаге, беге и приседе на одной фазе: камера и
фаза сохраняются. Ракурс «Таз и бёдра» показывает сгиб крупно, «Торс и руки» —
плечи. Ползунок останавливает движение, можно включить замедление.

C или кнопка на сцене включает/выключает стелс: в управлении есть покой и
медленный шаг, в просмотре на месте — шаг. WASD/стрелки или касание земли —
движение, Shift — бег вне приседа, Esc — остановка. Перетаскивание вращает
камеру. В приседе скорость снижена и бег отключён, как в предыдущей пробе.

В копии модели перераспределены веса перехода таза в бедро; базовая сетка и
длина ног не менялись. Складка мягче, но небольшой угловатый контур ещё виден.
В новой ходьбе, беге и приседе добавлено движение существующих костей
плечевого пояса; в ходьбе и беге руки дополнительно отведены на 5° от тела.
В беге уменьшен подъём стопы и максимальный
сгиб колена; он остаётся процедурной пробой. Кисти сохранены расслабленными,
у пальцев отдельных костей нет. Прошлая версия в просмотрщике использует также
сохранённые прежние веса, а не только старый цикл. В стороннем GLB-просмотрщике
по умолчанию используются новые веса; старые пробы целиком доступны в своих
архивах. Внутри GLB сохранены исходные анимационные ключи старых циклов, но они
будут деформироваться с новыми весами, если не восстановить старые веса.

Проверки выборочные, это не гарантия идеальной анатомии, отсутствия всех
пересечений или скольжения. В частности, в области подмышек обнаружены
пересекающиеся внутренние поверхности; они были и в прежней пробе. В выборке
бега осталась одна пара, не обнаруженная в выборке прошлого бега. В
просмотрщике есть вертикальная подгонка стоп при
переходах, но нет горизонтального foot-lock и физики; в стороннем просмотрщике
она не запускается. Отрицательные веса некоторых старых morph-клипов сохранены,
совместимость со всеми движками не проверялась.

Референсы: [анатомические размеры](https://www.mdpi.com/2617-8699/7/2/297),
[движение плеч и таза](https://journals.biologists.com/jeb/article/217/14/2456/12120/The-metabolic-cost-of-human-running-is-swinging),
[циклы бега](https://www.niccostiff.co.uk/wp-content/uploads/2020/02/Biomechanics-of-running-gait.pdf),
[деформация и веса](https://www.meshy.ai/3d-glossary/skinning), кадры
[реального бега](https://github.com/JRKagumba/2D-video-pose-estimation-yolov7).
Материалы этих референсов не включены. Project Zomboid — общий стилистический
ориентир, ассеты не использованы. Старые клипы содержат адаптации CMU mocap,
проект финансировался NSF EIA-0196217; CMU запрещает прямую перепродажу данных,
даже конвертированных. Условия CMU, BVH-конверсия Брюса Хана, CC0 и MIT — в
файлах LICENSE.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_sources() -> tuple[bytes, dict[str, bytes]]:
    archive = SOURCE.read_bytes()
    if sha(archive) != SOURCE_ZIP_SHA:
        raise ValueError('Previous ZIP differs from the verified last trial')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model = z.read('male_stealth_crouch.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_stealth_crouch.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-stealth-crouch' / file).read_bytes()) != digest:
            raise ValueError('Previous shared code changed: ' + file)
        if sha((HERE / file).read_bytes()) != digest:
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
