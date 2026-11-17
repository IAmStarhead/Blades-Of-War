#!/usr/bin/env python3
"""Build an independent offline comparison of the nape-normal correction."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import struct
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = ROOT / "work/male-nape-seam"
PREVIOUS = ROOT / "work/male-camera-dual-view/BladesOfWar_Dva_Rakursa.zip"
PREVIOUS_SHA = "03a6e5a6cf2b477c384764c3214961c60438d1489ffbec41766a070675210a99"
ORIGINAL_SHA = "450d660b03b284fdb4e3c9363a6211c02525311096d2cd9da69449e9f84a85b3"
OPTIMIZED_SHA = "ee4fee7388eaf3e77ba01061e11d9a569e6e8684ce349ab86981a9408b33b5c3"
FIXED_SHA = "009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e"
MARKER = "<!-- Blades of War: separate nape-normal smoothing trial -->"
OLD_PAGE = "BladesOfWar_Showcase.html"
PAGE = "BladesOfWar_Zatylok.html"
ARCHIVE = "BladesOfWar_Proba_Zatylka.zip"
ORIGINAL = "male_13_november_original.glb"
OPTIMIZED = "male_13_november_optimized.glb"
FIXED = "male_nape_smoothed_trial.glb"
LICENSES = ("LICENSE_CC0_ASSETS.md", "LICENSE_THREE.txt")

README = """BLADES OF WAR — ОТДЕЛЬНАЯ ПРОБА ЗАТЫЛКА

КАК ОТКРЫТЬ
Распакуйте весь архив и откройте BladesOfWar_Zatylok.html в современном
браузере с поддержкой WebGL. Для просмотра интернет не нужен.

СРАВНЕНИЕ
Витрина сразу открывается на затылке с выбранным вариантом «После».
Внизу в разделе «Вариант» переключайте:
  «До» — прежняя облегчённая модель с видимым переходом на затылке;
  «После» — отдельная проба со сглаженным освещением затылка;
  «Исходная» — неизменённый первоначальный мужчина: переход есть и на нём.
Камера и свет при переключении модели не меняются. Перетащите изображение
мышью или пальцем либо нажмите стрелки поворота; «Начальный вид» вернёт
исходное направление текущего ракурса.

«Сверху» — прежняя тактическая проба с колодцем. «Обычный» показывает
мужчину и колодец на уровне человека. «Осмотр» — мужчина в полный рост;
«Затылок» — голова крупнее. В двух последних видах колодец временно скрыт,
чтобы не заслонять модель, и вновь появляется в общих видах. Приближение головы
относится только к витрине, не к игровой камере; свободные зум и сдвиг выключены.

ЧТО ИЗМЕНЕНО
На копии облегчённой модели сглажены только направления освещения (нормали)
небольшой области затылка. Положения вершин, треугольники, текстура, лицо,
тело и уши не менялись. Треугольников по-прежнему 32 354. В зависимости от
освещения след может проявляться по-разному; это проба для Вашего решения,
а не утверждённая окончательная модель. Колодец не переделывался.

В архиве также сохранены оригинальная и предыдущая облегчённая модели.
Исходники и предыдущие витрины не заменены. Женщины в этой витрине нет;
кулаки выключены, руки расслаблены. Это статичная витрина: рига, анимации и
системы отсечения нет, игровая производительность не проверялась.

ИСТОЧНИКИ И ЛИЦЕНЗИИ
Модели и код колодца взяты из архива BladesOfWar_Dva_Rakursa.zip.
В исходных материалах Human Basemeshes (pistachio) и уши MakeHuman указаны как
CC0; текст CC0 приложен в LICENSE_CC0_ASSETS.md. Текст MIT для Three.js находится
в LICENSE_THREE.txt. Это не объявляет всю игру CC0 или MIT.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def triangles(glb: bytes) -> int:
    magic, version, length = struct.unpack_from("<4sII", glb)
    size, kind = struct.unpack_from("<I4s", glb, 12)
    if magic != b"glTF" or version != 2 or length != len(glb) or kind != b"JSON":
        raise ValueError("Not a complete GLB 2.0")
    doc = json.loads(glb[20:20 + size])
    if doc.get("skins") or doc.get("animations"):
        raise ValueError("Unexpected skin or animation in static trial")
    count = 0
    for mesh in doc["meshes"]:
        for p in mesh["primitives"]:
            if p.get("mode", 4) != 4 or "indices" not in p:
                raise ValueError("Unexpected primitive")
            count += doc["accessors"][p["indices"]]["count"] // 3
    return count


