#!/usr/bin/env python3
"""Make a separate, reproducible brow/blink/fist study of the approved model A.

The neutral model is the prior relief study.  Only the existing painted brows
change at rest.  Facial and hand motion are glTF morph targets plus short clips;
no rig is claimed in the exported model.  The latest well is reused unchanged.
"""
from __future__ import annotations

import argparse
import base64
import copy
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
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation
import trimesh

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = ROOT / "work/character-model-search/selected-a/relief-study/female_A_skin_relief.glb"
DEFAULT_RIG = ROOT / "work/character-showcase/prototype/assets/models/female_fixed.glb"
DEFAULT_OUTPUT = ROOT / "work/character-model-search/selected-a/motion-study"
SOURCE_SHA256 = "9d79a868a388f07443968e334da7f6b0b2be0f7515824f7b0535549eae11b425"
RIG_SHA256 = "bbde88441ee4f32f640e5a5a0d81b06989328ee5afede2732c42c4e5ef8ff158"
TARGETS = {
    "eye-left-closure.target": "e38cb77fd888de3d0d944efe6f3511bf3ca4076b0397fa7c840d8368f08205c2",
    "eye-right-closure.target": "58faf2c199272bfd87478ea122cdaa4b4b8669505be0d75f777c5471527b2b15",
}
ORIGINAL_VERTICES = 14517
BROW_SHIFT_PIXELS = 1.25  # U increases down the face in this UV island.
MODEL_NAME = "female_A_motion.glb"
ARCHIVE_NAME = "female_A_motion_and_well.zip"

spec = importlib.util.spec_from_file_location("_model_a_relief", ROOT / "tools/model-a-relief/build.py")
if spec is None or spec.loader is None:
    raise RuntimeError("Cannot load the previous builder")
relief = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = relief
spec.loader.exec_module(relief)
previous = relief.previous
helpers = relief.helpers

ARCHIVE_README = """Blades Of War — модель А: брови, моргание и кулаки

Распакуйте архив и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. Мышь вращает камеру, колесо меняет масштаб, правая
кнопка сдвигает сцену; на телефоне вращайте пальцем и масштабируйте двумя.

«Моргнуть» запускает моргание, «Автоморгание» включает периодическое
моргание, «Закрыть глаза» позволяет рассмотреть его. Флажок «Кулаки»
переключает обе кисти между исходной открытой и слегка сжатой позой.
Кнопки «Лицо крупно», «Кисти крупно», «Левая кисть» и «Правая кисть»
помогают рассмотреть изменения.

female_A_motion.glb содержит тот же нейтральный силуэт, со слегка опущенным
рисунком бровей, и морф-цели Blink и Fists. Линия верхних век следует за
морганием и сужается при закрытии; индивидуальные ресницы/стрелки не добавлены.
Есть glTF-клипы Blink_Once, Fists_Close, Fists_Open. Модель не содержит
скелета: это одна фиксированная пара поз кистей, не полноценный риг пальцев.
В движке клипы надо запускать однократно; удержание позы и автоматическое
повторение моргания организуются игровым кодом. Для ручного управления:
face_blink.Blink = b, upper_eyelid_line.Blink = b,
upper_eyelid_line.BlinkLineNarrow = min(1, 2*b), body.Fists = f,
где b и f находятся в пределах 0..1. Названия и шкала зависят от импортёра.
Лицевой участок и тело разделены по граням, чтобы клипы не управляли одной
и той же группой весов и могли работать одновременно. Это один дополнительный
меш/вызов отрисовки; число треугольников не изменилось. Память под морфы,
импорт клипов и управление ими зависят от движка и выбранных настроек.

Свет витрины в GLB не записан. Колодец построен исходным кодом из прежнего
архива, отдельного GLB колодца здесь нет; предыдущие версии не перезаписаны.
Причёска не согласована и не добавлена. Мужской модели в этой витрине нет.

Основа: MakeHuman/MPFB2 assets, CC0 1.0 Universal. Текст лицензии:
LICENSE_MAKEHUMAN_ASSETS.md. Исходные targets моргания — MakeHuman CC0.
"""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def checked(path: Path, expected: str, description: str) -> bytes:
    data = path.read_bytes()
    if sha256(data) != expected:
        raise ValueError(f"Unexpected {description}: {path}")
    return data


