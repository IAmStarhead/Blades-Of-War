#!/usr/bin/env python3
"""Reproducibly build a separate offline mocap-reference comparison."""
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
DEFAULT=ROOT/'work/male-reference-locomotion'
SOURCE=ROOT/'work/male-walk-refinement/BladesOfWar_Pohodka_Sheya_Sravnenie.zip'
SOURCE_ZIP_SHA='328d5250c525d9a1a6af65320b8ba4316e310380e737b7d79af4d5543f16b4c6'
SOURCE_MODEL_SHA='e32fca3f789abbb0eebcf17f21cba5d2a981155de50e155982bbcb0281574d6c'
WELL_SHA='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
NAV_SHA='93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608'
MARKER='<!-- Blades of War: separate reference locomotion comparison -->'
MODEL='male_reference_locomotion.glb'
ARCHIVE='BladesOfWar_Hodba_Beg_Referens.zip'
INHERITED_LICENSES=('LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — отдельная проба ходьбы и бега по референсам

## Как открыть

В GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin**, затем **Pull origin**, если эта кнопка появится. Откройте
`work/male-reference-locomotion/index.html` в браузере. Либо скачайте и
распакуйте `BladesOfWar_Hodba_Beg_Referens.zip` и откройте `index.html` внутри.
Сам HTML работает без интернета; ссылка на GLB в нём требует, чтобы файл
`male_reference_locomotion.glb` лежал рядом.

## Как сравнить

- **Прошлая проба / По референсу** переключает и ходьбу, и бег между последней
  присланной версией и новым вариантом. Положение, фаза и ракурс сохраняются.
- Выберите **Шаг на месте** или **Бег на месте**, затем **Мужчина крупно** и
  поверните камеру сбоку или спереди. **Пауза** и ползунок позволяют изучить
  отдельные фазы, **Пуск** продолжает движение.
- **Профиль шеи: До правки / С правкой** переключается отдельно от движения;
  по умолчанию включена правка из последней пробы. Крупный профиль — кнопка
  **Шея сбоку**. Затылок можно осмотреть, повернув камеру. На крупных планах
  колодец скрыт только временно.

## Управление сохранено

Щелчок или касание земли — идти к точке; **Shift + щелчок** — бежать к точке.
WASD или стрелки двигают относительно экрана, **Shift** включает бег, **Esc**
останавливает. Перетаскивание мышью или одним пальцем вращает камеру, не задавая
цели. На телефоне бег можно выбрать кнопкой. **В начало** возвращает персонажа
к колодцу. Камера следует за ним. Клик по земле или клавиша направления выходят
из просмотра движения на месте. Скорости управления прежние: 0,9 и 2,2 м/с.

Подробный колодец и круговое приближение его препятствия взяты из предыдущей
пробы без изменений. Границы площадки и их отображение не менялись.

## Что сделано и чего здесь нет

Предыдущие движения были сделаны процедурно и вручную; новый вариант опирается
на реальные записи захвата движения CMU: `02_01` (ходьба) и `35_17` (бег/джог).
Это **не прямое проигрывание исходных записей**: движения перенесены на другой
скелет, укорочены для скорости управления, сведены в циклы и подправлены. Углы
головы, шеи и положения рук откалиброваны для этой модели; шумные стопы
сглажены. Положение стоп подгонялось на этапе сборки по приближённым точкам
пятки и носка, а не по данным датчика силы. В самом просмотрщике дополнительная
вертикальная поправка ограничивает уход стоп под пол при смешивании движений.
Это не фиксация стопы в плоскости и не полноценный IK или физика. При повороте,
ускорении и остановке скольжение и другие ошибки всё ещё возможны. В другом
просмотрщике GLB эта дополнительная поправка не работает автоматически.

Кисти и предплечья проверялись по деформированной сетке в конечных фазах шага,
бега и выбранных переходов. Такая выборка не доказывает отсутствие пересечений
во всех возможных положениях; физического столкновения частей тела нет. Пальцы
отдельно не анимированы: в исходном CMU их движение не захватывалось, а в этой
модели нет костей пальцев. Поэтому кисти сохраняют исходную раскрытую форму.

Исходная сетка, веса, 22 кости, прошлые клипы, исправление затылочного шва и
обратимая правка шеи сохранены. Скрытых срезов, обрубков и системы отделения
частей тела пока **нет**. Скорость на Вашем устройстве не измерялась. Это
проба для оценки, а не гарантия естественности или готовая игра.

## Источники

- [CMU Graphics Lab Motion Capture Database](https://mocap.cs.cmu.edu/), записи
  [02_01 — ходьба](https://github.com/una-dinosauria/cmu-mocap/blob/09a07f54f3bbb58797325f009282d0b2048a2871/data/002/02_01.bvh)
  и [35_17 — бег/джог](https://github.com/una-dinosauria/cmu-mocap/blob/09a07f54f3bbb58797325f009282d0b2048a2871/data/035/35_17.bvh).
  BVH-конверсия Брюса Хана (Bruce Hahne), 2010. Условия — в `LICENSE_MOCAP.md`
  и `CMU_BVH_READMEFIRST.txt`; отдельно перепродавать данные CMU нельзя.
- Для понимания фаз также изучены [walk cycle](https://rustyanimator.com/animation-walk-cycle/),
  [run cycle](https://rustyanimator.com/run-cycle/) и
  [обзор биомеханики бега](https://www.tandfonline.com/doi/full/10.1080/14763141.2021.1873411).
- Исходные Human Basemeshes и уши MakeHuman — CC0 (`LICENSE_CC0_ASSETS.md`),
  Three.js r187 — MIT (`LICENSE_THREE.txt`). Это не лицензия всей игры.

Сборка и автоматические проверки описаны в `tools/male-reference-locomotion/README.md`.
Предыдущая проба остаётся в `work/male-walk-refinement/` без изменений.
'''

MOCAP_LICENSE='''# CMU motion capture and BVH conversion

The data used in this project was obtained from mocap.cs.cmu.edu. The database
was created with funding from NSF EIA-0196217.

CMU states that the data may be used in research and included in commercial
products, but **may not be resold directly, even in converted form**. See
<https://mocap.cs.cmu.edu/> for the current statement. The 2010 MotionBuilder
BVH conversion is by Bruce Hahne; his `CMU_BVH_READMEFIRST.txt` is included.

The adapted in-place clips use parts of takes 02_01 (walk) and 35_17 (run/jog)
from the CMU database. The synthetic BVH frame 0 was used only for alignment.
Hands/toes can be noisy, and the CMU finger/thumb channels are not captures.
The database and converted motion must not be represented as original work.
'''


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def read_sources()->tuple[bytes,dict[str,bytes]]:
    archive=SOURCE.read_bytes()
    if sha(archive)!=SOURCE_ZIP_SHA:
        raise ValueError('Previous ZIP differs from the verified source')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model=z.read('male_walk_refinement.glb')
        licenses={name:z.read(name) for name in INHERITED_LICENSES}
    if sha(model)!=SOURCE_MODEL_SHA or (ROOT/'work/male-walk-refinement/male_walk_refinement.glb').read_bytes()!=model:
        raise ValueError('Previous standalone model differs from the verified ZIP')
    if sha((HERE/'well-source.mjs').read_bytes())!=WELL_SHA:
        raise ValueError('Approved well source changed')
    if sha((HERE/'navigation.mjs').read_bytes())!=NAV_SHA:
        raise ValueError('Previous navigation code changed')
    return model,licenses


def build(output:Path)->None:
    output=output.resolve();own=DEFAULT.resolve()
    if output==ROOT or (ROOT in output.parents and output!=own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page=output/'index.html'
    names=(MODEL,ARCHIVE,'README.md','LICENSE_MOCAP.md','CMU_BVH_READMEFIRST.txt','build-info.json',*INHERITED_LICENSES)
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output/name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    source,licenses=read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-reference-locomotion-') as name:
        temp=Path(name);old=temp/'previous.glb';new=temp/MODEL;script=temp/'viewer.js';old.write_bytes(source)
        result=subprocess.run(['node',str(HERE/'retarget.mjs'),str(old),str(new)],cwd=ROOT,check=True,capture_output=True,text=True)
        info=json.loads(result.stdout);rigged=new.read_bytes()
        if old.read_bytes()!=source or info['sourceSha256']!=SOURCE_MODEL_SHA or info['outputSha256']!=sha(rigged):
            raise ValueError('Unexpected source or generated model')
        subprocess.run([str(HERE/'node_modules/.bin/esbuild'),str(HERE/'viewer.mjs'),'--bundle','--minify',
                        '--format=iife','--target=es2020','--outfile='+str(script)],cwd=ROOT,check=True,capture_output=True)
        bundle=script.read_text(encoding='utf-8')
    if '</script' in bundle.lower():
        raise ValueError('Viewer bundle contains a script terminator')
    template=(HERE/'viewer.template.html').read_text(encoding='utf-8')
    for key,value in {'__MODEL__':base64.b64encode(rigged).decode('ascii'),'__BUNDLE__':bundle}.items():
        if template.count(key)!=1:
            raise ValueError(f'Expected one marker {key}')
        template=template.replace(key,value,1)
    html=(MARKER+'\n'+template).encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,')!=1:
        raise ValueError('Expected one embedded model')
    files=[('index.html',html),(MODEL,rigged),('README.md',README.encode('utf-8')),
           ('LICENSE_MOCAP.md',MOCAP_LICENSE.encode('utf-8')),
           ('CMU_BVH_READMEFIRST.txt',(HERE/'mocap/READMEFIRST.txt').read_bytes())]
    files += [(name,licenses[name]) for name in INHERITED_LICENSES]
    result=io.BytesIO()
    with zipfile.ZipFile(result,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file,data in files:
            entry=zipfile.ZipInfo(file,date_time=(2026,11,14,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o644<<16
            z.writestr(entry,data,compresslevel=9)
    archive=result.getvalue()
    info.update({'sourceZipSha256':SOURCE_ZIP_SHA,'wellCodeSha256':WELL_SHA,'navigationCodeSha256':NAV_SHA,
                 'pageSha256':sha(html),'archiveSha256':sha(archive)})
    output.mkdir(parents=True,exist_ok=True)
    for file,data in files:
        (output/file).write_bytes(data)
    (output/ARCHIVE).write_bytes(archive)
    (output/'build-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'.gitattributes').write_text('index.html -whitespace\nCMU_BVH_READMEFIRST.txt -whitespace\n',encoding='utf-8')
    print(f'GLB: {len(rigged)} bytes, SHA-256 {sha(rigged)}')
    print(f'Offline HTML: {len(html)} bytes, SHA-256 {sha(html)}')
    print(f'ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}')
    print(f'Output: {output}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=DEFAULT)
    build(parser.parse_args().output)
