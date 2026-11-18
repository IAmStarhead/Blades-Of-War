#!/usr/bin/env python3
"""Build an independent, offline walking revision without changing earlier releases."""
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
DEFAULT = ROOT / 'work/male-natural-walk'
PREVIOUS = ROOT / 'work/male-zomboid-style'
SOURCE = PREVIOUS / 'BladesOfWar_Novaya_Hodba_Beg.zip'
SOURCE_ZIP_SHA = '23d4e0546e40d66bf388301a3c698c662e0b30d61667e3dcdd96341bacdf91e4'
SOURCE_MODEL_SHA = '6849e0a3112c2bc0a8c4fb341ffb7a9d7725a6cd786aa08a2ab63fadcdf37c0a'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '539257a8ad078e4793f8cab6a0cb26e31bba6af0d6bc1d4ef4a3defe9d64ee06',
}
MARKER = '<!-- Blades of War: independent walking revision -->'
MODEL = 'male_natural_walk.glb'
ARCHIVE = 'BladesOfWar_Novaya_Proba_Hodby.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = '''# Blades of War — новая проба ходьбы

## Как открыть и сравнить

Распакуйте `BladesOfWar_Novaya_Proba_Hodby.zip` целиком и откройте `index.html`
в современном браузере с WebGL. Интернет не нужен; для ссылки «Скачать модель»
файл `male_natural_walk.glb` должен находиться рядом с HTML.

Сразу открывается **Шаг на месте** сбоку. Переключайте **Новая ходьба / Прошлая**:
«Прошлая» — последняя версия, которую Вы описали как робота. Смотрите **Сбоку**,
**Спереди** и **Сзади**, включите **Ноги крупно** или поворачивайте камеру.
Есть пауза, ползунок фазы и замедление ×½. Ракурс и относительная фаза при
переключении сохраняются, но разные циклы не обязаны совпадать по позе.

**До прошлой** показывает ещё более раннюю пробу живота и трицепса. Это
позволяет сравнить её бег с последним вариантом. Бег между **Прошлая** и
**Новая ходьба** не менялся: это один и тот же `Game_Style_Jog`. Для старого
бега в управлении оставлена прежняя скорость 2,2 м/с, для двух последних —
1,9 м/с; шаг у всех — 0,9 м/с.

## Что изменено

Опорное колено больше не остаётся в глубоком приседе: в цикле оно сгибается
при принятии веса и ближе к концу опоры, распрямляясь в середине без полного
«замка». Перенос ноги, перекат стопы, высота таза и мах рук перестроены;
к корпусу добавлено очень небольшое сбалансированное движение, а не большое
виляние. Пальцы отдельно не анимированы. Бег из прошлой пробы и его коррекция
позы рук не переделывались; это не означает, что внешний вид бега уже принят.

Это самостоятельная процедурная проба под существующий риг, не копия Project
Zomboid. Игра выбрана как общий визуальный ориентир; подробный мужской бег
оригинала не был просмотрен, его ассеты не включены. Для ориентирования также
просмотрены отдельные кадры CC0-анимации Quaternius; данные её анимации не
переносились. Новая версия требует Вашей оценки **в движении**: выборочные
проверки и кадры не гарантируют естественности и отсутствия всех дефектов.

## Управление и ограничения

Нажмите **Управление**, чтобы водить персонажа. Щелчок или касание земли — идти
к точке; **Shift + щелчок** — бежать. WASD или стрелки — движение относительно
экрана, Shift — бег, Esc — стоп. Перетаскивание мышью или пальцем вращает
камеру. На телефоне бег выбирается кнопкой. **В начало** возвращает персонажа
к колодцу. На крупных ракурсах колодец временно скрыт.

Просмотрщик вертикально подгоняет стопы при смешивании поз; горизонтальной
фиксации стоп и физики нет, скольжение возможно. При открытии GLB в другом
просмотрщике дополнительная подгонка не запустится. GLB содержит десять
morph-целей и старые клипы с отрицательными весами morph; совместимость с каждым
движком не проверялась. Это не новая модель мышц и не гарантия отсутствия
сжатия при линейном skinning. Ранее опубликованные архивы не перезаписаны.

## Источники

Старые клипы в GLB включают адаптации CMU: данные получены с
[mocap.cs.cmu.edu](https://mocap.cs.cmu.edu/), проект финансировался NSF
EIA-0196217; CMU запрещает прямую перепродажу данных даже после конверсии.
Условия и описание BVH-конверсии Брюса Хана — в `LICENSE_MOCAP.md` и
`CMU_BVH_READMEFIRST.txt`. Модель и уши — CC0 (`LICENSE_CC0_ASSETS.md`),
Three.js — MIT (`LICENSE_THREE.txt`). Посмотренный в качестве стороннего
визуального ориентира [Quaternius Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
не включён в архив. Подробности сборки и проверки — `tools/male-natural-walk/README.md`.
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
        model = z.read('male_zomboid_style.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_zomboid_style.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-zomboid-style' / file).read_bytes()) != digest or sha((HERE / file).read_bytes()) != digest:
            raise ValueError('Approved shared code changed: ' + file)
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
    with tempfile.TemporaryDirectory(prefix='bow-natural-walk-') as name:
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
