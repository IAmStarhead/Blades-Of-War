#!/usr/bin/env python3
"""Verify the selected model, self-contained archive, and unchanged source data."""
from __future__ import annotations

import argparse
import base64
import copy
import zipfile
from pathlib import Path

import numpy as np

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def check(source: Path, result: Path) -> None:
    require(build.sha256(source.read_bytes()) == build.SOURCE_ZIP_SHA256, "Wrong source archive")
    with zipfile.ZipFile(source) as archive:
        original = archive.read("female_fixed.glb")
        source_html = archive.read("BladesOfWar_Showcase.html")
        source_readme = archive.read("README.txt")
    require(build.sha256(original) == build.SOURCE_GLB_SHA256, "Wrong source model")

    modified = (result / build.RESULT_GLB).read_bytes()
    with zipfile.ZipFile(result / build.RESULT_ZIP) as archive:
        require(archive.testzip() is None, "ZIP checksum failure")
        require(archive.read("female_A_original.glb") == original, "Original model in ZIP was changed")
        require(archive.read(build.RESULT_GLB) == modified, "Standalone GLB does not match ZIP")
        require(archive.read("README_original.txt") == source_readme, "Source README was changed")
        output_html = archive.read("BladesOfWar_Showcase.html")
        require("без скелета" in archive.read("README.txt").decode("utf-8") or
                "нет скелета" in archive.read("README.txt").decode("utf-8"), "Missing static-model limitation")

    uri = b"data:model/gltf-binary;base64,"
    new_uri, old_uri = uri + base64.b64encode(modified), uri + base64.b64encode(original)
    require(output_html.count(new_uri) == 1, "The output HTML does not contain the new model")
    require(output_html.replace(new_uri, old_uri, 1) == source_html,
            "HTML changed outside the single embedded female model")

    source_doc, source_bin = build.read_glb(original)
    output_doc, output_bin = build.read_glb(modified)
    require(output_bin[: len(source_bin)] == source_bin, "Original geometry, textures, or other binary data changed")
    require(len(output_doc["nodes"]) == len(source_doc["nodes"]) + 1, "Unexpected added nodes")
    require(len(output_doc["meshes"]) == len(source_doc["meshes"]) + 1, "Unexpected added meshes")
    require(len(output_doc["materials"]) == len(source_doc["materials"]) + 1, "Unexpected added materials")
    require(len(output_doc["accessors"]) == len(source_doc["accessors"]) + 3, "Unexpected added accessors")
    require(len(output_doc["bufferViews"]) == len(source_doc["bufferViews"]) + 3, "Unexpected added buffers")
    node = output_doc["nodes"][-1]
    require(node["name"] == "upper_lashes_cat_eye" and node["mesh"] == len(source_doc["meshes"]), "Lash node missing")
    require(output_doc["nodes"][0]["children"] == source_doc["nodes"][0]["children"] + [len(source_doc["nodes"])],
            "Lash node is not attached to the original root")
    require("skin" not in node and "skins" not in output_doc and "animations" not in output_doc,
            "Static model unexpectedly gained a skeleton or animations")

    # Removing only the appended entries and the new root child must recover
    # the exact original glTF JSON. This includes both original meshes/materials.
    normalized = copy.deepcopy(output_doc)
    normalized["nodes"][0]["children"].pop()
    for key in ("nodes", "meshes", "materials", "accessors", "bufferViews"):
        normalized[key] = normalized[key][: len(source_doc[key])]
    normalized["buffers"] = copy.deepcopy(source_doc["buffers"])
    require(normalized == source_doc, "Other original glTF metadata or scene objects changed")

    primitive = output_doc["meshes"][-1]["primitives"][0]
    pos = build.accessor(output_doc, output_bin, primitive["attributes"]["POSITION"])
    normals = build.accessor(output_doc, output_bin, primitive["attributes"]["NORMAL"])
    index_acc = output_doc["accessors"][primitive["indices"]]
    index_view = output_doc["bufferViews"][index_acc["bufferView"]]
    require(index_acc["componentType"] == 5123 and index_acc["count"] % 3 == 0, "Unexpected triangle indices")
    triangles = np.frombuffer(output_bin, dtype="<u2", count=index_acc["count"],
                              offset=index_view["byteOffset"]).reshape(-1, 3)
    require(np.isfinite(pos).all() and np.isfinite(normals).all(), "Non-finite lash vertex or normal")
    require(triangles.max() < len(pos), "Out-of-range lash triangle index")
    require(np.allclose(np.linalg.norm(normals, axis=1), 1, atol=1e-5), "Non-unit normals")
    area = np.linalg.norm(np.cross(pos[triangles[:, 1]] - pos[triangles[:, 0]],
                                   pos[triangles[:, 2]] - pos[triangles[:, 0]]), axis=1)
    require((area > 1e-12).all(), "Degenerate lash triangles")
    require(pos[:, 0].min() < -0.04 and pos[:, 0].max() > 0.04, "Lashes missing from an eye")
    require((np.abs(pos[:, 0]) < 0.05).all() and (pos[:, 1] > 1.56).all() and
            (pos[:, 1] < 1.58).all() and (pos[:, 2] > 0.1).all() and (pos[:, 2] < 0.13).all(),
            "Lashes are outside the eye area")
    print(f"PASS: original GLB binary and all original mesh/texture metadata unchanged; "
          f"{len(pos)} new vertices, {len(triangles)} non-degenerate lash triangles")
    print("PASS: HTML differs only by the embedded female GLB; original male, comparison model and well code retained")
    print("PASS: ZIP integrity, embedded and standalone GLB identity, original README, static model limitations")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path, help="Original archive")
    parser.add_argument("--result", type=Path, default=build.ROOT / "work/character-model-search/selected-a")
    args = parser.parse_args()
    check(args.source, args.result)


if __name__ == "__main__":
    main()
