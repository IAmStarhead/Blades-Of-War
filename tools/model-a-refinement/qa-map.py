#!/usr/bin/env python3
"""Independently reconstruct the stored vertex map from the pinned base OBJ UVs."""
from __future__ import annotations

import argparse
from collections import defaultdict
from pathlib import Path

import numpy as np

import build

BASE_SHA256 = "8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", type=Path, required=True, help="Pinned MakeHuman base.obj")
    parser.add_argument("--source", type=Path, default=build.DEFAULT_SOURCE)
    args = parser.parse_args()
    raw = args.base.read_bytes()
    if build.sha256(raw) != BASE_SHA256:
        raise ValueError("Unexpected MakeHuman base OBJ")
    uv_points: list[tuple[float, float]] = []
    pairs: set[tuple[int, int]] = set()
    group = ""
    for line in raw.decode("utf-8").splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == "vt":
            uv_points.append((float(words[1]), 1 - float(words[2])))
        elif words[0] == "g":
            group = words[1]
        elif words[0] == "f" and group == "body":
            for corner in words[1:]:
                vertex, uv, *_ = corner.split("/")
                pairs.add((int(vertex) - 1, int(uv) - 1))
    uv_points = np.asarray(uv_points)
    buckets: dict[tuple[int, int], list[tuple[int, np.ndarray]]] = defaultdict(list)
    for vertex, uv_index in pairs:
        uv = uv_points[uv_index]
        cell = tuple(np.floor(uv * 1e6).astype(int))
        buckets[cell].append((vertex, uv))
    document, binary = build.lash_helpers.read_glb(build.original_model(args.source))
    source_uv = build.lash_helpers.accessor(document, binary, 2)
    source_positions = build.lash_helpers.accessor(document, binary, 0)
    recovered: list[int] = []
    errors: list[float] = []
    for uv in source_uv:
        cell = np.floor(uv * 1e6).astype(int)
        candidates: list[tuple[int, float]] = []
        for x in (-1, 0, 1):
            for y in (-1, 0, 1):
                for vertex, base_uv in buckets.get((cell[0] + x, cell[1] + y), []):
                    distance = float(np.linalg.norm(uv - base_uv))
                    if distance < 1e-6:
                        candidates.append((vertex, distance))
        ids = {vertex for vertex, _ in candidates}
        if len(ids) != 1:
            raise AssertionError(f"Missing or ambiguous native ID at UV {uv}: {ids}")
        recovered.append(next(iter(ids)))
        errors.append(min(distance for _, distance in candidates))
    recovered_array = np.asarray(recovered, dtype="<u2")
    expected = build.vertex_map(len(source_uv))
    if not np.array_equal(recovered_array, expected):
        raise AssertionError("Reconstructed UV map differs from the stored map")
    _, representatives, inverse = np.unique(np.round(source_positions, 7), axis=0,
                                             return_index=True, return_inverse=True)
    if not np.array_equal(recovered_array, recovered_array[representatives[inverse]]):
        raise AssertionError("A coincident seam mapped to different native vertices")
    print(f"PASS: {len(recovered_array)} uniquely matched UVs, max error {max(errors):.2e}; "
          "stored map and coincident seam IDs agree")


if __name__ == "__main__":
    main()