def brows_with_offset(raw: bytes, shift: float) -> np.ndarray:
    """Reconstruct the prior brow overlay, with only its horizontal UV offset changed."""
    image = Image.open(io.BytesIO(raw)).convert("RGB")
    if image.size != (1024, 1024):
        raise ValueError("Unexpected original skin texture")
    pixels = np.asarray(image).copy()
    before = pixels.copy()
    # This reconstructs the clean underlying skin used by the prior builder;
    # do not paint over the adjacent eye socket with a flat replacement color.
    for y0, y1 in [(470, 520), (537, 591)]:
        for y in range(y0, y1):
            for x in range(832, 846):
                fade = min(1, max(0, (x - 831) / 2), max(0, (846 - x) / 2),
                           max(0, (y - (y0 - 1)) / 2), max(0, (y1 - y) / 2))
                skin = pixels[y, 829].astype(float) + (pixels[y, 832].astype(float) - pixels[y, 829].astype(float)) * (x - 829) / 3
                pixels[y, x] = np.rint((1 - fade) * before[y, x].astype(float) + fade * np.clip(skin, 0, 255)).astype("uint8")
    image = Image.fromarray(pixels, "RGB").convert("RGBA")
    scale, ox, oy, width, height = 6, 824, 456, 30, 144
    overlay = Image.new("RGBA", (width * scale, height * scale))
    draw = ImageDraw.Draw(overlay)
    center = 0.5168333 * 1024
    for side in (1, -1):
        left, right = [], []
        for t in np.linspace(0, 1, 151):
            y = center + side * (515 - 47 * t - center)
            x = 841.3 - 3.4 * math.sin(math.pi * t ** 1.35) + 0.70 * t + shift
            head = helpers.smoothstep(t / 0.16)
            tail = helpers.smoothstep((1 - t) / 0.21)
            radius = 0.67 * (1.85 + 0.30 * (1 - t)) * head * tail
            left.append((round((x - radius - ox) * scale), round((y - oy) * scale)))
            right.append((round((x + radius - ox) * scale), round((y - oy) * scale)))
        draw.polygon(left + right[::-1], fill=(88, 55, 43, int(255 * 0.55)))
    overlay = overlay.filter(ImageFilter.GaussianBlur(0.48 * scale)).resize((width, height), Image.Resampling.LANCZOS)
    image.alpha_composite(overlay, (ox, oy))
    return np.asarray(image.convert("RGB"))


def shift_brows(relief_png: bytes) -> bytes:
    source = previous.original_model(previous.DEFAULT_SOURCE)
    doc, binary = helpers.read_glb(source)
    view = doc["bufferViews"][8]
    raw = bytes(binary[view["byteOffset"]:view["byteOffset"] + view["byteLength"]])
    recreated = brows_with_offset(raw, 0)
    expected = np.asarray(Image.open(io.BytesIO(previous.painted_brows(raw))).convert("RGB"))
    if not np.array_equal(recreated, expected):
        raise ValueError("The approved eyebrow renderer no longer matches")
    shifted = brows_with_offset(raw, BROW_SHIFT_PIXELS)
    old = np.asarray(Image.open(io.BytesIO(relief_png)).convert("RGB"))
    mask = np.any(recreated != shifted, axis=2)
    if not np.array_equal(old[mask], recreated[mask]):
        raise ValueError("The previous skin differs under the brow overlay")
    out = old.copy()
    out[mask] = shifted[mask]
    result = io.BytesIO()
    Image.fromarray(out, "RGB").save(result, format="PNG", optimize=True)
    return result.getvalue()


def read_any_glb(data: bytes) -> tuple[dict, bytes]:
    """Read the source rig, whose binary chunk may include glTF padding."""
    magic, version, length = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("Invalid rig GLB")
    json_len, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("Missing rig JSON")
    doc = json.loads(data[20:20 + json_len])
    off = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", data, off)
    if bin_type != 0x004E4942 or off + 8 + bin_len != len(data):
        raise ValueError("Invalid rig binary chunk")
    return doc, data[off + 8:]


def rig_accessor(document: dict, binary: bytes, index: int) -> np.ndarray:
    accessor = document["accessors"][index]
    view = document["bufferViews"][accessor["bufferView"]]
    if view.get("byteStride") or accessor.get("sparse"):
        raise ValueError("Unexpected interleaved or sparse rig accessor")
    dtype = np.dtype({5121: "u1", 5123: "<u2", 5125: "<u4", 5126: "<f4"}[accessor["componentType"]])
    width = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return np.frombuffer(binary, dtype=dtype, count=accessor["count"] * width, offset=offset).reshape(-1, width).copy()


