#!/usr/bin/env python3
"""Build five individual, more restrained woman studies without replacing Eve or v1–v3.

The two regional mesh targets are *artistic shape ingredients*, not claims
about what any population looks like. Their height and translation are fitted
out before a partial, facial-only blend; neither target is used on the body.
"""
from __future__ import annotations

import argparse
import copy
import dataclasses
import importlib.util
import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
from scipy.ndimage import gaussian_filter1d
from scipy.spatial import cKDTree
import trimesh

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('_women_variants_v3', ROOT / 'tools/women-variants-v3/build.py')
if spec is None or spec.loader is None:
    raise RuntimeError('Cannot load the previous women study')
v3 = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = v3
spec.loader.exec_module(v3)
v2, old, eye, motion, helpers, refinement = v3.v2, v3.old, v3.eye, v3.motion, v3.helpers, v3.refinement
SOURCE, SOURCE_SHA256 = v3.SOURCE, v3.SOURCE_SHA256
ORIGINAL_COUNT = v3.ORIGINAL_COUNT
OUTPUT = ROOT / 'work/character-model-search/women-variants-v4'
DATA = HERE / 'targets'
ARCHIVE_NAME = 'six_women_individual_studies_and_well.zip'


def make_variant(key: str, label: str, filename: str, scale: float, inherited: str,
                 *, face: dict[str, float], extra_face: dict[str, float],
                 old_changes: dict, base_changes: dict, eyes: tuple, lips: tuple,
                 ears: tuple, brow: v3.Brow) -> v3.Variant:
    before = next(v for v in v3.VARIANTS if v.key == inherited)
    common = dict(key=key, label=label, filename=filename, scale=scale)
    first = dataclasses.replace(before.base.base, **common, face=face, **old_changes)
    base = dataclasses.replace(before.base, **common, base=first, extra_face=extra_face, **base_changes)
    return v3.Variant(**common, base=base, eyes=eyes, lips=lips, ears=ears, brows=brow)


