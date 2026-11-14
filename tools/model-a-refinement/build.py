#!/usr/bin/env python3
"""Revise the selected static model A and pair it with the latest detailed well.

The model uses a verified historical GLB and a verified UV-to-MakeHuman vertex
map. Only the requested body regions, brow pixels, and cat-eye lash mesh change.
The original well/Three.js code is copied from the verified project archive.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import importlib.util
import io
import json
import math
import struct
import sys
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DATA = HERE / "makehuman"
SOURCE_MODEL_SHA = "23428079f47cf54b2a5dc9b4dc7799dbc7afb27a06f8f1a67a69972dc593f7ec"
SOURCE_WELL_ZIP_SHA = "4c3d421eca3b5c9536a5b25958e4350c4d3ebd9d218ad57c00038907783ac9bc"
VERTEX_MAP_SHA = "9d3c0c7f72aa1943235508f031454c8a12bb45e796f29a07347b7f7ff6b60246"
MODEL_NAME = "female_A_refined.glb"
ARCHIVE_NAME = "female_A_and_detailed_well.zip"
DEFAULT_SOURCE = ROOT / "work/character-model-search/selected-a/female_A_with_lashes_showcase.zip"
DEFAULT_WELL = ROOT / "BladesOfWar_Adam_Eve_Showcase (3).zip"
DEFAULT_OUTPUT = ROOT / "work/character-model-search/selected-a/refined"

# These are MakeHuman CC0 target deltas on the original topology. We use small
# weights; the model's existing pose, eyes, skin, and remaining body are retained.
TARGETS = {
    "nose/nose-scale-horiz-decr.target": 0.42,
    "nose/nose-nostrils-width-decr.target": 0.20,
    "nose/nose-point-width-decr.target": 0.08,
    "ears/l-ear-shape-round.target": 0.45,
    "ears/r-ear-shape-round.target": 0.45,
    "ears/l-ear-flap-decr.target": 0.24,
    "ears/r-ear-flap-decr.target": 0.24,
    "ears/l-ear-scale-decr.target": 0.12,
    "ears/r-ear-scale-decr.target": 0.12,
    "breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target": 0.68,
    "breast/breast-volume-vert-up.target": 0.22,
    "breast/breast-point-decr.target": 0.45,
    "breast/breast-dist-decr.target": 0.14,
    "buttocks/buttocks-volume-decr.target": 0.45,
}

# Reuse the source GLB reader and eye-surface intersection from the previous
# version without importing its build.py under the ambiguous name "build".
_spec = importlib.util.spec_from_file_location("_model_a_lash_helpers", ROOT / "tools/model-a-lashes/build.py")
if _spec is None or _spec.loader is None:
    raise RuntimeError("Cannot load the original model A helpers")
lash_helpers = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = lash_helpers
_spec.loader.exec_module(lash_helpers)

ARCHIVE_README = """Blades Of War — модель А и детализированный колодец

Откройте BladesOfWar_Showcase.html после распаковки в браузере с WebGL.
Интернет не нужен. Мышь: вращение, колесо: масштаб, правая кнопка: сдвиг.
Кнопки справа переключают женщину, колодец, общую сцену и ракурсы.

female_A_refined.glb — отдельная модель А с переработанными кошачьими
ресницами без отдельных волосков и обновлёнными бровями. По просьбе также
аккуратно изменены нос, уши, грудь и ягодицы. Голубые глаза и остальные
части тела сохранены; причёски не добавлялись.

Колодец взят из BladesOfWar_Adam_Eve_Showcase (3).zip: его подробная
геометрия, материалы и код сохранены. В данной витрине мужской модели нет;
исходные архивы и мужская модель в репозитории при этом не удалялись.

Женская модель статичная: скелета, анимационных клипов и морфов мимики нет;
ресницы не будут автоматически следовать будущей анимации век.

Основа: женская модель А из коммита b093a0052a6be080d0364c8a5136cf74ae53dff3.
По README исходной модели, её основа MakeHuman и низкополигональные глаза
(MakeHuman / MPFB2) — CC0 1.0 Universal; добавленные MakeHuman targets также
CC0. Полный текст для assets см. LICENSE_MAKEHUMAN_ASSETS.md. Фотографии в
файл модели не копировались: они использовались только для визуального изучения.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def original_model(source: Path) -> bytes:
    if source.suffix.lower() == ".glb":
        model = source.read_bytes()
    else:
        with zipfile.ZipFile(source) as archive:
            choices = ["female_A_original.glb", "female_fixed.glb"]
            found = [name for name in choices if name in archive.namelist()]
            if len(found) != 1:
                raise ValueError("Source ZIP must contain exactly one original model A")
            model = archive.read(found[0])
    if sha256(model) != SOURCE_MODEL_SHA:
        raise ValueError("The source is not the selected historical model A")
    return model


