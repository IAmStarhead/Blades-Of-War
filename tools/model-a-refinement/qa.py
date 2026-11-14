#!/usr/bin/env python3
"""Check the selected-A revision, localized edits and the offline well archive."""
from __future__ import annotations

import argparse
import base64
import copy
import io
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image

import build


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def view_bytes(document: dict, binary: bytearray, index: int) -> bytes:
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return bytes(binary[start:start + view["byteLength"]])


def component_indices(document: dict, binary: bytearray, accessor_index: int) -> np.ndarray:
    accessor = document["accessors"][accessor_index]
    require(accessor["type"] == "SCALAR" and accessor["componentType"] == 5123,
            "Unexpected lash index format")
    view = document["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return np.frombuffer(binary, dtype="<u2", count=accessor["count"], offset=offset).reshape(-1, 3)


def target_group_deltas(mapping: np.ndarray, prefix: str) -> np.ndarray:
    result = np.zeros((len(mapping), 3), dtype=np.float64)
    for relative, weight in build.TARGETS.items():
        if relative.startswith(prefix + "/"):
            rows = np.loadtxt(build.DATA / "targets" / relative, dtype=np.float64)
            native = np.zeros((19158, 3), dtype=np.float64)
            native[rows[:, 0].astype(int)] = rows[:, 1:4] * (0.1 * weight)
            result += native[mapping]
    return result


def check_archive(model: bytes, result: Path, well_zip: Path) -> None:
    with zipfile.ZipFile(result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, "Broken ZIP checksum")
        require(archive.namelist() == ["BladesOfWar_Showcase.html", build.MODEL_NAME,
                                        "README.txt", "LICENSE_MAKEHUMAN_ASSETS.md"],
                "Unexpected archive contents")
        files = {name: archive.read(name) for name in archive.namelist()}
    require(files[build.MODEL_NAME] == model, "ZIP model differs from standalone GLB")
    require(files["LICENSE_MAKEHUMAN_ASSETS.md"] == (build.DATA / "LICENSE.ASSETS.md").read_bytes(),
            "Missing or altered CC0 assets license")
    require("скелета" in files["README.txt"].decode("utf-8"), "Static-model limitation missing")
    html = files["BladesOfWar_Showcase.html"].decode("utf-8")
    uri = "data:model/gltf-binary;base64," + base64.b64encode(model).decode("ascii")
    require(html.count("data:model/gltf-binary;base64,") == 1 and html.count(uri) == 1,
            "Unexpected embedded model payloads")
    require("data-mode=\"male\"" not in html and "male_fixed.glb" not in html,
            "A male mode or asset reference remains in the viewer")
    with zipfile.ZipFile(well_zip) as source:
        original_html = source.read("BladesOfWar_Showcase.html").decode("utf-8")
        male = source.read("assets/models/male_fixed.glb")
    require(build.sha256(well_zip.read_bytes()) == build.SOURCE_WELL_ZIP_SHA, "Unexpected well archive")
    start = original_html.index('<script type="module">') + len('<script type="module">')
    end = original_html.index("const FEMALE_URI =", start)
    bundle = original_html[start:end]
    require(bundle.count("function sp(") == 1 and html.count(bundle) == 1,
            "The original latest well/engine bundle was changed")
    template = (build.HERE / "viewer.template.html").read_text("utf-8")
    expected = template.replace("/*__ORIGINAL_WELL_AND_ENGINE_BUNDLE__*/", bundle, 1).replace(
        "__FEMALE_DATA_URI__", uri, 1)
    require(html == expected, "Viewer differs from the template, original well bundle and revised model")
    require(all(male not in data and base64.b64encode(male) not in data for data in files.values()),
            "Male geometry is present in the delivered archive")
    print("PASS: exact latest well/engine bundle, one female payload, no male controls or male GLB, ZIP integrity")


def check_model(original: bytes, modified: bytes) -> None:
    old, old_bin = build.lash_helpers.read_glb(original)
    new, new_bin = build.lash_helpers.read_glb(modified)
    require(len(new["nodes"]) == len(old["nodes"]) + 1 and
            len(new["meshes"]) == len(old["meshes"]) + 1 and
            len(new["materials"]) == len(old["materials"]) + 1 and
            len(new["accessors"]) == len(old["accessors"]) + 3 and
            len(new["bufferViews"]) == len(old["bufferViews"]) + 3,
            "Unexpected added glTF objects")
    require(new["nodes"][-1]["name"] == "upper_lashes_cat_eye" and
            new["nodes"][0]["children"] == old["nodes"][0]["children"] + [len(old["nodes"])],
            "Separate cat-eye node missing")
    require("skins" not in new and "animations" not in new and
            all("targets" not in primitive for mesh in new["meshes"] for primitive in mesh["primitives"]),
            "The model unexpectedly gained skinning, animation or morphs")
    normalized = copy.deepcopy(new)
    normalized["nodes"][0]["children"].pop()
    for key in ("nodes", "meshes", "materials", "accessors"):
        normalized[key] = normalized[key][:len(old[key])]
    normalized["accessors"][0] = copy.deepcopy(old["accessors"][0])
    normalized["bufferViews"] = copy.deepcopy(old["bufferViews"])
    normalized["buffers"] = copy.deepcopy(old["buffers"])
    require(normalized == old, "Original glTF metadata changed beyond the intended edits")
    for index in (2, 3, 4, 5, 6, 7, 9):
        require(view_bytes(old, old_bin, index) == view_bytes(new, new_bin, index),
                f"Original body UV/index or eye data changed at buffer view {index}")

    positions = build.lash_helpers.accessor(old, old_bin, 0)
    revised = build.lash_helpers.accessor(new, new_bin, 0)
    old_normals = build.lash_helpers.accessor(old, old_bin, 1)
    new_normals = build.lash_helpers.accessor(new, new_bin, 1)
    faces = build.lash_helpers.accessor(old, old_bin, 3).reshape(-1, 3)
    mapping = build.vertex_map(len(positions))
    wanted = (positions + build.target_deltas(mapping)).astype("<f4")
    require(np.array_equal(revised, wanted), "Unexpected changes to original body positions")
    require(np.isfinite(revised).all() and np.isfinite(new_normals).all() and
            np.allclose(np.linalg.norm(new_normals, axis=1), 1.0, atol=1e-5),
            "Invalid positions or normals")
    changed = np.any(positions != revised, axis=1)
    require(1800 <= changed.sum() <= 2100, "Unexpected number of changed body vertices")

    # Independently bound each target group's support to the requested area.
    boxes = {
        "nose": ((-0.028, 1.50, 0.12), (0.028, 1.58, 0.16), 0.003),
        "ears": ((-0.085, 1.47, -0.03), (0.085, 1.62, 0.10), 0.004),
        "breast": ((-0.15, 1.14, 0.06), (0.15, 1.35, 0.16), 0.013),
        "buttocks": ((-0.19, 0.75, -0.11), (0.19, 1.02, 0.04), 0.010),
    }
    for name, (low, high, limit) in boxes.items():
        delta = target_group_deltas(mapping, name)
        selected = np.any(abs(delta) > 1e-10, axis=1)
        require(selected.sum() > 100 and np.all(positions[selected] >= low) and
                np.all(positions[selected] <= high), f"{name} target escaped its local area")
        maximum = np.linalg.norm(delta[selected], axis=1).max()
        require(maximum < limit, f"{name} displacement is unexpectedly large")
        print(f"  {name}: {selected.sum()} vertices, max displacement {maximum * 1000:.2f} mm")

    # Welding uses the same position+normal groups as the normal transport;
    # only triangles touching a changed vertex and their welds may change.
    keys = np.column_stack([np.round(positions * 1e6).astype(np.int64),
                            np.round(old_normals * 100).astype(np.int64)])
    _, groups = np.unique(keys, axis=0, return_inverse=True)
    touching = np.zeros(len(positions), dtype=bool)
    touching[faces[np.any(changed[faces], axis=1)].ravel()] = True
    affected_groups = np.zeros(groups.max() + 1, dtype=bool)
    affected_groups[groups[touching]] = True
    normal_changed = np.any(old_normals != new_normals, axis=1)
    require(not np.any(normal_changed & ~affected_groups[groups]), "Normals changed outside edited neighborhoods")

    # The original mesh has UV split vertices. All exact positional duplicates
    # must remain coincident after the deformation, preventing new seam gaps.
    _, representatives, inverse, counts = np.unique(positions, axis=0, return_index=True,
                                                     return_inverse=True, return_counts=True)
    require(np.array_equal(revised, revised[representatives[inverse]]), "A previously welded seam separated")
    before_tri = positions[faces].astype(np.float64)
    after_tri = revised[faces].astype(np.float64)
    n0 = np.cross(before_tri[:, 1] - before_tri[:, 0], before_tri[:, 2] - before_tri[:, 0])
    n1 = np.cross(after_tri[:, 1] - after_tri[:, 0], after_tri[:, 2] - after_tri[:, 0])
    area0, area1 = np.linalg.norm(n0, axis=1), np.linalg.norm(n1, axis=1)
    require(np.all(area0 > 1e-12) and np.all(area1 > 1e-12), "Degenerate original or revised face")
    cosine = np.sum(n0 * n1, axis=1) / (area0 * area1)
    require(np.all(cosine > 0), "A body triangle flipped")
    print(f"PASS: {changed.sum()} moved vertices, {np.count_nonzero(counts > 1)} coincident seam groups, "
          f"no degenerate/flipped body faces (min cosine {cosine.min():.4f})")

    skin_before = np.asarray(Image.open(io.BytesIO(view_bytes(old, old_bin, 8))).convert("RGB"))
    skin_after = np.asarray(Image.open(io.BytesIO(view_bytes(new, new_bin, 8))).convert("RGB"))
    pixels_changed = np.any(skin_before != skin_after, axis=2)
    yy, xx = np.where(pixels_changed)
    require(0 < len(xx) < 2000 and xx.min() >= 824 and xx.max() < 854 and
            yy.min() >= 456 and yy.max() < 600, "Skin edits escaped the brow texture patch")
    print(f"PASS: eyes, eye texture and original UVs/indices unchanged; {len(xx)} brow pixels modified")

    primitive = new["meshes"][-1]["primitives"][0]
    lash_pos = build.lash_helpers.accessor(new, new_bin, primitive["attributes"]["POSITION"])
    lash_norm = build.lash_helpers.accessor(new, new_bin, primitive["attributes"]["NORMAL"])
    triangles = component_indices(new, new_bin, primitive["indices"])
    require(len(lash_pos) == 1022 and len(triangles) == 1728 and triangles.max() < len(lash_pos),
            "Unexpected eyelid ribbon topology")
    require(np.isfinite(lash_pos).all() and np.allclose(np.linalg.norm(lash_norm, axis=1), 1, atol=1e-5) and
            np.all(abs(lash_pos[:, 0]) < 0.05) and np.all((lash_pos[:, 1] > 1.56) & (lash_pos[:, 1] < 1.58)) and
            np.all((lash_pos[:, 2] > 0.1) & (lash_pos[:, 2] < 0.13)), "Invalid lash positions or normals")
    lt = lash_pos[triangles].astype(np.float64)
    require(np.all(np.linalg.norm(np.cross(lt[:, 1] - lt[:, 0], lt[:, 2] - lt[:, 0]), axis=1) > 1e-12),
            "Degenerate eyelid ribbon face")
    parents = list(range(len(lash_pos)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for a, b, c in triangles:
        parents[find(int(b))] = find(int(a))
        parents[find(int(c))] = find(int(a))
    _, component_counts = np.unique([find(i) for i in range(len(lash_pos))], return_counts=True)
    require(sorted(component_counts.tolist()) == [511, 511], "Expected exactly two continuous lash ribbons")
    for side in (-1, 1):
        half = lash_pos[np.sign(lash_pos[:, 0]) == side]
        _, columns = np.unique(half[:, 0], return_counts=True)
        require(len(half) == 511 and len(columns) == 73 and np.all(columns == 7),
                "Unexpected lash filaments or broken ribbon")
    print("PASS: two connected 73-by-7 cat-eye ribbons, without separate filament meshes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument("--well-archive", type=Path, default=build.DEFAULT_WELL)
    parser.add_argument("--result", type=Path, default=build.DEFAULT_OUTPUT)
    args = parser.parse_args()
    original = build.original_model(args.source)
    modified = (args.result / build.MODEL_NAME).read_bytes()
    check_archive(modified, args.result, args.well_archive)
    check_model(original, modified)


if __name__ == "__main__":
    main()
