#!/usr/bin/env python3
"""Add separate upper eyelashes to the exact historical static model A.

The builder does not alter the source archive or any original geometry. The
original showcase HTML is copied byte-for-byte apart from its one embedded
female GLB. It needs NumPy and the archived showcase from commit b093a0052a6b.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import math
import struct
import zipfile
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SOURCE_ZIP_SHA256 = "5d52cb8ec2b7edd49732df090c8205d0732cb168b8de13ebc4a799b4c2bed648"
SOURCE_GLB_SHA256 = "23428079f47cf54b2a5dc9b4dc7799dbc7afb27a06f8f1a67a69972dc593f7ec"
RESULT_GLB = "female_A_with_lashes.glb"
RESULT_ZIP = "female_A_with_lashes_showcase.zip"

ARCHIVE_README = """Blades Of War — модель А с пробой ресниц

Как посмотреть:
1. Распакуйте весь архив.
2. Откройте BladesOfWar_Showcase.html в современном браузере с поддержкой WebGL.
   Подключение к интернету для витрины не требуется.
3. Кнопка «Женщина — исправлено» показывает выбранную модель А с ресницами.
   Ракурсы и вращение работают так же, как в исходной витрине.

Файлы модели:
- female_A_with_lashes.glb — выбранная модель с отдельной сеткой верхних ресниц.
- female_A_original.glb — та же исходная модель А без ресниц.
- README_original.txt — исходное описание архива и сведения о лицензии основы.

Ресницы — отдельный объект upper_lashes_cat_eye. Исходная геометрия тела,
лица и глаз, текстуры и пропорции сохранены. Причёски не добавлялись.

Витрина взята из исторического архива модели А. В ней показаны исторические
версии мужчины и колодца, а не последний колодец проекта; их код не менялся.
Текущие файлы проекта и текущий колодец не изменены.

Это статичная версия: в ней нет скелета, клипов анимации или мимических
морфов. Ресницы не будут автоматически двигаться при будущей анимации век.
Кнопка «Женщина — прошлая проба» показывает другую историческую модель,
а не А без ресниц; оригинальная А лежит отдельным GLB-файлом.

Источник: коммит b093a0052a6be080d0364c8a5136cf74ae53dff3,
BladesOfWar_исправленная_модель.zip, female_fixed.glb.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_glb(data: bytes) -> tuple[dict, bytearray]:
    magic, version, total = struct.unpack_from("<4sII", data, 0)
    if (magic, version, total) != (b"glTF", 2, len(data)):
        raise ValueError("Expected a complete glTF 2.0 binary")
    json_len, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("GLB JSON chunk is missing")
    document = json.loads(data[20 : 20 + json_len])
    binary_len, binary_type = struct.unpack_from("<II", data, 20 + json_len)
    if binary_type != 0x004E4942 or 28 + json_len + binary_len != len(data):
        raise ValueError("Unexpected GLB binary chunk")
    binary = bytearray(data[28 + json_len :])
    if document["buffers"][0]["byteLength"] != len(binary):
        raise ValueError("Unexpected original buffer layout")
    return document, binary