VARIANTS = [
    make_variant('north', 'Северянка', 'woman_north_v4.glb', 1.05, 'north',
        face={'cheek/l-cheek-bones-incr.target': .12, 'cheek/r-cheek-bones-incr.target': .12,
              'cheek/l-cheek-volume-decr.target': .14, 'cheek/r-cheek-volume-decr.target': .14,
              'chin/chin-width-incr.target': .38, 'chin/chin-prominent-incr.target': .20,
              'nose/nose-scale-horiz-incr.target': .36},
        extra_face={'eyes/l-eye-height1-incr.target': .35, 'eyes/r-eye-height1-incr.target': .35,
                    'mouth/mouth-upperlip-volume-decr.target': .20},
        old_changes={'butt': .03}, base_changes={'bust': .003},
        eyes=(.02, .06, -.03), lips=(.04, -.08), ears=(.04, .0015, .04, .0015),
        brow=v3.Brow(4.4, 46., .90, .45, 2.35, (108, 75, 58), .58)),
    make_variant('central', 'Централка', 'woman_central_v4.glb', 1., 'central',
        face={'cheek/l-cheek-volume-decr.target': .55, 'cheek/r-cheek-volume-decr.target': .55,
              'chin/chin-width-decr.target': .60, 'chin/chin-prominent-decr.target': .18,
              'mouth/mouth-scale-horiz-decr.target': .35,
              'existing/nose/nose-scale-horiz-decr.target': .60,
              'nose/nose-scale-depth-decr.target': .58},
        extra_face={'eyes/l-eye-height1-incr.target': .20, 'eyes/r-eye-height1-incr.target': .20,
                    'mouth/mouth-lowerlip-volume-decr.target': .20},
        old_changes={'butt': -.65, 'chest_reduction': .0105, 'chest_contract': .12},
        base_changes={'torso': (-.07, -.05, -.045)}, eyes=(-.08, .13, -.02), lips=(.03, .04),
        ears=(-.08, -.0005, -.02, -.0015),
        brow=v3.Brow(2.3, 40., .72, 1.4, 2.20, (78, 53, 42), .59)),
    make_variant('east', 'Японский мотив', 'woman_east_asian_v4.glb', .95, 'east',
        face={'cheek/l-cheek-volume-incr.target': .12, 'cheek/r-cheek-volume-incr.target': .12,
              'chin/chin-width-decr.target': .38, 'chin/chin-prominent-decr.target': .26,
              'nose/nose-scale-depth-decr.target': .25, 'nose/nose-point-up.target': .20,
              'eyes/l-eye-epicanthus-in.target': .35, 'eyes/r-eye-epicanthus-in.target': .35,
              'eyes/l-eye-eyefold-down.target': .18, 'eyes/r-eye-eyefold-down.target': .18},
        extra_face={'eyes/l-eye-height1-incr.target': .18, 'eyes/r-eye-height1-incr.target': .18},
        old_changes={'butt': -.12}, base_changes={'bust': .002},
        eyes=(.04, .03, .02), lips=(-.04, .02), ears=(-.03, -.0005, .03, .001),
        brow=v3.Brow(.8, 45., .83, -.15, 2.65, (53, 37, 30), .67)),
    make_variant('africa', 'Африканка', 'woman_african_v4.glb', 1.02, 'africa',
        face={'cheek/l-cheek-volume-decr.target': .20, 'cheek/r-cheek-volume-decr.target': .20,
              'cheek/l-cheek-bones-incr.target': .08, 'cheek/r-cheek-bones-incr.target': .08,
              'chin/chin-width-incr.target': .15, 'chin/chin-prominent-decr.target': .20,
              'nose/nose-scale-horiz-incr.target': .42, 'nose/nose-scale-depth-decr.target': .16},
        extra_face={'eyes/l-eye-height1-incr.target': .40, 'eyes/r-eye-height1-incr.target': .40,
                    'nose/nose-nostrils-width-incr.target': .12},
        old_changes={'butt': .02}, base_changes={'mouth': (.08, .08), 'bust': .003},
        eyes=(.07, .10, .02), lips=(.04, .04), ears=(.04, .002, -.04, .002),
        brow=v3.Brow(3.1, 49., 1.18, -.2, 2.45, (48, 32, 26), .74)),
    make_variant('spain', 'Испанский образ', 'woman_spanish_v4.glb', .985, 'central',
        face={'cheek/l-cheek-volume-decr.target': .18, 'cheek/r-cheek-volume-decr.target': .18,
              'chin/chin-width-decr.target': .17, 'chin/chin-prominent-incr.target': .12,
              'existing/nose/nose-scale-horiz-decr.target': .20,
              'nose/nose-scale-depth-decr.target': .12},
        extra_face={'eyes/l-eye-height1-incr.target': .24, 'eyes/r-eye-height1-incr.target': .24,
                    'mouth/mouth-lowerlip-volume-decr.target': .10},
        old_changes={'butt': -.22, 'chest_reduction': .006, 'chest_contract': .07},
        base_changes={'skin': (204, 168, 148), 'iris': (.88, .61, .37),
                      'head': (.005, .012, .005), 'torso': (-.055, -.025, -.03),
                      'mouth': (.025, .015), 'bust': .002},
        eyes=(.04, .04, .025), lips=(.015, .01), ears=(.025, .0007, .02, -.0005),
        brow=v3.Brow(5.3, 44., 1.02, 1.35, 2.25, (65, 42, 31), .71)),
]

# Local-space shape fields, not associated with a population. All five are
# restrained relative to v3. The central figure has the narrowest added field.
# Values are hip-width fraction, posterior reduction and lower outer taper (m).
BODY = {'north': (-.045, .004, .004), 'central': (-.14, .012, .002),
        'east': (-.07, .006, .002), 'africa': (-.065, .006, .003),
        'spain': (-.08, .007, .002)}
MACRO = {'east': ('asian', .50), 'africa': ('african', .55)}
EAST_EYE_TARGETS = {f'eyes/{side}-eye-{part}.target': weight
                    for side in ('l', 'r') for part, weight in
                    [('height2-incr', .175), ('corner1-up', .0875), ('eyefold-angle-down', .07)]}

