#!/usr/bin/env python3
"""Approximate reference/model leg-direction comparison; NOT a medical test.

Reads SHA-pinned HMC rig and clips plus the actual 96-phase viewer samples.
Matches a single cyclic phase offset, not velocity, morphology, feet or skin.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

here=Path(__file__).resolve().parent
repo=here.parent.parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--output',type=Path,default=repo/'work/male-leg-human-trial/kinematics-report.json')
a=p.parse_args();out=a.output.resolve();allowed=(repo/'work/male-leg-human-trial/kinematics-report.json').resolve()
if out==repo or (out.is_relative_to(repo) and out!=allowed):raise SystemExit('Refusing to replace an unrelated repository artifact')
sources={'rig':('hmc-rig.json','24979f497bc7b75eaea811cd078ddb6d1d054be305fa2c1712a3e14605f60d73'),
 'walk':('walk-12.json','a4fd36340b55d45ed1e92c85783ace73bf43f2864f0839f61c5edec4ed3c7222'),
 'run':('run-9.json','d46f8eae1c8cc1eae338eba0d5b00168f1faf0553322d81dc5d6006df7fa745b'),
 'crouch':('crouch-walk-7.json','f44ef97de42d3c2a468d5d8a14156a0ede4deee42550bd9e5a0b70a8a805f184')}
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
ref=here/'reference'
for kind,(name,sha) in sources.items():
 if digest(ref/name)!=sha:raise SystemExit(f'Unexpected {kind} source: {name}')
rig=json.loads((ref/sources['rig'][0]).read_text());names=rig['names'];ids={name:i for i,name in enumerate(names)}
heads=np.array(rig['heads']);parents=rig['parents'];hh=rig['hip_height']
samples={k:json.loads((ref/f'{k}-samples.json').read_text()) for k in ['old','trial']}
if any(v['phaseCount']!=96 for v in samples.values()):raise SystemExit('Expected 96-phase samples')
if samples['old']['htmlSha256']!=digest(repo/'work/male-stealth-tuning/index.html') or samples['trial']['htmlSha256']!=digest(repo/'work/male-leg-human-trial/index.html'):
 raise SystemExit('Viewer changed: regenerate samples first')

def matrix(q):
 x,y,z,w=np.array(q)/np.linalg.norm(q)
 return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                  [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                  [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def reference_pose(key):
 R=[];P=[]
 for i,pa in enumerate(parents):
  q=matrix(key['rotations'][i])
  if pa<0:R.append(q);P.append(heads[i]+np.array(key['root'])*hh)
  else:R.append(R[pa]@q);P.append(P[pa]+R[pa]@(heads[i]-heads[pa]))
 R=np.array(R);P=np.array(P);yaw=np.arctan2(R[0,1,0],R[0,0,0]);c,s=np.cos(yaw),np.sin(yaw)
 rotate=np.array([[c,s,0],[-s,c,0],[0,0,1]]);P=(P-P[0])@rotate.T
 return np.array([[P[ids[name+'.'+side]][0],P[ids[name+'.'+side]][2],-P[ids[name+'.'+side]][1]]
                  for side in ('L','R') for name in ('upperleg01','lowerleg01','foot')]).reshape(2,3,3)
def model_pose(row):return np.array([row[s]['points'] for s in ('L','R')])
def feature(p):
 a=p[:,1]-p[:,0];b=p[:,2]-p[:,1]
 return np.stack((a/np.linalg.norm(a,axis=1)[:,None],b/np.linalg.norm(b,axis=1)[:,None]),axis=1)
def difference(p,q):return np.degrees(np.arccos(np.clip(np.einsum('ijk,ijk->ij',p,q),-1,1)))
def bends(p):
 a=p[:,1]-p[:,0];b=p[:,2]-p[:,1]
 return np.degrees(np.arccos(np.clip(np.sum(a*b,axis=1)/np.linalg.norm(a,axis=1)/np.linalg.norm(b,axis=1),-1,1)))

results={}
for label,kind,mode,start,end in [('walk','walk','walk',28,68),('run','run','run',30,54),('crouchWalk','crouch','crouchWalk',42,78)]:
 clip=json.loads((ref/sources[kind][0]).read_text())
 if clip['bones']!=names:raise SystemExit(f'Unexpected rig in {label}')
 keys={k['frame']:k for k in clip['keys']};frames=list(range(start,end,2));refposes=[reference_pose(keys[f]) for f in frames];features=[feature(x) for x in refposes]
 result={'referenceClip':clip['name'],'dataset':clip['dataset'],'frameRange':[start,end],'keyFrames':frames,'models':{}}
 for scene in ['old','trial']:
  target=[feature(model_pose(x)) for x in samples[scene]['samples'][mode]];scores=[]
  for offset in range(96):
   errors=[]
   for f,p in zip(frames,features):errors.extend(difference(p,target[(int(round(96*(f-start)/(end-start)))+offset)%96]).flatten())
   scores.append((float(np.mean(errors)),offset,errors))
  mean,offset,errors=min(scores,key=lambda x:x[0]);selected=[]
  for frame in [start,round((start+(end-start)*.25)/2)*2,round((start+(end-start)*.5)/2)*2,round((start+(end-start)*.75)/2)*2]:
   index=(int(round(96*(frame-start)/(end-start)))+offset)%96
   refp=reference_pose(keys[frame]);modelp=model_pose(samples[scene]['samples'][mode][index])
   selected.append({'frame':frame,'modelPhaseIndex':index,'referenceBendLRDegrees':bends(refp).tolist(),
                    'modelBendLRDegrees':bends(modelp).tolist(),'segmentDirectionErrorDegrees':difference(feature(refp),feature(modelp)).tolist()})
  result['models'][scene]={'phaseOffset96':offset,'meanSegmentDirectionErrorDegrees':mean,'maxSegmentDirectionErrorDegrees':float(max(errors)),'selected':selected}
  print(f"{label:10} {scene:5} offset={offset:2}/96 mean={mean:5.2f}° max={max(errors):5.2f}°")
 results[label]=result
report={'method':'FK at the listed HMC key frames, yaw and translation removed, then compare unit directions of left/right thigh and shin. Search one discrete offset among 96 model phases to minimize mean angle over four segments and the selected keys.',
 'limitations':'Different people, skeletal proportions, speeds, and styles; this phase-only fit does not synchronize recordings. Max/mean are not a medical norm or naturalness score and say nothing about feet, skin, force, transitions, or the entire dataset. HMC smooth interpolation differs from this trial between keys.',
 'sourceSha256':{k:sha for k,(_,sha) in sources.items()},'viewerHtmlSha256':{k:v['htmlSha256'] for k,v in samples.items()},
 'sampleSha256':{k:digest(ref/f'{k}-samples.json') for k in samples},'results':results}
out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,indent=2)+'\n');print('Wrote',out)
