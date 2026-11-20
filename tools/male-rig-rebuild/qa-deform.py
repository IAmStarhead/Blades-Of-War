#!/usr/bin/env python3
"""Report FCL contacts in sampled body subsets; not a whole-body guarantee.

Run qa-deform-export.mjs first. Neighboring triangles sharing a welded vertex
are excluded. Separate face and ears, all other poses, collision depth and
inter-frame contacts are outside this check. Use --strict to reject any hit.
"""
import argparse,base64,collections,importlib.util,json
from pathlib import Path
import fcl
import numpy as np
root=Path(__file__).resolve().parents[2];spec=importlib.util.spec_from_file_location('fcl_qa',root/'tools/male-deep-crouch/qa-geometry.py');qa=importlib.util.module_from_spec(spec);spec.loader.exec_module(qa)
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('samples',type=Path);parser.add_argument('--strict',action='store_true');args=parser.parse_args()
d=json.loads(args.samples.read_text());base=np.array(d['base']).reshape(-1,3);_,welded=np.unique(np.round(base,6),axis=0,return_inverse=True)
groups={k:qa.collision_group(v,welded) for k,v in d['groups'].items()}
self_names=['kneeL','kneeR','elbowL','elbowR','shoulderL','shoulderR','hip','neck']
pairs=[('handL','torso'),('handR','torso'),('footL','footR')];stats=collections.defaultdict(list);failures=[]
def contacts(a,b,ga,gb,same=False):
 # The very dense neck bridge alone has ~154k raw adjacent pairs at rest.
 # Keep a higher explicit cap and exclude welded neighbors after collision.
 result=fcl.CollisionResult();limit=500_000
 fcl.collide(a,b,fcl.CollisionRequest(num_max_contacts=limit,enable_contact=True),result)
 if len(result.contacts)>=limit:raise AssertionError('Contact cap reached; check incomplete')
 if not result.contacts:return set()
 first=np.array([c.b1 for c in result.contacts]);second=np.array([c.b2 for c in result.contacts])
 valid=~np.any(ga[3][first,:,None]==gb[3][second,None,:],axis=(1,2))
 if same:valid &= first!=second
 return {tuple(sorted((int(x),int(y)))) if same else (int(x),int(y)) for x,y in zip(first[valid],second[valid])}
for name,raw in d['states'].items():
 vertices=np.frombuffer(base64.b64decode(raw),dtype='<f4').reshape(-1,3).astype(float)
 objects={k:qa.collision_object(g,vertices) for k,g in groups.items()};mode=name.split('-')[0]
 for key in self_names:
  # Neck is much denser than the rest: test every fourth locomotion sample.
  if key=='neck' and mode!='stand' and int(name.split('-')[1])%4:continue
  hits=contacts(objects[key],objects[key],groups[key],groups[key],True);stats[(mode,key)].append((len(hits),name))
  if hits:failures.append((name,key,len(hits)))
 for a,b in pairs:
  hits=contacts(objects[a],objects[b],groups[a],groups[b]);key=a+'-'+b;stats[(mode,key)].append((len(hits),name))
  if hits:failures.append((name,key,len(hits)))
for (mode,key),values in sorted(stats.items()):print(f'{mode:5} {key:15}: max {max(values)}, poses with hits {sum(n>0 for n,_ in values)}/{len(values)}')
if failures:
 print('Selected-surface contacts (first 30):',*failures[:30],sep='\n')
 if args.strict:raise SystemExit(f'FAIL: {len(failures)} sampled region poses contain non-neighbouring contacts')
else:print('PASS: no non-neighbouring contacts in selected sampled subsets')
print('NOTE: only the specified triangles/poses; excludes separate face/ears, enclosure, penetration depth, other animations and the time between samples.')
