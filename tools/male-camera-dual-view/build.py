#!/usr/bin/env python3
"""Build a second, offline two-view showcase without modifying the first."""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUTPUT = ROOT / "work/male-camera-dual-view"
PREVIOUS = ROOT / "work/male-camera-optimization/BladesOfWar_Male_Fixed_Camera.zip"
PREVIOUS_SHA = "3cc9da6d6264822a0957cec0cf533dbffff15a0d6cbbf556bd6ed0877afb2a82"
ORIGINAL_SHA = "450d660b03b284fdb4e3c9363a6211c02525311096d2cd9da69449e9f84a85b3"
OPTIMIZED_SHA = "ee4fee7388eaf3e77ba01061e11d9a569e6e8684ce349ab86981a9408b33b5c3"
MARKER = "<!-- Blades of War: separate two-view male and well showcase -->"
OLD_PAGE = "BladesOfWar_Fixed_Camera.html"
PAGE = "BladesOfWar_Showcase.html"
ARCHIVE = "BladesOfWar_Dva_Rakursa.zip"
ORIGINAL = "male_13_november_original.glb"
OPTIMIZED = "male_13_november_optimized.glb"
LICENSES = ("LICENSE_CC0_ASSETS.md", "LICENSE_THREE.txt")

README = """BLADES OF WAR — МУЖЧИНА И КОЛОДЕЦ: ДВА РАКУРСА

КАК ОТКРЫТЬ
Распакуйте весь архив и откройте BladesOfWar_Showcase.html в современном
браузере с поддержкой WebGL. Интернет для просмотра не нужен.

НОВЫЙ РАКУРС
Внизу слева нажмите «Обычный ракурс»: мужчина будет показан в полный рост
примерно на уровне человека. Колодец в этом режиме временно скрыт, чтобы не
заслонять модель; кнопка «Сверху» возвращает колодец и прежнюю сцену.
Обычный ракурс нужен только для осмотра в витрине — это не изменение или
реализация приближения в игре. Для обеих камер свободное приближение и сдвиг
отключены. Вращайте камеру мышью, пальцем или кнопками со стрелками; «Начальный
вид» возвращает начальное направление текущего режима.

«Исходная» и «Облегчённая» переключают одного и того же мужчину в двух
вариантах, не меняя текущий ракурс и освещение. Кисти расслаблены, старая
статичная проба кулаков не включена. Женщины в витрине нет.

МОДЕЛИ
male_13_november_original.glb — прежняя исходная модель, 287 782 треугольника.
male_13_november_optimized.glb — прежняя облегчённая копия, 32 354 треугольника.
Обе модели побайтово совпадают с предыдущим архивом; в этом обновлении они не
переделывались. Сокращена была сетка головы, тело и уши сохранены. Внешность
близка к исходной, но упрощённая сетка не является её математической копией.

Это статичная витрина, не игра. Скелета, анимации и системы отсечения нет;
деформации и производительность реальной игры не проверялись. Подробный
колодец из предыдущей витрины сохранён без изменений. Оригинальные файлы и
предыдущий ZIP остаются на месте.

ИСТОЧНИКИ И ЛИЦЕНЗИИ
Модели и код колодца взяты из предыдущего архива BladesOfWar_Male_Fixed_Camera.zip.
В исходных материалах Human Basemeshes (pistachio) и уши MakeHuman указаны как
CC0; текст CC0 приложен в LICENSE_CC0_ASSETS.md. Текст MIT для Three.js находится
в LICENSE_THREE.txt. Это не объявляет всю игру CC0 или MIT.
"""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def triangle_count(glb: bytes) -> int:
    magic, version, length = struct.unpack_from("<4sII", glb)
    size, kind = struct.unpack_from("<I4s", glb, 12)
    if magic != b"glTF" or version != 2 or length != len(glb) or kind != b"JSON":
        raise ValueError("Not a complete GLB 2.0")
    doc = json.loads(glb[20:20 + size])
    if doc.get("skins") or doc.get("animations"):
        raise ValueError("Unexpected skin or animation in a static model")
    total = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            if primitive.get("mode", 4) != 4 or "indices" not in primitive:
                raise ValueError("Unexpected primitive")
            total += doc["accessors"][primitive["indices"]]["count"] // 3
    return total


