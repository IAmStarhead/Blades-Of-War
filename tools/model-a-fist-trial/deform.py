"""Model-specific, symmetric corrective shapes for the separate fist trial.

The previous model has no finger skeleton. The existing temporary rig is used
only to find influences and approximate centres; the shapes are baked back to
the original mesh. The little and ring fingers use a smooth centre-line bend,
with a small, local soft-pad correction on the little finger. Nothing is added
to the neutral mesh. This is an art-direction trial, not an anatomical rig or
physical soft-tissue simulation.
"""
from __future__ import annotations

import numpy as np
from scipy.integrate import cumulative_trapezoid
from scipy.interpolate import CubicHermiteSpline
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation


REFLECTION = np.diag([-1., 1., 1.])


def smoothstep(value: np.ndarray | float) -> np.ndarray:
    value = np.clip(value, 0., 1.)
    return value * value * (3. - 2. * value)


class FingerCurve:
    """Bend a rest finger along its sampled centre line, retaining its skin."""

    def __init__(self, fitted, digit: int):
        self.fitted = fitted
        self.positions = fitted.positions
        pivots = np.asarray(fitted.pivots['L'][digit - 1])
        weight = fitted.group('L', (f'finger{digit}_3_',))
        selected = np.flatnonzero(weight > .65)
        if len(selected) < 5:
            raise ValueError(f'Cannot estimate the tip of finger {digit}')
        along = pivots[2] - pivots[1]
        along /= np.linalg.norm(along)
        projection = (self.positions[selected] - pivots[2]) @ along
        tip_ids = selected[projection > np.quantile(projection, .8)]
        tip = np.average(self.positions[tip_ids], axis=0, weights=weight[tip_ids])
        anchors = np.vstack([pivots, tip])
        lengths = np.linalg.norm(np.diff(anchors, axis=0), axis=1)
        if np.any(lengths < 1e-5):
            raise ValueError(f'Degenerate centre line for finger {digit}')
        self.knots = np.r_[0., np.cumsum(lengths)]
        directions = np.diff(anchors, axis=0) / lengths[:, None]
        tangents = np.vstack([directions[0], directions[0] + directions[1],
                              directions[1] + directions[2], directions[-1]])
        tangents /= np.linalg.norm(tangents, axis=1)[:, None]
        curve = CubicHermiteSpline(self.knots, anchors, tangents, axis=0)
        self.grid = np.linspace(-.02, self.knots[-1] + .015, 1601)
        clipped = np.clip(self.grid, 0., self.knots[-1])
        self.centres = (curve(clipped)
                        + np.where((self.grid < 0)[:, None], self.grid[:, None] * tangents[0], 0.)
                        + np.where((self.grid > self.knots[-1])[:, None],
                                   (self.grid - self.knots[-1])[:, None] * tangents[-1], 0.))
        self.derivative = np.gradient(self.centres, self.grid, axis=0)
        nearest_curve = cKDTree(self.centres)
        self.samples = {}
        for side in ('L', 'R'):
            influences = fitted.group(side, (f'finger{digit}_',))
            indices = np.flatnonzero(influences > 1e-7)
            points = self.positions[indices].copy()
            if side == 'R':
                points = points @ REFLECTION
            _, nearest = nearest_curve.query(points)
            self.samples[side] = (indices, influences[indices], points, nearest, self.centres[nearest])

    def delta(self, angles: tuple[float, float, float], offset_mm: float, tilt: float,
              dip_halfwidth_mm: float, pad_mm: float = 0.) -> np.ndarray:
        """Return a displacement; optional pad gently fills the inner bend."""
        halfwidth = np.array([6., 6., dip_halfwidth_mm]) / 1000.
        creases = self.knots[:3].copy()
        creases[1] += offset_mm / 1000.
        progression = np.array([smoothstep((self.grid - (creases[k] - halfwidth[k]))
                                            / (2. * halfwidth[k])) for k in range(3)])
        axis = np.array([0., tilt, -np.sqrt(1. - tilt * tilt)])
        rotations = np.broadcast_to(np.eye(3), (len(self.grid), 3, 3)).copy()
        for k, angle in enumerate(np.deg2rad(angles)):
            rotation = Rotation.from_rotvec(progression[k, :, None] * angle * axis[None, :]).as_matrix()
            rotations = rotations @ rotation
        tangent = np.einsum('sij,sj->si', rotations, self.derivative)
        offset = cumulative_trapezoid(tangent - self.derivative, self.grid, axis=0, initial=0.)
        offset -= offset[np.searchsorted(self.grid, 0.)]
        result = np.zeros_like(self.positions)
        for side in ('L', 'R'):
            indices, weights, points, nearest, centres = self.samples[side]
            distance_along = self.grid[nearest]
            radius = np.einsum('nij,nj->ni', rotations[nearest], points - centres)
            moved = centres + offset[nearest] + radius
            difference = (moved - points) * weights[:, None]
            if pad_mm:
                # Only the proximal side of the crease is rounded. Expanding
                # both sides at once makes them interpenetrate at the fold.
                inward = np.cross(np.broadcast_to(axis, (len(nearest), 3)), tangent[nearest])
                inward /= np.maximum(np.linalg.norm(inward, axis=1)[:, None], 1e-12)
                radius_length = np.maximum(np.linalg.norm(radius, axis=1), 1e-12)
                facing = np.maximum(np.einsum('ni,ni->n', radius, inward) / radius_length, 0.)
                falloff = np.exp(-.5 * ((distance_along - .020) / .012) ** 2)
                proximal = 1. - smoothstep((distance_along - .012) / .008)
                difference += (pad_mm / 1000. * weights * facing * falloff * proximal)[:, None] * inward
            if side == 'R':
                difference = difference @ REFLECTION
            result[indices] += difference
        return result

    def root_gated(self, delta: np.ndarray, amount: float) -> np.ndarray:
        """Fade a changed finger shape into the unchanged knuckle region."""
        result = np.zeros_like(delta)
        for side in ('L', 'R'):
            indices, _, _, nearest, _ = self.samples[side]
            factor = smoothstep((self.grid[nearest] - .004) / .011)
            result[indices] += amount * factor[:, None] * delta[indices]
        return result


