# Модель А: сборка и проверка пробы ресниц

Здесь находится воспроизводимый построитель отдельной сетки ресниц для статичного `female_fixed.glb` из коммита `b093a0052a6be080d0364c8a5136cf74ae53dff3`. Исходные геометрия, материалы и текстуры не перерабатываются. HTML исторической витрины меняется только заменой встроенной женской GLB; исторические мужские модели и код колодца не меняются. Это старая витрина со старым колодцем, а не текущая сцена проекта; текущий колодец остаётся нетронутым.

## Исходник и сборка

Скачайте [исходный архив](https://github.com/IAmStarhead/Blades-Of-War/blob/b093a0052a6be080d0364c8a5136cf74ae53dff3/BladesOfWar_%D0%B8%D1%81%D0%BF%D1%80%D0%B0%D0%B2%D0%BB%D0%B5%D0%BD%D0%BD%D0%B0%D1%8F_%D0%BC%D0%BE%D0%B4%D0%B5%D0%BB%D1%8C.zip) и передайте его скрипту. Его SHA-256: `5d52cb8ec2b7edd49732df090c8205d0732cb168b8de13ebc4a799b4c2bed648`. Скрипт также проверяет SHA-256 женской модели, потому что построение привязано к её конкретной топологии.

```bash
python3 -m venv tools/model-a-lashes/.venv
. tools/model-a-lashes/.venv/bin/activate
pip install -r tools/model-a-lashes/requirements.txt
python tools/model-a-lashes/build.py --source /путь/к/BladesOfWar_исправленная_модель.zip
```

Результат: `work/character-model-search/selected-a/female_A_with_lashes.glb` и `female_A_with_lashes_showcase.zip`. В ZIP включён и побайтово неизменённый оригинальный GLB. Построение повторено в том же окружении: GLB и ZIP совпали побайтово.

## Проверки

```bash
python tools/model-a-lashes/qa.py --source /путь/к/BladesOfWar_исправленная_модель.zip
npm ci --prefix tools/character-showcase
node tools/model-a-lashes/qa-gltf.mjs
node tools/model-a-lashes/qa-browser.mjs /путь/к/BladesOfWar_исправленная_модель.zip --shots
```

Первая проверка сравнивает исходные буферы и структуру GLB, HTML после обратной замены единственной модели, содержимое ZIP и отдельный GLB; также проверяет диапазоны, нормали и вырожденные треугольники ресниц. Khronos glTF Validator проверяет исходную и новую модели. Браузерная проверка открывает оба HTML локально без сетевых запросов, проходит режимы и ракурсы, включая колодец, и создаёт снимки «до/после». Для снимков временная копия HTML лишь открывает доступ к камере; в поставляемом HTML этого кода нет. Если Chromium не запускается из-за системных библиотек, можно указать установленный браузер через `CHROME_BIN`.

Текущий GLB: SHA-256 `a6261b331b95c3f4d581964cc43e8551b9e13e9bae5ef58c6c6fa9e549207e57`; ZIP: `0ccca32e3cba49e7bb85e579799e4c9449030d1af86b093ad0e78f6f46fcbb93`. Ресницы статичны, для будущей анимации век им потребуется отдельная привязка/деформация.
