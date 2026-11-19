#!/usr/bin/env python3
"""Build a separate, reversible abdomen and pelvic-transition review trial."""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT = ROOT / 'work/male-body-contour'
INPUT = ROOT / 'work/male-body-volume/BladesOfWar_Proba_Zhivota_i_Nog.zip'
INPUT_ZIP_SHA = '25062514d8deeb2aee74dde7acf1d75d222a0e779ec681048228f27ea9ba888e'
INPUT_MODEL_SHA = '1c94cb1c5fbecc5a1aa4f00683c90bb34ce2eb502ef504781d6faa00fd95c8c3'
MODEL = 'male_body_contour.glb'
ARCHIVE = 'BladesOfWar_Proba_Kontura_Zhivota_i_Taza.zip'
LICENSES = ('LICENSE_MOCAP.md', 'CMU_BVH_READMEFIRST.txt', 'LICENSE_CC0_ASSETS.md',
            'LICENSE_THREE.txt', 'LICENSE_CC0_QUATERNIUS.txt')
MARKER = '<!-- Blades of War: reversible abdomen and pelvic-contour trial -->'

README = """# Blades of War — отдельная проба живота и таза

Распакуйте архив и откройте `index.html` в браузере с WebGL. На Android можно
открыть HTML из распакованной папки в браузере. Модель и код встроены в HTML,
интернет для просмотра не нужен. Файл `male_body_contour.glb` должен лежать
рядом с HTML для кнопки скачивания и открытия модели в других программах.

## Как сравнить

- «Последняя проба» — точная поверхность из архива
  `BladesOfWar_Proba_Zhivota_i_Nog.zip`, который Вы смотрели последним.
  «Новая правка» — новая отдельная проба; выбранная версия подписана на сцене.
- Для живота выберите «Шаг на месте» или «Бег на месте», затем «Сбоку» и,
  если нужно, «Торс и руки». Для таза используйте «Сзади» и «Таз и бёдра».
  На телефоне кнопки находятся ниже сцены; камеру также можно повернуть пальцем.
- Остановите движение ползунком фазы, переключите версии и осмотрите ту же
  позу. Ходьба, бег, присед и коррекция колен совпадают на обеих сторонах.

## Что изменено

В предыдущей пробе передняя часть живота действительно была немного добавлена
вперёд. Здесь эта добавка убрана, половина бокового расширения талии возвращена,
а передняя стенка живота плавно отведена внутрь по широкому участку от нижних
рёбер к тазу. Это проба более плоского профиля, не идеальная анатомическая модель.
В некоторых фазах бега тень под грудью стала заметнее: проверьте, нравится ли
Вам этот переход, а не только контур в покое.

В центре заднего перехода выполнено небольшое локальное сглаживание. В части
поз оно смягчает резкий переход, но **тёмная складка остаётся**, особенно при
сгибании ног; считать её исправленной нельзя. Мы не знаем, какую именно форму
задней части Вы предпочитаете, поэтому не стали сильно менять её объём. После
сравнения можно уточнить, что важнее: контур, складка или движение в конкретной
позе. Сильное заполнение центра в наших проверках усиливало тень и не включено.

Относительно последней модели более чем на 1 мм сдвинуто 493 вершины;
максимальное смещение базовой поверхности — примерно 28,6 мм. В передней полосе
живота базовые точки не сдвигаются вперёд; в выбранной области наибольшее
смещение назад около 28 мм. Это не измерение на экране или гарантия результата
во всех позах. Форма ниже перехода таза к ногам, руки, лицо и челюсть не
перелеплены. Топология, веса кожи, скелет, прежние морфы и все 51 клип
сохранены без изменений: ключи понравившегося бега и движения ног те же,
хотя силуэт живота и таза меняется вместе с поверхностью.

**Ограничения:** движение приседа, его коленные коррекции и возможные тёмные
пятна остаются экспериментальными. Фиксации стоп по горизонтали и физики нет,
поэтому возможно скольжение. Коррекция пола и переходов работает только во
встроенном просмотрщике и не запечена в GLB. Проверка мобильной страницы
проводилась в эмуляции браузера, не на физическом Android-устройстве.

Предыдущие архивы не изменены. Во внешнем просмотрщике новый GLB применяет
новую поверхность ко всем клипам. Для точного отката вне HTML используйте
GLB из предыдущего архива.

## Анатомические и технические ориентиры

Источники помогли ориентироваться в непрерывном переходе передней стенки живота
между рёбрами и тазом, а также в том, как задняя складка меняется при движении;
они не доказывают правильность полученной модели. Изображения из источников
в архив не включены.

- Kenhub, передние мышцы живота: https://www.kenhub.com/en/library/anatomy/anterior-abdominal-muscles
- Proko, поверхность ягодичной области и подвижность складки: https://www.proko.com/course-lesson/how-to-draw-butts
- Исследование ягодичной области и складки: https://pmc.ncbi.nlm.nih.gov/articles/PMC5733974/
- Autodesk, корректирующие формы для отдельных поз: https://help.autodesk.com/cloudhelp/2018/ENU/Maya-CharacterAnimation/files/GUID-00699C13-8CA1-450C-937D-57C7B3DFD8C6.htm

В этой пробе новые корректирующие позы не добавлялись: проверялась локальная
базовая поверхность. Ссылки приведены для ориентира, а не как лицензия на
сторонние изображения.

## Источники анимаций и условия

Модель и анимации унаследованы из предыдущей пробы. Ходьба и бег адаптированы
из Quaternius Universal Animation Library Standard 2025; страницы
https://quaternius.com/packs/universalanimationlibrary.html и
https://quaternius.itch.io/universal-animation-library указывают CC0 1.0.
Использовано зеркало https://github.com/J-Ponzo/gltf-universal-animation-library/tree/e24c23cf2a1323488a3faa226ea7ea21f644b73e .
Позднее опубликованная общая лицензия Quaternius отличается; перед
распространением проверьте условия именно полученной версии. В архиве есть
текст CC0 и сведения о модели, ушах и Three.js.

Некоторые унаследованные клипы содержат CMU mocap: The data used in this
project was obtained from mocap.cs.cmu.edu. The database was created with
funding from NSF EIA-0196217. CMU разрешает использовать данные в коммерческих
продуктах, но запрещает прямую перепродажу данных, даже после конверсии:
https://mocap.cs.cmu.edu/ и https://mocap.cs.cmu.edu/faqs.php . Условия и
README конверсии Брюса Хана прилагаются.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sources() -> tuple[bytes, dict[str, bytes]]:
    archive = INPUT.read_bytes()
    if sha(archive) != INPUT_ZIP_SHA:
        raise ValueError('Unexpected last archive')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if z.testzip() is not None:
            raise ValueError('Last archive failed CRC')
        model = z.read('male_body_volume.glb')
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(model) != INPUT_MODEL_SHA or (INPUT.parent / 'male_body_volume.glb').read_bytes() != model:
        raise ValueError('Last model does not match its archive')
    return model, licenses


def build(output: Path) -> None:
    output, own = output.resolve(), DEFAULT.resolve()
    if output == ROOT or (ROOT in output.parents and output != own and own not in output.parents):
        raise ValueError('Refusing to overwrite another repository artifact')
    page = output / 'index.html'
    names = (MODEL, ARCHIVE, 'README.md', 'build-info.json', *LICENSES)
    if page.exists():
        if not page.read_text(encoding='utf-8').startswith(MARKER):
            raise ValueError('Refusing to overwrite an unrelated page')
    elif any((output / name).exists() for name in names):
        raise ValueError('Refusing to overwrite files in an unrelated directory')
    last, licenses = sources()
    with tempfile.TemporaryDirectory(prefix='bow-contour-build-') as tempdir:
        temp = Path(tempdir)
        source, model, bundle = temp / 'previous.glb', temp / MODEL, temp / 'viewer.js'
        source.write_bytes(last)
        result = subprocess.run(['node', str(HERE / 'author.mjs'), str(source), str(model)],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        info = json.loads(result.stdout)
        rigged = model.read_bytes()
        if source.read_bytes() != last or info['sourceSha256'] != INPUT_MODEL_SHA or info['outputSha256'] != sha(rigged):
            raise ValueError('Model authoring failed verification')
        esbuild = ROOT / 'tools/male-library-motion/node_modules/.bin/esbuild'
        env = dict(os.environ, NODE_PATH=str(ROOT / 'tools/male-library-motion/node_modules'))
        subprocess.run([str(esbuild), str(HERE / 'viewer.mjs'), '--bundle', '--minify',
                        '--format=iife', '--target=es2020', '--outfile=' + str(bundle)],
                       cwd=ROOT, check=True, capture_output=True, env=env)
        script = bundle.read_text(encoding='utf-8')
    if '</script' in script.lower():
        raise ValueError('Viewer contains a script terminator')
    template = (HERE / 'viewer.template.html').read_text(encoding='utf-8')
    for key, value in {'__MODEL__': base64.b64encode(rigged).decode('ascii'), '__BUNDLE__': script}.items():
        if template.count(key) != 1:
            raise ValueError('Expected one template marker: ' + key)
        template = template.replace(key, value, 1)
    html = (MARKER + '\n' + template).encode('utf-8')
    if html.count(b'data:model/gltf-binary;base64,') != 1:
        raise ValueError('Expected one embedded model')
    files = [('index.html', html), (MODEL, rigged), ('README.md', README.encode('utf-8'))]
    files.extend(licenses.items())
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files:
            entry = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data, compresslevel=9)
    archive = stream.getvalue()
    info.update({'sourceZipSha256': INPUT_ZIP_SHA, 'pageSha256': sha(html), 'archiveSha256': sha(archive)})
    output.mkdir(parents=True, exist_ok=True)
    for name, data in files:
        (output / name).write_bytes(data)
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
