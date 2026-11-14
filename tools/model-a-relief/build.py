#!/usr/bin/env python3
"""Make a reversible skin-and-light study from the approved model A v2.

Only the existing skin PNG is revised in the GLB; no geometry, UVs, normals,
materials or other textures are changed. The viewer reuses the original well
and lights; a female-only toggle changes the existing lights' settings.
"""
from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import importlib.util
import io
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / "work/character-model-search/selected-a/refined-v2/female_A_refined_v2.glb"
DEFAULT_OUTPUT = ROOT / "work/character-model-search/selected-a/relief-study"
SOURCE_SHA256 = "ce7e25dc4e4160595dd2d1e14bd68a8ea008eef7ae80d0db687a4d6c8002004c"
MODEL_NAME = "female_A_skin_relief.glb"
ARCHIVE_NAME = "female_A_skin_relief_and_well.zip"

spec = importlib.util.spec_from_file_location("_model_a_revision", ROOT / "tools/model-a-revision/build.py")
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load model A revision helpers")
revision = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = revision
spec.loader.exec_module(revision)
previous = revision.previous
helpers = revision.helpers

ARCHIVE_README = """Blades Of War — проба кожи и света для выбранной модели А

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Мышь вращает камеру, колесо меняет масштаб, правая
кнопка сдвигает сцену; кнопки переключают объекты и ракурсы. На телефоне
вращайте пальцем, двумя пальцами меняйте масштаб и сдвигайте сцену.

В режиме «Женщина А» флажок «Мягкий свет для Евы» переключает баланс
уже существующих источников света. В общей сцене и в режиме колодца
всегда включается прежний свет: колодец сохранён без изменений.

female_A_skin_relief.glb — отдельная проба: изменён только цвет существующей
текстуры кожи, очень мягко и без мелких пор. Геометрия, количество
треугольников, UV, нормали, брови, линии век, голубые глаза и их текстура
сохранены. Новых текстур, материалов, волос и источников света нет.
Изменение света находится в этой витрине, а не внутри GLB; в другом
просмотрщике внешний вид зависит от его освещения.

Предыдущая версия модели и архивы в репозитории не перезаписаны. Колодец
процедурно создаётся исходным кодом, отдельного GLB колодца нет. Мужской
модели в этой витрине нет. Ева статична: скелета, анимаций и морфов нет.

Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal. Текст лицензии:
LICENSE_MAKEHUMAN_ASSETS.md. Изображения из интернета в текстуру не включались.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_model(path: Path) -> bytes:
    data = path.read_bytes()
    if sha256(data) != SOURCE_SHA256:
        raise ValueError("Source is not the approved model A v2")
    return data


def gaussian_blur(array: np.ndarray, sigma: float) -> np.ndarray:
    """Separable Gaussian convolution, zero outside the image; NumPy only."""
    radius = int(4 * sigma + 0.5)
    offsets = np.arange(-radius, radius + 1, dtype=np.float64)
    kernel = np.exp(-0.5 * (offsets / sigma) ** 2)
    kernel = (kernel / kernel.sum()).astype(np.float32)
    result = np.asarray(array, dtype=np.float32)
    height, width = result.shape
    for axis in (0, 1):
        padding = ((radius, radius), (0, 0)) if axis == 0 else ((0, 0), (radius, radius))
        padded = np.pad(result, padding, mode="constant")
        output = np.zeros_like(result)
        for index, weight in enumerate(kernel):
            window = padded[index:index + height, :] if axis == 0 else padded[:, index:index + width]
            output += window * weight
        result = output
    return result


def uv_positions(positions: np.ndarray, uvs: np.ndarray, faces: np.ndarray,
                 size: int = 1024) -> tuple[np.ndarray, np.ndarray]:
    """Rasterize position in each UV triangle at texel centres.

    Body UV islands in the verified source are essentially non-overlapping.
    Position-based fields, symmetric about X, keep their colors continuous
    around split UV seams instead of introducing a separate 2D noise seam.
    """
    coords = np.zeros((size, size, 3), dtype=np.float32)
    valid = np.zeros((size, size), dtype=bool)
    positions, uvs = positions.astype(np.float64), uvs.astype(np.float64)
    for a, b, c in faces:
        u, v, w = uvs[[a, b, c]] * size - 0.5
        low = np.maximum(np.ceil(np.minimum(np.minimum(u, v), w)).astype(int), 0)
        high = np.minimum(np.floor(np.maximum(np.maximum(u, v), w)).astype(int), size - 1)
        if np.any(high < low):
            continue
        determinant = (v[1] - w[1]) * (u[0] - w[0]) + (w[0] - v[0]) * (u[1] - w[1])
        if abs(determinant) < 1e-12:
            continue
        xx, yy = np.meshgrid(np.arange(low[0], high[0] + 1), np.arange(low[1], high[1] + 1))
        t0 = ((v[1] - w[1]) * (xx - w[0]) + (w[0] - v[0]) * (yy - w[1])) / determinant
        t1 = ((w[1] - u[1]) * (xx - w[0]) + (u[0] - w[0]) * (yy - w[1])) / determinant
        t2 = 1 - t0 - t1
        hit = (t0 >= -1e-8) & (t1 >= -1e-8) & (t2 >= -1e-8)
        if not np.any(hit):
            continue
        ys, xs = yy[hit], xx[hit]
        xyz = t0[hit, None] * positions[a] + t1[hit, None] * positions[b] + t2[hit, None] * positions[c]
        missing = ~valid[ys, xs]
        coords[ys[missing], xs[missing]] = xyz[missing]
        valid[ys, xs] = True
    if not 650000 < np.count_nonzero(valid) < 660000:
        raise ValueError("Unexpected skin UV coverage")
    return coords, valid


def smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def skin_texture(raw: bytes, positions: np.ndarray, uvs: np.ndarray, faces: np.ndarray) -> bytes:
    image = Image.open(io.BytesIO(raw))
    if image.size != (1024, 1024) or image.mode != "RGB":
        raise ValueError("Unexpected source skin texture")
    pixels = np.asarray(image, dtype=np.float64)
    coords, valid = uv_positions(positions, uvs, faces)
    x, y, z = abs(coords[:, :, 0]), coords[:, :, 1], coords[:, :, 2]

    def gaussian(x0: float, y0: float, z0: float, sx: float, sy: float, sz: float) -> np.ndarray:
        return np.exp(-0.5 * (((x - x0) / sx) ** 2 + ((y - y0) / sy) ** 2 + ((z - z0) / sz) ** 2))

    def soft_box(value: np.ndarray, low: float, high: float, feather: float) -> np.ndarray:
        return smoothstep((value - (low - feather)) / feather) * smoothstep(((high + feather) - value) / feather)

    # A restrained, broad tone variation: no photographed skin, pores, painted
    # directional shadow, extra material, normal map or fine high-frequency noise.
    field = (0.45 * np.sin(13 * x + 4.1 * y - 10 * z) * np.sin(7 * y + 17 * z)
             + 0.32 * np.sin(23 * x - 19 * y + 9 * z + 0.4) * np.cos(11 * y + 8 * z)
             + 0.23 * np.sin(36 * x + 32 * y - 21 * z + 1.2))
    warmth = (0.90 * gaussian(0.041, 1.548, 0.111, 0.018, 0.018, 0.035)
              + 0.42 * gaussian(0.071, 1.540, 0.035, 0.018, 0.030, 0.060)
              + 0.35 * gaussian(0.080, 0.520, 0.040, 0.060, 0.080, 0.080)
              + 0.30 * gaussian(0.200, 1.010, 0.010, 0.055, 0.075, 0.100)
              + 0.15 * gaussian(0.140, 1.330, 0.045, 0.065, 0.055, 0.090))
    # Protect eye-area skin consistently on both sides of UV seams, and keep
    # the approved painted eyebrow patch completely byte-identical.
    eye = (soft_box(x, 0.010, 0.056, 0.006) * soft_box(y, 1.552, 1.599, 0.005)
           * soft_box(z, 0.090, 0.150, 0.010))
    field *= 1 - eye
    warmth *= 1 - eye
    delta = np.stack([1.9 * field + 1.0 * warmth,
                      1.5 * field - 2.4 * warmth,
                      1.3 * field - 2.2 * warmth], axis=-1)
    mask = valid.astype(np.float32)
    denominator = gaussian_blur(mask, 2.0)
    padded = np.stack([gaussian_blur(delta[:, :, channel] * mask, 2.0) /
                       np.maximum(denominator, 1e-6) for channel in range(3)], axis=-1)
    padded[denominator < 0.005] = 0

    # Existing stronger detail is preserved; gradually taper near its edges.
    reference_color = np.array([222, 195, 177], dtype=np.float64)
    distance = np.max(abs(pixels - reference_color), axis=-1)
    gate = np.clip((14 - distance) / 9, 0, 1)
    brows = np.zeros(valid.shape, dtype=np.float32)
    brows[449:606, 821:856] = 1
    gate *= 1 - gaussian_blur(brows, 2.5)
    gate[456:600, 824:854] = 0
    result = np.rint(np.clip(pixels + padded * gate[:, :, None] * 1.8, 0, 255)).astype(np.uint8)
    output = io.BytesIO()
    Image.fromarray(result, "RGB").save(output, format="PNG", optimize=True)
    return output.getvalue()


def build_model(source: bytes) -> bytes:
    document, binary = helpers.read_glb(source)
    if len(document["bufferViews"]) != 13 or document["nodes"][-1]["name"] != "upper_eyelid_line":
        raise ValueError("Unexpected approved model layout")
    positions = helpers.accessor(document, binary, 0)
    uvs = helpers.accessor(document, binary, 2)
    faces = helpers.accessor(document, binary, 3).reshape(-1, 3)
    views = [bytearray(binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
             for v in document["bufferViews"]]
    views[8] = bytearray(skin_texture(bytes(views[8]), positions, uvs, faces))
    return previous.pack_glb(copy.deepcopy(document), views)


def make_showcase(model: bytes, well_zip: Path) -> bytes:
    template = (HERE / "viewer.template.html").read_text("utf-8")
    bundle_marker = "/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/"
    model_marker = "__FEMALE_DATA_URI__"
    if template.count(bundle_marker) != 1 or template.count(model_marker) != 1:
        raise ValueError("Unexpected viewer template")
    uri = "data:model/gltf-binary;base64," + base64.b64encode(model).decode("ascii")
    return template.replace(bundle_marker, previous.well_engine_bundle(well_zip), 1).replace(model_marker, uri, 1).encode("utf-8")


def make_archive(model: bytes, html: bytes) -> bytes:
    entries = [
        ("BladesOfWar_Showcase.html", html),
        (MODEL_NAME, model),
        ("README.txt", ARCHIVE_README.encode("utf-8")),
        ("LICENSE_MAKEHUMAN_ASSETS.md", (previous.DATA / "LICENSE.ASSETS.md").read_bytes()),
    ]
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, content, compresslevel=9)
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--well-archive", type=Path, default=previous.DEFAULT_WELL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    model = build_model(source_model(args.source))
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f"GLB {len(model)} bytes SHA-256 {sha256(model)}")
    print(f"ZIP {len(archive)} bytes SHA-256 {sha256(archive)}")


if __name__ == "__main__":
    main()