def rig_inputs(rig_data: bytes, positions: np.ndarray, uvs: np.ndarray) -> tuple:
    rig, binary = read_any_glb(rig_data)
    p = rig_accessor(rig, binary, 0).astype(float)
    rig_uv = rig_accessor(rig, binary, 2)
    joints = rig_accessor(rig, binary, 3)
    weights = rig_accessor(rig, binary, 4).astype(float)
    if p.shape != (ORIGINAL_VERTICES, 3) or not np.array_equal(uvs[:ORIGINAL_VERTICES], rig_uv):
        raise ValueError("Rig and selected model do not share the verified vertex order/UV")
    nodes = rig["nodes"]
    bone_ids = rig["skins"][0]["joints"]
    names = [nodes[i]["name"] for i in bone_ids]
    parents = {child: i for i, node in enumerate(nodes) for child in node.get("children", [])}

    def world(local: list[np.ndarray]) -> list[np.ndarray]:
        cache: dict[int, np.ndarray] = {}
        def calculate(i: int) -> np.ndarray:
            if i not in cache:
                cache[i] = calculate(parents[i]) @ local[i] if i in parents else local[i]
            return cache[i]
        return [calculate(i) for i in range(len(nodes))]

    local = []
    for node in nodes:
        if "scale" in node or "matrix" in node:
            raise ValueError("Unexpected source rig transform")
        matrix = np.eye(4)
        matrix[:3, :3] = Rotation.from_quat(node.get("rotation", [0, 0, 0, 1])).as_matrix()
        matrix[:3, 3] = node.get("translation", [0, 0, 0])
        local.append(matrix)
    rest = world(local)
    # The source rig is from a different shape. Fit each hand joint's translation
    # using the same weighted vertices; the orientations remain unchanged.
    adapted = [matrix.copy() for matrix in rest]
    for j, node_id in enumerate(bone_ids):
        name = names[j]
        if not name.startswith(("wrist_", "metacarpal", "finger")):
            continue
        weight = (weights * (joints == j)).sum(axis=1)
        select = weight > 0.08
        if np.any(select):
            offset = np.average(positions[:ORIGINAL_VERTICES][select] - p[select], weights=weight[select], axis=0)
            adapted[node_id][:3, 3] += offset
    adapted_local = [np.linalg.inv(adapted[parents[i]]) @ matrix if i in parents else matrix
                     for i, matrix in enumerate(adapted)]
    return rig, nodes, bone_ids, names, joints, weights, adapted, adapted_local, world


def fist_delta(rig_data: bytes, positions: np.ndarray, uvs: np.ndarray) -> np.ndarray:
    rig, nodes, ids, names, joints, weights, adapted, local, world = rig_inputs(rig_data, positions, uvs)
    # Fitted to THIS model. More extreme poses made fingertips or thumbs
    # penetrate the palm. The result is deliberately a loose fist.
    thumb_root = (-13.22, 0.43, 16.65)
    thumb_middle = (40.37, -5.97, -19.55)
    finger_angles = (50.0, 95.0, 40.0)
    pose = [matrix.copy() for matrix in local]
    for i, node in enumerate(nodes):
        name = node.get("name", "")
        if not name.startswith("finger") or name not in rig["asset"]["extras"]["fistLocalQuats"]:
            continue
        base = Rotation.from_matrix(local[i][:3, :3])
        world_rot = Rotation.from_matrix(adapted[i][:3, :3])
        side = 1 if name.endswith("_L") else -1
        if name.startswith(("finger1_1_", "finger1_2_", "finger1_3_")):
            k = int(name.split("_")[1])
            rx, ry, rz = thumb_root if k == 1 else thumb_middle if k == 2 else (0, 0, 0)
            absolute = Rotation.from_euler("xyz", [rx, side * ry, side * rz], degrees=True)
            relative = world_rot.inv() * absolute * world_rot
        else:
            k = int(name.split("_")[1])
            axis = world_rot.inv().apply([0, 0, -side])
            relative = Rotation.from_rotvec(axis * math.radians(finger_angles[k - 1]))
        pose[i][:3, :3] = (base * relative).as_matrix()
    animated = world(pose)
    matrices = np.stack([animated[i] @ np.linalg.inv(adapted[i]) for i in ids])
    p = positions[:ORIGINAL_VERTICES].astype(float)
    homogeneous = np.column_stack((p, np.ones(len(p))))
    deformed = np.zeros_like(p)
    for slot in range(4):
        transformed = np.einsum("nij,nj->ni", matrices[joints[:, slot]], homogeneous)[:, :3]
        deformed += transformed * weights[:, slot, None]
    delta = deformed - p
    finger_ids = [i for i, name in enumerate(names) if name.startswith("finger")]
    influenced = (weights * np.isin(joints, finger_ids)).sum(axis=1) > 1e-8
    delta[~influenced] = 0  # Do not transport floating-point weight noise to the rest of the body.
    return np.vstack([delta, np.zeros((len(positions) - ORIGINAL_VERTICES, 3))])


