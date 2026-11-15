#!/usr/bin/env python3
"""Compare selected body intersections and sampled hand/pelvis contacts to Eve.

This is deliberately not a proof of the whole body or continuous animation.
Requires python-fcl. Welded neighbours are excluded; pre-existing contacts are
reported separately and are not re-labelled as new defects.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import fcl
import numpy as np
import build


class Group:
    def __init__(self, faces: np.ndarray, welded: np.ndarray):
        self.original_faces = np.asarray(faces, dtype=np.int64)
        self.vertices, inverse = np.unique(faces, return_inverse=True)
        self.faces = inverse.reshape(-1, 3).astype(np.int32)
        self.welded_faces = welded[faces]

    def object(self, positions: np.ndarray):
        model = fcl.BVHModel()
        model.beginModel(len(self.vertices), len(self.faces))
        model.addSubModel(np.ascontiguousarray(positions[self.vertices], dtype=np.float64), self.faces)
        model.endModel()
        return fcl.CollisionObject(model)


def contacts(a, b, first: Group, second: Group, self_test: bool) -> dict[tuple[int, int], float]:
    request = fcl.CollisionRequest(num_max_contacts=500_000, enable_contact=True)
    result = fcl.CollisionResult()
    fcl.collide(a, b, request, result)
    if len(result.contacts) >= request.num_max_contacts:
        raise AssertionError('FCL contact limit reached; comparison incomplete')
    if not result.contacts:
        return {}
    x = np.fromiter((c.b1 for c in result.contacts), dtype=np.int64)
    y = np.fromiter((c.b2 for c in result.contacts), dtype=np.int64)
    depth = np.fromiter((c.penetration_depth for c in result.contacts), dtype=np.float64)
    valid = (x != y) if self_test else np.ones(len(x), dtype=bool)
    valid &= ~np.any(first.welded_faces[x, :, None] == second.welded_faces[y, None, :], axis=(1, 2))
    pairs: dict[tuple[int, int], float] = {}
    for i, j, d in zip(x[valid], y[valid], depth[valid]):
        key = tuple(sorted((int(i), int(j)))) if self_test else (int(i), int(j))
        pairs[key] = max(pairs.get(key, 0.), float(d))
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=build.SOURCE)
    parser.add_argument('--reference', type=Path, default=build.eye.DEFAULT_REFERENCE)
    parser.add_argument('--result', type=Path, default=build.OUTPUT)
    parser.add_argument('--samples', type=int, default=9)
    args = parser.parse_args()
    if args.samples < 2:
        parser.error('--samples must be at least 2')
    source = build.motion.checked(args.source, build.SOURCE_SHA256, 'Eve eye study')
    reference = build.motion.checked(args.reference, build.eye.REFERENCE_SHA256, 'auxiliary weight source')
    doc, binary = build.helpers.read_glb(source)
    p = build.helpers.accessor(doc, binary, 0).astype(np.float64)
    faces = np.concatenate([build.helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
    _, welded = np.unique(p, axis=0, return_inverse=True)
    triangles = p[faces]
    regions = {
        'face': ((triangles[:, :, 1].max(1) > 1.44) & (triangles[:, :, 1].min(1) < 1.60)
                 & (np.abs(triangles[:, :, 0]).min(1) < .09)),
        'chest': ((triangles[:, :, 1].max(1) > 1.05) & (triangles[:, :, 1].min(1) < 1.40)
                  & (np.abs(triangles[:, :, 0]).min(1) < .18) & (triangles[:, :, 2].max(1) > .01)),
        'glute': ((triangles[:, :, 1].max(1) > .82) & (triangles[:, :, 1].min(1) < 1.09)
                  & (np.abs(triangles[:, :, 0]).min(1) < .185) & (triangles[:, :, 2].min(1) < .035)),
    }
    variants = {}
    for variant in build.VARIANTS:
        var_doc, var_bin = build.helpers.read_glb((args.result / variant.filename).read_bytes())
        variants[variant.key] = build.helpers.accessor(var_doc, var_bin, 0).astype(np.float64)
    for label, mask in regions.items():
        group = Group(faces[mask], welded)
        obj = group.object(p)
        baseline = contacts(obj, obj, group, group, True)
        print(f'{label}: {len(group.faces):,} selected triangles, {len(baseline)} original non-neighbour contacts')
        for name, vertices in variants.items():
            obj = group.object(vertices)
            now = contacts(obj, obj, group, group, True)
            added = now.keys() - baseline.keys()
            if added:
                raise AssertionError(f'{name}: {len(added)} new selected {label} contact pairs, first={next(iter(added))}')
            growth = max((now[k] - baseline[k] for k in now.keys() & baseline.keys()), default=0.)
            print(f'  PASS {name}: {len(now)} contacts, no new pairs; max baseline FCL-depth change {growth*1000:.3f} mm')

    rig, rbin = build.motion.read_any_glb(reference)
    uv = build.helpers.accessor(doc, binary, 2)
    if not np.array_equal(uv[:build.ORIGINAL_COUNT], build.motion.rig_accessor(rig, rbin, 2)):
        raise AssertionError('Rig UV mismatch')
    joints = build.motion.rig_accessor(rig, rbin, 3)
    weights = build.motion.rig_accessor(rig, rbin, 4)
    names = [rig['nodes'][i]['name'] for i in rig['skins'][0]['joints']]
    source_faces = faces[np.all(faces < build.ORIGINAL_COUNT, axis=1)]
    hand_groups = {}
    for side in ('L', 'R'):
        ids = [i for i, name in enumerate(names)
               if name.endswith('_' + side) and name.startswith(('wrist', 'metacarpal', 'finger'))]
        hand_weight = (weights * np.isin(joints, ids)).sum(axis=1)
        hand_faces = source_faces[hand_weight[source_faces].mean(axis=1) > .25]
        if len(hand_faces) < 2500:
            raise AssertionError(f'Unexpected hand selection {side}')
        hand_groups[side] = Group(hand_faces, welded)
    pelvis = Group(faces[regions['glute']], welded)
    deltas = np.stack([build.helpers.accessor(doc, binary, item['POSITION']).astype(np.float64)
                       for item in doc['meshes'][0]['primitives'][0]['targets']])
    for t in np.linspace(0, 1, args.samples):
        mix = np.array([t, *[max(0., 1. - abs(t - c) / .25) for c in (.25, .5, .75)]])
        motion = np.einsum('i,ijk->jk', mix, deltas)
        baseline_pose = p + motion
        for side, hand in hand_groups.items():
            baseline = contacts(hand.object(baseline_pose), pelvis.object(baseline_pose), hand, pelvis, False)
            for name, vertices in variants.items():
                posed = vertices + motion
                current = contacts(hand.object(posed), pelvis.object(posed), hand, pelvis, False)
                added = current.keys() - baseline.keys()
                if added:
                    raise AssertionError(f'{name}: {len(added)} new {side} hand/glute contacts at {t:.3f}')
    print(f'PASS: both selected hand/glute groups: no new pairs at {args.samples} fist samples per variant')
    print('NOTE: FCL depths and sampled, selected triangle pairs are not a guarantee of collision-free geometry or motion.')


if __name__ == '__main__':
    main()
