#!/usr/bin/env python3
"""Diagnostic, not a blanket pass: compare selected inner-arm triangle contacts.

The source model already has contacts in this area. Counts vary with phase and
FCL ignores only coincident/adjacent welded triangles; neither these counts nor
unioned triangle pairs measure the visual extent or all surfaces.
"""
import argparse
import base64
import json
from collections import defaultdict
import numpy as np
import importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location('qa_geometry', Path(__file__).with_name('qa-geometry.py'))
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)
collision_group, collision_object, contacts = geometry.collision_group, geometry.collision_object, geometry.contacts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('samples', nargs='?', default='/tmp/bow-armpit-samples.json')
    args = parser.parse_args()
    with open(args.samples, encoding='utf-8') as f:
        data = json.load(f)
    base = np.asarray(data['base'], dtype=float).reshape(-1, 3)
    _, weld = np.unique(np.round(base, 6), axis=0, return_inverse=True)
    groups = {name: collision_group(ids, weld) for name, ids in data['groups'].items()}
    if not all(len(g[0]) == 551 for g in groups.values()):
        raise ValueError('Unexpected shoulder group selection')
    results = defaultdict(list)
    for name, encoded in data['states'].items():
        points = np.frombuffer(base64.b64decode(encoded), dtype='<f4').reshape(-1, 3).astype(float)
        category = '-'.join(name.split('-')[:2])
        for side, group in groups.items():
            obj = collision_object(group, points)
            found = contacts(obj, obj, group, group, True)
            faces, initial = points[group[0]], base[group[0]]
            area = lambda f: np.linalg.norm(np.cross(f[:, 1]-f[:, 0], f[:, 2]-f[:, 0]), axis=1)
            initial_area, current_area = area(initial), area(faces)
            valid = initial_area > 1e-10
            results[category, side].append((found, float(np.min(current_area[valid] / initial_area[valid]))))
    for mode in ('walk', 'run', 'crouch'):
        for side in ('L', 'R'):
            before, after = results[mode+'-before', side], results[mode+'-after', side]
            assert len(before) == len(after) == 48
            old_pairs = set().union(*(x[0] for x in before))
            new_pairs = set().union(*(x[0] for x in after))
            assert old_pairs, 'This diagnostic expected existing source contacts'
            old_peak = max(len(x[0]) for x in before)
            new_peak = max(len(x[0]) for x in after)
            # These are regression guards for this specific sampled model, not
            # a claim that any phase or the whole shoulder is collision-free.
            assert len(new_pairs-old_pairs) <= 2, f'{mode} {side}: too many new sampled pairs'
            if mode != 'crouch':
                assert new_peak <= old_peak*.6, f'{mode} {side}: sampled overlap not reduced'
            else:
                assert new_peak <= old_peak, f'{mode} {side}: sampled overlap grew'
            print(f'{mode} {side}: old/new unioned pairs {len(old_pairs)}/{len(new_pairs)}, '
                  f'new relative to all old phases {len(new_pairs-old_pairs)}, '
                  f'max contacts per old/new phase {old_peak}/{new_peak}, '
                  f'min area old/new {min(x[1] for x in before):.4f}/{min(x[1] for x in after):.4f}')
    for category in ('transition-enter', 'transition-exit'):
        for side in ('L', 'R'):
            values = results[category, side]
            assert len(values) == 32
            print(f'{category} {side}: max contacts per sampled phase {max(len(x[0]) for x in values)}, '
                  f'min area {min(x[1] for x in values):.4f}')
    print('NOTE: observed armpit contacts are not fixed; sampled contacts and areas are not a whole-body guarantee.')


if __name__ == '__main__':
    main()