def blink_delta(positions: np.ndarray) -> np.ndarray:
    mapping = previous.vertex_map(ORIGINAL_VERTICES)
    native = np.zeros((19158, 3), dtype=np.float64)
    for name, expected in TARGETS.items():
        path = HERE / "targets" / name
        checked(path, expected, "MakeHuman eye-closure target")
        rows = np.loadtxt(path, dtype=np.float64)
        ids = rows[:, 0].astype(np.int64)
        if len(set(ids.tolist())) != len(ids) or ids.min() < 0 or ids.max() >= len(native):
            raise ValueError(f"Invalid eye target {path}")
        native[ids] += rows[:, 1:4] * 0.1  # decimetres -> metres
    return np.vstack([native[mapping], np.zeros((len(positions) - ORIGINAL_VERTICES, 3))])


def lid_deltas(positions: np.ndarray, faces: np.ndarray, lids: np.ndarray,
               blink: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if lids.shape != (2 * 61 * 7, 3):
        raise ValueError("Unexpected smooth upper-lid ribbon")
    selected = ((positions[faces][:, :, 1].max(1) > 1.550)
                & (positions[faces][:, :, 1].min(1) < 1.580)
                & (np.abs(positions[faces][:, :, 0]).min(1) < .060)
                & (positions[faces][:, :, 2].max(1) > .09))
    subset = faces[selected]
    mesh = trimesh.Trimesh(vertices=positions, faces=subset, process=False)
    closest, distance, triangle = trimesh.proximity.closest_point_naive(mesh, lids)
    if np.max(distance) > .004:
        raise ValueError("A ribbon row is too far from the eyelid")
    bary = trimesh.triangles.points_to_barycentric(positions[subset[triangle]], closest)
    raw = np.einsum("ij,ijk->ik", bary, blink[subset[triangle]])
    # A shared, smoothed displacement per cross-row avoids crumpling the ribbon.
    center_delta = raw.reshape(2, 61, 7, 3)[:, :, 3, :]
    center_delta = gaussian_filter1d(center_delta, 1, axis=1, mode="nearest")
    move = np.repeat(center_delta[:, :, None, :], 7, axis=2).reshape(-1, 3)
    move[:, 2] += .0005
    # Fade the ribbon to a very fine line as eyelids close. The viewer and
    # Blink_Once clip drive this extra target with min(1, 2*Blink).
    rows = lids.reshape(2, 61, 7, 3)
    narrow = ((rows[:, :, 3:4, :] - rows) * .98).reshape(-1, 3)
    return move, narrow


def build_model(source: bytes, rig_data: bytes) -> bytes:
    document, binary = helpers.read_glb(source)
    if len(document["bufferViews"]) != 13 or document["nodes"][3]["name"] != "upper_eyelid_line":
        raise ValueError("Unexpected approved model layout")
    positions = helpers.accessor(document, binary, 0).astype(float)
    normals = helpers.accessor(document, binary, 1).astype(float)
    uvs = helpers.accessor(document, binary, 2)
    faces = helpers.accessor(document, binary, 3).reshape(-1, 3)
    lids = helpers.accessor(document, binary, 8).astype(float)
    blink = blink_delta(positions)
    fist = fist_delta(rig_data, positions, uvs)
    blink_normal = previous.updated_normals(positions, positions + blink, normals, faces).astype(float) - normals
    fist_normal = previous.updated_normals(positions, positions + fist, normals, faces).astype(float) - normals
    lid_blink, lid_narrow = lid_deltas(positions, faces, lids, blink)
    # Put the affected facial faces on a second node. On its boundary neither
    # positions nor normals change, so there is no seam. Separate nodes allow
    # the blink and fist animation clips to run concurrently in glTF players.
    changed = np.any(blink != 0, axis=1) | np.any(blink_normal != 0, axis=1)
    face_mask = np.any(changed[faces], axis=1)
    face_faces, body_faces = faces[face_mask], faces[~face_mask]
    if not 100 < len(face_faces) < 3000 or not len(body_faces):
        raise ValueError("Unexpected blink face selection")
    facial_vertices = np.unique(face_faces)
    if np.any(fist[facial_vertices] != 0) or np.any(fist_normal[facial_vertices] != 0):
        raise ValueError("Fist morph unexpectedly influences the blink patch")
    views = [bytearray(binary[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]])
             for v in document["bufferViews"]]
    document = copy.deepcopy(document)
    views[8] = bytearray(shift_brows(bytes(views[8])))
    views[3] = bytearray(np.ascontiguousarray(body_faces, dtype="<u4").tobytes())
    document["accessors"][3]["count"] = int(body_faces.size)

    def append(array: np.ndarray, kind: str, component: int = 5126, target: int | None = None,
               bounds: bool = False) -> int:
        dtype = {5125: "<u4", 5126: "<f4"}[component]
        array = np.ascontiguousarray(array, dtype=dtype)
        if kind == "SCALAR":
            array = array.reshape(-1, 1)
        v = {"buffer": 0, "byteLength": int(array.nbytes)}
        if target is not None:
            v["target"] = target
        vi = len(views)
        views.append(bytearray(array.tobytes()))
        document["bufferViews"].append(v)
        a = {"bufferView": vi, "componentType": component, "count": len(array), "type": kind}
        if bounds:
            a["min"] = array.min(axis=0).astype(float).tolist()
            a["max"] = array.max(axis=0).astype(float).tolist()
        ai = len(document["accessors"])
        document["accessors"].append(a)
        return ai

    body = document["meshes"][0]
    body["primitives"][0]["targets"] = [{"POSITION": append(fist, "VEC3", target=34962, bounds=True),
                                         "NORMAL": append(fist_normal, "VEC3", target=34962)}]
    body["weights"] = [0]
    body["extras"] = {"targetNames": ["Fists"]}
    face_primitive = {"attributes": copy.deepcopy(body["primitives"][0]["attributes"]),
                      "indices": append(face_faces, "SCALAR", 5125, 34963),
                      "material": body["primitives"][0]["material"],
                      "targets": [{"POSITION": append(blink, "VEC3", target=34962, bounds=True),
                                   "NORMAL": append(blink_normal, "VEC3", target=34962)}]}
    face_mesh_index = len(document["meshes"])
    document["meshes"].append({"name": "female_face_blink", "primitives": [face_primitive],
                               "weights": [0], "extras": {"targetNames": ["Blink"]}})
    face_node_index = len(document["nodes"])
    document["nodes"].append({"name": "face_blink", "mesh": face_mesh_index})
    document["nodes"][0]["children"].append(face_node_index)
    line = document["meshes"][2]
    line["primitives"][0]["targets"] = [
        {"POSITION": append(lid_blink, "VEC3", target=34962, bounds=True)},
        {"POSITION": append(lid_narrow, "VEC3", target=34962, bounds=True)},
    ]
    line["weights"] = [0, 0]
    line["extras"] = {"targetNames": ["Blink", "BlinkLineNarrow"]}

    def animation(name: str, time: np.ndarray, targets: list[tuple[int, np.ndarray]]) -> dict:
        time_accessor = append(time, "SCALAR", bounds=True)
        samplers, channels = [], []
        for node_id, values in targets:
            output = append(values, "SCALAR")
            samplers.append({"input": time_accessor, "output": output, "interpolation": "LINEAR"})
            channels.append({"sampler": len(samplers) - 1, "target": {"node": node_id, "path": "weights"}})
        return {"name": name, "samplers": samplers, "channels": channels}

    blink_time = np.array([0, .08, .14, .17, .23, .31])
    blink_values = np.array([0, .5, 1, 1, .5, 0])
    narrow_values = np.minimum(1, 2 * blink_values)
    fist_time = np.array([0, .0875, .175, .2625, .35])
    fist_values = np.array([0, .15625, .5, .84375, 1])
    document["animations"] = [
        animation("Blink_Once", blink_time, [(face_node_index, blink_values),
                                             (3, np.column_stack([blink_values, narrow_values]))]),
        animation("Fists_Close", fist_time, [(1, fist_values)]),
        animation("Fists_Open", fist_time, [(1, 1 - fist_values)]),
    ]
    document["asset"]["generator"] = "BladesOfWar Model A brow/blink/fist study"
    return previous.pack_glb(document, views)


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
    parser.add_argument("--rig", type=Path, default=DEFAULT_RIG)
    parser.add_argument("--well-archive", type=Path, default=previous.DEFAULT_WELL)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = checked(args.source, SOURCE_SHA256, "approved relief model")
    rig = checked(args.rig, RIG_SHA256, "reference hand rig")
    model = build_model(source, rig)
    archive = make_archive(model, make_showcase(model, args.well_archive))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / MODEL_NAME).write_bytes(model)
    (args.output / ARCHIVE_NAME).write_bytes(archive)
    print(f"GLB {len(model)} bytes SHA-256 {sha256(model)}")
    print(f"ZIP {len(archive)} bytes SHA-256 {sha256(archive)}")


if __name__ == "__main__":
    main()