def sources() -> tuple[bytes, bytes, str, dict[str, bytes]]:
    previous = PREVIOUS.read_bytes()
    if sha(previous) != PREVIOUS_SHA:
        raise ValueError("Previous ZIP does not match the confirmed source")
    with zipfile.ZipFile(io.BytesIO(previous)) as z:
        if z.testzip() is not None:
            raise ValueError("Previous ZIP failed CRC verification")
        original, optimized = z.read(ORIGINAL), z.read(OPTIMIZED)
        old_page = z.read(OLD_PAGE).decode("utf-8")
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(original) != ORIGINAL_SHA or sha(optimized) != OPTIMIZED_SHA:
        raise ValueError("Source models do not match confirmed originals")
    if triangles(original) != 287782 or triangles(optimized) != 32354:
        raise ValueError("Unexpected source triangle count")
    marker = '<script type="module">'
    if old_page.count(marker) != 1 or old_page.count("const ORIGINAL_URI =") != 1:
        raise ValueError("Unexpected previous viewer structure")
    start = old_page.index(marker) + len(marker)
    end = old_page.index("const ORIGINAL_URI =", start)
    engine = old_page[start:end]
    if engine.count("function sp(") != 1 or "data:model/gltf-binary;base64," in engine:
        raise ValueError("Unexpected detailed well/engine bundle")
    return original, optimized, engine, licenses


def fixed_model(original: bytes, optimized: bytes) -> tuple[bytes, dict]:
    with tempfile.TemporaryDirectory(prefix="bow-nape-build-") as temp:
        folder = Path(temp)
        a, b, c = folder / ORIGINAL, folder / OPTIMIZED, folder / FIXED
        a.write_bytes(original)
        b.write_bytes(optimized)
        completed = subprocess.run(["node", str(HERE / "fix.mjs"), str(a), str(b), str(c)],
                                   cwd=ROOT, text=True, capture_output=True, check=True)
        info = json.loads(completed.stdout)
        result = c.read_bytes()
        if a.read_bytes() != original or b.read_bytes() != optimized:
            raise ValueError("Input model was modified")
    if sha(result) != FIXED_SHA or info["fixedSha256"] != FIXED_SHA or triangles(result) != 32354:
        raise ValueError("Unexpected fixed GLB; inspect the build environment")
    return result, info


def make_html(original: bytes, optimized: bytes, fixed: bytes, engine: str) -> bytes:
    template = (HERE / "viewer.template.html").read_text(encoding="utf-8")
    substitutions = {
        "/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/": engine,
        "__ORIGINAL_DATA_URI__": "data:model/gltf-binary;base64," + base64.b64encode(original).decode("ascii"),
        "__OPTIMIZED_DATA_URI__": "data:model/gltf-binary;base64," + base64.b64encode(optimized).decode("ascii"),
        "__FIXED_DATA_URI__": "data:model/gltf-binary;base64," + base64.b64encode(fixed).decode("ascii"),
        "__OPTIMIZED_TRIANGLES_NUMBER__": "32354",
        "__OPTIMIZED_TRIANGLES__": "32 354",
    }
    for key, value in substitutions.items():
        if template.count(key) != 1:
            raise ValueError(f"Expected exactly one marker: {key}")
        template = template.replace(key, value, 1)
    if template.count("data:model/gltf-binary;base64,") != 3 or "FIST_DELTAS" in template:
        raise ValueError("Expected three male models, no fist trial")
    return (MARKER + "\n" + template).encode("utf-8")


def make_zip(html: bytes, original: bytes, optimized: bytes, fixed: bytes, licenses: dict[str, bytes]) -> bytes:
    entries = [(PAGE, html), (ORIGINAL, original), (OPTIMIZED, optimized), (FIXED, fixed), ("README.txt", README.encode("utf-8"))]
    entries += [(name, licenses[name]) for name in LICENSES]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, content, compresslevel=9)
    return buffer.getvalue()


def build(output: Path) -> None:
    output = output.resolve()
    if output in (ROOT, PREVIOUS.parent.resolve()):
        raise ValueError("Choose a new output directory, not the source")
    index = output / "index.html"
    if index.exists() and not index.read_bytes().startswith(MARKER.encode()):
        raise ValueError(f"Refusing to overwrite an unrelated page: {index}")
    if (output / FIXED).exists() and not index.exists():
        raise ValueError("Refusing to overwrite an unrelated GLB")
    original, optimized, engine, licenses = sources()
    fixed, info = fixed_model(original, optimized)
    html = make_html(original, optimized, fixed, engine)
    archive = make_zip(html, original, optimized, fixed, licenses)
    info.update({"previousZipSha256": PREVIOUS_SHA, "pageSha256": sha(html), "archiveSha256": sha(archive)})
    output.mkdir(parents=True, exist_ok=True)
    index.write_bytes(html)
    (output / FIXED).write_bytes(fixed)
    (output / ARCHIVE).write_bytes(archive)
    (output / "build-info.json").write_text(json.dumps(info, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Fixed GLB: {len(fixed)} bytes, SHA-256 {sha(fixed)}")
    print(f"Standalone HTML: {len(html)} bytes, SHA-256 {sha(html)}")
    print(f"ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}")
    print(f"Output: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    build(parser.parse_args().output)


if __name__ == "__main__":
    main()
