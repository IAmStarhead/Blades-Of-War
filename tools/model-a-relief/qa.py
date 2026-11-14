#!/usr/bin/env python3
"""Check that the skin study only changes the existing skin image."""
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


def bilinear(image: np.ndarray, uv: np.ndarray) -> np.ndarray:
    """Sample the unflipped PNG at the body UV vertices, including borders."""
    height, width, _ = image.shape
    x, y = uv[:, 0] * width - 0.5, uv[:, 1] * height - 0.5
    floor_x, floor_y = np.floor(x).astype(int), np.floor(y).astype(int)
    dx, dy = x - floor_x, y - floor_y
    x0, x1 = np.clip(floor_x, 0, width - 1), np.clip(floor_x + 1, 0, width - 1)
    y0, y1 = np.clip(floor_y, 0, height - 1), np.clip(floor_y + 1, 0, height - 1)
    top = (1 - dx[:, None]) * image[y0, x0] + dx[:, None] * image[y0, x1]
    bottom = (1 - dx[:, None]) * image[y1, x0] + dx[:, None] * image[y1, x1]
    return (1 - dy[:, None]) * top + dy[:, None] * bottom


def check_model(source: bytes, model: bytes) -> None:
    old, old_binary = build.helpers.read_glb(source)
    new, new_binary = build.helpers.read_glb(model)
    require(old["images"][0]["bufferView"] == 8 and len(old["bufferViews"]) == 13,
            "Unexpected original image layout")
    require(len(new["bufferViews"]) == len(old["bufferViews"]), "Added or removed buffer view")
    normalized = copy.deepcopy(new)
    for index, (before, after) in enumerate(zip(old["bufferViews"], new["bufferViews"])):
        require(after.get("byteOffset", 0) % 4 == 0, "Unaligned buffer view")
        if index != 8:
            require(view_bytes(old, old_binary, index) == view_bytes(new, new_binary, index),
                    f"Non-skin data changed in buffer view {index}")
            require(before["byteLength"] == after["byteLength"], f"View {index} changed size")
        normalized["bufferViews"][index]["byteOffset"] = before.get("byteOffset", 0)
    normalized["bufferViews"][8]["byteLength"] = old["bufferViews"][8]["byteLength"]
    normalized["buffers"] = copy.deepcopy(old["buffers"])
    require(normalized == old, "Unexpected GLB structure, material or metadata change")
    require("skins" not in new and "animations" not in new and
            all("targets" not in primitive for mesh in new["meshes"] for primitive in mesh["primitives"]),
            "Study unexpectedly added rigging, animation or morphs")
    triangles = sum(new["accessors"][primitive["indices"]]["count"] // 3
                    for mesh in new["meshes"] for primitive in mesh["primitives"])
    require(triangles == 31066, "Unexpected triangle count")
    require(len(new["meshes"]) == 3 and len(new["textures"]) == 2 and len(new["materials"]) == 3,
            "Unexpected mesh, texture or material count")

    def image(document: dict, binary: bytearray) -> np.ndarray:
        source_image = Image.open(io.BytesIO(view_bytes(document, binary, 8)))
        require(source_image.size == (1024, 1024) and source_image.mode == "RGB", "Unexpected skin image")
        return np.asarray(source_image, dtype=np.int16)

    before, after = image(old, old_binary), image(new, new_binary)
    delta = after - before
    changed = np.any(delta != 0, axis=-1)
    require(400000 < np.count_nonzero(changed) < 600000, "Unexpected skin variation coverage")
    require(-5 <= int(delta.min()) and int(delta.max()) <= 3, "Skin changes are stronger than intended")
    strong_details = np.max(abs(before - np.array([222, 195, 177])), axis=-1) >= 14
    require(np.array_equal(after[strong_details], before[strong_details]), "Original detailed pixels changed")
    require(np.array_equal(before[456:600, 824:854], after[456:600, 824:854]), "Eyebrow patch changed")

    positions = build.helpers.accessor(old, old_binary, 0)
    uvs = build.helpers.accessor(old, old_binary, 2)
    _, reps, inverse, counts = np.unique(positions, axis=0, return_index=True, return_inverse=True, return_counts=True)
    seam = counts[inverse] > 1
    change_at_vertices = bilinear(after.astype(float), uvs) - bilinear(before.astype(float), uvs)
    discrepancy = np.max(abs(change_at_vertices - change_at_vertices[reps[inverse]]), axis=-1)
    require(np.count_nonzero(counts > 1) == 1122, "Unexpected seam group count")
    require(float(discrepancy[seam].max()) <= 1.01, "Color change is inconsistent at a seam vertex")
    print(f"PASS: identical geometry, normals, UVs, materials, blue-eye/eyelid data; {triangles:,} triangles, no hair")
    print(f"PASS: only existing 1024² skin PNG changed: {np.count_nonzero(changed):,} pixels, "
          f"RGB delta {delta.min()} to +{delta.max()}, existing stronger detail and brow patch unchanged")
    print(f"PASS: {np.count_nonzero(counts > 1):,} coincident-position seam groups, "
          f"maximum sampled color-change disagreement {discrepancy[seam].max():.2f}/255")


