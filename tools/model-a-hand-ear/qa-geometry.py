#!/usr/bin/env python3
"""Sample exported morph geometry for hand self- and same-side hand/leg intersections.

Requires python-fcl. This examines broad, rig-weight-selected hand and leg
triangle subsets on both sides, not every triangle or every instant. Original
rest-pose self contacts are tracked separately; newly detected contacts fail.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import fcl
import numpy as np

import build
import hands


class CollisionGroup:
    def __init__(self, faces: np.ndarray, welded_vertices: np.ndarray):
        self.original_faces = np.asarray(faces, dtype=np.int64)
        self.vertices, indices = np.unique(faces, return_inverse=True)
        self.faces = indices.reshape(-1, 3).astype(np.int32)
        self.welded_faces = welded_vertices[faces]

    def object(self, positions: np.ndarray):
        model = fcl.BVHModel()
        model.beginModel(len(self.vertices), len(self.faces))
        model.addSubModel(np.ascontiguousarray(positions[self.vertices], dtype=np.float64), self.faces)
        model.endModel()
        return fcl.CollisionObject(model)


def contacts(first_object, second_object, first: CollisionGroup, second: CollisionGroup,
             self_test: bool = False) -> dict[tuple[int, int], float]:
    request = fcl.CollisionRequest(num_max_contacts=50_000, enable_contact=True)
    result = fcl.CollisionResult()
    fcl.collide(first_object, second_object, request, result)
    found = result.contacts
    if len(found) >= request.num_max_contacts:
        raise AssertionError('FCL contact limit reached; comparison would be incomplete')
    if not found:
        return {}
    a = np.fromiter((c.b1 for c in found), dtype=np.int64)
    b = np.fromiter((c.b2 for c in found), dtype=np.int64)
    depth = np.fromiter((c.penetration_depth for c in found), dtype=np.float64)
    valid = (a != b) if self_test else np.ones(len(a), dtype=bool)
    # Welded UV duplicates and immediate neighbours are one continuous surface,
    # not an intersection between separate parts of the hand. Canonicalize
    # both orders rather than assuming FCL always reports each pair twice.
    valid &= ~np.any(first.welded_faces[a, :, None] == second.welded_faces[b, None, :], axis=(1, 2))
    pairs: dict[tuple[int, int], float] = {}
    for i, j, d in zip(a[valid], b[valid], depth[valid]):
        key = tuple(sorted((int(i), int(j)))) if self_test else (int(i), int(j))
        pairs[key] = max(pairs.get(key, 0.), float(d))
    return pairs


def crossing_segment(first: np.ndarray, second: np.ndarray) -> float | None:
    """Length of a non-coplanar triangle/triangle intersection in metres.

    Unlike FCL's triangle contact depth this is directly measurable from the
    two surfaces, though it is not a volume-penetration depth either. Return
    None when nearly coplanar or numerically ambiguous, not a false zero.
    """
    a, b = np.asarray(first, dtype=float), np.asarray(second, dtype=float)
    def normal(triangle: np.ndarray) -> np.ndarray | None:
        cross = np.cross(triangle[1] - triangle[0], triangle[2] - triangle[0])
        size = np.linalg.norm(cross)
        return cross / size if size > 1e-15 else None
    na, nb = normal(a), normal(b)
    if na is None or nb is None or np.linalg.norm(np.cross(na, nb)) < 1e-6:
        return None
    points = []
    for moving, plane, n in ((a, b, nb), (b, a, na)):
        signed = (moving - plane[0]) @ n
        e0, e1 = plane[1] - plane[0], plane[2] - plane[0]
        d00, d01, d11 = e0 @ e0, e0 @ e1, e1 @ e1
        denominator = d00 * d11 - d01 * d01
        if denominator <= 1e-30:
            return None
        for i in range(3):
            j = (i + 1) % 3
            if signed[i] * signed[j] >= 0:
                continue
            point = moving[i] + signed[i] / (signed[i] - signed[j]) * (moving[j] - moving[i])
            relative = point - plane[0]
            d20, d21 = relative @ e0, relative @ e1
            u, v = (d11 * d20 - d01 * d21) / denominator, (d00 * d21 - d01 * d20) / denominator
            if u >= -1e-8 and v >= -1e-8 and u + v <= 1 + 1e-8:
                points.append(point)
    if len(points) < 2:
        return None
    return max(float(np.linalg.norm(x - y)) for x in points for y in points)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--result', type=Path, default=build.DEFAULT_OUTPUT)
    parser.add_argument('--rig', type=Path, default=build.motion.DEFAULT_RIG)
    parser.add_argument('--samples', type=int, default=101)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2')
    source = build.motion.checked(build.DEFAULT_SOURCE, build.SOURCE_SHA256, 'approved motion model')
    old_doc, old_bin = build.helpers.read_glb(source)
    document, binary = build.helpers.read_glb((args.result / build.MODEL_NAME).read_bytes())
    count = build.motion.ORIGINAL_VERTICES
    p = build.helpers.accessor(document, binary, 0)[:count].astype(np.float64)
    uv = build.helpers.accessor(document, binary, 2)
    faces = np.concatenate([build.helpers.accessor(old_doc, old_bin, i).reshape(-1, 3) for i in (3, 13)])
    faces = faces[np.all(faces < count, axis=1)]
    targets = document['meshes'][0]['primitives'][0]['targets']
    deltas = np.stack([build.helpers.accessor(document, binary, item['POSITION'])[:count].astype(np.float64)
                       for item in targets])
    if len(deltas) != len(build.TARGET_NAMES):
        raise AssertionError('Unexpected hand morph target count')
    rig = build.motion.checked(args.rig, build.motion.RIG_SHA256, 'reference hand rig')
    _, _, _, names, joints, weights, *_ = build.motion.rig_inputs(rig, p, uv)

    def group(side: str, prefixes: tuple[str, ...]) -> np.ndarray:
        ids = [i for i, name in enumerate(names) if name.endswith('_' + side) and name.startswith(prefixes)]
        return (weights * np.isin(joints, ids)).sum(axis=1)

    def select(weight: np.ndarray, threshold: float) -> np.ndarray:
        return faces[weight[faces].mean(axis=1) > threshold]

    _, welded = np.unique(p, axis=0, return_inverse=True)
    groups = {}
    for side in ('L', 'R'):
        hand_faces = select(group(side, ('wrist', 'metacarpal', 'finger')), .25)
        leg_faces = select(group(side, ('upperleg', 'lowerleg', 'pelvis')), .6)
        if len(hand_faces) < 2500 or len(leg_faces) < 100:
            raise AssertionError(f'Unexpectedly small collision group on {side}')
        hand, leg = CollisionGroup(hand_faces, welded), CollisionGroup(leg_faces, welded)
        hand_object = hand.object(p)
        baseline = contacts(hand_object, hand_object, hand, hand, True)
        if contacts(hand_object, leg.object(p), hand, leg):
            raise AssertionError(f'Baseline {side} hand intersects the leg group')
        groups[side] = hand, leg, baseline
        print(f'{side}: {len(hand_faces)} hand triangles, {len(leg_faces)} leg triangles; '
              f'{len(baseline)} pre-existing non-adjacent self contacts in the unchanged open pose')

    failures = []
    last_rest_contact = {'L': 0., 'R': 0.}
    worst_depth = None
    worst_segment = None
    for t in np.linspace(0, 1, args.samples):
        vertices = p + np.einsum('i,ijk->jk', hands.correction_weights(float(t)), deltas)
        for side in ('L', 'R'):
            hand, leg, baseline = groups[side]
            obj = hand.object(vertices)
            current = contacts(obj, obj, hand, hand, True)
            added = {key: depth for key, depth in current.items() if key not in baseline}
            if added:
                failures.append((side, round(float(t), 4), 'new self', len(added), max(added.values()) * 1000))
            continuing = current.keys() & baseline.keys()
            if continuing:
                last_rest_contact[side] = float(t)
            for key in continuing:
                old_depth, new_depth = baseline[key], current[key]
                a, b = hand.original_faces[list(key)]
                old_length = crossing_segment(p[a], p[b])
                new_length = crossing_segment(vertices[a], vertices[b])
                record = (side, float(t), key, a.tolist(), b.tolist(), old_depth, new_depth, old_length, new_length)
                if worst_depth is None or new_depth - old_depth > worst_depth[6] - worst_depth[5]:
                    worst_depth = record
                if old_length is not None and new_length is not None and (
                        worst_segment is None or new_length - old_length > worst_segment[8] - worst_segment[7]):
                    worst_segment = record
            hit_leg = contacts(obj, leg.object(vertices), hand, leg)
            if hit_leg:
                failures.append((side, round(float(t), 4), 'hand/leg', len(hit_leg), max(hit_leg.values()) * 1000))
    if failures:
        for item in failures[:20]:
            print('FAIL', item)
        raise AssertionError(f'{len(failures)} sampled hand intersections; first 20 shown')
    print(f'PASS: no newly detected hand self-intersections or same-side hand/leg intersections '
          f'on both hands at {args.samples} sampled weights')
    print('Pre-existing pairs last seen at sampled weight: '
          + ', '.join(f'{side}={value:.4f}' for side, value in last_rest_contact.items()))
    if worst_depth:
        side, t, pair, a, b, before, after, length_before, length_after = worst_depth
        print(f'Largest sampled FCL depth increase: {side}, weight={t:.4f}, group pair={pair}, '
              f'mesh vertices={a}/{b}, {before*1000:.3f} -> {after*1000:.3f} mm')
        if length_before is not None and length_after is not None:
            print(f'  Same triangle-pair crossing segment: {length_before*1000:.3f} -> {length_after*1000:.3f} mm')
    if worst_segment:
        side, t, pair, _, _, _, _, before, after = worst_segment
        print(f'Largest sampled increase in baseline crossing-segment length: {side}, weight={t:.4f}, '
              f'group pair={pair}, {before*1000:.3f} -> {after*1000:.3f} mm')
    print('NOTE: pre-existing intersections can change during motion; FCL depth and crossing length '
          'are not equivalent measures of volume penetration.')
    print('NOTE: these are selected triangle subsets and sampled instants, not a proof for every mesh triangle or time.')


if __name__ == '__main__':
    main()