ARCHIVE_README = """Blades Of War — Ева и пять индивидуальных женских проб v4

Распакуйте ZIP и откройте BladesOfWar_Showcase.html в браузере с WebGL.
Интернет не нужен. «Сравнить рост» показывает шесть персонажей на общем
полу; «Сравнить лица» и «Сравнить уши» выравнивают головы для изучения
деталей и временно скрывают тело ниже шеи; это не сравнение роста. Выберите
персонажа и ракурс или
вращайте сцену мышью/пальцем. Витрина и модели предыдущих версий сохранены.

У северянки и африканки уменьшены припухлые скулы; лицо африканки изменено
целиком, а не только нос и губы. Централке сделаны голубые глаза, уменьшены
выступание и ширина носа, объём груди, бёдер и ягодиц. Для японского образа
переработаны рельеф лица, контур верхнего века и его уголки, а не просто
сжаты глаза. Добавлен отдельный испанский образ. Брови нарисованы на
текстуре, их форма индивидуальна. Уши сохранены с индивидуальными мягкими
поправками. Тела сделаны менее гиперболизированными; различия остаются.

Это индивидуальные художественные персонажи, а не стандарты внешности народов.
Волос и одежды нет. Рост различается равномерным масштабом всей фигуры.
Локальная форма рук и нижней части ног сохранена; изменение таза плавно
переходит в верхнюю часть бедра. Колодец и свет прежние.

В GLB нет скелета. Парный сгиб кистей запечён в четыре морфа, пальцы
нельзя независимо анимировать. Моргание и кулак остаются предварительными:
в исходной сетке есть контакты пальцев и век, а при изменении глаз меняются
контакты глаз с кожей. Выборочные проверки не гарантируют отсутствия
пересечений во всех позах или в движке. Для боя и хвата необходим риг.

Сгиб кистей f=0..1: Fists=f;
FistQuarterCorrection=max(0,1-abs(f-.25)/.25);
FistHalfCorrection=max(0,1-abs(f-.50)/.25);
FistThreeQuarterCorrection=max(0,1-abs(f-.75)/.25).
Моргание b=0..1: face_blink.Blink=b; upper_eyelid_line.Blink=b;
upper_eyelid_line.BlinkLineNarrow=min(1,2*b).

Основа и отдельные формы: MakeHuman/MPFB2 assets, CC0 1.0 Universal;
полный текст — LICENSE_MAKEHUMAN_ASSETS.md. Фотографии не включены.
"""


def load_target(name: str, mapping: np.ndarray, manifest: dict[str, str]) -> np.ndarray:
    path = DATA / name
    if name not in manifest or motion.sha256(path.read_bytes()) != manifest[name]:
        raise ValueError(f'Unexpected v4 target {name}')
    rows = np.loadtxt(path, dtype=np.float64)
    indices = rows[:, 0].astype(np.int64)
    if np.any(indices != rows[:, 0]) or len(np.unique(indices)) != len(indices) or indices.min() < 0 or indices.max() >= 19158:
        raise ValueError(f'Invalid target indices in {name}')
    native = np.zeros((19158, 3), dtype=np.float64)
    native[indices] = rows[:, 1:4] * .1
    return native[mapping]


def aligned_macro(positions: np.ndarray, difference: np.ndarray) -> np.ndarray:
    """Remove global height and translation before using a fraction of a face.

    The regional target files also encode substantial whole-body height
    differences. Fit a single uniform scale and translation to the head and
    use only the residual shape. This fit is not an anthropometric classifier.
    """
    mask = (positions[:, 1] > 1.44) & (positions[:, 1] < 1.68)
    origin, goal = positions[mask], positions[mask] + difference[mask]
    scale = np.sum((origin - origin.mean(0)) * (goal - goal.mean(0))) / np.sum((origin - origin.mean(0)) ** 2)
    translation = goal.mean(0) - scale * origin.mean(0)
    return (positions + difference - translation) / scale - positions


