#!/usr/bin/env python3
"""Revise the approved model A's upper-lid line and breast shape only.

The previous, verified GLB is the source. The detailed well and the viewer code
come unchanged from the previous showcase; a new result is written separately.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import io
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / "work/character-model-search/selected-a/refined/female_A_refined.glb"
DEFAULT_OUTPUT = ROOT / "work/character-model-search/selected-a/refined-v2"
SOURCE_SHA256 = "5df2138963662f7630cd9674ccd8111d4bb415b270424401c4915f97e0810eac"
MAX_TARGET = HERE / "data/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target"
MAX_TARGET_SHA256 = "76737472bf148e69bd5e80da982b88aa0926b51ef9ea1ac6217da88d86cf55cf"
AVG_TARGET_SHA256 = "31f1d91824fcbb98ccf52f2c4d20c8e7c77c77ae596c58d1cf91c34801552b60"
CUP_WEIGHT = 0.42
MODEL_NAME = "female_A_refined_v2.glb"
ARCHIVE_NAME = "female_A_v2_and_detailed_well.zip"
LID_NODE = "upper_eyelid_line"

# Import the previous builder without changing it: its MakeHuman vertex map,
# normal transport, GLB reader/packer and well/viewer code are reused.
spec = importlib.util.spec_from_file_location("_model_a_previous_refinement", ROOT / "tools/model-a-refinement/build.py")
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load the previous model A builder")
previous = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = previous
spec.loader.exec_module(previous)
helpers = previous.lash_helpers
AVG_TARGET = previous.DATA / "targets/breast/female-young-averagemuscle-averageweight-averagecup-maxfirmness.target"

ARCHIVE_README = """Blades Of War — модель А, версия 2, и детализированный колодец

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Мышь вращает камеру, колесо меняет масштаб, правая
кнопка сдвигает сцену. Кнопки переключают модель, колодец и ракурсы.

female_A_refined_v2.glb — та же выбранная модель А. По сравнению с
предыдущей версией острые внешние стрелки удалены: над верхними веками
остались две непрерывные линии без отдельных волосков. Грудь увеличена и
локально сглажена. Голубые глаза, текстуры, лицо, ягодицы и остальная
геометрия тела сохранены; причёска не добавлялась.

Для более плавного силуэта в зоне груди локально добавлены вершины; вне
затронутых граней форма поверхности не меняется. Исходная версия модели и
исходные архивы в репозитории не перезаписаны.

Детализированный колодец создаётся тем же кодом из последнего архива проекта;
отдельного GLB колодца здесь нет. Мужской модели в этой витрине нет.
Женская модель статична: скелета, анимаций и морфов мимики в ней нет;
линии век не следуют за будущей анимацией автоматически.

Исходная А: коммит b093a0052a6be080d0364c8a5136cf74ae53dff3. Для формы
груди использованы данные MakeHuman из a8bc2d54ff0ac92e78ff71431b1023eda42bf482
под CC0 1.0 Universal; текст лицензии — LICENSE_MAKEHUMAN_ASSETS.md.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def source_model(path: Path) -> bytes:
    data = path.read_bytes()
    if sha256(data) != SOURCE_SHA256:
        raise ValueError("Source is not the approved refined model A")
    return data


def mapped_target(path: Path, expected_hash: str, mapping: np.ndarray) -> np.ndarray:
    if sha256(path.read_bytes()) != expected_hash:
        raise ValueError(f"Unexpected MakeHuman target: {path}")
    rows = np.loadtxt(path, dtype=np.float64)
    ids = rows[:, 0].astype(np.int64)
    if len(set(ids.tolist())) != len(ids) or ids.min() < 0 or ids.max() >= 19158:
        raise ValueError(f"Invalid native vertex indices: {path}")
    native = np.zeros((19158, 3), dtype=np.float64)
    native[ids] = rows[:, 1:4] * 0.1  # MakeHuman decimetres -> model metres.
    return native[mapping]


def breast_delta(mapping: np.ndarray) -> np.ndarray:
    maximum = mapped_target(MAX_TARGET, MAX_TARGET_SHA256, mapping)
    average = mapped_target(AVG_TARGET, AVG_TARGET_SHA256, mapping)
    return (maximum - average) * CUP_WEIGHT


