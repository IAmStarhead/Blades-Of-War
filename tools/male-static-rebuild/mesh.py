#!/usr/bin/env python3
"""Author the stationary MakeHuman body and join it to the retained old nape.

The pose weights are used only while constructing the static surface. No skin,
rig, morphs or animation is exported by this script. Input assets are pinned
and hash-checked by build.py. The head and ears are handled by author.mjs.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

import networkx as nx
import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial.transform import Rotation

HERE = Path(__file__).resolve().parent
SOURCES = HERE / 'sources'
BOTTOM, TOP = 1.510, 1.545


def smoothstep(value):
    value = np.clip(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def apply_rotation(points, rotation, pivot):
    return (points - pivot) @ rotation.T + pivot


def make_body():
    vertices, quads, group = [], [], None
    with (SOURCES / 'base.obj').open(encoding='utf-8') as stream:
        for line in stream:
            parts = line.split()
            if not parts:
                continue
            if parts[0] == 'v':
                vertices.append([float(x) for x in parts[1:4]])
            elif parts[0] == 'g':
                group = parts[1]
            elif parts[0] == 'f' and group == 'body':
                face = [int(x.split('/')[0]) - 1 for x in parts[1:]]
                if len(face) != 4:
                    raise ValueError('Unexpected base-mesh face')
                quads.append(face)
    vertices, quads = np.array(vertices, dtype=float), np.array(quads, dtype=int)
    if len(vertices) != 19158 or len(quads) != 13378:
        raise ValueError('Unexpected MakeHuman base topology')
    used = np.unique(quads)

    def target(name):
        delta = np.zeros_like(vertices)
        with (SOURCES / name).open(encoding='utf-8') as stream:
            for line in stream:
                parts = line.split()
                if parts and not parts[0].startswith('#'):
                    delta[int(parts[0])] = [float(x) for x in parts[1:4]]
        return delta

    # The average-muscle/average-weight universal target is the zero target.
    # An adult male macro target plus a modest muscle target makes the donor.
    vertices += target('caucasian-male-young.target')
    vertices += 0.35 * target('universal-male-young-maxmuscle-averageweight.target')
    scale = 1.788 / np.ptp(vertices[used, 1])
    vertices *= scale
    vertices[:, 1] += 0.010 - np.min(vertices[used, 1])
    neck = vertices[used]
    neck = neck[(neck[:, 1] > 1.50) & (neck[:, 1] < 1.56) & (np.abs(neck[:, 0]) < 0.10)]
    vertices[:, 2] += -0.030 - (neck[:, 2].min() + neck[:, 2].max()) / 2.0
    # Match the reproducible precision used for the evaluated source pose.
    vertices = np.round(vertices, 7)

    skeleton = json.loads((SOURCES / 'default.mhskel').read_text(encoding='utf-8'))
    raw_weights = json.loads((SOURCES / 'default_weights.mhw').read_text(encoding='utf-8'))['weights']
    weights, total = {}, np.zeros(len(vertices))
    for name, values in raw_weights.items():
        values = np.asarray(values, dtype=float)
        weight = np.zeros(len(vertices))
        weight[values[:, 0].astype(int)] = values[:, 1]
        weights[name] = weight
        total += weight
    if np.any(total <= 0):
        raise ValueError('Unexpected unweighted source vertex')
    for name in weights:
        weights[name] /= total

    def joint(name, end='head'):
        key = skeleton['bones'][name][end]
        return np.mean(vertices[skeleton['joints'][key]], axis=0)

    # Pose both arms closer to the old stationary model, close the stance a
    # little, and gently curl the four fingers. This is baked geometry, not a
    # claimed movement rig; the native weights are used to avoid hard hinges.
    posed = vertices.copy()
    for side, sign in [('L', 1), ('R', -1)]:
        suffix = '.' + side
        shoulder, elbow = joint('upperarm01' + suffix), joint('lowerarm01' + suffix)
        shoulder_rotation = Rotation.from_euler('z', -sign * 28, degrees=True).as_matrix()
        elbow = apply_rotation(elbow[None, :], shoulder_rotation, shoulder)[0]
        elbow_rotation = Rotation.from_euler('x', 25, degrees=True).as_matrix()
        upper, lower = np.zeros(len(vertices)), np.zeros(len(vertices))
        for name, weight in weights.items():
            if not name.endswith(suffix):
                continue
            if name.startswith(('upperarm', 'lowerarm', 'wrist', 'finger', 'metacarpal')):
                upper += weight
            if name.startswith(('lowerarm', 'wrist', 'finger', 'metacarpal')):
                lower += weight
        upper += 0.25 * weights['shoulder01' + suffix]
        v1 = apply_rotation(vertices, shoulder_rotation, shoulder)
        v2 = apply_rotation(v1, elbow_rotation, elbow)
        posed += (v1 - vertices) * upper[:, None] + (v2 - v1) * lower[:, None]

        wrist, index, pinky = (joint(name + suffix) for name in ('wrist', 'finger2-1', 'finger5-1'))
        palm = np.cross(index - wrist, pinky - wrist)
        palm *= sign / np.linalg.norm(palm)
        for finger in range(2, 6):
            rotations, pivots = [], []
            for part in range(1, 4):
                name = f'finger{finger}-{part}{suffix}'
                pivot = joint(name)
                direction = joint(name, 'tail') - pivot
                direction /= np.linalg.norm(direction)
                axis = np.cross(direction, palm)
                axis /= np.linalg.norm(axis)
                angle = np.deg2rad(-12 * [1.0, 0.8, 0.65][part - 1])
                rotations.append(Rotation.from_rotvec(axis * angle).as_matrix())
                pivots.append(pivot)
                moved = vertices
                for rotation, center in reversed(list(zip(rotations, pivots))):
                    moved = apply_rotation(moved, rotation, center)
                finger_delta = (moved - vertices) @ shoulder_rotation.T @ elbow_rotation.T
                posed += finger_delta * weights[name][:, None]

        hip = joint('upperleg01' + suffix)
        leg_rotation = Rotation.from_euler('z', -sign * 4, degrees=True).as_matrix()
        leg = np.zeros(len(vertices))
        for name, weight in weights.items():
            if name.endswith(suffix) and name.startswith(('upperleg', 'lowerleg', 'foot', 'toe')):
                leg += weight
        posed += (apply_rotation(vertices, leg_rotation, hip) - vertices) * leg[:, None]
    posed[:, 1] += 0.010 - np.min(posed[used, 1])
    posed = np.round(posed, 7)

    # Lower the donor neck slightly to fit the unchanged old head; adjust depth
    # only near that junction, blending into the shoulders and torso.
    height = posed[:, 1].copy()
    posed[:, 1] -= 0.020 * smoothstep((height - 1.32) / 0.23)
    fade = smoothstep((height - 1.47) / 0.09)
    posed[:, 2] += fade * (0.12 * (posed[:, 2] + 0.015) - 0.011)
    faces = np.stack((quads[:, [0, 1, 2]], quads[:, [0, 2, 3]]), axis=1).reshape(-1, 3)
    if not np.isfinite(posed).all():
        raise ValueError('Non-finite posed donor')
    return posed, faces, scale


def vertex_normals(points, faces):
    cross = np.cross(points[faces[:, 1]] - points[faces[:, 0]], points[faces[:, 2]] - points[faces[:, 0]])
    result = np.zeros_like(points)
    for column in range(3):
        np.add.at(result, faces[:, column], cross)
    length = np.linalg.norm(result, axis=1)
    result[length > 0] /= length[length > 0, None]
    return result


def old_nape(path):
    old = json.loads(path.read_text(encoding='utf-8'))
    positions = np.asarray(old['positions']).reshape(-1, 3) + np.asarray(old['positionDelta']).reshape(-1, 3)
    normals = np.asarray(old['normals']).reshape(-1, 3) + np.asarray(old['normalDelta']).reshape(-1, 3)
    normals /= np.linalg.norm(normals, axis=1)[:, None]
    faces = np.asarray(old['indices']).reshape(-1, 3)
    # Coincident old UV splits share normals. Welding is restricted to the
    # copied old body, and the original head mesh stays byte-for-byte indexed.
    _, index, inverse = np.unique(np.round(positions, 7), axis=0, return_index=True, return_inverse=True)
    return positions[index], inverse[faces], normals[index]


def section(points, faces, normals, height, above):
    """Clip a triangle mesh and return its one closed, angle-ordered cut loop."""
    outp, outn, outf, originals, intersections = [], [], [], {}, {}

    def existing(index):
        if index not in originals:
            originals[index] = len(outp)
            outp.append(points[index])
            outn.append(normals[index])
        return originals[index]

    def intersection(i, j):
        key = tuple(sorted((int(i), int(j))))
        if key not in intersections:
            p, q = points[i], points[j]
            t = (height - p[1]) / (q[1] - p[1])
            point = p + (q - p) * t
            point[1] = height
            normal = normals[i] * (1 - t) + normals[j] * t
            normal /= np.linalg.norm(normal)
            intersections[key] = len(outp)
            outp.append(point)
            outn.append(normal)
        return intersections[key]

    for face in faces:
        polygon = []
        for i, j in zip(face, np.roll(face, -1)):
            inside = points[i, 1] > height if above else points[i, 1] < height
            next_inside = points[j, 1] > height if above else points[j, 1] < height
            if inside:
                polygon.append(existing(i))
            if inside != next_inside:
                polygon.append(intersection(i, j))
        for i in range(1, len(polygon) - 1):
            outf.append([polygon[0], polygon[i], polygon[i + 1]])
    points, normals, faces = np.asarray(outp), np.asarray(outn), np.asarray(outf)
    graph = nx.Graph()
    for face in faces:
        for i, j in zip(face, np.roll(face, -1)):
            if abs(points[i, 1] - height) < 1e-9 and abs(points[j, 1] - height) < 1e-9:
                graph.add_edge(int(i), int(j))
    if nx.number_connected_components(graph) != 1 or any(degree != 2 for _, degree in graph.degree()):
        raise ValueError('Cut is not a single closed loop')
    ring = np.asarray(list(graph.nodes))
    center = np.mean(points[ring][:, [0, 2]], axis=0)
    ring = ring[np.argsort(angles(points, ring, center))]
    if not all(graph.has_edge(i, j) for i, j in zip(ring, np.roll(ring, -1))):
        raise ValueError('Cut loop is not star-shaped')
    return points, faces, normals, ring, center


def angles(points, ring, center):
    return np.mod(np.arctan2(points[ring, 0] - center[0], points[ring, 2] - center[1]), 2 * np.pi)


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def point_on_ray(points, normals, va, vb, center, angle):
    a = points[va, [0, 2]] - center
    b = points[vb, [0, 2]] - center
    ray = np.array([np.sin(angle), np.cos(angle)])
    difference = b - a
    denominator = cross2(difference, ray)
    if abs(denominator) < 1e-14:
        raise ValueError('Section edge is parallel to ray')
    t = -cross2(a, ray) / denominator
    if t < -2e-6 or t > 1 + 2e-6:
        raise ValueError(f'Ray missed section edge: {t}')
    t = np.clip(t, 0, 1)
    point = points[va] * (1 - t) + points[vb] * t
    normal = normals[va] * (1 - t) + normals[vb] * t
    normal /= np.linalg.norm(normal)
    return point, normal


def sample_section(points, normals, ring, center, theta):
    source_angles = angles(points, ring, center)
    result, result_normals = [], []
    for angle in theta:
        j = np.searchsorted(source_angles, angle, side='right') - 1
        va, vb = ring[j % len(ring)], ring[(j + 1) % len(ring)]
        p, n = point_on_ray(points, normals, va, vb, center, angle)
        result.append(p)
        result_normals.append(n)
    return np.asarray(result), np.asarray(result_normals)


def split_boundary(points, faces, normals, ring, center, theta):
    """Split each original boundary edge at all common angular samples."""
    source_angles = angles(points, ring, center)
    newp, newn, edge_faces = points.tolist(), normals.tolist(), {}
    for index, face in enumerate(faces):
        for x, y in zip(face, np.roll(face, -1)):
            edge_faces.setdefault(tuple(sorted((int(x), int(y)))), []).append(index)
    replacements, result_ring = {}, np.full(len(theta), -1, dtype=int)
    for i, va in enumerate(ring):
        vb = ring[(i + 1) % len(ring)]
        start = source_angles[i]
        end = source_angles[(i + 1) % len(ring)] + (2 * np.pi if i == len(ring) - 1 else 0)
        nearest = int(np.argmin(np.abs(theta - start)))
        if abs(theta[nearest] - start) >= 1e-9:
            raise ValueError('Missing original boundary point')
        result_ring[nearest] = va
        candidates = []
        for j, angle in enumerate(theta):
            adjusted = angle + (2 * np.pi if angle < start - 1e-9 else 0)
            if start + 1e-9 < adjusted < end - 1e-9:
                candidates.append((adjusted, j, angle))
        inserted = []
        for _, j, angle in sorted(candidates):
            p, n = point_on_ray(points, normals, va, vb, center, angle)
            newp.append(p.tolist())
            newn.append(n.tolist())
            result_ring[j] = len(newp) - 1
            inserted.append(len(newp) - 1)
        adjacent = edge_faces[tuple(sorted((int(va), int(vb))))]
        if len(adjacent) != 1 or adjacent[0] in replacements:
            raise ValueError('Unexpected boundary adjacency')
        fi, face = adjacent[0], list(faces[adjacent[0]])
        forward = any(face[k] == va and face[(k + 1) % 3] == vb for k in range(3))
        sequence = ([int(va)] + inserted + [int(vb)]) if forward else ([int(vb)] + inserted[::-1] + [int(va)])
        opposite = next(x for x in face if x != va and x != vb)
        replacements[fi] = [[sequence[k], sequence[k + 1], int(opposite)] for k in range(len(sequence) - 1)]
    if np.any(result_ring < 0):
        raise ValueError('Incomplete common boundary')
    newf = []
    for fi, face in enumerate(faces):
        newf.extend(replacements.get(fi, [face.tolist()]))
    return np.asarray(newp), np.asarray(newf), np.asarray(newn), result_ring


def periodic_sample(angles_, values, points):
    return np.stack([np.interp(points, angles_, values[:, k], period=2 * np.pi) for k in range(values.shape[1])], axis=1)


def make_join(donor, donor_faces, old, old_faces, old_normals):
    donor_normals = vertex_normals(donor, donor_faces)
    p0, f0, n0, r0, c0 = section(donor, donor_faces, donor_normals, BOTTOM, False)
    p1, f1, n1, r1, c1 = section(old, old_faces, old_normals, TOP, True)
    delta = 0.0025
    pb, _, nb, rb, cb = section(donor, donor_faces, donor_normals, BOTTOM - delta, False)
    pt, _, nt, rt, ct = section(old, old_faces, old_normals, TOP + delta, True)
    regular = np.arange(128) * 2 * np.pi / 128
    theta = np.unique(np.round(np.concatenate((regular, angles(p0, r0, c0), angles(p1, r1, c1))), 10))
    if np.min(np.diff(np.append(theta, theta[0] + 2 * np.pi))) < 1e-8:
        raise ValueError('Coincident join parameters')
    p0, f0, n0, r0 = split_boundary(p0, f0, n0, r0, c0, theta)
    p1, f1, n1, r1 = split_boundary(p1, f1, n1, r1, c1, theta)
    x0, x1 = p0[r0][:, [0, 2]], p1[r1][:, [0, 2]]
    nlo, nhi = n0[r0].copy(), n1[r1].copy()
    xb, _ = sample_section(pb, nb, rb, cb, theta)
    xt, _ = sample_section(pt, nt, rt, ct, theta)
    d0, d1, gap = (x0 - xb[:, [0, 2]]) / delta, (xt[:, [0, 2]] - x1) / delta, TOP - BOTTOM

    # Smooth contour estimates in an even angular domain, but retain the exact
    # source positions at both cut edges. A Hermite patch preserves the local
    # neck and shoulder slopes more smoothly than joining two unequal rings.
    grid = np.arange(512) * 2 * np.pi / 512

    def angular_filter(values):
        regular_values = periodic_sample(theta, values, grid)
        filtered = gaussian_filter1d(regular_values, sigma=8, axis=0, mode='wrap')
        return periodic_sample(grid, filtered, theta)

    x0s, x1s, d0s, d1s = map(angular_filter, (x0, x1, d0, d1))
    nlo_sm, nhi_sm = angular_filter(nlo), angular_filter(nhi)
    for normal in (nlo_sm, nhi_sm):
        normal /= np.linalg.norm(normal, axis=1)[:, None]

    def patch(t):
        h00, h10 = 2 * t**3 - 3 * t*t + 1, t**3 - 2 * t*t + t
        h01, h11 = -2 * t**3 + 3 * t*t, t**3 - t*t
        w0, w1 = 1 - smoothstep(t / 0.20), 1 - smoothstep((1 - t) / 0.20)
        return h00*x0s + h10*gap*d0s + h01*x1s + h11*gap*d1s + w0*(x0-x0s) + w1*(x1-x1s)

    rows, row_normals = [], []
    steps = [0.025, 0.06, 0.12, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.88, 0.94, 0.975]
    count = len(theta)
    for t in steps:
        x, epsilon = patch(t), 0.0001
        derivative = (patch(min(t + epsilon, 1)) - patch(max(t - epsilon, 0))) / (2 * epsilon * gap)
        positions = np.column_stack((x[:, 0], np.full(count, BOTTOM + t * gap), x[:, 1]))
        tangent = np.roll(positions, -1, axis=0) - np.roll(positions, 1, axis=0)
        dy = np.column_stack((derivative[:, 0], np.ones(count), derivative[:, 1]))
        normal = np.cross(tangent, dy)
        normal /= np.linalg.norm(normal, axis=1)[:, None]
        normal = angular_filter(normal)
        normal /= np.linalg.norm(normal, axis=1)[:, None]
        wlo, whi = 1 - smoothstep(t / 0.38), 1 - smoothstep((1 - t) / 0.38)
        normal = (1 - wlo - whi) * normal + wlo * nlo_sm + whi * nhi_sm
        normal /= np.linalg.norm(normal, axis=1)[:, None]
        rows.append(positions)
        row_normals.append(normal)

    def transfer_smoothing(points, normals, center, source, filtered, fade):
        angle = np.mod(np.arctan2(points[:, 0] - center[0], points[:, 2] - center[1]), 2*np.pi)
        change = periodic_sample(theta, filtered - source, angle)
        result = normals + fade[:, None] * change
        result /= np.linalg.norm(result, axis=1)[:, None]
        return result

    n0 = transfer_smoothing(p0, n0, c0, nlo, nlo_sm, smoothstep((p0[:, 1] - (BOTTOM - .025)) / .025))
    n1 = transfer_smoothing(p1, n1, c1, nhi, nhi_sm, 1 - smoothstep((p1[:, 1] - TOP) / .010))
    positions = np.vstack((p0, p1, *rows))
    normals = np.vstack((n0, n1, *row_normals))
    faces = [*f0.tolist(), *(f1 + len(p0)).tolist()]
    r1 += len(p0)
    start = len(p0) + len(p1)
    middle = [np.arange(start + i*count, start + (i+1)*count) for i in range(len(rows))]
    for low, high in zip([r0, *middle], [*middle, r1]):
        for i in range(count):
            j = (i + 1) % count
            faces.extend([[int(low[i]), int(low[j]), int(high[i])], [int(low[j]), int(high[j]), int(high[i])]])
    faces = np.asarray(faces)

    # Check the new joining band separately from the inherited head overlap.
    bridge_start = len(f0) + len(f1)
    bridge = faces[bridge_start:]
    cross = np.cross(positions[bridge[:, 1]] - positions[bridge[:, 0]], positions[bridge[:, 2]] - positions[bridge[:, 0]])
    area = np.linalg.norm(cross, axis=1)
    average_normals = normals[bridge].mean(axis=1)
    dot = np.einsum('ij,ij->i', cross, average_normals) / (area * np.linalg.norm(average_normals, axis=1))
    if not np.isfinite(positions).all() or not np.isfinite(normals).all() or np.min(area) <= 1e-12 or np.min(dot) <= 0:
        raise ValueError('Degenerate or inverted join triangles')
    edges = Counter(tuple(sorted((int(face[i]), int(face[(i+1) % 3])))) for face in faces for i in range(3))
    for ring in (r0, r1):
        if any(edges[tuple(sorted((int(x), int(y))))] != 2 for x, y in zip(ring, np.roll(ring, -1))):
            raise ValueError('Join boundary is not stitched')
    report = {
        'lowerCutY': BOTTOM, 'upperCutY': TOP, 'joinRingVertices': int(count),
        'donorFaces': int(len(f0)), 'retainedNapeFaces': int(len(f1)), 'joinFaces': int(len(bridge)),
        'joinMinNormalDot': float(np.min(dot)), 'joinMinDoubleArea': float(np.min(area)),
        'bodyBoundaryEdges': int(sum(n == 1 for n in edges.values())),
        'bodyNonManifoldEdges': int(sum(n > 2 for n in edges.values())),
    }
    return positions, normals, faces, r0, r1, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('old_body', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    donor, donor_faces, scale = make_body()
    old, old_faces, old_normals = old_nape(args.old_body)
    positions, normals, faces, r0, r1, report = make_join(donor, donor_faces, old, old_faces, old_normals)
    report['donorScaleToMeters'] = float(scale)
    report['bodyVertices'] = int(len(positions))
    report['bodyTriangles'] = int(len(faces))
    data = {
        'positions': positions.astype('<f4').ravel().tolist(),
        'normals': normals.astype('<f4').ravel().tolist(),
        'indices': faces.astype('<u4').ravel().tolist(),
        'ring0': r0.tolist(), 'ring1': r1.tolist(), 'report': report,
    }
    args.output.write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
