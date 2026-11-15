"""Bake a symmetric, model-specific hand pose and intermediate corrective shapes.

The temporary rig supplies joint influences only. The exported mesh has no rig;
its rest position is untouched and the computed displacements are hand morphs.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial.transform import Rotation

# Index, middle, ring, little: MCP/PIP/DIP flex, root yaw, and fitted PIP/DIP
# pivot corrections in millimetres. Axes follow each finger's rest direction
# rather than treating all four fingers as parallel.
FINGERS = np.array([
    [60.056476813924064, 98.72624787229482, 59.87285069755998, 0.017475615044193482, -4.186855746513155, -0.6831172449496807],
    [58.4257656757113, 107.50227788018508, 40.56508681891803, -0.6011299557067096, -4.055349765502484, -2.5521094348486195],
    [45.59191261951101, 101.68249335828759, 55.00635879394697, 6.0565959129389135, -4.251562616672294, -2.3698454322405675],
    [76.37078124464225, 81.64283568232574, 46.71394898682262, 0.026946417443631798, -0.402398771074842, 0.6894454313932781],
], dtype=np.float64)

# The thumb approaches the outside of the index/middle fingers. During the
# transition it moves slightly forward to pass around the index; the other
# fingers move slightly outwards to clear the neighbouring thigh.
THUMB = np.array([
    [30.06202305142485, -34.32120837895855, -28.00032939518323],
    [-0.28942828683079824, -62.86368526183922, 15.443499838401983],
    [6.706869332091914, -2.28692038142475, -34.0409490356297],
], dtype=np.float64)
# finger progress, thumb progress, finger outward mm, thumb forward mm
KEYS = [(0.25, 0.3, 8.0, 0.0), (0.5, 0.5, 12.0, 6.0), (0.75, 1.0, 8.0, 8.0)]


def around(rotation: np.ndarray, pivot: np.ndarray) -> np.ndarray:
    matrix = np.eye(4)
    matrix[:3, :3] = rotation
    matrix[:3, 3] = pivot - rotation @ pivot
    return matrix


class FittedHands:
    def __init__(self, motion, rig_data: bytes, positions: np.ndarray, uvs: np.ndarray):
        self.positions = np.asarray(positions, dtype=np.float64)
        self.count = motion.ORIGINAL_VERTICES
        (_, nodes, ids, names, joints, weights, adapted, _, _) = motion.rig_inputs(rig_data, positions, uvs)
        self.names, self.joints, self.weights = names, joints, weights
        self.pivots: dict[str, list[list[np.ndarray]]] = {}
        self.joint_weights: dict[str, list[list[np.ndarray]]] = {}
        self.selections: dict[str, np.ndarray] = {}
        self.bases: dict[str, np.ndarray] = {}
        self.homogeneous: dict[str, np.ndarray] = {}
        for side in ('L', 'R'):
            pivots, all_weights = [], []
            selected = np.zeros(self.count, dtype=bool)
            for digit in range(1, 6):
                digit_pivots, digit_weights = [], []
                for part in range(1, 4):
                    name = f'finger{digit}_{part}_{side}'
                    node = next(i for i, item in enumerate(nodes) if item.get('name') == name)
                    joint = ids.index(node)
                    weight = (weights * (joints == joint)).sum(axis=1)
                    selected |= weight > 1e-8
                    digit_pivots.append(adapted[node][:3, 3].copy())
                    digit_weights.append(weight)
                pivots.append(digit_pivots)
                all_weights.append(digit_weights)
            self.pivots[side], self.joint_weights[side] = pivots, all_weights
            self.selections[side] = np.flatnonzero(selected)
            base = self.positions[self.selections[side]]
            self.bases[side] = base
            self.homogeneous[side] = np.column_stack([base, np.ones(len(base))])
        # The mesh and skin weights are mirror-symmetric, while the external
        # reference rig has slightly different hand pivots. Mirroring pivots
        # avoids asymmetric final grips without altering the neutral mesh.
        for digit in range(5):
            for part in range(3):
                self.pivots['R'][digit][part] = self.pivots['L'][digit][part] * [-1, 1, 1]
        self.axes = []
        for digit in range(1, 5):
            pivots = np.asarray(self.pivots['L'][digit])
            weight = self.group('L', (f'finger{digit + 1}_3_',))
            selected = weight > .65
            tip = np.average(self.positions[:self.count][selected], axis=0, weights=weight[selected])
            along = np.concatenate([np.diff(pivots, axis=0), [tip - pivots[-1]]])
            axes = np.cross(along, np.array([-1., 0., 0.]))
            axes /= np.linalg.norm(axes, axis=1)[:, None]
            self.axes.append(axes)

    def group(self, side: str, prefixes: tuple[str, ...]) -> np.ndarray:
        indices = [i for i, name in enumerate(self.names)
                   if name.endswith('_' + side) and name.startswith(prefixes)]
        return (self.weights * np.isin(self.joints, indices)).sum(axis=1)

    def finger_delta(self, progress: float, outward_mm: float = 0.0) -> np.ndarray:
        result = np.zeros_like(self.positions)
        for side, sign in [('L', 1), ('R', -1)]:
            indices = self.selections[side]
            base, homogeneous = self.bases[side], self.homogeneous[side]
            out = np.zeros_like(base)
            for digit, (a, b, c, yaw, pip_mm, dip_mm) in enumerate(FINGERS, start=1):
                chain = np.eye(4)
                for part, angle in enumerate((a, b, c)):
                    pivot = self.pivots[side][digit][part].copy()
                    pivot[0] += sign * (0, pip_mm, dip_mm)[part] / 1000
                    axis = self.axes[digit - 1][part] * sign
                    rotation = Rotation.from_rotvec(axis * np.deg2rad(angle * progress)).as_matrix()
                    if part == 0:
                        rotation = Rotation.from_euler('y', sign * yaw * progress, degrees=True).as_matrix() @ rotation
                    chain = chain @ around(rotation, pivot)
                    joint_weight = self.joint_weights[side][digit][part][indices]
                    out += ((homogeneous @ chain.T)[:, :3] - base) * joint_weight[:, None]
            result[indices] += out
            finger_weight = self.group(side, ('finger2_', 'finger3_', 'finger4_', 'finger5_'))
            result[:self.count, 0] += sign * finger_weight * outward_mm / 1000
        return result

    def thumb_delta(self, progress: float, forward_mm: float = 0.0) -> np.ndarray:
        result = np.zeros_like(self.positions)
        reflection = np.diag([-1., 1., 1.])
        for side in ('L', 'R'):
            indices = self.selections[side]
            base, homogeneous = self.bases[side], self.homogeneous[side]
            out = np.zeros_like(base)
            chain = np.eye(4)
            for part in range(3):
                rotation = Rotation.from_euler('xyz', THUMB[part], degrees=True)
                rotation = Rotation.from_rotvec(rotation.as_rotvec() * progress).as_matrix()
                if side == 'R':
                    rotation = reflection @ rotation @ reflection
                chain = chain @ around(rotation, self.pivots[side][0][part])
                weight = self.joint_weights[side][0][part][indices]
                out += ((homogeneous @ chain.T)[:, :3] - base) * weight[:, None]
            result[indices] += out
            thumb_weight = self.group(side, ('finger1_',))
            result[:self.count, 2] += thumb_weight * forward_mm / 1000
        return result

    def key_deltas(self) -> list[np.ndarray]:
        return ([np.zeros_like(self.positions)]
                + [self.finger_delta(t, outward) + self.thumb_delta(thumb, forward)
                   for t, thumb, outward, forward in KEYS]
                + [self.finger_delta(1) + self.thumb_delta(1)])


def correction_weights(value: float) -> np.ndarray:
    """Fists weight and three triangular corrective weights for a scalar 0..1."""
    t = float(np.clip(value, 0, 1))
    return np.array([t] + [max(0., 1. - abs(t - center) / .25)
                           for center in (.25, .5, .75)], dtype=np.float64)


def morph_targets(hands: FittedHands, normals: np.ndarray, faces: np.ndarray, refinement) -> list[tuple[np.ndarray, np.ndarray]]:
    """Export the end morph and three local corrections for piecewise motion."""
    keys = hands.key_deltas()
    p = hands.positions
    n = np.asarray(normals, dtype=np.float64)
    normal_keys = [np.zeros_like(n)] + [
        refinement.updated_normals(p, p + key, n, faces).astype(np.float64) - n
        for key in keys[1:]
    ]
    result = [(keys[-1], normal_keys[-1])]
    for t, pos, normal in zip((.25, .5, .75), keys[1:4], normal_keys[1:4]):
        result.append((pos - t * keys[-1], normal - t * normal_keys[-1]))
    return result
