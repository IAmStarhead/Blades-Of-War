#!/usr/bin/env python3
"""Build a separate, offline male rig trial from the approved nape trial.

Only the new output directory is written. The male geometry and the procedural
well are copied or checked against their known source hashes.
"""
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
DEFAULT_OUTPUT = ROOT / 'work/male-rig-trial'
SOURCE = ROOT / 'work/male-nape-seam/BladesOfWar_Proba_Zatylka.zip'
SOURCE_SHA = '62e31dbee8df16368687c1af9740fc3e0136e68e4cfba9827134e056860f00a6'
FIXED_SHA = '009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e'
WELL_SOURCE_SHA = 'e0433a8dc25a44aa127425d4c4d9b7aa1c62e767d775dc261ac64c0d190eba8b'
MARKER = '<!-- Blades of War: separate experimental male rig and breathing -->'
MODEL = 'male_rig_trial.glb'
ARCHIVE = 'BladesOfWar_Proba_Skeleta.zip'
LICENSES = ('LICENSE_CC0_ASSETS.md', 'LICENSE_THREE.txt')

README = '''# Blades of War — отдельная проба скелета и дыхания

## Как открыть через GitHub Desktop

1. Откройте репозиторий **Blades-Of-War** и выберите ветку
   `arena/4319905c-blades-of-war`.
2. Нажмите **Fetch origin**, а если появится **Pull origin** — нажмите и его.
3. Откройте папку репозитория на компьютере и найдите
   `work/male-rig-trial/index.html`. Дважды щёлкните `index.html`: он откроется
   в современном браузере с поддержкой WebGL. После получения файлов интернет
   для просмотра не нужен, архив распаковывать не требуется.

При желании можно также распаковать `BladesOfWar_Proba_Skeleta.zip` и открыть
находящийся внутри `index.html`.

## Как смотреть пробу

- Сначала включено **«Дыхание»** — небольшое повторяющееся движение в покое.
  При системной настройке уменьшения движения оно стартует на паузе: нажмите
  **«Пуск»**, чтобы посмотреть. **«Стоять»** показывает неподвижную исходную позу.
- **«Плечи и руки»**, **«Локоть»**, **«Колено»** и **«Голова»** — медленные
  пробные движения. Локоть и колено сгибаются с одной стороны, чтобы их можно
  было сравнить с другой. Это тест, а не ходьба и не проверка равновесия.
- Нажмите **«Пауза»**, чтобы остановить движение. Перемещение ползунка **«Фаза»**
  тоже ставит анимацию на паузу; середина ползунка показывает максимальный сгиб.
  Кнопка **«Пуск»** продолжает движение. **«Скелет»** показывает и скрывает кости.
- **«Сверху»** — прежний вид с игровой дистанции, **«Вместе»** — обычный общий
  ракурс мужчины и подробного колодца, **«Человек»** — мужчина в полный рост,
  **«Крупно»** — голова. В последних двух ракурсах колодец только временно скрыт.
  Поворачивайте камеру перетаскиванием или кнопками ↶ и ↷. Свободный зум
  выключен; крупный осмотр — возможность витрины, не настройка игровой камеры.

## Что это за файл

`male_rig_trial.glb` — отдельная копия облегчённого мужчины с исправленным
затылком: 22 пробные кости, веса, цикл дыхания и четыре тестовых клипа записаны
в саму модель. Уши по-прежнему отдельные и прикреплены к голове; лицо и исходное
положение вершин не переделаны. В исходной позе должно сохраняться прежнее
проявление модели, а при сгибах форма изменяется из-за работы скелета.
Руки остаются расслабленными: пальцы и кулаки пока не анимированы.

Это **первая проба**, а не утверждённый игровой риг: веса и сгибы нужно оценить
и при необходимости доработать. Нет ходьбы, бега, игровой сцены, физики,
отсечения конечностей или анимации пальцев. Во время теста колена стопа может
подниматься — постановка ног и контакт с землёй здесь не настраивались.
Производительность на конкретном компьютере не проверялась.

Исходные модели, прежние витрины и подробный колодец не заменены. Женская
модель в этой пробе не добавлена. Колодец создан тем же процедурным кодом,
что и в прошлой витрине; он не редактировался.

## Источники и лицензии

Основа — `BladesOfWar_Proba_Zatylka.zip` из `work/male-nape-seam`. В исходных
материалах Human Basemeshes (pistachio) и уши MakeHuman указаны как CC0; текст
CC0 приложен в `LICENSE_CC0_ASSETS.md`. Для Three.js r187 приложен
`LICENSE_THREE.txt` (MIT). Это не объявляет всю игру CC0 или MIT.
'''


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_sources() -> tuple[bytes, dict[str, bytes]]:
    blob = SOURCE.read_bytes()
    if sha(blob) != SOURCE_SHA:
        raise ValueError('The nape trial ZIP is not the previously verified source')
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        if z.testzip() is not None:
            raise ValueError('Source ZIP CRC failed')
        model = z.read('male_nape_smoothed_trial.glb')
        html = z.read('BladesOfWar_Zatylok.html').decode('utf-8')
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(model) != FIXED_SHA:
        raise ValueError('Unexpected source male')
    if html.count('function tp(e,t,n)') != 1 or html.count('function sp(') != 1:
        raise ValueError('Unexpected previous well code')
    well = html[html.index('function tp(e,t,n)'):html.index('const ORIGINAL_URI =')].rstrip() + '\n'
    if sha(well.encode('utf-8')) != WELL_SOURCE_SHA:
        raise ValueError('Previous well source has changed')
    local = (HERE / 'well-source.mjs').read_text(encoding='utf-8')
    embedded = local[local.index('function tp(e,t,n)'):local.index('\nexport {sp as createApprovedWell};')]
    if embedded != well:
        raise ValueError('Well source was changed rather than reused verbatim')
    return model, licenses


