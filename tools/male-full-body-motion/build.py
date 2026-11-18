#!/usr/bin/env python3
"""Build an independent offline walk/run trial without changing earlier releases."""
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
DEFAULT = ROOT / 'work/male-full-body-motion'
PREVIOUS = ROOT / 'work/male-natural-walk'
SOURCE = PREVIOUS / 'BladesOfWar_Novaya_Proba_Hodby.zip'
SOURCE_ZIP_SHA = '3e7df2739c89c8623e31385389f91ee25f6e2ac42571f02bf4fdc419d13c8041'
SOURCE_MODEL_SHA = '0785de99520946cfa9eaf207813f256bd4e944f670f24972150a9d2181c8cdcf'
CODE_SHA = {
    'well-source.mjs': '62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
    'navigation.mjs': '93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
    'floor-guard.mjs': '539257a8ad078e4793f8cab6a0cb26e31bba6af0d6bc1d4ef4a3defe9d64ee06',
}
MARKER = '<!-- Blades of War: independent full-body locomotion trial -->'
MODEL = 'male_full_body_motion.glb'
ARCHIVE = 'BladesOfWar_Proba_Hodby_i_Bega.zip'
INHERITED = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = '''# Blades of War — проба ходьбы и бега

## Как открыть и сравнить

Распакуйте `BladesOfWar_Proba_Hodby_i_Bega.zip` целиком и откройте `index.html`
в современном браузере с WebGL. Интернет не нужен. Для ссылки «Скачать модель»
файл `male_full_body_motion.glb` должен находиться рядом с HTML.

Сразу открывается шаг сбоку. Выберите **Шаг на месте** или **Бег на месте**,
затем **Спереди**, **Сбоку**, **Сзади**, **Торс и руки** или **Игровой**.
Есть пауза, ползунок фазы и замедление ×½. При сравнении ракурс и относительная
фаза сохраняются, но разные циклы не обязаны совпадать по позе.

- **Новая** — `Full_Body_Walk` и новый отдельный `Full_Body_Run`.
- **Прошлая** — последняя проба: `Relaxed_Walk` и `Game_Style_Jog`.
- **До прошлой** — `Game_Style_Walk` и тот же `Game_Style_Jog`.
- **Ранняя** — `Adjusted_Walk` и `Adjusted_Run` из пробы живота/трицепса.

В управлении новая ходьба и бег рассчитаны на 0,9 и 2,4 м/с; бег двух средних
вариантов — 1,9 м/с, ранний — 2,2 м/с. Это разные скорости, поэтому
сравнивайте и силуэт на месте, и движение с игровой дистанции.

## Что изменено и ограничения

В обеих новых анимациях уменьшено боковое расстояние между траекториями ног,
добавлены небольшой перенос веса и согласованное вращение таза и плеч. Бег —
отдельный цикл с наклоном вперёд, большим подъемом ноги и фазой без опоры.
Мах рук и локти рассчитаны без дополнительного осевого скручивания предплечий;
в беге немного усилена существующая коррекция локтя. Геометрия, веса и прежние
клипы сохранены. Пальцы не имеют костей и отдельно не анимированы, кисти
остаются открытыми; линейный skinning всё ещё может сжимать сетку на сгибах.

Это самостоятельная процедурная проба, созданная непосредственно под
существующий риг, а не запись человека или перенос из игры. Project Zomboid —
общий игровой ориентир; ассеты и анимации игры не использованы. Отдельные кадры Quaternius (CC0 по заявлению автора) просмотрены
для ориентира, но его данные не включены. Отдельные кадры и выборочные тесты
не гарантируют, что движение выглядит естественно: важна Ваша оценка вживую.

## Управление

**Управление**: щелчок или касание земли — идти к точке; **Shift + щелчок** —
бежать. WASD или стрелки — движение относительно экрана, Shift — бег, Esc —
стоп. Перетаскивание мышью или пальцем вращает камеру. На телефоне бег
выбирается кнопкой. **В начало** возвращает персонажа к колодцу. На крупных
ракурсах колодец временно скрыт.

При смешивании просмотрщик подгоняет стопы по вертикали; горизонтальной
фиксации стоп и физики нет, скольжение возможно. В стороннем GLB-просмотрщике
дополнительная подгонка не запустится. На низкой частоте кадров контроллер
использует несколько коротких шагов вместо замедления времени; при задержке
более 250 мс лишнее время отбрасывается, чтобы избежать резкого скачка. Саму
плавность покадрового вывода низкий FPS не исправляет.

GLB содержит десять morph-целей и старые клипы с отрицательными весами morph;
совместимость с каждым движком не проверялась. Старые архивы не перезаписаны.

## Источники

Старые клипы включают адаптации CMU: данные с [mocap.cs.cmu.edu](https://mocap.cs.cmu.edu/),
проект финансировался NSF EIA-0196217; CMU запрещает прямую перепродажу данных,
даже конвертированных. Условия и описание BVH-конверсии Брюса Хана — в
`LICENSE_MOCAP.md` и `CMU_BVH_READMEFIRST.txt`. Модель и уши — CC0
(`LICENSE_CC0_ASSETS.md`), Three.js — MIT (`LICENSE_THREE.txt`). Посмотренная
как визуальный ориентир [Quaternius Animation Library](https://quaternius.com/packs/universalanimationlibrary.html)
в архив не включена. Подробности сборки и проверок —
`tools/male-full-body-motion/README.md` в репозитории.
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
        model = z.read('male_natural_walk.glb')
        licenses = {name: z.read(name) for name in INHERITED}
    if sha(model) != SOURCE_MODEL_SHA or (PREVIOUS / 'male_natural_walk.glb').read_bytes() != model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file, digest in CODE_SHA.items():
        if sha((ROOT / 'tools/male-natural-walk' / file).read_bytes()) != digest or sha((HERE / file).read_bytes()) != digest:
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
    with tempfile.TemporaryDirectory(prefix='bow-full-body-motion-') as name:
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