def vertex_map(count: int) -> np.ndarray:
    data = (DATA / "model-a-vertex-map.u16").read_bytes()
    if sha256(data) != VERTEX_MAP_SHA:
        raise ValueError("The MakeHuman topology map has changed")
    result = np.frombuffer(data, dtype="<u2")
    if len(result) != count or result.max() >= 19158:
        raise ValueError("The MakeHuman topology map does not fit the source GLB")
    return result


def target_deltas(mapping: np.ndarray) -> np.ndarray:
    result = np.zeros((len(mapping), 3), dtype=np.float64)
    for relative_path, weight in TARGETS.items():
        rows = np.loadtxt(DATA / "targets" / relative_path, dtype=np.float64)
        native_ids = rows[:, 0].astype(np.int64)
        if len(set(native_ids.tolist())) != len(native_ids) or native_ids.min() < 0 or native_ids.max() >= 19158:
            raise ValueError(f"Invalid target indices in {relative_path}")
        native = np.zeros((19158, 3), dtype=np.float64)
        # MakeHuman's original coordinates are in decimetres; this GLB is in metres.
        native[native_ids] = rows[:, 1:4] * 0.1
        result += native[mapping] * weight
    return result


def normalize(vectors: np.ndarray) -> np.ndarray:
    return vectors / np.maximum(np.linalg.norm(vectors, axis=1)[:, None], 1e-12)


