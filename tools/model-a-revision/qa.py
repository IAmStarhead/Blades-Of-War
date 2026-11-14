#!/usr/bin/env python3
"""Verify the v2 GLB against the previously approved A and the unchanged well."""
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


def view_bytes(document: dict, binary: bytearray, index: int) -> bytes:
    view = document["bufferViews"][index]
    start = view.get("byteOffset", 0)
    return bytes(binary[start:start + view["byteLength"]])


def lid_indices(document: dict, binary: bytearray) -> np.ndarray:
    accessor = document["accessors"][10]
    require(accessor["type"] == "SCALAR" and accessor["componentType"] == 5123,
            "Unexpected eyelid index type")
    view = document["bufferViews"][accessor["bufferView"]]
    start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return np.frombuffer(binary, dtype="<u2", count=accessor["count"], offset=start).reshape(-1, 3)


def check_archive(model: bytes, result: Path, well_zip: Path) -> None:
    with zipfile.ZipFile(result / build.ARCHIVE_NAME) as archive:
        require(archive.testzip() is None, "Corrupt showcase archive")
        require(archive.namelist() == ["BladesOfWar_Showcase.html", build.MODEL_NAME,
                                      "README.txt", "LICENSE_MAKEHUMAN_ASSETS.md"], "Unexpected archive contents")
        files = {name: archive.read(name) for name in archive.namelist()}
    require(files[build.MODEL_NAME] == model, "ZIP and standalone GLB differ")
    require(files["LICENSE_MAKEHUMAN_ASSETS.md"] == (build.previous.DATA / "LICENSE.ASSETS.md").read_bytes(),
            "CC0 assets license is missing or changed")
    require("скелета" in files["README.txt"].decode("utf-8"), "Static-model limitation is missing")
    source = build.source_model(build.DEFAULT_SOURCE)
    baseline_zip = build.previous.DEFAULT_OUTPUT / build.previous.ARCHIVE_NAME
    require(build.sha256(baseline_zip.read_bytes()) == "7f524fd081d326a9bdc59688ac4a29249006948c194ff3169be4556bf4773e52",
            "Previous showcase archive changed")
    with zipfile.ZipFile(baseline_zip) as archive:
        baseline_html = archive.read("BladesOfWar_Showcase.html")
    uri = lambda data: b"data:model/gltf-binary;base64," + base64.b64encode(data)
    require(baseline_html.count(uri(source)) == 1, "Unexpected previous female payload")
    html = files["BladesOfWar_Showcase.html"]
    require(html == baseline_html.replace(uri(source), uri(model), 1),
            "Showcase changed beyond its one female GLB")
    require(html.count(b"data:model/gltf-binary;base64,") == 1 and b'data-mode="male"' not in html and
            b"male_fixed.glb" not in html, "Male controls or unexpected embedded model present")
    require(build.sha256(well_zip.read_bytes()) == build.previous.SOURCE_WELL_ZIP_SHA, "Unexpected well source")
    with zipfile.ZipFile(well_zip) as archive:
        original = archive.read("BladesOfWar_Showcase.html").decode("utf-8")
        male = archive.read("assets/models/male_fixed.glb")
    start = original.index('<script type="module">') + len('<script type="module">')
    end = original.index("const FEMALE_URI =", start)
    bundle = original[start:end].encode("utf-8")
    require(bundle.count(b"function sp(") == 1 and html.count(bundle) == 1, "Original well/engine bundle changed")
    require(all(male not in data and base64.b64encode(male) not in data for data in files.values()),
            "Male geometry remains in the delivered ZIP")
    print("PASS: ZIP integrity, unchanged viewer and latest well code, one female GLB and no male model")


def check_metadata(old: dict, new: dict, old_binary: bytearray, new_binary: bytearray) -> None:
    require(new["nodes"][-1]["name"] == new["meshes"][-1]["name"] == build.LID_NODE,
            "Upper-lid line node/mesh missing")
    require("skins" not in new and "animations" not in new and
            all("targets" not in primitive for mesh in new["meshes"] for primitive in mesh["primitives"]),
            "Model unexpectedly gained animation, skinning or morphs")
    normalized = copy.deepcopy(new)
    normalized["nodes"][-1]["name"] = old["nodes"][-1]["name"]
    normalized["meshes"][-1]["name"] = old["meshes"][-1]["name"]
    normalized["materials"][-1]["name"] = old["materials"][-1]["name"]
    for index in (0, 1, 2, 3, 8, 9, 10):
        normalized["accessors"][index] = copy.deepcopy(old["accessors"][index])
    normalized["bufferViews"] = copy.deepcopy(old["bufferViews"])
    normalized["buffers"] = copy.deepcopy(old["buffers"])
    require(normalized == old, "Unexpected glTF structure/material/metadata changes")
    for index in (4, 5, 6, 7, 8, 9):
        require(view_bytes(old, old_binary, index) == view_bytes(new, new_binary, index),
                f"Eye geometry or skin/eye texture changed at buffer view {index}")
    print("PASS: original blue-eye mesh, eye texture and entire skin/brow texture are byte-identical")