def key_shapes(fitted, hands) -> list[np.ndarray]:
    """Return the neutral and four pose-key displacements for both hands."""
    original_angles = hands.FINGERS.copy()
    little = FingerCurve(fitted, 5)
    ring = FingerCurve(fitted, 4)
    keys = [np.zeros_like(fitted.positions)]
    try:
        for progress, thumb, outward, forward in [*hands.KEYS, (1., 1., 0., 0.)]:
            # Preserve the previous index, middle and thumb, with a slight
            # ring adjustment, and replace the little finger's old LBS bend.
            hands.FINGERS[:] = original_angles
            hands.FINGERS[2, :4] = [45., 100., 55., 3.]
            hands.FINGERS[3, :] = 0.
            shape = fitted.finger_delta(progress, outward) + fitted.thumb_delta(thumb, forward)
            little_angles = tuple(progress * np.array([35., 130., 55.]))
            pad = 5. * smoothstep((progress - .55) / .45)
            shape += little.delta(little_angles, 3., -.15, 4.8, float(pad))

            # Mix a smoother ring-finger bend into the existing deformation,
            # retaining the old skinning near the adjoining middle finger.
            hands.FINGERS[:] = 0.
            hands.FINGERS[2, :] = original_angles[2]
            hands.FINGERS[2, :4] = [45., 100., 55., 3.]
            old_ring = fitted.finger_delta(progress)
            ring_angles = tuple(progress * np.array([45., 90., 75.]))
            new_ring = ring.delta(ring_angles, 4., -.1, 5.)
            shape += ring.root_gated(new_ring - old_ring, .6)
            keys.append(shape)
    finally:
        hands.FINGERS[:] = original_angles
    return keys
