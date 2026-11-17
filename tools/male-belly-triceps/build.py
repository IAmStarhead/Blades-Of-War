#!/usr/bin/env python3
"""Build a separate, offline abdomen/upper-arm comparison from the last trial."""
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
DEFAULT=ROOT/'work/male-belly-triceps'
PREVIOUS=ROOT/'work/male-locomotion-correction'
SOURCE=PREVIOUS/'BladesOfWar_Dvizhenie_Ispravleniya.zip'
SOURCE_ZIP_SHA='12298bbbb1c9a92a9cbc8f126954b731f3a9b53e03e4869befa52d7d168c6c8f'
SOURCE_MODEL_SHA='ed3c99b191e4f8f4cfd2f69bea0584b23faa12da9d2e9128f4842d9419328382'
CODE_SHA={'well-source.mjs':'62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5',
          'navigation.mjs':'93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608',
          'floor-guard.mjs':'539257a8ad078e4793f8cab6a0cb26e31bba6af0d6bc1d4ef4a3defe9d64ee06'}
MARKER='<!-- Blades of War: separate abdomen and upper-arm trial -->'
MODEL='male_belly_triceps.glb'
ARCHIVE='BladesOfWar_Zhivot_Triceps_Sravnenie.zip'
INHERITED=('LICENSE_MOCAP.md','CMU_BVH_READMEFIRST.txt','LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — живот и руки в движении

## Открыть

Распакуйте `BladesOfWar_Zhivot_Triceps_Sravnenie.zip` целиком и откройте
`index.html` в браузере. Для просмотра интернет не нужен. Для ссылки
«Скачать модель» файл `male_belly_triceps.glb` должен лежать рядом с HTML.

Либо в GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin** и затем **Pull origin**, если кнопка появится. Откройте
`work/male-belly-triceps/index.html`. Прошлая проба не перезаписана.

## Как сравнить

Выберите **Шаг на месте** и ракурс **Торс и руки** — можно посмотреть живот
спереди и повернуть камеру. Затем выберите **Бег на месте** и посмотрите руки
сбоку и сзади. Кнопки **Прошлая проба / Новая правка** переключают именно между
последней присланной версией и этой; выбранные ракурс и фаза сохраняются.
**Пауза** и ползунок позволяют задержаться на отдельной фазе. Для осмотра
всего движения выберите **Мужчина крупно** или игровой ракурс.

## Что изменено

При ходьбе боковое покачивание живота заметно уменьшено локальной компенсацией
сетки. Таз, поясница и остальные кости при этом продолжают двигаться по
прежней анимации; ноги, руки и направление головы не перенастраивались.
Живот не закреплён абсолютно: вертикальное движение, переход к соседним
частям тела и смешивание при смене движения остаются.

При беге проверка показала сжатие линейного skinning около сгиба локтя, но
выше по руке модель уже сама имеет более тонкий силуэт. Видимая форма зависит
и от позы, и от ракурса, поэтому точно приписать весь эффект одной причине
нельзя. В новой пробе слегка добавлен объём сзади верхней части обеих рук,
плавно сходящий на нет к окружающей сетке. Форма действует в новом беге и
плавно смешивается с другими движениями; в покое, ходьбе и прошлой пробе она
выключена. Исходная форма модели и ранее добавленные коррекции суставов
сохранены. Это небольшая визуальная коррекция, не точная анатомическая модель.

Профиль шеи, затылок, подробный колодец, управление и прежние клипы сохранены.
Переключатель шеи работает независимо от сравнения движения. Пальцы отдельно
не анимированы. Это проба для оценки, а не готовая игра.

## Управление

Щелчок или касание земли — идти к точке; **Shift + щелчок** — бежать.
WASD или стрелки — движение относительно экрана, Shift — бег, Esc — стоп.
Перетаскивание мышью или пальцем вращает камеру. На телефоне бег выбирается
кнопкой. **В начало** возвращает персонажа к колодцу. Камера следует за ним;
колодец временно скрыт на крупных ракурсах.

В просмотрщике есть вертикальная подгонка ног к полу при смешивании поз.
Горизонтальной фиксации стоп и физики нет, скольжение и неточности переходов
возможны; при открытии GLB в другом просмотрщике дополнительный код подгонки
не запустится. Новые формы записаны в GLB, но для них нужны поддержка
отрицательных весов morph и более восьми morph-целей; совместимость с каждым
движком и скорость на Вашем устройстве не проверялись. Выборочные тесты не
доказывают отсутствия всех пересечений или естественности движения.

## Источники

Сохранены адаптированные движения CMU `02_02` и `02_03`, а также более
ранние клипы; это не точная копия движений актёра. Данные получены с
[mocap.cs.cmu.edu](https://mocap.cs.cmu.edu/), проект финансировался NSF
EIA-0196217. CMU запрещает прямую перепродажу данных даже после конверсии.
Условия и описание BVH-конверсии Брюса Хана — в `LICENSE_MOCAP.md` и
`CMU_BVH_READMEFIRST.txt`. Базовая модель и уши — CC0
(`LICENSE_CC0_ASSETS.md`), Three.js — MIT (`LICENSE_THREE.txt`).

Подробности сборки и выборочных проверок: `tools/male-belly-triceps/README.md`.
'''


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def read_sources()->tuple[bytes,dict[str,bytes]]:
    archive=SOURCE.read_bytes()
    if sha(archive)!=SOURCE_ZIP_SHA:
        raise ValueError('Previous ZIP differs from the verified last trial')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model=z.read('male_locomotion_corrected.glb')
        licenses={name:z.read(name) for name in INHERITED}
    if sha(model)!=SOURCE_MODEL_SHA or (PREVIOUS/'male_locomotion_corrected.glb').read_bytes()!=model:
        raise ValueError('Previous model differs from the verified ZIP')
    for file,digest in CODE_SHA.items():
        if sha((ROOT/'tools/male-locomotion-correction'/file).read_bytes())!=digest or sha((HERE/file).read_bytes())!=digest:
            raise ValueError('Approved shared code changed: '+file)
    return model,licenses


def build(output:Path)->None:
    output=output.resolve();own=DEFAULT.resolve()
    if output==ROOT or (ROOT in output.parents and output!=own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page=output/'index.html'
    names=(MODEL,ARCHIVE,'README.md','build-info.json',*INHERITED)
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output/name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    source,licenses=read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-belly-triceps-') as name:
        temp=Path(name);old=temp/'previous.glb';new=temp/MODEL;script=temp/'viewer.js';old.write_bytes(source)
        result=subprocess.run(['node',str(HERE/'revise.mjs'),str(old),str(new)],cwd=ROOT,check=True,capture_output=True,text=True)
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
    files=[('index.html',html),(MODEL,rigged),('README.md',README.encode('utf-8'))]
    files += [(name,licenses[name]) for name in INHERITED]
    result=io.BytesIO()
    with zipfile.ZipFile(result,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file,data in files:
            entry=zipfile.ZipInfo(file,date_time=(2026,11,14,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o644<<16
            z.writestr(entry,data,compresslevel=9)
    archive=result.getvalue()
    info.update({'sourceZipSha256':SOURCE_ZIP_SHA,'sharedCodeSha256':CODE_SHA,'pageSha256':sha(html),'archiveSha256':sha(archive)})
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
