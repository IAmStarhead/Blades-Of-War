#!/usr/bin/env python3
"""Structural, morph, brow, archive and animation checks for the motion study."""
from __future__ import annotations

import argparse
import base64
import io
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def view_bytes(document: dict, binary: bytes, index: int) -> bytes:
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return bytes(binary[start:start + view["byteLength"]])


def image(document: dict, binary: bytes, index: int) -> np.ndarray:
    source = Image.open(io.BytesIO(view_bytes(document, binary, index)))
    require(source.size == (1024, 1024) and source.mode == "RGB", "Unexpected skin format")
    return np.asarray(source)


def sorted_faces(faces: np.ndarray) -> np.ndarray:
    return faces[np.lexsort((faces[:, 2], faces[:, 1], faces[:, 0]))]


def check_weld(positions: np.ndarray, delta: np.ndarray, label: str) -> None:
    _, representative, inverse = np.unique(positions, axis=0, return_index=True, return_inverse=True)
    disagreement = np.linalg.norm(delta - delta[representative[inverse]], axis=1)
    require(float(disagreement.max()) < 1e-7, f"{label} separates coincident source vertices")


def check_model(source: bytes, model: bytes) -> None:
    old, before = build.helpers.read_glb(source)
    new, after = build.helpers.read_glb(model)
    require(len(new["meshes"]) == 4 and len(new["materials"]) == 3 and len(new["textures"]) == 2,
            "Unexpected number of meshes/materials/textures")
    require("skins" not in new, "Unexpected skeleton")
    for key in ("materials", "images", "textures", "samplers"):
        require(new.get(key) == old.get(key), f"Changed {key}")
    # All old binary blocks except the body indices and brow PNG remain exact.
    for i in (0, 1, 2, 4, 5, 6, 7, 9, 10, 11, 12):
        require(view_bytes(old, before, i) == view_bytes(new, after, i), f"Original buffer view {i} changed")
    require(new["nodes"][1] == old["nodes"][1] and new["nodes"][2] == old["nodes"][2]
            and new["nodes"][3] == old["nodes"][3], "Original mesh-node transforms changed")
    original_faces = build.helpers.accessor(old, before, 3).reshape(-1, 3)
    body = new["meshes"][0]["primitives"][0]
    face = new["meshes"][3]["primitives"][0]
    line = new["meshes"][2]["primitives"][0]
    body_faces = build.helpers.accessor(new, after, body["indices"]).reshape(-1, 3)
    face_faces = build.helpers.accessor(new, after, face["indices"]).reshape(-1, 3)
    combined = np.concatenate((body_faces, face_faces))
    require(np.array_equal(sorted_faces(original_faces), sorted_faces(combined)), "Body face partition changed triangles")
    require(face["attributes"] == body["attributes"] == old["meshes"][0]["primitives"][0]["attributes"]
            and face["material"] == body["material"], "Face/body do not share the original geometry and material")
    triangles = (len(body_faces) + len(face_faces)
                 + new["accessors"][7]["count"] // 3 + new["accessors"][10]["count"] // 3)
    require(triangles == 31066, "Triangle count changed")

    old_skin, new_skin = image(old, before, 8), image(new, after, 8)
    changed = np.any(old_skin != new_skin, axis=2)
    yy, xx = np.where(changed)
    require(600 < len(xx) < 900 and xx.min() >= 824 and xx.max() < 854
            and yy.min() >= 456 and yy.max() < 600, "Changed pixels outside the brow patch")
    require(np.array_equal(np.asarray(Image.open(io.BytesIO(build.shift_brows(view_bytes(old, before, 8))))), new_skin),
            "Brow shift differs from the verified reconstruction")
    positions = build.helpers.accessor(new, after, 0)
    uvs = build.helpers.accessor(new, after, 2)
    uv_positions, valid = build.relief.uv_positions(positions, uvs, original_faces)
    ys = np.arange(470, 591)
    differences = []
    for x in (836, 838, 840, 842):
        select = valid[ys, x] & valid[ys, x + 1]
        differences.extend((uv_positions[ys[select], x + 1, 1] - uv_positions[ys[select], x, 1]).tolist())
    require(np.median(differences) < -0.001, "Increasing brow U does not move downward on the face")

    require(new["meshes"][0]["extras"]["targetNames"] == ["Fists"]
            and new["meshes"][3]["extras"]["targetNames"] == ["Blink"]
            and new["meshes"][2]["extras"]["targetNames"] == ["Blink", "BlinkLineNarrow"],
            "Morph target names changed")
    require(new["meshes"][0]["weights"] == [0] and new["meshes"][3]["weights"] == [0]
            and new["meshes"][2]["weights"] == [0, 0], "Neutral shape has nonzero weights")
    fist = build.helpers.accessor(new, after, body["targets"][0]["POSITION"])
    blink = build.helpers.accessor(new, after, face["targets"][0]["POSITION"])
    fist_norm = build.helpers.accessor(new, after, body["targets"][0]["NORMAL"])
    blink_norm = build.helpers.accessor(new, after, face["targets"][0]["NORMAL"])
    require(np.array_equal(blink, build.blink_delta(positions).astype("<f4")), "Unexpected blink target")
    check_weld(positions, fist, "Fists")
    check_weld(positions, blink, "Blink")
    facial_vertices = np.unique(face_faces)
    require(not np.any(fist[facial_vertices]) and not np.any(fist_norm[facial_vertices]),
            "Fists affect face patch")
    body_vertices = np.unique(body_faces)
    require(not np.any(blink[body_vertices]) and not np.any(blink_norm[body_vertices]),
            "Blink crosses the face/body partition boundary")
    require(np.count_nonzero(np.linalg.norm(fist, axis=1) > 1e-7) > 3000, "Fist target is empty")
    require(0.009 < float(np.linalg.norm(blink, axis=1).max()) < .011, "Unexpected blink scale")
    require(0.07 < float(np.linalg.norm(fist, axis=1).max()) < .11, "Unexpected fist scale")
    require(len(line["targets"]) == 2 and np.any(build.helpers.accessor(new, after, line["targets"][0]["POSITION"]))
            and np.any(build.helpers.accessor(new, after, line["targets"][1]["POSITION"])), "Missing lid motion")

    animations = {animation["name"]: animation for animation in new["animations"]}
    require(set(animations) == {"Blink_Once", "Fists_Close", "Fists_Open"}, "Unexpected glTF clips")
    nodes = {name: {channel["target"]["node"] for channel in clip["channels"]}
             for name, clip in animations.items()}
    require(nodes == {"Blink_Once": {3, 4}, "Fists_Close": {1}, "Fists_Open": {1}},
            "Blink and fist clips are not independently targeted")
    blink_clip = animations["Blink_Once"]
    b = build.helpers.accessor(new, after, blink_clip["samplers"][0]["output"]).ravel()
    line_weights = build.helpers.accessor(new, after, blink_clip["samplers"][1]["output"]).reshape(-1, 2)
    require(np.array_equal(line_weights[:, 0], b) and np.array_equal(line_weights[:, 1], np.minimum(1, 2 * b)),
            "Blink clip doesn't coordinate the eyelid strip")
    close_clip, open_clip = animations["Fists_Close"], animations["Fists_Open"]
    close = build.helpers.accessor(new, after, close_clip["samplers"][0]["output"]).ravel()
    opened = build.helpers.accessor(new, after, open_clip["samplers"][0]["output"]).ravel()
    require(close[0] == 0 and close[-1] == 1 and np.allclose(opened, 1 - close), "Fist clips cannot reverse")
    print(f"PASS: same neutral positions/normals/UVs/materials, {triangles:,} triangles; "
          f"face partition {len(face_faces)} + body {len(body_faces)} triangles; no skeleton or hair")
    print(f"PASS: {len(xx)} changed brow texels at x={xx.min()}..{xx.max()}, y={yy.min()}..{yy.max()}; "
          f"UV shift {build.BROW_SHIFT_PIXELS} px, local vertical scale median {np.median(differences)*1000:.2f} mm/px")
    print("PASS: welded morph seams; Blink/Fists are independent; eyelid strip tracks blink and narrows; 3 reversible clips")


def check_archive(model: bytes, result: Path, well_zip: Path) -> None:
    with zipfile.ZipFile(result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, "Corrupt archive")
        require(archive.namelist() == ["BladesOfWar_Showcase.html", build.MODEL_NAME, "README.txt", "LICENSE_MAKEHUMAN_ASSETS.md"],
                "Unexpected archive contents")
        html = archive.read("BladesOfWar_Showcase.html")
        require(archive.read(build.MODEL_NAME) == model, "Archive GLB differs")
        require(html == build.make_showcase(model, well_zip), "Archive HTML was not generated from this GLB/template/well")
        require(base64.b64encode(model) in html, "Embedded GLB mismatch")
        require(build.previous.well_engine_bundle(well_zip).encode() in html, "Original well/engine bundle changed")
        readme = archive.read("README.txt").decode()
        require("Модель не содержит\nскелета" in readme, "Missing limitations in archive readme")
    print("PASS: offline ZIP contains exactly the delivered GLB, original well/engine code, readme and CC0 license")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument("--result", type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument("--well-archive", type=Path, default=build.previous.DEFAULT_WELL)
    args = parser.parse_args()
    source = build.checked(args.source, build.SOURCE_SHA256, "approved relief model")
    model = (args.result / build.MODEL_NAME).read_bytes()
    check_model(source, model)
    check_archive(model, args.result, args.well_archive)


if __name__ == "__main__":
    main()