def welded_edge_counts(positions: np.ndarray, faces: np.ndarray) -> np.ndarray:
    _, groups = np.unique(positions, axis=0, return_inverse=True)
    welded = groups[faces]
    edges = np.concatenate((welded[:, [0, 1]], welded[:, [1, 2]], welded[:, [2, 0]]))
    edges = np.sort(edges, axis=1)
    _, counts = np.unique(edges, axis=0, return_counts=True)
    return counts


def check_body(old: dict, old_binary: bytearray, new: dict, new_binary: bytearray) -> None:
    p = build.helpers.accessor(old, old_binary, 0)
    normal = build.helpers.accessor(old, old_binary, 1)
    uv = build.helpers.accessor(old, old_binary, 2)
    faces = build.helpers.accessor(old, old_binary, 3).reshape(-1, 3)
    q = build.helpers.accessor(new, new_binary, 0)
    qnormal = build.helpers.accessor(new, new_binary, 1)
    quv = build.helpers.accessor(new, new_binary, 2)
    qfaces = build.helpers.accessor(new, new_binary, 3).reshape(-1, 3)
    n = len(p)
    require(n == 14517 and len(q) == 15866 and len(qfaces) == 29454, "Unexpected body topology size")
    require(np.isfinite(q).all() and np.isfinite(qnormal).all() and np.isfinite(quv).all() and
            np.allclose(np.linalg.norm(qnormal, axis=1), 1, atol=1e-5), "Invalid body values or normals")
    require(np.array_equal(uv, quv[:n]), "An original UV coordinate changed")
    wanted = (p + build.breast_delta(build.previous.vertex_map(n))).astype("<f4")
    require(np.array_equal(q[:n], wanted), "Original vertices changed beyond the pinned breast targets")
    changed = np.any(p != q[:n], axis=1)
    require(changed.sum() == 406 and np.all(p[changed] >= [-0.15, 1.08, 0.04]) and
            np.all(p[changed] <= [0.15, 1.33, 0.16]), "Vertex deformation escaped the chest")
    displacement = np.linalg.norm(q[:n] - p, axis=1)
    require(0.034 < displacement.max() < 0.035, "Unexpected breast displacement")
    require(np.all(q[n:] >= [-0.15, 1.06, 0.01]) and np.all(q[n:] <= [0.15, 1.34, 0.18]),
            "Added smoothing vertices escaped the chest")

    # Existing normals may change only in the weld groups of triangles incident
    # to a moved vertex, so the rest of the face, body and buttocks stay exact.
    keys = np.column_stack([np.round(p * 1e6).astype(np.int64), np.round(normal * 100).astype(np.int64)])
    _, welds = np.unique(keys, axis=0, return_inverse=True)
    touching = np.zeros(n, dtype=bool)
    selected = np.any(changed[faces], axis=1)
    touching[faces[selected].ravel()] = True
    affected = np.zeros(welds.max() + 1, dtype=bool)
    affected[welds[touching]] = True
    normals_changed = np.any(normal != qnormal[:n], axis=1)
    require(not np.any(normals_changed & ~affected[welds]), "Normals changed outside the chest neighborhood")
    transported = build.previous.updated_normals(p, q[:n], normal, faces)
    require(np.array_equal(qnormal[:n], transported), "Original normals differ from the local transport")

    expected = build.subdivide_breasts(p, q[:n], qnormal[:n], uv, faces)
    expected_positions, expected_normals, expected_uvs, expected_faces, parents, endpoints = expected
    require(all(np.array_equal(a, b) for a, b in
                ((q, expected_positions), (qnormal, expected_normals), (quv, expected_uvs), (qfaces, expected_faces))),
            "Unexpected local subdivision")
    require(len(endpoints) == len(q) - n and len(parents) == len(qfaces), "Subdivision metadata mismatch")
    wanted_uv = (uv[endpoints[:, 0]] + uv[endpoints[:, 1]]) * 0.5
    require(np.array_equal(quv[n:], wanted_uv), "New UV coordinates do not interpolate their source edges")

    # Independently check that each emitted subtriangle uses only the vertices
    # and edge points of its stated parent. For unaffected faces every edge
    # point remains the exact straight midpoint, so their surface is unchanged.
    for triangle, parent in zip(qfaces, parents):
        originals = set(int(v) for v in faces[parent])
        for index in triangle:
            index = int(index)
            if index < n:
                require(index in originals, "A subtriangle uses a vertex from another source face")
            else:
                require(set(endpoints[index - n].tolist()) <= originals, "A split edge crosses a source face")
                if not selected[parent]:
                    a, b = endpoints[index - n]
                    midpoint = ((p[a].astype(np.float64) + p[b].astype(np.float64)) / 2).astype("<f4")
                    require(np.array_equal(q[index], midpoint), "An unaffected face was curved or moved")

    tri0 = p[faces].astype(np.float64)
    tri_deformed = q[:n][faces].astype(np.float64)
    tri1 = q[qfaces].astype(np.float64)
    n0 = np.cross(tri0[:, 1] - tri0[:, 0], tri0[:, 2] - tri0[:, 0])
    nd = np.cross(tri_deformed[:, 1] - tri_deformed[:, 0], tri_deformed[:, 2] - tri_deformed[:, 0])
    n1 = np.cross(tri1[:, 1] - tri1[:, 0], tri1[:, 2] - tri1[:, 0])
    area0, aread, area1 = np.linalg.norm(n0, axis=1), np.linalg.norm(nd, axis=1), np.linalg.norm(n1, axis=1)
    require(np.all(area0 > 1e-12) and np.all(aread > 1e-12) and np.all(area1 > 1e-12), "Degenerate body face")
    cosine_original = np.sum(n0[parents] * n1, axis=1) / (area0[parents] * area1)
    cosine_deformed = np.sum(nd[parents] * n1, axis=1) / (aread[parents] * area1)
    require(np.all(cosine_original > 0) and np.all(cosine_deformed > 0), "A body face flipped")
    summed = np.zeros_like(n0)
    np.add.at(summed, parents, n1)
    require(np.allclose(summed[~selected], n0[~selected], atol=1e-9, rtol=2e-5),
            "A transition triangle changed the surface of an unaffected face")
    _, reps, inverse, counts = np.unique(p, axis=0, return_index=True, return_inverse=True, return_counts=True)
    require(np.array_equal(q[:n], q[:n][reps[inverse]]), "A pre-existing UV seam separated")
    require(np.all(welded_edge_counts(p, faces) == 2) and np.all(welded_edge_counts(q, qfaces) == 2),
            "The welded body has a new hole, T-junction or non-manifold edge")
    print(f"PASS: {changed.sum()} moved vertices (max {displacement.max() * 1000:.2f} mm), "
          f"{len(endpoints)} chest midpoints; {np.count_nonzero(counts > 1)} seams remain coincident")
    print(f"PASS: unaffected face surface and original UVs retained; no holes/flipped/degenerate faces "
          f"(min child/parent normal cosine {cosine_original.min():.4f})")


