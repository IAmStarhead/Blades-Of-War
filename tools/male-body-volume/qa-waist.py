#!/usr/bin/env python3
"""Compare sampled torso/arm triangle contacts; finite subsets only.

Input from qa-waist-export.mjs. Requires NumPy and python-fcl. Adjacent faces
sharing a welded bind vertex are excluded. This does not check all surfaces,
poses, containment, visual quality, or the space between colliding samples.
"""
import argparse
import base64
from pathlib import Path
import json
import numpy as np
from importlib.util import module_from_spec, spec_from_file_location

spec=spec_from_file_location('geometry_qa',Path(__file__).resolve().parent.parent/'male-deep-crouch/qa-geometry.py')
assert spec and spec.loader
qa=module_from_spec(spec)
spec.loader.exec_module(qa)
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('samples',type=Path)
args=parser.parse_args()
data=json.loads(args.samples.read_text(encoding='utf-8'))
base=np.array(data['base']).reshape(-1,3)
_,welded=np.unique(np.round(base,6),axis=0,return_inverse=True)
groups={key:qa.collision_group(faces,welded) for key,faces in data['groups'].items()}
results={}
for name,raw in data['states'].items():
    vertices=np.frombuffer(base64.b64decode(raw),dtype='<f4').reshape(-1,3).astype(float)
    if not np.isfinite(vertices).all():
        raise ValueError('Nonfinite '+name)
    objs={key:qa.collision_object(group,vertices) for key,group in groups.items()}
    contacts={side:qa.contacts(objs['torso'],objs[side],groups['torso'],groups[side],False) for side in ('L','R')}
    results[name]=contacts
before=[k for k in results if k.startswith('before/')]
assert len(before)*2==len(results)
new=0
for name in before:
    after=name.replace('before/','after/',1)
    for side in ('L','R'):
        new+=len(results[after][side]-results[name][side])
old_sides=sum(bool(results[name][side]) for name in before for side in ('L','R'))
after_sides=sum(bool(results[name.replace('before/','after/',1)][side]) for name in before for side in ('L','R'))
print(f'Before/after: {len(before)} paired poses; sides with torso/arm contacts {old_sides}/{after_sides}; new triangle pairs {new}')
assert new==0,'New sampled torso/arm contact pairs found'
print('PASS: no new sampled torso-to-arm contacts in the selected regions')
print('NOTE: finite samples and subsets; neighboring faces excluded. Not a full collision or anatomy proof.')
