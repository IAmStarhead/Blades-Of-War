#!/usr/bin/env python3
"""Build a separate offline lower-body movement trial without changing prior releases."""
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
DEFAULT = ROOT / 'work/male-leg-mechanics'
PREVIOUS = ROOT / 'work/male-motion-review'
SOURCE = PREVIOUS / 'BladesOfWar_Plechi_Bedra_Beg.zip'
SOURCE_ZIP_SHA = 'f3112eacb9235adc9de80f14fbfd7a8bb490961f744fbd13496d5a17ca7c204f'
SOURCE_MODEL_SHA = 'be394a6f1124fbe10e352ab2d3bfa0c0aabddce65c3774c2f4e622e52b037e07'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '6f6def18282574bc50e584c574d04e21d62a05426aa0aa3ef08ed69e2ec3bca7',
}
MARKER = '<!-- Blades of War: independent leg mechanics trial -->'
MODEL = 'male_leg_mechanics.glb'
ARCHIVE = 'BladesOfWar_Dvizhenie_Nog.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = """# Blades of War — движение ног от таза

Распакуйте `BladesOfWar_Dvizhenie_Nog.zip` и откройте `index.html` в браузере
с WebGL. Сеть не нужна. Для кнопки скачивания GLB файл должен лежать рядом.
Сравните «Новая» и «Прошлая» в шаге, беге и приседе; используйте ракурсы
«Таз и бёдра», «Ноги крупно», паузу и ползунок фазы. Камера и фаза сохраняются.

В копии рига точки вращения бёдер подняты на 5 см; поверхность модели и
нейтральная форма не изменены. Часть веса верхней поверхности ноги снова
передана кости бедра, а по внутреннему краю переход смягчён. В четырёх
новых циклах ноги пересчитаны под прежнюю траекторию и ориентацию стоп;
верхние кости и их ключи сохранены. Это проба, а не подтверждённая
анатомическая реконструкция: мышцы отдельно не симулируются. Стопы могут
отличаться в деталях из-за новых вращений голеней и линейного skinning.

C или кнопка на сцене включает/выключает стелс; WASD/стрелки и Shift или
касание земли управляют персонажем. На телефоне сцена остаётся видимой при
прокрутке к кнопкам сравнения. Скорость цикла на месте плавно меняется при
входе в присед и выходе из него — для обеих сравниваемых версий.

По-прежнему возможны скольжение стоп, неточности деформации и пересечения.
В выборочных позах отдельные треугольники в районе бёдер сжимаются сильнее,
чем в прошлой пробе; итог нужно оценивать глазами. При переходах подгонка
стоп может немного перемещать весь корпус. Зона подмышек исходной модели
не исправлена. Прежняя проба сохранена в отдельном архиве.

Для старых циклов в этом просмотрщике восстанавливаются старые положение
костей, bind-матрицы и веса. Во внешнем GLB-проигрывателе по умолчанию
используется новый риг и новые веса: для точного старого вида нужен прежний
GLB. Вертикальная подгонка стоп работает только в этом просмотрщике, не в
самом GLB; горизонтальной фиксации стоп и физики нет.

Старые клипы содержат адаптации CMU mocap, финансирование NSF EIA-0196217;
CMU запрещает прямую перепродажу данных, включая конвертированные. Условия
CMU, BVH-конверсия Брюса Хана, CC0 и MIT — в файлах LICENSE архива.
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
        model = z.read('male_motion_review.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_motion_review.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-motion-review' / file).read_bytes()) != digest:
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
    with tempfile.TemporaryDirectory(prefix='bow-leg-mechanics-') as name:
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