def check_archive(model: bytes, result: Path, well_zip: Path) -> None:
    with zipfile.ZipFile(result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, "Corrupt showcase archive")
        require(archive.namelist() == ["BladesOfWar_Showcase.html", build.MODEL_NAME,
                                      "README.txt", "LICENSE_MAKEHUMAN_ASSETS.md"], "Unexpected archive entries")
        files = {name: archive.read(name) for name in archive.namelist()}
    require(files[build.MODEL_NAME] == model, "ZIP and standalone GLB differ")
    require(files["LICENSE_MAKEHUMAN_ASSETS.md"] == (build.previous.DATA / "LICENSE.ASSETS.md").read_bytes(),
            "CC0 license changed or missing")
    html = files["BladesOfWar_Showcase.html"]
    require(html == build.make_showcase(model, well_zip), "HTML differs from the checked build template")
    uri = b"data:model/gltf-binary;base64," + base64.b64encode(model)
    require(html.count(uri) == 1 and html.count(b"data:model/gltf-binary;base64,") == 1,
            "Expected exactly one embedded model")
    require(b'data-mode="male"' not in html and b"male_fixed.glb" not in html, "Unexpected male controls")
    require(b'id="soft-light"' in html and "только в режиме" in html.decode("utf-8"), "Light control missing")
    require(build.sha256(well_zip.read_bytes()) == build.previous.SOURCE_WELL_ZIP_SHA, "Source well archive changed")
    with zipfile.ZipFile(well_zip) as archive:
        original_html = archive.read("BladesOfWar_Showcase.html").decode("utf-8")
        male = archive.read("assets/models/male_fixed.glb")
    start = original_html.index('<script type="module">') + len('<script type="module">')
    end = original_html.index("const FEMALE_URI =", start)
    bundle = original_html[start:end].encode("utf-8")
    require(bundle.count(b"function sp(") == 1 and html.count(bundle) == 1, "Original well/engine code changed")
    require(all(male not in data and base64.b64encode(male) not in data for data in files.values()),
            "Male geometry remains in the delivered ZIP")
    baseline_zip = build.ROOT / "work/character-model-search/selected-a/refined-v2/female_A_v2_and_detailed_well.zip"
    require(build.sha256(baseline_zip.read_bytes()) == "49f54081ab5d600e73e029baecc67d9dbae8fcc7a51edb2935af0fde521e8056",
            "Approved previous showcase changed")
    text = files["README.txt"].decode("utf-8")
    require("скелета" in text and "не внутри GLB" in text and "колодца" in text, "Essential usage notes missing")
    print("PASS: original archives preserved; ZIP includes one matching GLB, CC0 license, original well/engine and usage notes")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument("--well-archive", type=Path, default=build.previous.DEFAULT_WELL)
    parser.add_argument("--result", type=Path, default=build.DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = build.source_model(args.source)
    model = (args.result / build.MODEL_NAME).read_bytes()
    check_model(source, model)
    check_archive(model, args.result, args.well_archive)


if __name__ == "__main__":
    main()
