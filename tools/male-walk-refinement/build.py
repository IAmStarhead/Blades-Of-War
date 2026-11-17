#!/usr/bin/env python3
"""Build the separate, reproducible offline walk and neck comparison."""
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
DEFAULT=ROOT/'work/male-walk-refinement'
SOURCE=ROOT/'work/male-locomotion/BladesOfWar_Hodba_Beg_Upravlenie.zip'
SOURCE_ZIP_SHA='81d1f0c0663d5a69ab314fb65baa7b4402d1b5ec42372233f5985e4fdc80345f'
SOURCE_MODEL_SHA='bf967a9abea76c35ecbbeebde644a34a2b45984ab13526d9047680e6487d6200'
WELL_SHA='62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5'
NAV_SHA='93127f23ebc0185c21a11cceace973e0ab3eb9c3a19b447c5d215590527aa608'
MARKER='<!-- Blades of War: separate walk and neck comparison -->'
MODEL='male_walk_refinement.glb'
ARCHIVE='BladesOfWar_Pohodka_Sheya_Sravnenie.zip'
LICENSES=('LICENSE_CC0_ASSETS.md','LICENSE_THREE.txt')

README='''# Blades of War — отдельная проба походки и шеи

## Как открыть

В GitHub Desktop выберите ветку `arena/4319905c-blades-of-war`, нажмите
**Fetch origin**, затем **Pull origin**, если эта кнопка появится. Откройте в
браузере `work/male-walk-refinement/index.html`. Либо скачайте и распакуйте
`BladesOfWar_Pohodka_Sheya_Sravnenie.zip` и откройте `index.html` внутри.
HTML со сценой работает без интернета; ссылка на скачивание GLB в самом HTML
работает, когда файл `male_walk_refinement.glb` лежит рядом.

## Как сравнить

- **Прежняя / Новая проба** переключает предыдущую походку и форму шеи на эту
  доработку и обратно. Ракурс и положение в цикле сохраняются. В покое удобно
  сравнить именно профиль шеи; клип бега при переключении не изменяется.
- **Шаг на месте** и **Мужчина крупно** дают возможность наблюдать походку с
  разных сторон. **Пауза** и ползунок останавливают цикл на выбранной позе;
  нажмите **Пуск**, чтобы продолжить. Режим бега на месте сохранён.
- **Шея сбоку** открывает крупный профиль относительно направления мужчины.
  Камеру можно повернуть кнопками 45° или перетаскиванием и посмотреть затылок.
  На крупных ракурсах колодец временно скрыт только для осмотра.

## Управление сохранено

Щелчок мышью или касание земли — идти к точке; **Shift + щелчок** — бежать к
точке. WASD или стрелки двигают относительно экрана, **Shift** включает бег,
**Esc** останавливает. Перетаскивание мышью или одним пальцем вращает камеру,
не задавая цели. На телефоне бег можно выбрать кнопкой. **В начало** возвращает
персонажа к колодцу. Камера следует за ним. При выборе режима движения на месте
щелчок по земле или клавиша направления возвращают режим управления.

Колодец и круговое приближение его препятствия сохранены из прошлой пробы;
границы площадки и их отображение не изменялись. Это не полноценная игровая
физика. Схема управления и сцена остаются отдельной технической пробой.

## Что изменено и ограничения

В новой пробе шаг сделан короче и менее присевшим, подъём ноги уменьшен;
подобран переход от пятки к носку. Сзади профиль шеи слегка убран с плавным
переходом к плечам; исходная форма доступна переключателем. Коррекция сделана
обратимым морфом, исходные позиции, нормали и веса скелета в файле сохранены.
Проверялись также затылок и поворот головы, чтобы не вернуть прежнюю полосу.

Цикл создаётся процедурно и запечён в анимацию, без захвата движения и без
работающего в реальном времени IK стоп. В отдельных позах, при поворотах,
разгоне и остановке возможны скольжение и другие неточности. Это вариант для
оценки, а не гарантия естественной походки или окончательной анатомии.

В GLB сохранены прежняя ходьба `Previous_Walk`, бег `Run_Loop`, дыхание,
пробы головы, локтя, рук, колена и другие прежние клипы. Скрытых срезов,
обрубков и системы отделения частей тела пока **нет**; пальцы отдельно не
анимированы. Производительность на устройстве пользователя не измерялась.
Предыдущая проба целиком остаётся в `work/male-locomotion/` без изменений.

## Источники и сборка

Использованы прежние лицензии: Human Basemeshes и уши MakeHuman — CC0
(`LICENSE_CC0_ASSETS.md`), Three.js r187 — MIT (`LICENSE_THREE.txt`). Это не
лицензия всей игры. Исходник подробного колодца и код навигации не изменены.

Для воспроизводимой сборки из корня репозитория:

```
npm ci --prefix tools/male-walk-refinement
python3 tools/male-walk-refinement/build.py
python3 tools/male-walk-refinement/verify.py --rebuild
```
'''


def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()


def read_sources()->tuple[bytes,dict[str,bytes]]:
    archive=SOURCE.read_bytes()
    if sha(archive)!=SOURCE_ZIP_SHA:
        raise ValueError('The previous trial ZIP differs from the verified source')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Previous ZIP CRC failed')
        model=z.read('male_locomotion.glb')
        licenses={name:z.read(name) for name in LICENSES}
    if sha(model)!=SOURCE_MODEL_SHA or (ROOT/'work/male-locomotion/male_locomotion.glb').read_bytes()!=model:
        raise ValueError('The previous standalone model differs from the verified ZIP')
    if sha((HERE/'well-source.mjs').read_bytes())!=WELL_SHA:
        raise ValueError('The approved well source has changed')
    if sha((HERE/'navigation.mjs').read_bytes())!=NAV_SHA:
        raise ValueError('The previous navigation code has changed')
    return model,licenses


def build(output:Path)->None:
    output=output.resolve();own=DEFAULT.resolve()
    if output==ROOT or (ROOT in output.parents and output!=own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page=output/'index.html'
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output/name).exists() for name in (MODEL,ARCHIVE,'README.md','build-info.json',*LICENSES)):
        raise ValueError('Refusing to overwrite files in an unrelated output directory')
    source,licenses=read_sources()
    with tempfile.TemporaryDirectory(prefix='bow-walk-refinement-') as name:
        temp=Path(name);old=temp/'previous.glb';new=temp/MODEL;script=temp/'viewer.js';old.write_bytes(source)
        result=subprocess.run(['node',str(HERE/'refine.mjs'),str(old),str(new)],cwd=ROOT,check=True,capture_output=True,text=True)
        info=json.loads(result.stdout);rigged=new.read_bytes()
        if old.read_bytes()!=source or info['sourceSha256']!=SOURCE_MODEL_SHA or info['outputSha256']!=sha(rigged):
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
    info.update({'sourceZipSha256':SOURCE_ZIP_SHA,'wellCodeSha256':WELL_SHA,'navigationCodeSha256':NAV_SHA,
                 'pageSha256':sha(html),'archiveSha256':sha(archive)})
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
