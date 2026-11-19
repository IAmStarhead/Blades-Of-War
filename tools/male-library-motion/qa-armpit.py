#!/usr/bin/env python3
"""Check sampled armpit triangle subsets from qa-armpit-export.mjs.

Requires NumPy and python-fcl. This is a finite, model-specific intersection
check; it cannot rule out all contacts, enclosure or poor-looking deformation.
"""
from __future__ import annotations
import argparse
import base64
import collections
import json
from pathlib import Path
import numpy as np
from importlib.util import module_from_spec, spec_from_file_location

spec = spec_from_file_location('geometry_qa', Path(__file__).resolve().parent.parent / 'male-deep-crouch/qa-geometry.py')
assert spec and spec.loader
qa = module_from_spec(spec)
spec.loader.exec_module(qa)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('samples', type=Path)
args = parser.parse_args()
data = json.loads(args.samples.read_text())
base = np.array(data['base']).reshape(-1, 3)
_, welded = np.unique(np.round(base, 6), axis=0, return_inverse=True)
groups = {side: qa.collision_group(faces, welded) for side, faces in data['groups'].items()}
summary = collections.defaultdict(list)
for name, raw in data['states'].items():
    vertices = np.frombuffer(base64.b64decode(raw), dtype='<f4').reshape(-1, 3).astype(float)
    kind = '-'.join(name.split('-')[:2])
    for side, group in groups.items():
        obj = qa.collision_object(group, vertices)
        count = len(qa.contacts(obj, obj, group, group, True))
        summary[kind].append((count, name, side))
for kind, values in sorted(summary.items()):
    print(f'{kind}: {len(values)//2} poses; max {max(values)}; '
          f'side-poses with contacts {sum(n > 0 for n, _, _ in values)}')
    assert max(n for n, _, _ in values) == 0, f'sampled armpit contact in {kind}'
print('PASS: no selected non-neighbouring armpit triangle contacts in the trial samples')
print('NOTE: selected surfaces and discrete phases only; not a guarantee for every pose or the entire mesh.')
