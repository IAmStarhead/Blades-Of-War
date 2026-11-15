"""Locally soften and subdivide only the two ears of model A.

The ear region is based on world-space coordinates in the verified source GLB.
Only selected interior edges are subdivided: unchanged triangles retain exactly
all their original indices. UV seams are handled by sharing geometric midpoints
but retaining separate UV vertices. No morph at the ear is introduced.
"""
from __future__ import annotations

from collections import defaultdict

import numpy as np


def _smoothstep(values: np.ndarray, start: float, end: float) -> np.ndarray:
    t = np.clip((values - start) / (end - start), 0, 1)
    return t * t * (3 - 2 * t)


def ear_neighbourhood(points: np.ndarray) -> np.ndarray:
    """A conservative enclosing volume around each ear, including its root."""
    return ((np.abs(points[:, 0]) > .059) & (points[:, 1] > 1.500)
            & (points[:, 1] < 1.605) & (points[:, 2] > -.030) & (points[:, 2] < .070))


def soften_ears(positions: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Two gentle, symmetric Laplacian passes with a tapered ear-only mask."""
    original = np.asarray(positions, dtype=np.float64)
    _, representatives, groups = np.unique(original, axis=0, return_index=True, return_inverse=True)
    welded = original[representatives].copy()
    grouped_faces = groups[faces]
    edges = np.concatenate([grouped_faces[:, [0, 1]], grouped_faces[:, [1, 2]],
                            grouped_faces[:, [2, 0]]])
    edges = np.unique(np.sort(edges, axis=1), axis=0)
    weight = (_smoothstep(abs(welded[:, 0]), .066, .074)
              * _smoothstep(welded[:, 1], 1.509, 1.522)
              * (1 - _smoothstep(welded[:, 1], 1.582, 1.597))
              * _smoothstep(welded[:, 2], -.020, -.008)
              * (1 - _smoothstep(welded[:, 2], .049, .060)))
    for _ in range(2):
        total = np.zeros_like(welded)
        count = np.zeros(len(welded))
        np.add.at(total, edges[:, 0], welded[edges[:, 1]])
        np.add.at(total, edges[:, 1], welded[edges[:, 0]])
        np.add.at(count, edges[:, 0], 1)
        np.add.at(count, edges[:, 1], 1)
        laplacian = total / np.maximum(count[:, None], 1) - welded
        welded += .25 * weight[:, None] * laplacian
    result = welded[groups].astype('<f4')
    changed = np.any(result != original, axis=1)
    if np.any(changed & ~ear_neighbourhood(original)):
        raise ValueError('Ear smoothing escaped its local neighbourhood')
    return result


def subdivide_ears(original: np.ndarray, deformed: np.ndarray, normals: np.ndarray,
                   uvs: np.ndarray, faces: np.ndarray, normalize) -> tuple[np.ndarray, ...]:
    """Split only interior edges of the displaced ear patch, with no T-junctions.

    `parents` maps new faces to their original faces. `endpoints` maps each new
    (possibly UV-duplicated) vertex to an original edge. Border edges and every
    triangle outside the patch remain unchanged. Round interior midpoints using
    source normals, with a conservative clamp to avoid exaggerating the folds.
    """
    changed = np.any(original != deformed, axis=1)
    selected = np.any(changed[faces], axis=1)
    _, representatives, groups = np.unique(original, axis=0, return_index=True, return_inverse=True)
    if not np.array_equal(deformed, deformed[representatives[groups]]):
        raise ValueError('Ear smoothing separated a previously coincident seam')
    grouped_faces = groups[faces]
    group_normals = np.zeros((len(representatives), 3), dtype=np.float64)
    np.add.at(group_normals, groups, normals.astype(np.float64))
    group_normals = normalize(group_normals)

    incidence: dict[tuple[int, int], list[int]] = defaultdict(list)
    for face_id, (a, b, c) in enumerate(grouped_faces):
        for u, v in ((a, b), (b, c), (c, a)):
            incidence[tuple(sorted((int(u), int(v))))].append(face_id)
    if any(len(adjacent) != 2 for adjacent in incidence.values()):
        raise ValueError('Expected the closed, welded body from the approved GLB')
    allowed = np.all(ear_neighbourhood(original)[faces], axis=1)
    midpoints: dict[tuple[int, int], np.ndarray] = {}
    for edge, adjacent in incidence.items():
        # Both adjacent faces have to be edited and entirely in the ear region;
        # thus no unaffected face or edge is split and there is no T-junction.
        if not all(selected[i] and allowed[i] for i in adjacent):
            continue
        a, b = edge
        start = deformed[representatives[a]].astype(np.float64)
        end = deformed[representatives[b]].astype(np.float64)
        vector = end - start
        offset = -(np.dot(vector, group_normals[a]) * group_normals[a]
                   - np.dot(vector, group_normals[b]) * group_normals[b]) / 8
        maximum = np.linalg.norm(vector) * .15
        size = np.linalg.norm(offset)
        if size > maximum:
            offset *= maximum / size
        midpoints[edge] = (start + end) / 2 + offset

    out_positions = list(deformed.astype(np.float64))
    out_normals = list(normals.astype(np.float64))
    out_uvs = list(uvs.astype(np.float64))
    edge_indices: dict[tuple[int, int], int] = {}
    endpoints: list[tuple[int, int]] = []
    out_faces: list[list[int]] = []
    parents: list[int] = []

    def midpoint(u: int, v: int) -> int | None:
        key = tuple(sorted((int(u), int(v))))
        group_key = tuple(sorted((int(groups[u]), int(groups[v]))))
        if group_key not in midpoints:
            return None
        if key not in edge_indices:
            edge_indices[key] = len(out_positions)
            endpoints.append(key)
            out_positions.append(midpoints[group_key])
            out_normals.append(normalize(np.asarray([(normals[u] + normals[v]) / 2]))[0])
            out_uvs.append((uvs[u] + uvs[v]) / 2)
        return edge_indices[key]

    def add(face_id: int, triangle: list[int]) -> None:
        out_faces.append(triangle)
        parents.append(face_id)

    for face_id, (a, b, c) in enumerate(faces):
        edge = [midpoint(a, b), midpoint(b, c), midpoint(c, a)]
        count = sum(vertex is not None for vertex in edge)
        if count == 0:
            add(face_id, [a, b, c])
        elif count == 3:
            x, y, z = edge
            for triangle in ([a, x, z], [x, b, y], [z, y, c], [x, y, z]):
                add(face_id, triangle)
        elif count == 1:
            if edge[0] is not None:
                a, b, c, x = a, b, c, edge[0]
            elif edge[1] is not None:
                a, b, c, x = b, c, a, edge[1]
            else:
                a, b, c, x = c, a, b, edge[2]
            for triangle in ([a, x, c], [x, b, c]):
                add(face_id, triangle)
        else:  # Two split edges; rotate so that they meet at b.
            if edge[0] is not None and edge[1] is not None:
                a, b, c, x, y = a, b, c, edge[0], edge[1]
            elif edge[1] is not None and edge[2] is not None:
                a, b, c, x, y = b, c, a, edge[1], edge[2]
            else:
                a, b, c, x, y = c, a, b, edge[2], edge[0]
            for triangle in ([a, x, c], [x, y, c], [x, b, y]):
                add(face_id, triangle)

    points = np.asarray(out_positions, dtype='<f4')
    if not np.all(ear_neighbourhood(points[len(original):])):
        raise ValueError('New ear vertices escaped the local neighbourhood')
    return (points, np.asarray(out_normals, dtype='<f4'), np.asarray(out_uvs, dtype='<f4'),
            np.asarray(out_faces, dtype='<u4'), np.asarray(parents, dtype=np.int64),
            np.asarray(endpoints, dtype=np.int64), selected)


def build_ears(positions: np.ndarray, normals: np.ndarray, uvs: np.ndarray,
               faces: np.ndarray, refinement) -> tuple[np.ndarray, ...]:
    """Return new arrays and the maps required to preserve all other data."""
    original = np.asarray(positions, dtype=np.float64)
    normal_original = np.asarray(normals, dtype=np.float64)
    deformed = soften_ears(original, faces)
    # Both operands must use the same float precision. Otherwise arithmetic noise
    # would unnecessarily change normals throughout the body.
    transported = refinement.updated_normals(original, deformed.astype(np.float64),
                                              normal_original, faces)
    points, result_normals, tex, triangles, parents, endpoints, selected = subdivide_ears(
        original, deformed, transported, uvs, faces, refinement.normalize)
    linear = points.astype(np.float64)
    linear[len(original):] = (deformed[endpoints[:, 0]].astype(np.float64)
                              + deformed[endpoints[:, 1]].astype(np.float64)) / 2
    result_normals = refinement.updated_normals(linear, points.astype(np.float64), result_normals, triangles)
    # Transport is useful at the ear root, but outside its neighbourhood the
    # approved normals must remain byte-for-byte identical.
    untouched = ~ear_neighbourhood(original)
    result_normals[:len(original)][untouched] = normals[untouched]
    if not np.array_equal(triangles[~selected[parents]], faces[~selected]):
        raise ValueError('An unaffected triangle was unexpectedly subdivided')
    return points, result_normals, tex, triangles, parents, endpoints, selected