def average_welds(values: np.ndarray, groups: np.ndarray) -> np.ndarray:
    counts = np.bincount(groups)
    summed = np.zeros((len(counts), 3), dtype=np.float64)
    np.add.at(summed, groups, values)
    return (summed / counts[:, None])[groups]


def shape_pelvis(p: np.ndarray, arm_tree: cKDTree, key: str) -> np.ndarray:
    x, y, z = p.T
    ax = np.abs(x)
    hip_fraction, depth_reduction, corner_taper = BODY[key]
    distance, _ = arm_tree.query(p)
    # The transition covers the upper thigh and fades fully before the
    # protected lower body and arm surface. The midline cleft is not pushed.
    arm_gate = old.smooth(.008, .05, distance)
    y_gate = old.smooth(.835, .915, y) * (1 - old.smooth(1.035, 1.12, y))
    hip = arm_gate * y_gate
    posterior = (1 - old.smooth(-.04, .01, z))
    lobes = (np.exp(-.5 * ((ax - .073) / .05) ** 2 - .5 * ((y - .93) / .065) ** 2)
             * old.smooth(.01, .026, ax) * posterior * hip)
    corners = (np.exp(-.5 * ((y - .89) / .045) ** 2) * old.smooth(.085, .14, ax)
               * (1 - old.smooth(.16, .20, ax)) * posterior * hip)
    delta = np.zeros_like(p)
    delta[:, 0] = x * hip_fraction * hip - np.sign(x) * corner_taper * corners
    delta[:, 2] = depth_reduction * lobes
    return delta


def move_lid_with_face(p: np.ndarray, faces: np.ndarray, lids: np.ndarray, displacement: np.ndarray) -> np.ndarray:
    """Transport the upper line with the nearby deformed lid, without new wings."""
    selected = ((p[faces][:, :, 1].max(1) > 1.545) & (p[faces][:, :, 1].min(1) < 1.590)
                & (np.abs(p[faces][:, :, 0]).min(1) < .065) & (p[faces][:, :, 2].max(1) > .085))
    subset = faces[selected]
    mesh = trimesh.Trimesh(vertices=p, faces=subset, process=False)
    closest, distance, triangle = trimesh.proximity.closest_point_naive(mesh, lids)
    if distance.max() > .005:
        raise ValueError(f'Upper-lid strip unexpectedly far from face: {distance.max():.4f} m')
    bary = trimesh.triangles.points_to_barycentric(p[subset[triangle]], closest)
    local = np.einsum('ij,ijk->ik', bary, displacement[subset[triangle]])
    center = gaussian_filter1d(local.reshape(2, 61, 7, 3)[:, :, 3, :], 1., axis=1, mode='nearest')
    shift = np.repeat(center[:, :, None, :], 7, axis=2).reshape(-1, 3)
    if np.linalg.norm(shift, axis=1).max() > .006:
        raise ValueError('Unexpectedly large eyelid-line displacement')
    return lids + shift


def repartition_blink_patch(document: dict, binary: bytes, views: list[bytearray],
                            faces: np.ndarray, blink: np.ndarray, blink_normals: np.ndarray) -> None:
    """Put every blink-affected triangle on the animated face node.

    The source separates the static body/fist node from the blink node. The
    new eyelid corrections extend beyond its old patch: leaving that partition
    untouched opens cracks because those body triangles do not receive Blink.
    Move every triangle touching a changed position *or normal* to the face,
    retaining the original winding/material and all independent hand morphs.
    """
    changed = np.any(blink != 0, axis=1) | np.any(blink_normals != 0, axis=1)
    mask = np.any(changed[faces], axis=1)
    body, face = faces[~mask], faces[mask]
    if not 100 < len(face) < 6000 or len(body) < 25000:
        raise ValueError('Unexpected blink-patch partition')
    body_vertices, face_vertices = np.unique(body), np.unique(face)
    if np.any(blink[body_vertices]) or np.any(blink_normals[body_vertices]):
        raise ValueError('Blink would move a static body vertex')
    # Facial faces do not carry the Fists targets. This holds only if none of
    # the four baked hand targets (including normals) influence their vertices.
    for index in (11, 12, 25, 26, 27, 28, 29, 30):
        if np.any(helpers.accessor(document, binary, index)[face_vertices]):
            raise ValueError('Fist morph unexpectedly affects the blink patch')
    for index, triangles in ((3, body), (13, face)):
        accessor = document['accessors'][index]
        if (accessor['componentType'] != 5125 or accessor['type'] != 'SCALAR'
                or accessor.get('byteOffset', 0)):
            raise ValueError('Unexpected body/face index accessor')
        views[accessor['bufferView']] = bytearray(np.ascontiguousarray(triangles, dtype='<u4').tobytes())
        accessor['count'] = int(triangles.size)