def accessor(document: dict, binary: bytearray, index: int) -> np.ndarray:
    acc = document["accessors"][index]
    view = document["bufferViews"][acc["bufferView"]]
    if view.get("byteStride"):
        raise ValueError("This source model should not contain interleaved accessors")
    dtype = {5126: "<f4", 5125: "<u4"}[acc["componentType"]]
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[acc["type"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(binary, dtype=dtype, count=acc["count"] * width, offset=start).reshape(-1, width).copy()


class FrontSurface:
    """Intersect the eye area with rays parallel to +Z, including both sides."""

    def __init__(self, vertices: np.ndarray, faces: np.ndarray):
        triangles = vertices[faces]
        area = (
            (triangles[:, :, 1].max(1) > 1.54)
            & (triangles[:, :, 1].min(1) < 1.59)
            & (np.abs(triangles[:, :, 0]).min(1) < 0.08)
        )
        self.triangles = triangles[area].astype(float)
        self.lo = self.triangles[:, :, :2].min(1)
        self.hi = self.triangles[:, :, :2].max(1)

    def depth(self, x: float, ys: np.ndarray | list[float]) -> np.ndarray:
        ys = np.asarray(ys, dtype=float)
        select = (
            (self.lo[:, 0] <= x + 1e-8)
            & (self.hi[:, 0] >= x - 1e-8)
            & (self.lo[:, 1] <= ys.max() + 1e-8)
            & (self.hi[:, 1] >= ys.min() - 1e-8)
        )
        tr = self.triangles[select]
        if len(tr) == 0:
            return np.full(len(ys), -np.inf)
        a, b, c = tr[:, 0, :2], tr[:, 1, :2], tr[:, 2, :2]
        den = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
        den = np.where(np.abs(den) > 1e-13, den, np.nan)
        y = ys[:, None]
        wa = ((b[:, 1] - c[:, 1]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (y - c[:, 1])) / den
        wb = ((c[:, 1] - a[:, 1]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (y - c[:, 1])) / den
        wc = 1 - wa - wb
        inside = (wa >= -1e-7) & (wb >= -1e-7) & (wc >= -1e-7)
        z = wa * tr[:, 0, 2] + wb * tr[:, 1, 2] + wc * tr[:, 2, 2]
        return np.max(np.where(inside, z, -np.inf), axis=1)


def smoothstep(t: float) -> float:
    t = max(0, min(1, t))
    return t * t * (3 - 2 * t)


def build_lashes(source: bytes) -> bytes:
    document, binary = read_glb(source)
    if len(document["nodes"]) != 3 or len(document["meshes"]) != 2:
        raise ValueError("Unexpected model A scene topology")
    body = FrontSurface(accessor(document, binary, 0), accessor(document, binary, 3).reshape(-1, 3))
    eyes = FrontSurface(accessor(document, binary, 4), accessor(document, binary, 7).reshape(-1, 3))

    def front_depth(x: float, y: float) -> float:
        z = max(body.depth(x, [y])[0], eyes.depth(x, [y])[0])
        if not np.isfinite(z):
            raise ValueError(f"No eye-area surface at ({x:.6f}, {y:.6f})")
        return float(z)

    vertices: list[list[float]] = []
    normals: list[list[float]] = []
    indices: list[int] = []

    def vertex(point, normal) -> int:
        vertices.append(list(map(float, point)))
        normals.append(list(map(float, normal)))
        return len(vertices) - 1

    for side in (-1, 1):
        # Find the visible upper margin from the actual, unaltered body and eyes.
        xs = np.linspace(0.0190, 0.0420, 61)
        ys = np.linspace(1.558, 1.574, 1281)
        edge = []
        for x in xs:
            body_z = body.depth(side * x, ys)
            eye_z = eyes.depth(side * x, ys)
            visible = (eye_z > body_z + 1e-6) & np.isfinite(eye_z)
            if not visible.any():
                raise ValueError(f"No visible eye edge at x={side * x:.6f}")
            edge.append(ys[np.flatnonzero(visible)[-1]])
        edge = np.asarray(edge)
        x_all = list(xs)
        bottom = list(edge - 0.00028)
        widths = []
        for k in range(len(xs)):
            t = k / (len(xs) - 1)
            widths.append(0.00028 + 0.00075 * math.sin(math.pi * t) ** 0.75 + 0.00110 * smoothstep((t - 0.48) / 0.48))

        # Short, raised taper at the outer corner, as in the supplied reference.
        x0, y0, w0 = xs[-1], bottom[-1], widths[-1]
        for u in np.linspace(0, 1, 13)[1:]:
            x_all.append(x0 + (0.0458 - x0) * u)
            bottom.append(y0 + 0.0018 * u + 0.00005 * math.sin(math.pi * u))
            widths.append(0.000012 + w0 * (1 - u) ** 1.12)

        # A subdivided strip follows the eyelid depth without altering the skin.
        strip: list[list[int]] = []
        for x, y0, width in zip(x_all, bottom, widths):
            row = []
            for yf in np.linspace(0, 1, 7):
                y = y0 + width * yf
                xx = side * x
                row.append(vertex([xx, y, front_depth(xx, y) + 0.00048], [0, 0, 1]))
            strip.append(row)
        for i in range(len(strip) - 1):
            for k in range(len(strip[i]) - 1):
                a, b = strip[i][k], strip[i][k + 1]
                c, d = strip[i + 1][k], strip[i + 1][k + 1]
                indices.extend([a, c, d, a, d, b] if side == 1 else [a, d, c, a, b, d])

        # Narrow tapered 3D filaments fan out; their roots overlap the strip.
        positions = [0.15, 0.205, 0.262, 0.317, 0.365, 0.415, 0.463, 0.510, 0.556, 0.602,
                     0.646, 0.690, 0.732, 0.773, 0.810, 0.845, 0.878, 0.910, 0.938]
        for lash_i, t in enumerate(positions):
            x = float(np.interp(t, np.linspace(0, 1, len(xs)), xs))
            eye_edge = float(np.interp(x, xs, edge))
            width = float(np.interp(x, xs, np.asarray(widths[: len(xs)])))
            root_y, root_x = eye_edge - 0.00028 + width * 0.73, side * x
            fan = smoothstep((t - 0.15) / 0.79)
            variation = 1 + 0.13 * math.sin(lash_i * 2.32) + 0.05 * math.sin(lash_i * 4.15)
            length = (0.00070 + 0.00155 * fan) * variation
            sweep = (0.00028 + 0.00170 * fan) * (1 + 0.12 * math.sin(lash_i * 1.51))
            radius = (0.000115 + 0.000050 * fan) * (1 + 0.08 * math.sin(lash_i * 1.9))
            centers = []
            for u in np.linspace(0, 1, 6):
                xx, y = root_x + side * sweep * u ** 1.32, root_y + length * u
                centers.append(np.array([xx, y, front_depth(xx, y) + 0.00052 + 0.00055 * u]))
            centers = np.asarray(centers)
            tangents = np.gradient(centers, axis=0)
            tangents /= np.maximum(np.linalg.norm(tangents, axis=1)[:, None], 1e-9)
            rings: list[list[int]] = []
            for k, (center, tangent) in enumerate(zip(centers, tangents)):
                u = k / (len(centers) - 1)
                e1 = np.array([-tangent[1], tangent[0], 0])
                e1 /= max(np.linalg.norm(e1), 1e-9)
                e2 = np.cross(tangent, e1)
                e2 /= max(np.linalg.norm(e2), 1e-9)
                r = radius * (1 - u) ** 1.2 + 0.000006
                ring = []
                for phi in np.linspace(0, 2 * math.pi, 5)[:-1]:
                    normal = e1 * math.cos(phi) + e2 * math.sin(phi)
                    ring.append(vertex(center + normal * r, normal))
                rings.append(ring)
            for k in range(len(rings) - 1):
                for p in range(4):
                    q = (p + 1) % 4
                    a, b = rings[k][p], rings[k][q]
                    c, d = rings[k + 1][p], rings[k + 1][q]
                    indices.extend([a, c, d, a, d, b])

    def append_accessor(data, shape: str, component: int, target: int, *, bounds=False) -> int:
        arr = np.ascontiguousarray(data, dtype={5126: "<f4", 5123: "<u2"}[component])
        while len(binary) % 4:
            binary.append(0)
        view = len(document["bufferViews"])
        document["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": arr.nbytes, "target": target})
        binary.extend(arr.tobytes())
        acc = {"bufferView": view, "componentType": component, "count": len(arr), "type": shape}
        if bounds:
            acc.update(min=[float(x) for x in arr.min(0)], max=[float(x) for x in arr.max(0)])
        index = len(document["accessors"])
        document["accessors"].append(acc)
        return index

    if not np.isfinite(vertices).all() or len(vertices) >= 65536:
        raise ValueError("Invalid eyelash vertex data")
    p = append_accessor(vertices, "VEC3", 5126, 34962, bounds=True)
    n = append_accessor(normals, "VEC3", 5126, 34962)
    faces = append_accessor(np.asarray(indices).reshape(-1, 1), "SCALAR", 5123, 34963)
    material = len(document["materials"])
    document["materials"].append({"name": "upper_lashes_dark_brown", "doubleSided": True,
                                  "pbrMetallicRoughness": {"baseColorFactor": [0.025, 0.012, 0.009, 1.0],
                                                           "metallicFactor": 0.0, "roughnessFactor": 0.9}})
    mesh = len(document["meshes"])
    document["meshes"].append({"name": "upper_lashes_cat_eye", "primitives": [
        {"attributes": {"POSITION": p, "NORMAL": n}, "indices": faces, "material": material}]})
    node = len(document["nodes"])
    document["nodes"].append({"name": "upper_lashes_cat_eye", "mesh": mesh})
    document["nodes"][0]["children"].append(node)
    document["buffers"][0]["byteLength"] = len(binary)
    js = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


def build_archive(source_path: Path, out: Path) -> None:
    source_zip = source_path.read_bytes()
    if sha256(source_zip) != SOURCE_ZIP_SHA256:
        raise ValueError("Input is not the original archive from b093a0052a6b")
    with zipfile.ZipFile(source_path) as archive:
        original = archive.read("female_fixed.glb")
        html = archive.read("BladesOfWar_Showcase.html")
        original_readme = archive.read("README.txt")
    if sha256(original) != SOURCE_GLB_SHA256:
        raise ValueError("Unexpected original model A")
    modified = build_lashes(original)
    uri = b"data:model/gltf-binary;base64,"
    old_embedded, new_embedded = uri + base64.b64encode(original), uri + base64.b64encode(modified)
    if html.count(old_embedded) != 1:
        raise ValueError("Expected one embedded copy of model A in the source showcase")
    showcase = html.replace(old_embedded, new_embedded, 1)
    out.mkdir(parents=True, exist_ok=True)
    (out / RESULT_GLB).write_bytes(modified)
    entries = [
        ("BladesOfWar_Showcase.html", showcase),
        (RESULT_GLB, modified),
        ("female_A_original.glb", original),
        ("README.txt", ARCHIVE_README.encode("utf-8")),
        ("README_original.txt", original_readme),
    ]
    with zipfile.ZipFile(out / RESULT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as result:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            result.writestr(info, data, compresslevel=9)
    print(f"GLB: {out / RESULT_GLB} ({len(modified)} bytes), SHA-256 {sha256(modified)}")
    print(f"ZIP: {out / RESULT_ZIP}, SHA-256 {sha256((out / RESULT_ZIP).read_bytes())}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Original BladesOfWar_исправленная_модель.zip")
    parser.add_argument("--output", type=Path, default=ROOT / "work/character-model-search/selected-a")
    args = parser.parse_args()
    build_archive(args.source, args.output)


if __name__ == "__main__":
    main()
