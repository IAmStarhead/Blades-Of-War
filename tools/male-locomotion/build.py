#!/usr/bin/env python3
"""Build a separate, reproducible offline locomotion and controls prototype."""
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
DEFAULT=ROOT/'work/male-locomotion'
SOURCE=ROOT/'work/male-rig-refinement/BladesOfWar_Dorabotka_Dvizheniy.zip'
SOURCE_SHA='494b0b314c47f8ff288c7ed3d03b834e019738de8101b5dd3e50ce36e6b4ff04'
MODEL_SOURCE_SHA='a442b85eab3e725bb54f87ce5a3e89da05e7cfefa02cf5cfbb817cf6c67fcc4d'
WELL_SHA='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
MARKER='<!-- Blades of War: separate male locomotion and controls prototype -->'
MODEL='male_locomotion.glb'
ARCHIVE='BladesOfWar_Hodba_Beg_Upravlenie.zip'
LICENSES=('LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — отдельная проба ходьбы, бега и управления

## Как открыть

В GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin**, затем **Pull origin**, если эта кнопка появится. Откройте в
браузере `work/male-locomotion/index.html`. Либо распакуйте рядом файлы из
`BladesOfWar_Hodba_Beg_Upravlenie.zip` и откройте `index.html`. После получения
HTML и встроенная в него сцена работают без интернета; ссылка на скачивание GLB
действует, когда файл `male_locomotion.glb` лежит рядом.

## Временное управление

- **Управление**: щёлкните мышью по земле или коснитесь её, чтобы идти к
  выбранной точке. В меню можно выбрать ходьбу или бег; Shift + щелчок мышью
  даёт бег только к выбранной точке. Перетаскивание одним пальцем или мышью
  поворачивает камеру, не задавая цели.
- **WASD / стрелки**: идти относительно экрана; удерживайте **Shift** для бега.
  Клавиатура отменяет предыдущую цель. **Esc** или **Остановить** прекращают
  движение. **В начало** возвращает персонажа к колодцу и тоже останавливает.
- **Шаг на месте / Бег на месте**: непрерывные циклы для проверки со всех сторон.
  Они не перемещают персонажа. Клик по земле или клавиша направления возвращают
  управление. Эти режимы не представляют собой отдельную игровую механику.
- **Игровой** — вид сверху под углом, камера следует за мужчиной. **С колодцем**
  показывает его с более близкого ракурса. **Мужчина крупно** и **Ноги крупно**
  — технический осмотр, на этих ракурсах колодец временно скрыт. Приближение
  колёсиком не предусмотрено. Кнопки 45° и перетаскивание вращают камеру;
  **Кости** показывает скелет.
- **Дыхание в покое**: «Мягче» — новая версия без масштабирования груди,
  «Прежнее» — дыхание из предыдущей пробы. При включённом в системе сокращении
  движения дыхание в покое заморожено; управление по-прежнему работает.

Колодец остаётся подробным и на своём месте. Для пробы вокруг него установлено
одно круглое невидимое препятствие: персонаж не входит в него, а путь по щелчку
обходит его. Это приближение без отдельных коллизий крыши, ведра и т. п.; пол
плоский, ограниченный, полноценной игровой навигации/физики нет. Интерфейс и
схема управления предложены временно для обсуждения, а не как окончательный дизайн.

## Что изменено и что пока не готово

В отдельной копии модели перераспределена часть весов у тазобедренного сгиба,
чтобы поворот ноги начинался ближе к тазу. Это проба, не гарантия идеальной
анатомии: на сильном сгибе спереди ещё виден резкий переход освещения бедра.
Основа модели, форма и сетка в исходной позе, скелет и детали колодца сохранены.
Ключи понравившихся ранее движений головы и локтя сохранены в GLB; для их
просмотра сохранена также предыдущая самостоятельная проба.

Добавлены циклы `Walk_Loop` и `Run_Loop` и смена их со спокойным дыханием в
управлении. Они созданы процедурно, не из захвата движения. Нога считается по
заданной траектории на этапе создания клипов; полноценного IK/физики контакта
в приложении нет. Положение и направление стопы приблизительные, особенно на
поворотах и при разгоне/остановке; возможны скольжение и визуальные огрехи.
Оценивайте также форму движения в реальном времени, не только отдельные кадры.

В GLB сохранены `Test_Arms`, `Test_Elbow`, `Test_Knee`, `Test_Head` и предыдущие
`Previous_...`. Скрытых срезов, обрубков и системы отделения головы/конечностей
в модели пока **нет**. Точки отсечения и степень детализации ещё не определены.
Кисти/пальцы и одежда отдельно не анимированы, производительность и FPS на
устройстве пользователя не измерялись. Это промежуточный прототип, не игра.

## Источники и сборка

Предыдущая самостоятельная проба остаётся в `work/male-rig-refinement/` без
изменений. Эта сцена использует тот же код подробного колодца. Human Basemeshes
и уши MakeHuman указаны как CC0 (`LICENSE_CC0_ASSETS.md`), Three.js r187 — MIT
(`LICENSE_THREE.txt`). Это не лицензия всей игры.

Для воспроизводимой локальной сборки из корня репозитория:

```
npm ci --prefix tools/male-locomotion
python3 tools/male-locomotion/build.py
```
'''


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def read_sources()->tuple[bytes,dict[str,bytes]]:
    archive=SOURCE.read_bytes()
    if sha(archive)!=SOURCE_SHA:
        raise ValueError('The previous trial ZIP differs from the verified source')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model=z.read('male_motion_refinement.glb')
        licenses={name:z.read(name) for name in LICENSES}
    if sha(model)!=MODEL_SOURCE_SHA:
        raise ValueError('The previous model differs from the verified source')
    if sha((HERE/'well-source.mjs').read_bytes())!=WELL_SHA:
        raise ValueError('The approved well source has changed')
    return model,licenses


def build(output:Path)->None:
    output=output.resolve()
    protected=[ROOT,ROOT/'work/male-rig-refinement',ROOT/'work/male-rig-trial']
    if any(output==p.resolve() or (p!=ROOT and p.resolve() in output.parents) for p in protected):
        raise ValueError('Refusing to overwrite a previous trial')
    page=output/'index.html'
    if page.exists() and not page.read_text(encoding='utf-8').startswith(MARKER):
        raise ValueError('Refusing to overwrite an unrelated page')
    source,licenses=read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-locomotion-') as name:
        temp=Path(name);old=temp/'previous.glb';new=temp/MODEL;script=temp/'viewer.js';old.write_bytes(source)
        result=subprocess.run(['node',str(HERE/'locomotion.mjs'),str(old),str(new)],cwd=ROOT,check=True,capture_output=True,text=True)
        info=json.loads(result.stdout);rigged=new.read_bytes()
        if old.read_bytes()!=source or info['sourceSha256']!=MODEL_SOURCE_SHA or info['outputSha256']!=sha(rigged):
            raise ValueError('Unexpected model source or generated output')
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
        raise ValueError('Expected a single embedded model')
    files=[('index.html',html),(MODEL,rigged),('README.md',README.encode('utf-8'))]
    files += [(name,licenses[name]) for name in LICENSES]
    output_zip=io.BytesIO()
    with zipfile.ZipFile(output_zip,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for file,data in files:
            entry=zipfile.ZipInfo(file,date_time=(2026,11,14,0,0,0));entry.compress_type=zipfile.ZIP_DEFLATED;entry.external_attr=0o644<<16
            z.writestr(entry,data,compresslevel=9)
    archive=output_zip.getvalue()
    info.update({'sourceZipSha256':SOURCE_SHA,'wellCodeSha256':WELL_SHA,'pageSha256':sha(html),'archiveSha256':sha(archive)})
    output.mkdir(parents=True,exist_ok=True)
    for file,data in files:
        (output/file).write_bytes(data)
    (output/ARCHIVE).write_bytes(archive)
    (output/'build-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (output/'.gitattributes').write_text('index.html -whitespace\n',encoding='utf-8')
    print(f'GLB: {len(rigged)} bytes, SHA-256 {sha(rigged)}')
    print(f'Offline HTML: {len(html)} bytes, SHA-256 {sha(html)}')
    print(f'ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}')
    print(f'Output: {output}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=DEFAULT)
    build(parser.parse_args().output)