def build_variants(source: bytes, reference: bytes) -> dict[str, bytes]:
    saved = v3.VARIANTS
    try:
        v3.VARIANTS = VARIANTS
        bases = v3.build_variants(source, reference)
    finally:
        v3.VARIANTS = saved
    src_doc, src_bin = helpers.read_glb(source)
    src = helpers.accessor(src_doc, src_bin, 0).astype(np.float64)
    normals_src = helpers.accessor(src_doc, src_bin, 1)
    uv = helpers.accessor(src_doc, src_bin, 2)
    arms = old.arm_weights(reference, uv)
    arm_tree = cKDTree(src[:ORIGINAL_COUNT][arms > 1e-8])
    _, groups = np.unique(src, axis=0, return_inverse=True)
    protected = src[:, 1] <= .835
    protected[:ORIGINAL_COUNT] |= arms > 1e-8
    protected = (np.bincount(groups, weights=protected.astype(int)) > 0)[groups]
    mapping = refinement.vertex_map(ORIGINAL_COUNT)
    manifest = json.loads((DATA / 'manifest.json').read_text())
    targets = {name: load_target(name, mapping, manifest) for name in manifest}
    neutral = targets['macrodetails/caucasian-female-young.target']
    macro_shapes = {name: aligned_macro(src[:ORIGINAL_COUNT], targets[f'macrodetails/{name}-female-young.target'] - neutral)
                    for name in ('asian', 'african')}
    eye_source = eye.brow.view_bytes(src_doc, src_bin, 9)
    outputs = {}
    for variant in VARIANTS:
        doc, binary = helpers.read_glb(bases[variant.key])
        p = helpers.accessor(doc, binary, 0).astype(np.float64)
        normals = helpers.accessor(doc, binary, 1).astype(np.float64)
        faces = np.concatenate([helpers.accessor(doc, binary, i).reshape(-1, 3) for i in (3, 13)])
        macro_delta = np.zeros_like(p)
        eye_delta = np.zeros_like(p)
        linear = 1. + np.asarray(variant.base.head)
        x, y, z = src[:ORIGINAL_COUNT].T
        eye_translations = {}
        if variant.key in MACRO:
            name, weight = MACRO[variant.key]
            # The subdivided ears have different ancestry; taper the source
            # target to zero before the ear boundary (z <= .0625).
            gate = old.smooth(.065, .085, z) * old.smooth(1.435, 1.465, y)
            if variant.key == 'africa':
                # Both sides of the closed lip seam stay under the same
                # smooth mouth mapping rather than an unrelated native target.
                # This avoids defining the face by exaggerated lip projection.
                lips = (old.smooth(1.47, 1.482, y) * (1 - old.smooth(1.52, 1.532, y))
                        * (1 - old.smooth(.037, .050, np.abs(x))) * old.smooth(.075, .09, z))
                gate *= 1 - lips
            else:
                # Keep a gentle bridge/tip transition when the face target is
                # combined with the separate nose-depth sculpt.
                nose = (old.smooth(1.505, 1.52, y) * (1 - old.smooth(1.55, 1.565, y))
                        * (1 - old.smooth(.019, .036, np.abs(x))) * old.smooth(.11, .13, z))
                gate *= 1 - .30 * nose
            raw = macro_shapes[name] * (weight * gate[:, None]) * linear
            # The native target predates Eve's refined, densely detailed lids.
            # Applying its individual deltas there bends tiny triangles. Move
            # the whole orbital opening with a shared socket translation and
            # sculpt the lid itself separately with explicit lid targets.
            orbit = (old.smooth(.010, .016, np.abs(x)) * (1 - old.smooth(.050, .061, np.abs(x)))
                     * old.smooth(1.545, 1.552, y) * (1 - old.smooth(1.58, 1.592, y))
                     * old.smooth(.07, .09, z))
            for side in (-1, 1):
                socket = ((np.sign(x) == side) & (np.abs(x) > .018) & (np.abs(x) < .044)
                          & (y > 1.55) & (y < 1.58) & (z > .09))
                if socket.sum() < 50:
                    raise ValueError('Unexpected eye socket selection')
                translation = raw[socket].mean(axis=0)
                eye_translations[side] = translation
                blend = (orbit * (np.sign(x) == side))[:, None]
                raw = raw * (1 - blend) + translation * blend
            macro_delta[:ORIGINAL_COUNT] = raw
        if variant.key == 'east':
            gate = old.smooth(1.53, 1.54, y) * (1 - old.smooth(1.59, 1.60, y))
            for name, weight in EAST_EYE_TARGETS.items():
                eye_delta[:ORIGINAL_COUNT] += targets[name] * (weight * gate[:, None]) * linear
        macro_delta = average_welds(macro_delta, groups)
        eye_delta = average_welds(eye_delta, groups)
        body_delta = average_welds(shape_pelvis(p, arm_tree, variant.key), groups)
        for part in (macro_delta, eye_delta, body_delta):
            part[protected] = 0
        displacement = macro_delta + eye_delta + body_delta
        q = np.ascontiguousarray(p + displacement, dtype='<f4')
        precise = q.astype(np.float64)
        new_normals = refinement.updated_normals(p, precise, normals, faces)
        new_normals[protected] = normals[protected]
        blink_old = helpers.accessor(doc, binary, 14).astype(np.float64)
        # Fade the local lid-shape targets out as the inherited blink closes.
        # For the Japanese-motif face also fade only the non-rigid component
        # of the macro shape inside the socket: the closed lid and eyeball
        # retain the same translated relationship as the previous blink.
        correction = eye_delta.copy()
        if variant.key == 'east':
            sx, sy, sz = src.T
            translation = np.zeros_like(src)
            for side in (-1, 1):
                translation[np.sign(sx) == side] = eye_translations[side]
            fade = (old.smooth(1.53, 1.545, sy) * (1 - old.smooth(1.59, 1.605, sy))
                    * old.smooth(.05, .09, sz) * (1 - old.smooth(.065, .09, np.abs(sx)))
                    * old.smooth(.002, .012, np.abs(sx)))
            correction += average_welds((macro_delta - translation) * fade[:, None], groups)
        blink = np.ascontiguousarray(blink_old - correction, dtype='<f4')
        blink_normals = (refinement.updated_normals(precise, precise + blink, new_normals, faces).astype(float)
                         - new_normals.astype(float)).astype('<f4')
        eyes = helpers.accessor(doc, binary, 4).astype(np.float64)
        if variant.key in MACRO:
            # Translate each eyeball with the same socket field; do not
            # flatten it to fake the new contour of the upper eyelid.
            for side in (-1, 1):
                eyes[np.sign(eyes[:, 0]) == side] += eye_translations[side]
        eyes = np.ascontiguousarray(eyes, dtype='<f4')
        lids_old = helpers.accessor(doc, binary, 8).astype(float)
        if variant.key in MACRO:
            lids = move_lid_with_face(p, faces, lids_old, macro_delta + eye_delta)
        else:
            lids = lids_old.copy()
        lids = np.ascontiguousarray(lids, dtype='<f4')
        lid_faces = motion.rig_accessor(doc, binary, 10).reshape(-1, 3)
        lid_normals = refinement.updated_normals(lids_old, lids.astype(float), helpers.accessor(doc, binary, 9), lid_faces)
        lid_blink, lid_narrow = motion.lid_deltas(precise, faces, lids.astype(float), blink.astype(float))
        result = copy.deepcopy(doc)
        views = [bytearray(eye.brow.view_bytes(doc, binary, i)) for i in range(len(doc['bufferViews']))]
        for index, values in ((0, q), (1, new_normals), (4, eyes), (8, lids), (9, lid_normals),
                              (14, blink), (15, blink_normals), (16, lid_blink), (17, lid_narrow)):
            eye.update(result, views, index, values)
        repartition_blink_patch(result, binary, views, faces, blink, blink_normals)
        if variant.key == 'central':
            # Preserve exactly the approved blue iris, pupil and sclera.
            views[9] = bytearray(eye_source)
        result['asset']['generator'] = f'BladesOfWar individual woman study v4: {variant.key}'
        result['asset']['extras'] = {'study': variant.label, 'uniformHeightScale': variant.scale,
                                     'base': 'Eve eye study; no skeleton'}
        outputs[variant.key] = refinement.pack_glb(result, views)
        print(f'built {variant.key}', flush=True)
    return outputs