def upper_lid_line(document: dict, binary: bytearray, positions: np.ndarray,
                   faces: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Remove the 12 wing rows per side and taper the existing upper-lid strips."""
    old = helpers.accessor(document, binary, 8)
    if old.shape != (2 * 73 * 7, 3):
        raise ValueError("Unexpected approved eyelid ribbon")
    strips = old.reshape(2, 73, 7, 3)[:, :61, :, :].copy()
    body = helpers.FrontSurface(positions, faces)
    eyes = helpers.FrontSurface(helpers.accessor(document, binary, 4),
                                helpers.accessor(document, binary, 7).reshape(-1, 3))
    # Keep the original ribbon over the eye; smoothly narrow its last six
    # rows, reprojecting them onto the same unmodified eyelid/eye surfaces.
    for side in range(2):
        for row_index in range(55, 61):
            row = strips[side, row_index]
            center = (row[0, 1] + row[-1, 1]) / 2
            t = (row_index - 55) / 5
            fade = t * t * (3 - 2 * t)
            width_scale = 1 - 0.96 * fade
            for column in range(7):
                x = float(row[column, 0])
                y = float(center + (row[column, 1] - center) * width_scale)
                z = max(body.depth(x, [y])[0], eyes.depth(x, [y])[0])
                if not np.isfinite(z):
                    raise ValueError("The upper-lid line left the eyelid surface")
                row[column, 1:] = [y, z + 0.00048]
    result = np.ascontiguousarray(strips.reshape(-1, 3), dtype="<f4")
    normals = np.tile([0, 0, 1], (len(result), 1)).astype("<f4")
    indices: list[int] = []
    for side in range(2):
        offset = side * 61 * 7
        for row in range(60):
            for column in range(6):
                a = offset + row * 7 + column
                b, c, d = a + 1, a + 7, a + 8
                indices.extend([a, d, c, a, b, d] if side == 0 else [a, c, d, a, d, b])
    return result, normals, np.asarray(indices, dtype="<u2")


def subdivide_breasts(original: np.ndarray, deformed: np.ndarray, normals: np.ndarray,
                      uvs: np.ndarray, faces: np.ndarray) -> tuple[np.ndarray, ...]:
    """Locally split changed chest triangles; keep their boundary exactly linear.

    A shared normal-guided midpoint rounds the interior of the enlarged patch.
    Neighboring triangles are also split when needed to avoid T-junctions; on
    the patch boundary their midpoints stay on the original edges. All original
    vertices remain in place. `parents` and `endpoints` allow independent QA of
    face orientation, UV interpolation and unaffected transition triangles.
    """
    changed = np.any(original != deformed, axis=1)
    selected = np.any(changed[faces], axis=1)
    _, representatives, groups = np.unique(original, axis=0, return_index=True, return_inverse=True)
    if not np.array_equal(deformed, deformed[representatives[groups]]):
        raise ValueError("Deformation separated a previously coincident seam")
    grouped_faces = groups[faces]
    group_normals = np.zeros((len(representatives), 3), dtype=np.float64)
    np.add.at(group_normals, groups, normals.astype(np.float64))
    group_normals = previous.normalize(group_normals)

    incidence: dict[tuple[int, int], list[int]] = defaultdict(list)
    for face_id, (a, b, c) in enumerate(grouped_faces):
        for u, v in ((a, b), (b, c), (c, a)):
            incidence[tuple(sorted((int(u), int(v))))].append(face_id)
    if any(len(adjacent) != 2 for adjacent in incidence.values()):
        raise ValueError("Expected a closed welded source body")

    midpoints: dict[tuple[int, int], np.ndarray] = {}
    for face_id in np.flatnonzero(selected):
        a, b, c = grouped_faces[face_id]
        for u, v in ((a, b), (b, c), (c, a)):
            midpoints[tuple(sorted((int(u), int(v))))] = np.empty(3)
    for edge in midpoints:
        a, b = edge
        start = deformed[representatives[a]].astype(np.float64)
        end = deformed[representatives[b]].astype(np.float64)
        point = (start + end) / 2
        # Curved midpoints are only used when both adjacent faces are edited.
        # Every edge bordering an unaffected face remains an exact midpoint.
        if all(selected[face_id] for face_id in incidence[edge]):
            vector = end - start
            offset = -(np.dot(vector, group_normals[a]) * group_normals[a]
                       - np.dot(vector, group_normals[b]) * group_normals[b]) / 8
            limit = np.linalg.norm(vector) * 0.15
            size = np.linalg.norm(offset)
            if size > limit:
                offset *= limit / size
            point += offset
        midpoints[edge] = point

    out_positions = list(deformed.astype(np.float64))
    out_normals = list(normals.astype(np.float64))
    out_uvs = list(uvs.astype(np.float64))
    edge_indices: dict[tuple[int, int], int] = {}
    endpoints: list[tuple[int, int]] = []
    out_faces: list[list[int]] = []
    parents: list[int] = []

    def midpoint(u: int, v: int) -> int | None:
        key = tuple(sorted((int(u), int(v))))
        group_key = tuple(sorted((int(groups[u]), int(groups[v]))))
        if group_key not in midpoints:
            return None
        if key not in edge_indices:
            edge_indices[key] = len(out_positions)
            endpoints.append(key)
            out_positions.append(midpoints[group_key])
            out_normals.append(previous.normalize(np.asarray([(normals[u] + normals[v]) * 0.5]))[0])
            out_uvs.append((uvs[u] + uvs[v]) * 0.5)
        return edge_indices[key]

    def add(face_id: int, triangle: list[int]) -> None:
        out_faces.append(triangle)
        parents.append(face_id)

    for face_id, (a, b, c) in enumerate(faces):
        edge = [midpoint(a, b), midpoint(b, c), midpoint(c, a)]
        count = sum(vertex is not None for vertex in edge)
        if count == 0:
            add(face_id, [a, b, c])
        elif count == 3:
            x, y, z = edge
            for triangle in ([a, x, z], [x, b, y], [z, y, c], [x, y, z]):
                add(face_id, triangle)
        elif count == 1:
            if edge[0] is not None:
                a, b, c, x = a, b, c, edge[0]
            elif edge[1] is not None:
                a, b, c, x = b, c, a, edge[1]
            else:
                a, b, c, x = c, a, b, edge[2]
            for triangle in ([a, x, c], [x, b, c]):
                add(face_id, triangle)
        else:  # Two split edges; rotate so they meet at b.
            if edge[0] is not None and edge[1] is not None:
                a, b, c, x, y = a, b, c, edge[0], edge[1]
            elif edge[1] is not None and edge[2] is not None:
                a, b, c, x, y = b, c, a, edge[1], edge[2]
            else:
                a, b, c, x, y = c, a, b, edge[2], edge[0]
            for triangle in ([a, x, c], [x, y, c], [x, b, y]):
                add(face_id, triangle)

    return (np.asarray(out_positions, dtype="<f4"), np.asarray(out_normals, dtype="<f4"),
            np.asarray(out_uvs, dtype="<f4"), np.asarray(out_faces, dtype="<u4"),
            np.asarray(parents, dtype=np.int64), np.asarray(endpoints, dtype=np.int64))


def build_model(source: bytes) -> bytes:
    document, binary = helpers.read_glb(source)
    if len(document["bufferViews"]) != 13 or document["nodes"][-1]["name"] != "upper_lashes_cat_eye":
        raise ValueError("Unexpected approved model structure")
    views = [bytearray(binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
             for v in document["bufferViews"]]
    positions = helpers.accessor(document, binary, 0)
    normals = helpers.accessor(document, binary, 1)
    uvs = helpers.accessor(document, binary, 2)
    faces = helpers.accessor(document, binary, 3).reshape(-1, 3)
    mapping = previous.vertex_map(len(positions))
    deformed = (positions + breast_delta(mapping)).astype("<f4")
    transported = previous.updated_normals(positions, deformed, normals, faces)
    new_positions, new_normals, new_uvs, new_faces, _, _ = subdivide_breasts(
        positions, deformed, transported, uvs, faces)
    lash_positions, lash_normals, lash_indices = upper_lid_line(document, binary, positions, faces)
    updated = copy.deepcopy(document)
    for view_index, accessor_index, array in (
        (0, 0, new_positions), (1, 1, new_normals), (2, 2, new_uvs),
        (3, 3, new_faces.reshape(-1, 1)), (10, 8, lash_positions),
        (11, 9, lash_normals), (12, 10, lash_indices.reshape(-1, 1)),
    ):
        views[view_index] = bytearray(array.tobytes())
        updated["accessors"][accessor_index]["count"] = len(array)
    for index, array in ((0, new_positions), (8, lash_positions)):
        updated["accessors"][index]["min"] = array.min(0).tolist()
        updated["accessors"][index]["max"] = array.max(0).tolist()
    updated["nodes"][-1]["name"] = LID_NODE
    updated["meshes"][-1]["name"] = LID_NODE
    updated["materials"][-1]["name"] = "upper_lid_deep_brown"
    return previous.pack_glb(updated, views)


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
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Approved refined model A")
    parser.add_argument("--well-archive", type=Path, default=previous.DEFAULT_WELL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    model = build_model(source_model(args.source))
    archive = make_archive(model, previous.make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f"GLB {len(model)} bytes SHA-256 {sha256(model)}")
    print(f"ZIP {len(archive)} bytes SHA-256 {sha256(archive)}")


if __name__ == "__main__":
    main()
