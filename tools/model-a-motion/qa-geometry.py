#!/usr/bin/env python3
"""Sample hand-morph intersections in the actual exported GLB (requires python-fcl)."""
from __future__ import annotations

import argparse
from itertools import combinations
from pathlib import Path

import numpy as np
import trimesh

import build


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--result", type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument("--rig", type=Path, default=build.DEFAULT_RIG)
    args = parser.parse_args()
    original, raw = build.helpers.read_glb(build.checked(build.DEFAULT_SOURCE, build.SOURCE_SHA256, "approved relief model"))
    document, binary = build.helpers.read_glb((args.result / build.MODEL_NAME).read_bytes())
    p = build.helpers.accessor(document, binary, 0).astype(float)
    uv = build.helpers.accessor(document, binary, 2)
    original_faces = build.helpers.accessor(original, raw, 3).reshape(-1, 3)
    faces = original_faces[np.all(original_faces < build.ORIGINAL_VERTICES, axis=1)]
    fist_accessor = document["meshes"][0]["primitives"][0]["targets"][0]["POSITION"]
    delta = build.helpers.accessor(document, binary, fist_accessor)[:build.ORIGINAL_VERTICES].astype(float)
    p = p[:build.ORIGINAL_VERTICES]
    rig_data = build.checked(args.rig, build.RIG_SHA256, "reference hand rig")
    _, _, _, names, joints, weights, *_ = build.rig_inputs(rig_data, p, uv)

    def group(side: str, prefixes: tuple[str, ...]) -> np.ndarray:
        ids = [i for i, name in enumerate(names) if name.endswith("_" + side) and name.startswith(prefixes)]
        return (weights * np.isin(joints, ids)).sum(axis=1)

    def selected(weight: np.ndarray, threshold: float) -> np.ndarray:
        return faces[weight[faces].mean(axis=1) > threshold]

    groups = {}
    for side in ("L", "R"):
        groups[side] = {
            "thumb": selected(group(side, ("finger1_",)), .6),
            "fingers": selected(group(side, ("finger2_", "finger3_", "finger4_", "finger5_")), .6),
            "distal": selected(group(side, tuple(f"finger{d}_{k}_" for d in range(2, 6) for k in (2, 3))), .6),
            "palm": selected(group(side, ("wrist", "metacarpal")), .75),
            "hand": selected(group(side, ("wrist", "metacarpal", "finger")), .6),
            "leg": selected(group(side, ("upperleg", "lowerleg", "pelvis")), .6),
        }
        for finger in range(2, 6):
            groups[side][f"finger{finger}"] = selected(group(side, (f"finger{finger}_",)), .6)
        if any(len(item) == 0 for item in groups[side].values()):
            raise AssertionError(f"Empty collision group on {side}")

    def collision(vertices: np.ndarray, first: np.ndarray, second: np.ndarray) -> tuple[int, float]:
        manager = trimesh.collision.CollisionManager()
        manager.add_object("first", trimesh.Trimesh(vertices=vertices, faces=first, process=False))
        _, contacts = manager.in_collision_single(trimesh.Trimesh(vertices=vertices, faces=second, process=False),
                                                  return_data=True)
        depths = []
        for contact in contacts:
            a = first[contact.index("first")]
            b = second[contact.index("__external")]
            # Triangles sharing an original vertex (including UV duplicates) are
            # neighbours, not a self-penetration between separate surfaces.
            if len(set(a) & set(b)) or np.any(np.linalg.norm(p[a, None] - p[b][None, :], axis=2) < 1e-6):
                continue
            depths.append(contact.depth)
        return len(depths), max(depths, default=0) * 1000

    checked_pairs = 0
    for t in np.linspace(0, 1, 21):
        vertices = p + t * delta
        for side in ("L", "R"):
            g = groups[side]
            tests = [("thumb/fingers", g["thumb"], g["fingers"]),
                     ("thumb/palm", g["thumb"], g["palm"]),
                     ("distal fingers/palm", g["distal"], g["palm"]),
                     ("hand/leg", g["hand"], g["leg"])]
            tests += [(f"finger{a}/finger{b}", g[f"finger{a}"], g[f"finger{b}"])
                      for a, b in combinations(range(2, 6), 2)]
            for label, a, b in tests:
                count, depth = collision(vertices, a, b)
                if count:
                    raise AssertionError(f"{side} {label}, weight {t:.2f}: {count} contacts, depth {depth:.2f} mm")
                checked_pairs += 1
    print(f"PASS: {checked_pairs} FCL group-pair tests, both hands at 21 sampled weights; "
          "no detected thumb/finger, thumb/palm, fingertip/palm, finger/finger or hand/leg intersections")
    print("NOTE: weight-defined triangle subsets and sampled times are not a proof for every mesh triangle or instant.")


if __name__ == "__main__":
    main()
