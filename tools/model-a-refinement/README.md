# Модель А: локальная доработка и витрина с подробным колодцем

Результат и снимки: [`work/character-model-search/selected-a/refined/`](../../work/character-model-search/selected-a/refined/). Предыдущая проба с отдельными штрихами ресниц остаётся в истории; здесь она **не** используется как основа новой геометрии.

## Источники и состав

- Основа — выбранная женская модель А (`female_fixed.glb`) из [коммита b093a0052a6be080d0364c8a5136cf74ae53dff3](https://github.com/IAmStarhead/Blades-Of-War/blob/b093a0052a6be080d0364c8a5136cf74ae53dff3/assets/models/female_fixed.glb), SHA-256 `23428079f47cf54b2a5dc9b4dc7799dbc7afb27a06f8f1a67a69972dc593f7ec`. Она уже находится в отслеживаемом архиве `work/character-model-search/selected-a/female_A_with_lashes_showcase.zip` под именем `female_A_original.glb`; именно её берёт скрипт по умолчанию.
- Колодец и встроенный Three.js-код скопированы из `BladesOfWar_Adam_Eve_Showcase (3).zip`, SHA-256 `4c3d421eca3b5c9536a5b25958e4350c4d3ebd9d218ad57c00038907783ac9bc`. Код генератора `sp()` и его движок переносятся **без изменений**, но пользовательский интерфейс витрины написан заново. В новом HTML встроена только женская модель; мужской GLB и переключатели мужчины не включены. Исходный архив не изменяется.
- Использованы файлы целей MakeHuman из зафиксированного [a8bc2d54ff0ac92e78ff71431b1023eda42bf482](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/targets). Все 14 файлов в `makehuman/targets` и лицензия сверены по Git blob с этим коммитом. По [лицензии MakeHuman](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md) графические данные, включая base mesh и targets, выпущены под CC0 1.0; текст лежит в `makehuman/LICENSE.ASSETS.md` и включён в ZIP. Исходный README модели А также указывает CC0 для основы MakeHuman и низкополигональных глаз MakeHuman/MPFB2. Код MakeHuman в проект не копировался.
- Связь 14 517 вершин тела GLB с индексами исходной MakeHuman-сетки вычислена сравнением UV оригинальной модели с [base.obj](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/makehuman/data/3dobjs/base.obj) после переворота V. Все вершины совпали, максимальная ошибка UV — около `4.21e-8`; противоречий при сопоставлении швов не найдено. Сохранённая таблица `model-a-vertex-map.u16` — little-endian uint16, SHA-256 `9d3c0c7f72aa1943235508f031454c8a12bb45e796f29a07347b7f7ff6b60246`. Геометрия исходной модели А, а не base.obj, остаётся основой результата.

## Что именно изменяется

`build.py` применяет небольшие взвешенные дельты только из следующих групп MakeHuman: ширина носа/ноздрей/кончика, округление и размер ушей, форма груди и объём ягодиц. Точные коэффициенты находятся в `TARGETS`; преобразование единиц из данных MakeHuman в метры — `0.1`. Нормали пересчитываются переносом изменения сглаженных нормалей только в соседстве изменённых граней. Брови перерисовываются в ограниченной области исходной текстуры кожи.

Ресницы — отдельный объект `upper_lashes_cat_eye`: две непрерывные сужающиеся ленты вдоль верхних век без отдельных волосков или чёрточек. Исходные сетка и текстура голубых глаз сохранены побайтово. Форма и UV остальной части модели не меняются, причёски не добавляются. Модель по-прежнему статична: нет skeleton/skin, анимаций и морфов, поэтому автоматического моргания нет.

## Визуальные и анатомические материалы

Справочно просматривались [женский портрет в профиль](https://www.pexels.com/photo/side-portrait-of-a-young-woman-with-nose-piercing-17136717/), [пример подводки кошачьего глаза](https://ashleykaylamakeup.com/how-i-apply-inner-and-outer-corner-winged-eyeliner/), [ориентиры дуги брови](https://www.researchgate.net/figure/Female-eyebrow-is-positioned-above-the-orbital-rim-line-and-is-arched-with-its-apex_fig3_316483049), [вариативность формы носа](https://pubmed.ncbi.nlm.nih.gov/16673536/), [строение наружного уха](https://www.ncbi.nlm.nih.gov/books/NBK470359/figure/article-20828.image.f1/) и [описание анатомии груди](https://plastsurgeon.com/breast-surgery/the-normal-breast/). Это визуальные ориентиры, а не универсальные каноны красоты. Сами фотографии и сторонние иллюстрации в репозиторий и ZIP не копировались.

## Сборка

На Python 3.11:

```bash
python3 -m venv tools/model-a-refinement/.venv
. tools/model-a-refinement/.venv/bin/activate
pip install -r tools/model-a-refinement/requirements.txt
python tools/model-a-refinement/build.py
```

`--source` позволяет указать оригинальный GLB или ZIP с `female_A_original.glb`, `--well-archive` — исходный ZIP с подробным колодцем, `--output` — другую папку. Проверяются SHA-256 исходной модели, таблицы вершин и архива колодца. Сборка не использует сеть. При повторном запуске в одном окружении файлы получаются побайтово идентичными (для данной сборки: Python 3.11.2, NumPy 2.4.6, Pillow 13.0.0, zlib 1.2.13).

Результат:

- `female_A_refined.glb`: SHA-256 `5df2138963662f7630cd9674ccd8111d4bb415b270424401c4915f97e0810eac`.
- `female_A_and_detailed_well.zip`: SHA-256 `7f524fd081d326a9bdc59688ac4a29249006948c194ff3169be4556bf4773e52`.

В ZIP — полностью автономный HTML, отдельный женский GLB, README и лицензия assets. Колодец — процедурный объект внутри HTML, отдельного GLB колодца в архиве нет.

## Проверка и снимки

```bash
python tools/model-a-refinement/qa.py
npm ci --prefix tools/character-showcase
node tools/model-a-refinement/qa-gltf.mjs
node tools/model-a-refinement/qa-browser.mjs
# Дополнительно пересоздать снимки; требуется Pillow из requirements.txt:
node tools/model-a-refinement/qa-browser.mjs --shots
```

`qa.py` сверяет источник, локальные координаты и предельные смещения четырёх групп, неизменённые UV/индексы/глаза, текстурную область бровей, смежность нормалей, отсутствие новых зазоров в совпадающих вершинах и переворотов/вырождений граней; проверяет две связные ленты ресниц, содержимое ZIP, единственный встроенный GLB, отсутствие мужской модели и точное совпадение кода колодца. Khronos glTF Validator проверяет исходник и результат. Браузерная проверка отключает сеть, проверяет три режима и четыре полных ракурса по проекции габаритов, крупный план лица, мышь, масштаб, сдвиг, автовращение и два размера мобильного экрана. При необходимости путь к браузеру можно передать через `CHROME_BIN`; Chromium может требовать системные библиотеки.

Для независимой проверки таблицы UV можно скачать зафиксированный base OBJ и восстановить сопоставление (для обычной сборки и `qa.py` этот файл не нужен):

```bash
gh api repos/makehumancommunity/makehuman/git/blobs/d26635e9326e3cca30778fd7b9c00062b03cce09 --jq .content | base64 -d > /tmp/makehuman-base.obj
python tools/model-a-refinement/qa-map.py --base /tmp/makehuman-base.obj
```

`qa-map.py` проверяет SHA-256 base OBJ, уникальность каждого UV-совпадения, совпадение восстановленной таблицы и консистентность индексов на швах.

При `--shots` временные HTML-копии отличаются только встроенным GLB: оригинальная А, предыдущая проба ресниц и итоговая модель снимаются с одинаковой камерой и светом. `review.py` выполняет одинаковую обрезку и добавляет подписи, не ретушируя снимки. Пересъёмка на программном WebGL может занять несколько минут; внешний вид теней может немного отличаться на других GPU.
