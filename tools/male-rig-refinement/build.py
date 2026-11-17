#!/usr/bin/env python3
"""Build a separate, offline before/after movement refinement."""
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

ROOT=Path(__file__).resolve().parents[2]
HERE=Path(__file__).resolve().parent
DEFAULT=ROOT/'work/male-rig-refinement'
SOURCE=ROOT/'work/male-rig-trial/BladesOfWar_Proba_Skeleta.zip'
SOURCE_SHA='4b8263535d8a11594d1acb5e81e80aff5138cf5866e3153420f843c7ede0420b'
MODEL_SHA='9d9ee4719111f932573f098b97ee7d55c8357db0e730ba4a8883862a10985bea'
WELL_SHA='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
MARKER='<!-- Blades of War: separate male motion refinement and comparison -->'
MODEL='male_motion_refinement.glb'
ARCHIVE='BladesOfWar_Dorabotka_Dvizheniy.zip'
LICENSES=('LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — доработка движений мужчины

## Как открыть

В GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin**, а если появится **Pull origin** — и его. В папке репозитория
откройте в браузере `work/male-rig-refinement/index.html`. Интернет для
просмотра после получения файлов не нужен; распаковывать архив не обязательно.

## Сравнение движений

Выберите **«Дыхание»**, **«Плечи и руки»** или **«Колено и стопа»**. Справа от
выбора движений находятся кнопки **«Прежняя»** и **«Новая»**. Они переключают
первую пробу и эту доработку, сохраняя ракурс и фазу движения. Если хотите
внимательно сравнить одинаковую позу, нажмите **«Пауза»** и передвиньте ползунок
**«Фаза»**: середина — максимальная часть движения. **«Пуск»** продолжит его.

- В новой пробе грудная клетка и плечевой пояс дышат заметнее. Это по-прежнему
  спокойное дыхание, не разговор или ходьба. Если в системе включено уменьшение
  движения, анимация открывается на паузе — нажмите **«Пуск»**.
- В пробе ноги колено слегка поднимается, голень сгибается, а стопа наклоняется
  вместе с ногой и в голеностопе, вместо прежнего почти горизонтального положения.
  Сгиб показан с одной стороны. Это проверка суставов, а не походка или физика.
- В пробе плеч и рук немного изменены распределение движения и расслабление
  предплечий; добавлена очень небольшая пробная коррекция объёма бицепса
  при подъёме руки. В неподвижной позе она выключена.
- Принятые Вами пробы **локтя** и **головы** не переделывались. Они одинаковы в
  обоих вариантах; отдельно расположенные уши следуют за головой.

**«Сверху»** — вид с игровой дистанции, **«Вместе»** — обычный ракурс мужчины
и колодца, **«Человек»** — полный рост, **«Крупно»** — голова. Кнопка **«Детали»**
внизу изображения приближает область выбранного движения: ногу для проверки
колена, верх тела для дыхания и плеч или голову для её поворота. Ракурс можно
повернуть перетаскиванием; для стопы удобно посмотреть сбоку. Кнопка **«Скелет»**
показывает или скрывает кости. Свободное приближение отключено; крупный осмотр
не является игровой камерой.

## Что сохранено

Исходные модель и подробный колодец, а также первая проба скелета остались без
изменений. В новой копии — те же 22 кости и 32 354 треугольника. Положения
вершин и веса в исходной позе сохранены; небольшая пробная коррекция верхней
части рук действует только при новом движении плеч. Сравнение, дыхание и тесты
записаны в `male_motion_refinement.glb`; в обычном glTF-просмотрщике можно
выбирать клипы по именам. Предыдущие движения имеют имена `Previous_...`.

Это не финальный игровой риг: остаются проверка и ручная доработка сгибов.
Здесь нет ходьбы, бега, физики контакта с землёй, отсечения или анимации
пальцев и кулаков. Производительность на Вашем компьютере не проверялась.

Источники и лицензии: первая проба `work/male-rig-trial`. Исходные Human
Basemeshes и уши MakeHuman указаны как CC0 (текст в `LICENSE_CC0_ASSETS.md`);
Three.js r187 — MIT (`LICENSE_THREE.txt`). Это не лицензия всей игры.
'''


def sha(b:bytes)->str:
    return hashlib.sha256(b).hexdigest()


def sources()->tuple[bytes,dict[str,bytes]]:
    blob=SOURCE.read_bytes()
    if sha(blob)!=SOURCE_SHA:
        raise ValueError('The previous ZIP does not match the verified first rig')
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model=z.read('male_rig_trial.glb')
        licenses={name:z.read(name) for name in LICENSES}
    if sha(model)!=MODEL_SHA:
        raise ValueError('The previous GLB has changed')
    if sha((HERE/'well-source.mjs').read_bytes())!=WELL_SHA:
        raise ValueError('The approved well code has changed')
    return model,licenses


def build(output:Path)->None:
    output=output.resolve()
    if output in (ROOT,SOURCE.parent.resolve()):
        raise ValueError('Refusing to overwrite source files')
    page=output/'index.html'
    if page.exists() and not page.read_text(encoding='utf-8').startswith(MARKER):
        raise ValueError('Refusing to overwrite an unrelated page')
    model,licenses=sources()
    with tempfile.TemporaryDirectory(prefix='bow-rig-refinement-') as t:
        folder=Path(t)
        old,new,script=folder/'previous.glb',folder/MODEL,folder/'viewer.js'
        old.write_bytes(model)
        run=subprocess.run(['node',str(HERE/'refine.mjs'),str(old),str(new)],cwd=ROOT,check=True,capture_output=True,text=True)
        info=json.loads(run.stdout);rigged=new.read_bytes()
        if old.read_bytes()!=model or info['sourceSha256']!=MODEL_SHA or info['outputSha256']!=sha(rigged):
            raise ValueError('Unexpected source or output model')
        subprocess.run([str(HERE/'node_modules/.bin/esbuild'),str(HERE/'viewer.mjs'),'--bundle','--minify',
                        '--format=iife','--target=es2020','--outfile='+str(script)],cwd=ROOT,check=True,capture_output=True)
        bundle=script.read_text(encoding='utf-8')
    template=(HERE/'viewer.template.html').read_text(encoding='utf-8')
    for key,value in {'__RIGGED_DATA_URI__':'data:model/gltf-binary;base64,'+base64.b64encode(rigged).decode('ascii'),
                      '/*__VIEWER_BUNDLE__*/':bundle}.items():
        if template.count(key)!=1:
            raise ValueError(f'Expected one marker {key}')
        template=template.replace(key,value,1)
    if '</script' in bundle.lower():
        raise ValueError('Bundle contains a script terminator')
    html=template.encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,')!=1:
        raise ValueError('Expected one embedded GLB')
    files=[('index.html',html),(MODEL,rigged),('README.md',README.encode('utf-8'))]
    files += [(name,licenses[name]) for name in LICENSES]
    output_zip=io.BytesIO()
    with zipfile.ZipFile(output_zip,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,data in files:
            zi=zipfile.ZipInfo(name,date_time=(2026,11,13,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;zi.external_attr=0o644<<16
            z.writestr(zi,data,compresslevel=9)
    archive=output_zip.getvalue()
    info.update({'sourceZipSha256':SOURCE_SHA,'wellCodeSha256':WELL_SHA,'pageSha256':sha(html),'archiveSha256':sha(archive)})
    output.mkdir(parents=True,exist_ok=True)
    for name,data in files:
        (output/name).write_bytes(data)
    (output/ARCHIVE).write_bytes(archive)
    (output/'build-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'.gitattributes').write_text('index.html -whitespace\n',encoding='utf-8')
    print(f'Refined GLB: {len(rigged)} bytes, SHA-256 {sha(rigged)}')
    print(f'Standalone HTML: {len(html)} bytes, SHA-256 {sha(html)}')
    print(f'ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}')
    print(f'Output: {output}')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=DEFAULT)
    build(parser.parse_args().output)
