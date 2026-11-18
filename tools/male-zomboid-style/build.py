#!/usr/bin/env python3
"""Build an independent, offline walking/jogging trial without changing older releases."""
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
DEFAULT = ROOT / 'work/male-zomboid-style'
PREVIOUS = ROOT / 'work/male-belly-triceps'
SOURCE = PREVIOUS / 'BladesOfWar_Zhivot_Triceps_Sravnenie.zip'
SOURCE_ZIP_SHA = 'f9ae35be819bd2a7954c0b635c0cf3fa0dcb33f2887f884948f4bf4bb908ac3e'
SOURCE_MODEL_SHA = '0525f293409ad40e5146f461964d89d23e863ac57f57b12a51ea453f87867554'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '539257a8ad078e4793f8cab6a0cb26e31bba6af0d6bc1d4ef4a3defe9d64ee06',
}
MARKER = '<!-- Blades of War: independent game-style locomotion trial -->'
MODEL = 'male_zomboid_style.glb'
ARCHIVE = 'BladesOfWar_Novaya_Hodba_Beg.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = '''# Blades of War — отдельная проба ходьбы и бега

## Открыть и сравнить

Распакуйте `BladesOfWar_Novaya_Hodba_Beg.zip` целиком и откройте `index.html`
в современном браузере. Для просмотра интернет не нужен. Для ссылки «Скачать
модель» файл `male_zomboid_style.glb` должен лежать рядом с HTML.

Сначала показан **Шаг на месте**. Переключайте **Прошлая проба / Новые циклы**:
это последняя присланная версия и новые движения. Выберите **Бег на месте**
и сравните руки. Кнопки **Спереди / Сбоку / Сзади**, ракурс **Торс и руки**,
поворот камеры, **Пауза**, ползунок фазы и **Медленно ×½** помогают рассмотреть
движение. Ракурс и относительная фаза при сравнении сохраняются, хотя разные
циклы не обязаны иметь одинаковые позы в одной фазе. В режиме управления
прежний бег сохраняет свою скорость и немного быстрее нового.

## Что изменено

Ходьба и спокойный бег созданы заново для того же рига. Project Zomboid выбран
как общий визуальный ориентир игровой угловатости; это не копия и не перенос
его движений. Достаточно подробный референс именно мужского бега оригинальной
игры не был просмотрен, поэтому точное сходство утверждать нельзя. Файлы и
ассеты Project Zomboid в пробу не включены.

В новых чистых циклах отключены боковые повороты и крен костей таза/корпуса;
небольшой постоянный наклон и вертикальное движение остаются. В руках изменены
позы: мах идёт от плеча, локоть сгибается по одной заданной оси без отдельной
анимации скручивания предплечья и кисти. Риг, веса и исходная форма модели не
перезаписывались. При сгибе остаётся некоторое сжатие линейного skinning;
это не новая мышечная система и не гарантия одинакового силуэта во всех позах.
Пальцы по отдельности не анимированы.

Локальные morph-поправки живота и трицепса из прошлой пробы в новых циклах
выключены; прежние коррекции локтей, коленей и профиля шеи сохранены. В покое,
старых клипах и переходах могут действовать другие позы и формы. Прежний файл
и его 18 клипов сохранены отдельно; внутри нового GLB они тоже сохранены.
Это техническая проба для Вашей визуальной оценки, а не обещание, что все
недостатки устранены.

## Управление

Нажмите **Управление**, чтобы водить персонажа. Щелчок или касание земли — идти
к точке; **Shift + щелчок** — бежать. WASD или стрелки — движение относительно
экрана, Shift — бег, Esc — стоп. Перетаскивание мышью или пальцем вращает
камеру. На телефоне бег выбирается кнопкой. **В начало** возвращает персонажа
к колодцу. Камера следует за ним; колодец временно скрыт на крупных ракурсах.

В просмотрщике есть вертикальная подгонка ног к полу при смешивании поз.
Горизонтальной фиксации стоп и физики нет: скольжение и неточности переходов
возможны. При открытии GLB в другом просмотрщике дополнительная подгонка не
запустится. GLB сохраняет десять morph-целей на теле и старые клипы с
отрицательными весами morph; совместимость с каждым движком не проверялась.
Выборочные проверки не доказывают отсутствия всех пересечений или естественности
движения.

## Источники

В файле сохранены прежние адаптированные движения CMU; новые `Game_Style_Walk`
и `Game_Style_Jog` созданы отдельно. Данные CMU получены с
[mocap.cs.cmu.edu](https://mocap.cs.cmu.edu/), проект финансировался NSF
EIA-0196217. CMU запрещает прямую перепродажу данных даже после конверсии.
Условия и описание BVH-конверсии Брюса Хана — в `LICENSE_MOCAP.md` и
`CMU_BVH_READMEFIRST.txt`. Базовая модель и уши — CC0
(`LICENSE_CC0_ASSETS.md`), Three.js — MIT (`LICENSE_THREE.txt`).

Подробности и проверки: `tools/male-zomboid-style/README.md` в репозитории.
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
        model = z.read('male_belly_triceps.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_belly_triceps.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-belly-triceps' / file).read_bytes()) != digest or sha((HERE / file).read_bytes()) != digest:
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
    with tempfile.TemporaryDirectory(prefix='bow-game-style-') as name:
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