def make_archive(models: dict[str, bytes], html: bytes) -> bytes:
    entries = [('BladesOfWar_Showcase.html', html), (eye.MODEL_NAME, models['eve'])]
    entries.extend((v.filename, models[v.key]) for v in VARIANTS)
    entries.extend([('README.txt', ARCHIVE_README.encode('utf-8')),
                    ('LICENSE_MAKEHUMAN_ASSETS.md', (refinement.DATA / 'LICENSE.ASSETS.md').read_bytes())])
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 14, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data, compresslevel=9)
    return out.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--reference', type=Path, default=eye.DEFAULT_REFERENCE)
    parser.add_argument('--well-archive', type=Path, default=refinement.DEFAULT_WELL)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--models-only', action='store_true')
    args = parser.parse_args()
    protected = {SOURCE.parent.resolve(), old.OUTPUT.resolve(), v2.OUTPUT.resolve(), v3.OUTPUT.resolve(),
                 eye.DEFAULT_SOURCE.parent.resolve(), eye.brow.DEFAULT_SOURCE.parent.resolve(),
                 eye.brow.trial.DEFAULT_SOURCE.parent.resolve(), motion.DEFAULT_SOURCE.parent.resolve()}
    output_paths = {(args.output / f).resolve() for f in [ARCHIVE_NAME, *[v.filename for v in VARIANTS]]}
    if args.output.resolve() in protected or output_paths & {args.source.resolve(), args.reference.resolve(), args.well_archive.resolve()}:
        parser.error('Refusing to overwrite a previous study or input')
    source = motion.checked(args.source, SOURCE_SHA256, 'Eve eye study')
    reference = motion.checked(args.reference, eye.REFERENCE_SHA256, 'auxiliary weight source')
    models = {'eve': source, **build_variants(source, reference)}
    args.output.mkdir(parents=True, exist_ok=True)
    for variant in VARIANTS:
        data = models[variant.key]
        (args.output / variant.filename).write_bytes(data)
        doc, binary = helpers.read_glb(data)
        p = helpers.accessor(doc, binary, 0)
        print(f'{variant.key}: {len(data)} bytes; {(p[:, 1].max() - p[:, 1].min()) * variant.scale * 100:.2f} cm; '
              f'SHA-256 {motion.sha256(data)}', flush=True)
    if not args.models_only:
        from showcase import make_showcase
        html = make_showcase(models, args.well_archive, sys.modules[__name__])
        archive = make_archive(models, html)
        (args.output / ARCHIVE_NAME).write_bytes(archive)
        print(f'ZIP: {len(archive)} bytes SHA-256 {motion.sha256(archive)}', flush=True)


if __name__ == '__main__':
    main()