def sources() -> tuple[bytes, bytes, str, dict[str, bytes]]:
    data = PREVIOUS.read_bytes()
    if sha(data) != PREVIOUS_SHA:
        raise ValueError("Previous, confirmed ZIP does not match its expected SHA-256")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        if z.testzip() is not None:
            raise ValueError("Previous ZIP is damaged")
        original, optimized = z.read(ORIGINAL), z.read(OPTIMIZED)
        old_page = z.read(OLD_PAGE).decode("utf-8")
        licenses = {name: z.read(name) for name in LICENSES}
    if sha(original) != ORIGINAL_SHA or sha(optimized) != OPTIMIZED_SHA:
        raise ValueError("The source models are not the confirmed two versions")
    if triangle_count(original) != 287782 or triangle_count(optimized) != 32354:
        raise ValueError("Unexpected triangle count")
    # Copy the entire validated Three.js and detailed-well bundle from the
    # previous viewer. No model, procedural well or engine is regenerated.
    start_marker = '<script type="module">'
    if old_page.count(start_marker) != 1 or old_page.count("const ORIGINAL_URI =") != 1:
        raise ValueError("Unexpected previous page layout")
    start = old_page.index(start_marker) + len(start_marker)
    end = old_page.index("const ORIGINAL_URI =", start)
    engine = old_page[start:end]
    if engine.count("function sp(") != 1 or "data:model/gltf-binary;base64," in engine:
        raise ValueError("Unexpected previous engine and well bundle")
    return original, optimized, engine, licenses


def make_html(original: bytes, optimized: bytes, engine: str) -> bytes:
    template = (HERE / "viewer.template.html").read_text(encoding="utf-8")
    substitutions = {
        "/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/": engine,
        "__ORIGINAL_DATA_URI__": "data:model/gltf-binary;base64," + base64.b64encode(original).decode("ascii"),
        "__OPTIMIZED_DATA_URI__": "data:model/gltf-binary;base64," + base64.b64encode(optimized).decode("ascii"),
        "__OPTIMIZED_TRIANGLES_NUMBER__": str(triangle_count(optimized)),
        "__OPTIMIZED_TRIANGLES__": f"{triangle_count(optimized):,}".replace(",", " "),
    }
    for key, value in substitutions.items():
        if template.count(key) != 1:
            raise ValueError(f"Expected one template marker: {key}")
        template = template.replace(key, value, 1)
    if template.count("data:model/gltf-binary;base64,") != 2 or "FIST_DELTAS" in template:
        raise ValueError("The showcase must embed only the two male models, no fist test")
    return (MARKER + "\n" + template).encode("utf-8")


def make_zip(html: bytes, original: bytes, optimized: bytes, licenses: dict[str, bytes]) -> bytes:
    entries = [(PAGE, html), (ORIGINAL, original), (OPTIMIZED, optimized), ("README.txt", README.encode("utf-8"))]
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
        raise ValueError("Choose a new output directory, not a source directory")
    index = output / "index.html"
    if index.exists() and not index.read_bytes().startswith(MARKER.encode()):
        raise ValueError(f"Refusing to overwrite an unrelated page: {index}")
    original, optimized, engine, licenses = sources()
    html = make_html(original, optimized, engine)
    archive = make_zip(html, original, optimized, licenses)
    info = {"previousZipSha256": PREVIOUS_SHA, "originalGlbSha256": sha(original),
            "optimizedGlbSha256": sha(optimized), "originalTriangles": triangle_count(original),
            "optimizedTriangles": triangle_count(optimized), "pageSha256": sha(html), "archiveSha256": sha(archive)}
    output.mkdir(parents=True, exist_ok=True)
    index.write_bytes(html)
    (output / ARCHIVE).write_bytes(archive)
    (output / "build-info.json").write_text(json.dumps(info, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Original and optimized GLBs copied unchanged: {sha(original)}, {sha(optimized)}")
    print(f"Standalone HTML: {len(html)} bytes, SHA-256 {sha(html)}")
    print(f"ZIP: {len(archive)} bytes, SHA-256 {sha(archive)}")
    print(f"Output: {output}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    build(parser.parse_args().output)


if __name__ == "__main__":
    main()