def check_lids(old: dict, old_binary: bytearray, new: dict, new_binary: bytearray) -> None:
    old_pos = build.helpers.accessor(old, old_binary, 8).reshape(2, 73, 7, 3)
    pos = build.helpers.accessor(new, new_binary, 8)
    normal = build.helpers.accessor(new, new_binary, 9)
    faces = lid_indices(new, new_binary)
    require(pos.shape == (854, 3) and normal.shape == (854, 3) and faces.shape == (1440, 3),
            "Unexpected number of lid vertices or triangles")
    require(faces.max() < len(pos) and np.isfinite(pos).all() and np.isfinite(normal).all() and
            np.allclose(np.linalg.norm(normal, axis=1), 1, atol=1e-5), "Invalid upper-lid geometry")
    strips = pos.reshape(2, 61, 7, 3)
    require(np.array_equal(strips[:, :55], old_pos[:, :55]), "The inner lid line changed unnecessarily")
    require(np.array_equal(strips[:, :, :, 0], old_pos[:, :61, :, 0]) and
            np.max(np.abs(pos[:, 0])) <= 0.042001, "An outward wing remains")
    for side in range(2):
        widths = strips[side, 55:61, -1, 1] - strips[side, 55:61, 0, 1]
        require(np.all(np.diff(widths) < 0) and 0 < widths[-1] < 0.00007,
                "The outer end does not smoothly taper")
    tri = pos[faces].astype(np.float64)
    require(np.all(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) > 1e-12),
            "Degenerate upper-lid face")
    parents = list(range(len(pos)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for a, b, c in faces:
        parents[find(int(b))] = find(int(a))
        parents[find(int(c))] = find(int(a))
    _, counts = np.unique([find(i) for i in range(len(pos))], return_counts=True)
    require(sorted(counts.tolist()) == [427, 427], "Expected exactly two continuous lid ribbons and no filaments")
    print("PASS: two 61×7 continuous upper-lid lines, no outward wings or separate lash filaments")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=build.DEFAULT_SOURCE)
    parser.add_argument("--well-archive", type=Path, default=build.previous.DEFAULT_WELL)
    parser.add_argument("--result", type=Path, default=build.DEFAULT_OUTPUT)
    args = parser.parse_args()
    source = build.source_model(args.source)
    model = (args.result / build.MODEL_NAME).read_bytes()
    old, old_binary = build.helpers.read_glb(source)
    new, new_binary = build.helpers.read_glb(model)
    check_archive(model, args.result, args.well_archive)
    check_metadata(old, new, old_binary, new_binary)
    check_body(old, old_binary, new, new_binary)
    check_lids(old, old_binary, new, new_binary)


if __name__ == "__main__":
    main()