def updated_normals(old: np.ndarray, new: np.ndarray, original: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Transport original normals by the change of the welded face normals."""
    keys = np.column_stack([np.round(old * 1e6).astype(np.int64), np.round(original * 100).astype(np.int64)])
    _, groups = np.unique(keys, axis=0, return_inverse=True)

    def smooth_normals(points: np.ndarray) -> np.ndarray:
        tri = points[faces]
        face_normal = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
        accumulated = np.zeros_like(points, dtype=np.float64)
        for k in range(3):
            np.add.at(accumulated, faces[:, k], face_normal)
        welded = np.zeros((groups.max() + 1, 3), dtype=np.float64)
        np.add.at(welded, groups, accumulated)
        return normalize(welded[groups])

    normal_delta = smooth_normals(new) - smooth_normals(old)
    result = normalize(original.astype(np.float64) + normal_delta).astype("<f4")
    unchanged = np.max(abs(normal_delta), axis=1) < 1e-12
    result[unchanged] = original[unchanged]
    return result


def painted_brows(raw: bytes) -> bytes:
    """Repaint only the two brows in the existing UV face island."""
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    if image.size != (1024, 1024):
        raise ValueError("Unexpected source skin texture size")
    pixels = np.asarray(image).copy()
    before = pixels.copy()
    # The old dark brows occupy a narrow strip; nearby unpainted skin is used
    # to remove them. Do not overwrite the neighboring eye-socket shading.
    for y0, y1 in [(470, 520), (537, 591)]:
        for y in range(y0, y1):
            for x in range(832, 846):
                fade = min(1, max(0, (x - 831) / 2), max(0, (846 - x) / 2),
                           max(0, (y - (y0 - 1)) / 2), max(0, (y1 - y) / 2))
                skin = pixels[y, 829].astype(float) + (pixels[y, 832].astype(float) - pixels[y, 829].astype(float)) * (x - 829) / 3
                pixels[y, x] = np.rint((1 - fade) * before[y, x].astype(float) + fade * np.clip(skin, 0, 255)).astype("uint8")

    image = Image.fromarray(pixels, "RGB").convert("RGBA")
    # Work at six times the texture resolution, but only in a small patch.
    scale, ox, oy, width, height = 6, 824, 456, 30, 144
    overlay = Image.new("RGBA", (width * scale, height * scale))
    draw = ImageDraw.Draw(overlay)
    center = 0.5168333 * 1024
    for side in (1, -1):
        left, right = [], []
        for t in np.linspace(0, 1, 151):
            y = center + side * (515 - 47 * t - center)
            x = 841.3 - 3.4 * math.sin(math.pi * t ** 1.35) + 0.70 * t
            head = lash_helpers.smoothstep(t / 0.16)
            tail = lash_helpers.smoothstep((1 - t) / 0.21)
            radius = 0.67 * (1.85 + 0.30 * (1 - t)) * head * tail
            left.append((round((x - radius - ox) * scale), round((y - oy) * scale)))
            right.append((round((x + radius - ox) * scale), round((y - oy) * scale)))
        draw.polygon(left + right[::-1], fill=(88, 55, 43, int(255 * 0.55)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.48 * scale)).resize((width, height), Image.Resampling.LANCZOS)
    image.alpha_composite(overlay, (ox, oy))
    out = io.BytesIO()
    image.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()


def add_cat_eye(document: dict, views: list[bytearray], original_binary: bytearray,
                positions: np.ndarray, faces: np.ndarray) -> None:
    """Add exactly two continuous upper-lid ribbons, no individual hairs."""
    eyes = lash_helpers.accessor(document, original_binary, 4)
    eye_faces = lash_helpers.accessor(document, original_binary, 7).reshape(-1, 3)
    body_surface = lash_helpers.FrontSurface(positions, faces)
    eye_surface = lash_helpers.FrontSurface(eyes, eye_faces)

    def front_depth(x: float, y: float) -> float:
        z = max(body_surface.depth(x, [y])[0], eye_surface.depth(x, [y])[0])
        if not np.isfinite(z):
            raise ValueError(f"Missing eyelid surface at {x:.6f}, {y:.6f}")
        return float(z)

    vertices: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []
    for side in (-1, 1):
        xs = np.linspace(0.019, 0.042, 61)
        ys = np.linspace(1.558, 1.574, 1281)
        edge = []
        for x in xs:
            body_z = body_surface.depth(side * x, ys)
            eye_z = eye_surface.depth(side * x, ys)
            visible = (eye_z > body_z + 1e-6) & np.isfinite(eye_z)
            if not visible.any():
                raise ValueError(f"No visible eye edge at {side * x:.6f}")
            edge.append(ys[np.flatnonzero(visible)[-1]])
        all_x = list(xs)
        bottom = list(np.asarray(edge) - 0.00028)
        widths = []
        for k in range(len(xs)):
            t = k / (len(xs) - 1)
            widths.append(0.00028 + 0.00075 * math.sin(math.pi * t) ** 0.75
                          + 0.00110 * lash_helpers.smoothstep((t - 0.48) / 0.48))
        x0, y0, w0 = xs[-1], bottom[-1], widths[-1]
        for u in np.linspace(0, 1, 13)[1:]:
            all_x.append(x0 + (0.0458 - x0) * u)
            bottom.append(y0 + 0.0018 * u + 0.00005 * math.sin(math.pi * u))
            widths.append(0.000012 + w0 * (1 - u) ** 1.12)

        strip = []
        for x, y0, width in zip(all_x, bottom, widths):
            row = []
            for yf in np.linspace(0, 1, 7):
                y, xx = y0 + width * yf, side * x
                row.append(len(vertices))
                vertices.append([xx, y, front_depth(xx, y) + 0.00048])
                normals.append([0, 0, 1])
            strip.append(row)
        for i in range(len(strip) - 1):
            for k in range(len(strip[i]) - 1):
                a, b = strip[i][k], strip[i][k + 1]
                c, d = strip[i + 1][k], strip[i + 1][k + 1]
                indices.extend([a, c, d, a, d, b] if side == 1 else [a, d, c, a, b, d])

    def append_accessor(data, kind: str, component: int, target: int, bounds: bool = False) -> int:
        array = np.ascontiguousarray(data, dtype={5126: "<f4", 5123: "<u2"}[component])
        view_index = len(views)
        views.append(bytearray(array.tobytes()))
        document["bufferViews"].append({"buffer": 0, "byteLength": array.nbytes, "target": target})
        accessor = {"bufferView": view_index, "componentType": component, "count": len(array), "type": kind}
        if bounds:
            accessor.update(min=array.min(0).tolist(), max=array.max(0).tolist())
        index = len(document["accessors"])
        document["accessors"].append(accessor)
        return index

    p = append_accessor(vertices, "VEC3", 5126, 34962, True)
    n = append_accessor(normals, "VEC3", 5126, 34962)
    triangles = append_accessor(np.asarray(indices).reshape(-1, 1), "SCALAR", 5123, 34963)
    material = len(document["materials"])
    document["materials"].append({"name": "cat_eye_deep_brown", "doubleSided": True,
                                  "pbrMetallicRoughness": {"baseColorFactor": [0.025, 0.012, 0.009, 1.0],
                                                           "metallicFactor": 0.0, "roughnessFactor": 0.9}})
    mesh = len(document["meshes"])
    document["meshes"].append({"name": "upper_lashes_cat_eye", "primitives": [
        {"attributes": {"POSITION": p, "NORMAL": n}, "indices": triangles, "material": material}]})
    node = len(document["nodes"])
    document["nodes"].append({"name": "upper_lashes_cat_eye", "mesh": mesh})
    document["nodes"][0]["children"].append(node)


def pack_glb(document: dict, views: list[bytearray]) -> bytes:
    binary = bytearray()
    if len(views) != len(document["bufferViews"]):
        raise ValueError("Buffer view mismatch")
    for view, data in zip(document["bufferViews"], views):
        binary += b"\0" * (-len(binary) % 4)
        view["byteOffset"] = len(binary)
        view["byteLength"] = len(data)
        binary += data
    binary += b"\0" * (-len(binary) % 4)
    document["buffers"][0]["byteLength"] = len(binary)
    text = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    total = 28 + len(text) + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(text), 0x4E4F534A) + text
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def build_model(source: bytes) -> bytes:
    document, original_binary = lash_helpers.read_glb(source)
    if len(document["nodes"]) != 3 or len(document["meshes"]) != 2 or len(document["bufferViews"]) != 10:
        raise ValueError("Unexpected source model structure")
    views = [bytearray(original_binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
             for v in document["bufferViews"]]
    positions = lash_helpers.accessor(document, original_binary, 0)
    normals = lash_helpers.accessor(document, original_binary, 1)
    faces = lash_helpers.accessor(document, original_binary, 3).reshape(-1, 3)
    mapping = vertex_map(len(positions))
    changed = (positions + target_deltas(mapping)).astype("<f4")
    views[0] = bytearray(changed.tobytes())
    views[1] = bytearray(updated_normals(positions, changed, normals, faces).tobytes())
    document["accessors"][0]["min"] = changed.min(0).tolist()
    document["accessors"][0]["max"] = changed.max(0).tolist()
    views[8] = bytearray(painted_brows(bytes(views[8])))
    add_cat_eye(document, views, original_binary, changed, faces)
    return pack_glb(document, views)


def well_engine_bundle(source_zip: Path) -> str:
    data = source_zip.read_bytes()
    if sha256(data) != SOURCE_WELL_ZIP_SHA:
        raise ValueError("Expected the original latest BladesOfWar_Adam_Eve_Showcase (3).zip")
    with zipfile.ZipFile(source_zip) as archive:
        html = archive.read("BladesOfWar_Showcase.html").decode("utf-8")
    marker = '<script type="module">'
    start = html.index(marker) + len(marker)
    end = html.index("const FEMALE_URI =", start)
    bundle = html[start:end]
    if bundle.count("function sp(") != 1 or "data:model/gltf-binary;base64," in bundle:
        raise ValueError("Unexpected latest well/engine bundle layout")
    return bundle


def make_showcase(model: bytes, well_zip: Path) -> bytes:
    template = (HERE / "viewer.template.html").read_text("utf-8")
    bundle_marker = "/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/"
    model_marker = "__FEMALE_DATA_URI__"
    if template.count(bundle_marker) != 1 or template.count(model_marker) != 1:
        raise ValueError("Unexpected viewer template")
    uri = "data:model/gltf-binary;base64," + base64.b64encode(model).decode("ascii")
    return template.replace(bundle_marker, well_engine_bundle(well_zip), 1).replace(model_marker, uri, 1).encode("utf-8")


def make_archive(model: bytes, html: bytes) -> bytes:
    entries = [
        ("BladesOfWar_Showcase.html", html),
        (MODEL_NAME, model),
        ("README.txt", ARCHIVE_README.encode("utf-8")),
        ("LICENSE_MAKEHUMAN_ASSETS.md", (DATA / "LICENSE.ASSETS.md").read_bytes()),
    ]
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, content, compresslevel=9)
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Original model A or previous archive")
    parser.add_argument("--well-archive", type=Path, default=DEFAULT_WELL, help="Latest detailed-well project archive")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    model = build_model(original_model(args.source))
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f"GLB {len(model)} bytes SHA-256 {sha256(model)}")
    print(f"ZIP {len(archive)} bytes SHA-256 {sha256(archive)}")


if __name__ == "__main__":
    main()
