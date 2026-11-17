#!/usr/bin/env python3
"""Reproducibly build a separate offline locomotion-correction comparison."""
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
DEFAULT=ROOT/'work/male-locomotion-correction'
SOURCE=ROOT/'work/male-reference-locomotion/BladesOfWar_Hodba_Beg_Referens.zip'
SOURCE_ZIP_SHA='bc99287dedbb0bb80cf246ef75e76f55c46d4c533a73ed4882656b50021f2b63'
SOURCE_MODEL_SHA='a7a2d08f8c92a11c713cc855a734437a98cd7e3e1e6cf8e19baafe32db572343'
WELL_SHA='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
NAV_SHA='93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608'
MARKER='<!-- Blades of War: separate locomotion correction trial -->'
MODEL='male_locomotion_corrected.glb'
ARCHIVE='BladesOfWar_Dvizhenie_Ispravleniya.zip'
INHERITED_LICENSES=('LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — исправление ходьбы и бега

## Открыть

Распакуйте `BladesOfWar_Dvizhenie_Ispravleniya.zip` целиком и откройте
`index.html` в браузере. HTML работает без интернета; для кнопки скачивания GLB
файл `male_locomotion_corrected.glb` должен лежать рядом.

Либо в GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin**, затем **Pull origin**, если кнопка появится, и откройте
`work/male-locomotion-correction/index.html`.

## Как сравнить

- **Прошлая проба / С исправлениями** — последнее присланное движение и новая
  версия. Фаза и ракурс сохраняются. Оба варианта есть в одном просмотрщике;
  предыдущие файлы также не заменены.
- Выберите **Шаг на месте** или **Бег на месте**, затем **Мужчина крупно**.
  Поверните камеру спереди, сбоку и сзади. **Пауза** и ползунок показывают
  отдельные фазы, **Пуск** продолжает движение.
- **Профиль шеи: До правки / С правкой** работает независимо от ходьбы и бега;
  включён прежний обратимый вариант. Для близкого вида есть **Шея сбоку**.
  Кнопка **Кости** показывает скелет.

## Управление

Щелчок или касание земли — идти к точке; **Shift + щелчок** — бежать к точке.
WASD или стрелки — движение относительно экрана, Shift — бег, Esc — стоп.
Перетаскивание мышью или пальцем вращает камеру. На телефоне бег можно выбрать
кнопкой. **В начало** возвращает персонажа к колодцу. Камера следует за ним.
Подробный колодец, обход и управление сохранены; на крупном плане колодец
временно скрывается. Границы площадки и их отображение не менялись.

## Что изменено после видео

В прошлой пробе голова при ходьбе была заметно развёрнута в сторону. В новой
версии заново настроено направление головы и уменьшены её колебания по трём
осям, но движение не заморожено. Для бега подобран другой исходный проход и
уменьшен перегиб между тазом и поясницей. Руки отведены от бёдер; подгонка ног
исправляет обнаруженный в процессе работы выворот колена в проверенных фазах.

На сильно согнутых локтях и коленях линейное смешивание костей действительно
сжимало сетку. Добавлены четыре локальные корректирующие формы, которые частично
возвращают объём при сгибании. Они не меняют исходные веса костей или форму в
покое и не затрагивают голову и шею. Исправление частичное: некоторые изменения
силуэта могут зависеть также от ракурса и позы.

Положение стоп подгоняется на этапе сборки; в просмотрщике при смешивании поз
добавлена вертикальная подгонка ноги, чтобы стопа не уходила под пол.
Это не фиксация стопы по земле и не физическая симуляция; в отдельных
переходах подгонка может быть заметна. При переходах,
поворотах и движении возможны скольжение и другие дефекты; в другом
просмотрщике GLB дополнительная подгонка стоп не работает автоматически.
Выбранные поверхности рук и ног проверены в конечном числе фаз, но это не
доказывает отсутствия пересечений во всех позах.

Нормали, исправившие полосу на затылке, и переключаемый профиль шеи сохранены.
Пальцы отдельно не анимированы. Скрытых срезов, обрубков и системы отделения
частей тела здесь нет. Скорость на Вашем устройстве не измерялась. Это проба
для оценки, а не гарантия естественности и не готовая игра.

## Откуда движения

Прошлая проба использовала анонимные записи CMU `02_01` (ходьба) и `35_17`
(бег/джог). Это не референс «Человека-паука»; имена, пол и возраст участников
нам не известны. Результат не был прямой записью актёров: при переносе на
модель добавлялись наши поправки головы, шеи, рук и ног, сглаживание и
замыкание циклов. Именно эти изменения тоже могли создавать дефекты.

Новая версия использует другие записи того же собрания: `02_02` (ходьба) и
`02_03` (бег/джог), анонимный участник № 2. Это тоже **адаптированный**, а не
дословно воспроизведённый захват: углы головы и поясницы, положение рук, путь
стоп и плоскость сгибания коленей изменены для этой модели.

- [CMU Graphics Lab Motion Capture Database](https://mocap.cs.cmu.edu/):
  [02_02](https://github.com/una-dinosauria/cmu-mocap/blob/09a07f54f3bbb58797325f009282d0b2048a2871/data/002/02_02.bvh),
  [02_03](https://github.com/una-dinosauria/cmu-mocap/blob/09a07f54f3bbb58797325f009282d0b2048a2871/data/002/02_03.bvh).
  BVH-конверсия Брюса Хана; условия — в `LICENSE_MOCAP.md` и
  `CMU_BVH_READMEFIRST.txt`. Отдельно перепродавать данные CMU нельзя.
- Для понимания фаз: [ходьба](https://rustyanimator.com/animation-walk-cycle/),
  [бег](https://rustyanimator.com/run-cycle/),
  [обзор биомеханики бега](https://www.tandfonline.com/doi/full/10.1080/14763141.2021.1873411).
- Исходные Human Basemeshes и уши MakeHuman — CC0 (`LICENSE_CC0_ASSETS.md`),
  Three.js — MIT (`LICENSE_THREE.txt`). Это не лицензия всей игры.

Сборка и ограничения проверок описаны в `tools/male-locomotion-correction/README.md`.
'''

MOCAP_LICENSE='''# CMU motion capture and BVH conversion

The data used in this project was obtained from mocap.cs.cmu.edu. The database
was created with funding from NSF EIA-0196217.

CMU states that the data may be used in research and included in commercial
products, but **may not be resold directly, even in converted form**. See
<https://mocap.cs.cmu.edu/> for the current statement. The 2010 MotionBuilder
BVH conversion is by Bruce Hahne; his `CMU_BVH_READMEFIRST.txt` is included.

The previous adapted clips use parts of takes 02_01 (walk) and 35_17 (run/jog).
The new adapted clips use parts of takes 02_02 (walk) and 02_03 (run/jog).
The synthetic BVH frame 0 was used only for alignment. Hands/toes can be noisy,
and the CMU finger/thumb channels are not captures. The database and converted
motion must not be represented as original work.
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
        model=z.read('male_reference_locomotion.glb')
        licenses={name:z.read(name) for name in INHERITED_LICENSES}
    if sha(model)!=SOURCE_MODEL_SHA or (ROOT/'work/male-reference-locomotion/male_reference_locomotion.glb').read_bytes()!=model:
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