def build(output: Path) -> None:
    output = output.resolve()
    if output == ROOT or output == SOURCE.parent.resolve():
        raise ValueError('Refusing to overwrite the source directory')
    if (output / 'index.html').exists() and not (output / 'index.html').read_text(encoding='utf-8').startswith(MARKER):
        raise ValueError('Refusing to overwrite an unrelated page')
    model, licenses = read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-rig-build-') as temp:
        folder = Path(temp)
        input_path, output_path, script_path = folder/'input.glb', folder/MODEL, folder/'viewer.js'
        input_path.write_bytes(model)
        run = subprocess.run(['node', str(HERE/'rig.mjs'), str(input_path), str(output_path)],
                             cwd=ROOT, check=True, capture_output=True, text=True)
        info = json.loads(run.stdout)
        rigged = output_path.read_bytes()
        if input_path.read_bytes() != model or info['sourceSha256'] != FIXED_SHA:
            raise ValueError('Unexpected modification of source model')
        if info['outputSha256'] != sha(rigged) or info['triangles'] != 32354:
            raise ValueError('Rig output failed verification')
        subprocess.run([str(HERE/'node_modules/.bin/esbuild'), str(HERE/'viewer.mjs'),
                        '--bundle', '--minify', '--format=iife', '--target=es2020',
                        '--outfile='+str(script_path)], cwd=ROOT, check=True, capture_output=True)
        script = script_path.read_text(encoding='utf-8')
    template = (HERE/'viewer.template.html').read_text(encoding='utf-8')
    for key, value in {
        '__RIGGED_DATA_URI__': 'data:model/gltf-binary;base64,' + base64.b64encode(rigged).decode('ascii'),
        '/*__VIEWER_BUNDLE__*/': script,
    }.items():
        if template.count(key) != 1:
            raise ValueError(f'Expected one marker {key}')
        template = template.replace(key, value, 1)
    if '</script' in script.lower():
        raise ValueError('Bundle contains an HTML script terminator')
    html = template.encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,') != 1:
        raise ValueError('Expected exactly one embedded male')
    files = [('index.html', html), (MODEL, rigged), ('README.md', README.encode('utf-8'))]
    files += [(name, licenses[name]) for name in LICENSES]
    archive_data = io.BytesIO()
    with zipfile.ZipFile(archive_data, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files:
            zinfo = zipfile.ZipInfo(name, date_time=(2026, 11, 13, 0, 0, 0))
            zinfo.compress_type = zipfile.ZIP_DEFLATED
            zinfo.external_attr = 0o644 << 16
            z.writestr(zinfo, data, compresslevel=9)
    archive = archive_data.getvalue()
    info.update({'sourceZipSha256': SOURCE_SHA, 'wellSourceSha256': WELL_SOURCE_SHA,
                 'pageSha256': sha(html), 'archiveSha256': sha(archive)})
    output.mkdir(parents=True, exist_ok=True)
    for name, data in files:
        (output/name).write_bytes(data)
    (output/ARCHIVE).write_bytes(archive)
    (output/'build-info.json').write_text(json.dumps(info, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (output/'.gitattributes').write_text('index.html -whitespace\n', encoding='utf-8')
    print(f'Rigged GLB: {len(rigged)} bytes, SHA-256 {sha(rigged)}')
    print(f'Standalone HTML: {len(html)} bytes, SHA-256 {sha(html)}')
    print(f'ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}')
    print(f'Output: {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    build(parser.parse_args().output)
