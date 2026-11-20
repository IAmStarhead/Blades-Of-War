#!/usr/bin/env python3
"""Reconstruct the approved surface and transfer/adjust donor skin weights.

This makes an experimental linear-blend skin, not a medical skeleton. Positions
are checked against the separately approved static mesh, which is not modified.
"""
import argparse, json, importlib.util
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
import trimesh
R=Path(__file__).resolve().parents[2];S=R/'tools/male-static-rebuild'
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('old_body',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args()
spec=importlib.util.spec_from_file_location('mesh',S/'mesh.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
donor,df,scale=m.make_body(); old,of,on=m.old_nape(args.old_body);P,N,F,r0,r1,report=m.make_join(donor,df,old,of,on)
static=trimesh.load(R/'work/male-static-rebuild/male_static_rebuild.glb',force='scene',process=False).geometry['New body'];assert np.array_equal(P.astype('f4'),static.vertices.astype('f4'));assert np.array_equal(F,static.faces)
old_names=['Rig_Root','Rig_Hips','Rig_Spine','Rig_Chest','Rig_Neck','Rig_Head']
for side in ['L','R']:
 old_names += [f'Rig_{x}_{side}' for x in ['Shoulder','UpperArm','Forearm','Hand','Thigh','Shin','Foot','Toes']]
finger_names=[f'Rig_Finger{f}_{n}_{side}' for side in ['L','R'] for f in range(1,6) for n in range(1,4)]
names=old_names+finger_names;ix={name:i for i,name in enumerate(names)}
skel=json.loads((S/'sources/default.mhskel').read_text());dweights=json.loads((S/'sources/default_weights.mhw').read_text())['weights'];
# Native MakeHuman weights are an anatomical starting point. Combine helper
# bones into the original gait rig, keeping three independently skinned
# phalanges per finger. Manual pose tests will decide if this is acceptable.
def mapped(name):
 side=name[-1] if name.endswith(('.L','.R')) else None
 if side:
  prefix=name[:-2]
  if prefix.startswith('finger'):
   a,b=map(int,prefix[6:].split('-'));return [(f'Rig_Finger{a}_{b}_{side}',1.)]
  if prefix.startswith(('metacarpal','wrist')):return [(f'Rig_Hand_{side}',1.)]
  if prefix.startswith('lowerarm'):return [(f'Rig_Forearm_{side}',1.)]
  if prefix.startswith('upperarm'):return [(f'Rig_UpperArm_{side}',1.)]
  if prefix=='shoulder01':return [(f'Rig_Shoulder_{side}',.50),(f'Rig_UpperArm_{side}',.50)]
  if prefix=='clavicle':return [(f'Rig_Shoulder_{side}',1.)]
  if prefix.startswith('pelvis'):return [('Rig_Hips',1.)]
  if prefix.startswith('upperleg'):return [(f'Rig_Thigh_{side}',1.)]
  if prefix.startswith('lowerleg'):return [(f'Rig_Shin_{side}',1.)]
  if prefix=='foot':return [(f'Rig_Foot_{side}',1.)]
  if prefix.startswith('toe'):return [(f'Rig_Toes_{side}',1.)]
  if prefix.startswith('breast'):return [('Rig_Chest',1.)]
 if name in ('root','spine05'):return [('Rig_Hips',1.)]
 if name in ('spine04','spine03'):return [('Rig_Spine',1.)]
 if name in ('spine02','spine01'):return [('Rig_Chest',1.)]
 if name.startswith('neck'):return [('Rig_Neck',1.)]
 if name in ('head','jaw'):return [('Rig_Head',1.)]
 return []
W=np.zeros((len(donor),len(names)),dtype=float);total=np.zeros(len(donor));unknown=[]
used=np.unique(df)
for k,values in dweights.items():
 values=np.asarray(values); ids=values[:,0].astype(int); weights=values[:,1]; total[ids]+=weights
 mapping=mapped(k)
 if not mapping:
  selected=np.isin(ids,used)&(donor[ids,1]<=1.515)
  if np.any(selected & (weights>1e-9)):unknown.append((k,float(weights[selected].sum())))
 for name,factor in mapping:W[ids,ix[name]]+=factor*weights
print('unknown on body',unknown);assert not unknown
W/=total[:,None]

orig=json.loads(args.old_body.read_text());op=np.array(orig['positions']).reshape(-1,3)+np.array(orig['positionDelta']).reshape(-1,3);oj=np.array(orig['joints']).reshape(-1,4);ow=np.array(orig['weights']).reshape(-1,4);oraw=np.zeros((len(op),len(names)))
for k in range(4):oraw[np.arange(len(op)),oj[:,k]]+=ow[:,k]
_,ind,inv=np.unique(np.round(op,7),axis=0,return_index=True,return_inverse=True);assert np.max(np.abs(oraw-oraw[ind][inv]))<1e-6;OW=oraw[ind]

def transfer(query,vertices,faces,weights,plane):
 used=np.unique(faces);dist,ids=cKDTree(vertices[used]).query(query);out=np.zeros((len(query),weights.shape[1]));exact=dist<2e-7;out[exact]=weights[used[ids[exact]]]
 selected=np.where(~exact)[0];tri=faces[(vertices[faces][:,:,1].min(1)<plane)&(vertices[faces][:,:,1].max(1)>plane)];a=vertices[tri[:,0]];ab=vertices[tri[:,1]]-a;ac=vertices[tri[:,2]]-a;d00=np.einsum('ij,ij->i',ab,ab);d01=np.einsum('ij,ij->i',ab,ac);d11=np.einsum('ij,ij->i',ac,ac);den=d00*d11-d01*d01;valid=np.abs(den)>1e-25
 worst=0
 for j in selected:
  ap=query[j]-a;d20=np.einsum('ij,ij->i',ap,ab);d21=np.einsum('ij,ij->i',ap,ac);v=np.where(valid,(d11*d20-d01*d21)/den,0);w=np.where(valid,(d00*d21-d01*d20)/den,0);u=1-v-w
  err=np.linalg.norm(a+v[:,None]*ab+w[:,None]*ac-query[j],axis=1);err[(u<-.0001)|(v<-.0001)|(w<-.0001)|~valid]=np.inf; best=np.argmin(err);worst=max(worst,err[best]);
  if err[best]>2e-6:raise ValueError(('no match',j,err[best],query[j],plane))
  out[j]=u[best]*weights[tri[best,0]]+v[best]*weights[tri[best,1]]+w[best]*weights[tri[best,2]]
 print('transfer plane',plane,'total',len(query),'exact',sum(exact),'interpolated',len(selected),'max surface error',worst)
 return out
first=report['donorFaces'];second=first+report['retainedNapeFaces'];f0=F[:first];f1=F[first:second];p0_end=int(f1.min());p1_end=len(P)-13*report['joinRingVertices'];print('segments',p0_end,p1_end,len(P));assert set(np.unique(f0))==set(range(p0_end));assert set(np.unique(f1))==set(range(p0_end,p1_end))
weights=np.zeros((len(P),len(names)));weights[:p0_end]=transfer(P[:p0_end],donor,df,W,1.510);weights[p0_end:p1_end]=transfer(P[p0_end:p1_end],old,of,OW,1.545)
steps=[.025,.06,.12,.2,.3,.4,.5,.6,.7,.8,.88,.94,.975];M=len(r0)
for i,t in enumerate(steps):weights[p1_end+i*M:p1_end+(i+1)*M]=(1-t)*weights[r0]+t*weights[r1]
assert np.min(weights)>-1e-5; weights=np.maximum(weights,0); weights/=weights.sum(axis=1)[:,None]
# The narrow joined neck otherwise has five competing influences. A hard
# top-four truncation can swap the fifth influence abruptly between adjacent
# seam vertices, folding tiny bridge faces in the running cycle. Fade the
# nearby upper-arm influence into its shoulder before the four-weight limit.
fade=m.smoothstep((P[:,1]-1.46)/.045)
for side in ('L','R'):
 a,b=ix['Rig_UpperArm_'+side],ix['Rig_Shoulder_'+side];amount=weights[:,a]*fade;weights[:,a]-=amount;weights[:,b]+=amount
order=np.argsort(-weights,axis=1)[:,:4];top=np.take_along_axis(weights,order,axis=1);lost=1-top.sum(axis=1);print('weight loss max',lost.max(),'p99',np.quantile(lost,.99),'n>1%',sum(lost>.01),'n>5%',sum(lost>.05));top/=top.sum(axis=1)[:,None]

# Empirically broaden the bends after mapping the source helpers into the
# smaller game hierarchy. The old sharp transitions folded badly in the two
# requested gaits. These smooth fades avoid changing rest positions; they do
# not replace corrective shapes or prove suitability for arbitrary motions.
weights=np.zeros_like(weights);rows=np.arange(len(P));top=top.astype('f4')
for k in range(4): weights[rows,order[:,k]]+=top[:,k]
def smooth(v):
 v=np.clip(v,0,1);return v*v*(3-2*v)
for side in ('L','R'):
 for a,b,center,width in [('Thigh','Shin',.5332,.36),('UpperArm','Forearm',1.195,.21)]:
  a,b=ix[f'Rig_{a}_{side}'],ix[f'Rig_{b}_{side}'];mass=weights[:,a]+weights[:,b];v=smooth((center+width/2-P[:,1])/width)
  weights[:,a]=mass*(1-v);weights[:,b]=mass*v
hips,left,right=ix['Rig_Hips'],ix['Rig_Thigh_L'],ix['Rig_Thigh_R']
tl,tr=weights[:,left].copy(),weights[:,right].copy();mass=weights[:,hips]+tl+tr
active=(tl+tr)>1e-10
frac=np.divide(tl,tl+tr,out=np.zeros_like(tl),where=active);v=smooth((1.04-P[:,1])/.29)
weights[active,hips]=(mass*(1-v))[active];weights[active,left]=(mass*v*frac)[active];weights[active,right]=(mass*v*(1-frac))[active]
order=np.argsort(-weights,axis=1)[:,:4];top=np.take_along_axis(weights,order,axis=1);lost2=1-top.sum(axis=1);top/=top.sum(axis=1)[:,None];order[top<=0]=0
print('after bend adjustments: additional influence loss max',float(lost2.max()))

# Centers follow joint guide vertices on the actually posed donor, not the old
# character's unrelated wrist, elbow, knee or ankle positions.
def joint(name,end='head'):
 return np.mean(donor[skel['joints'][skel['bones'][name][end]]],axis=0)
definition=[]
def add(name,parent,vec):definition.append({'name':name,'parent':parent,'world':np.asarray(vec).tolist()})
add('Rig_Root',None,[0,0,0]);add('Rig_Hips','Rig_Root',joint('root','tail'));add('Rig_Spine','Rig_Hips',joint('spine03'));add('Rig_Chest','Rig_Spine',joint('spine01'));add('Rig_Neck','Rig_Chest',[0,1.510,-.040]);add('Rig_Head','Rig_Neck',[0,1.60,-.025])
for side in ['L','R']:
 def j(x):return joint(x+'.'+side)
 # Small empirical hinge adjustments reduce inside-crease folding in the
 # sampled gaits. They are approximate art/animation pivots, not CT anatomy.
 add('Rig_Shoulder_'+side,'Rig_Chest',j('shoulder01'));add('Rig_UpperArm_'+side,'Rig_Shoulder_'+side,j('upperarm01'));add('Rig_Forearm_'+side,'Rig_UpperArm_'+side,j('lowerarm01')+[0,0,.012]);add('Rig_Hand_'+side,'Rig_Forearm_'+side,j('wrist'))
 add('Rig_Thigh_'+side,'Rig_Hips',j('upperleg01'));add('Rig_Shin_'+side,'Rig_Thigh_'+side,j('lowerleg01')+[0,0,-.028]);add('Rig_Foot_'+side,'Rig_Shin_'+side,j('foot')); toe=(j('toe2-1')+j('toe4-1'))/2;add('Rig_Toes_'+side,'Rig_Foot_'+side,toe)
# Match name list order exactly.
for side in ['L','R']:
 for finger in range(1,6):
  for n in range(1,4):
   name=f'Rig_Finger{finger}_{n}_{side}';parent=f'Rig_Finger{finger}_{n-1}_{side}' if n>1 else f'Rig_Hand_{side}';add(name,parent,joint(f'finger{finger}-{n}.{side}'))
assert [d['name'] for d in definition]==names
out={'positions':P.astype('f4').ravel().tolist(),'normals':N.astype('f4').ravel().tolist(),'indices':F.astype('uint32').ravel().tolist(),'joints':order.astype('uint16').ravel().tolist(),'weights':top.astype('float32').ravel().tolist(),'bones':definition,'report':{'weightLossMax':float(lost.max()),'weightLossP99':float(np.quantile(lost,.99)),'postAdjustmentWeightLossMax':float(lost2.max()),'faces':len(F),'verts':len(P),'headBoundaryEdges':report['bodyBoundaryEdges']}}
args.output.write_text(json.dumps(out,separators=(',',':')));print('done',len(P),len(F),'bone count',len(names));
for v in definition[:14]:print(v['name'],np.round(v['world'],4))
