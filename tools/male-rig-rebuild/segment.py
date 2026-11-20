#!/usr/bin/env python3
"""Build a separate, pre-segmented skinned mesh with paired geometric caps.

At each of eight chosen joint planes, only the closed crossing loop nearest
that joint is cut. This is an authoring-time study, not a general runtime mesh
slicer or a physics/gore system. The intact GLB is left untouched.
"""
import argparse, json
from collections import Counter
from pathlib import Path
import networkx as nx
import numpy as np

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('geometry',type=Path);parser.add_argument('output',type=Path)
args=parser.parse_args();d=json.loads(args.geometry.read_text());bones={x['name']:np.array(x['world'],float) for x in d['bones']}
P=np.array(d['positions'],float).reshape(-1,3).tolist();N=np.array(d['normals'],float).reshape(-1,3).tolist();J=np.array(d['joints'],int).reshape(-1,4).tolist();W=np.array(d['weights'],float).reshape(-1,4).tolist()
main=np.array(d['indices'],int).reshape(-1,3).tolist();parts={};caps={};sites={};discard=[]

def unit(v):return v/np.linalg.norm(v)
def edge(a,b):return tuple(sorted((int(a),int(b))))
def cross2(a,b):return a[0]*b[1]-a[1]*b[0]
def triangulate(points,normal):
 # Ear clipping in a plane basis; no artificial center is needed. An oriented
 # rim and its original interpolated skin weights are shared by both caps.
 ref=np.array([0.,0.,1.]) if abs(normal[2])<.8 else np.array([1.,0.,0.])
 u=unit(np.cross(ref,normal));v=np.cross(normal,u);xy=np.column_stack((points@u,points@v))
 area=sum(cross2(xy[i],xy[(i+1)%len(xy)]) for i in range(len(xy)))/2
 if abs(area)<1e-12:raise ValueError('Degenerate cap contour')
 order=list(range(len(points))) if area>0 else list(reversed(range(len(points))))
 def inside(p,a,b,c):
  e=1e-13
  return cross2(b-a,p-a)>=-e and cross2(c-b,p-b)>=-e and cross2(a-c,p-c)>=-e
 tris=[]
 while len(order)>3:
  found=False
  for j in range(len(order)):
   a,b,c=order[j-1],order[j],order[(j+1)%len(order)]
   if cross2(xy[b]-xy[a],xy[c]-xy[b])<=1e-13:continue
   if any(inside(xy[k],xy[a],xy[b],xy[c]) for k in order if k not in (a,b,c)):continue
   tris.append([a,b,c]);del order[j];found=True;break
  if not found:raise ValueError('Cannot ear-clip section; contour may be degenerate')
 if cross2(xy[order[1]]-xy[order[0]],xy[order[2]]-xy[order[0]])<=1e-13:raise ValueError('Degenerate last cap triangle')
 tris.append(order)
 poly=abs(area);ta=sum(cross2(xy[b]-xy[a],xy[c]-xy[a])/2 for a,b,c in tris)
 if abs(poly-ta)>1e-8:raise ValueError('Cap triangulation area mismatch')
 return tris,float(poly)

def cut(label,center,normal,part):
 global main
 points=np.asarray(P);normal=unit(normal);center=center+normal*0.000017 # avoid a vertex exactly on the plane
 distance=(points-center)@normal
 graph=nx.Graph();records=[]
 for fi,face in enumerate(main):
  crossings=[edge(a,b) for a,b in zip(face,face[1:]+face[:1]) if distance[a]*distance[b]<0]
  if len(crossings)==2:
   graph.add_edge(*crossings,face=fi);records.append((fi,crossings))
  elif len(crossings):raise ValueError(f'{label}: ambiguous plane intersection')
 loops=[]
 for component in nx.connected_components(graph):
  if len(component)<6 or any(graph.degree[e]!=2 for e in component):continue
  loop=[min(component)];prev=None;cur=loop[0]
  while True:
   choices=sorted(graph.neighbors(cur));nxt=choices[0] if choices[0]!=prev else choices[1]
   if nxt==loop[0]:break
   if nxt in loop:raise ValueError('Self-repeating crossing loop')
   loop.append(nxt);prev,cur=cur,nxt
  if len(loop)!=len(component):raise ValueError('Incomplete crossing loop')
  positions=[]
  for a,b in loop:
   t=distance[a]/(distance[a]-distance[b]);positions.append(points[a]+t*(points[b]-points[a]))
  positions=np.asarray(positions);dist=np.linalg.norm(positions.mean(axis=0)-center)
  loops.append((dist,loop,positions))
 if not loops:raise ValueError(f'{label}: no closed crossing loop')
 dist,loop,positions=min(loops,key=lambda x:x[0])
 if dist>.08:raise ValueError(f'{label}: closest loop is {dist:.4f} m away')
 mapping={}
 for (a,b),point in zip(loop,positions):
  t=distance[a]/(distance[a]-distance[b]);normal0=unit(np.array(N[a])*(1-t)+np.array(N[b])*t)
  weights={}
  for vertex,factor in [(a,1-t),(b,t)]:
   for j,w in zip(J[vertex],W[vertex]):weights[j]=weights.get(j,0)+factor*w
  ordered=sorted(weights.items(),key=lambda x:(-x[1],x[0]))[:4];loss=1-sum(w for _,w in ordered);discard.append(loss)
  total=sum(w for _,w in ordered);jj=[j if w>0 else 0 for j,w in ordered];ww=[w/total for _,w in ordered]
  while len(jj)<4:jj.append(0);ww.append(0.)
  mapping[(a,b)]=len(P);P.append(point.tolist());N.append(normal0.tolist());J.append(jj);W.append(ww)
 selected=set(loop);faces_on_loop={fi for fi,c in records if c[0] in selected and c[1] in selected}
 if len(faces_on_loop)!=len(loop):raise ValueError(f'{label}: crossing-loop face count mismatch')
 out=[];marks=[];barriers=set()
 def intersect(a,b):return mapping[edge(a,b)]
 for fi,face in enumerate(main):
  if fi not in faces_on_loop:out.append(face);marks.append(0);continue
  for sign in (1,-1):
   polygon=[]
   for a,b in zip(face,face[1:]+face[:1]):
    ins=distance[a]*sign>0;nextins=distance[b]*sign>0
    if ins:polygon.append(a)
    if ins!=nextins:polygon.append(intersect(a,b))
   for k in range(1,len(polygon)-1):out.append([polygon[0],polygon[k],polygon[k+1]]);marks.append(sign)
  cross=[intersect(a,b) for a,b in zip(face,face[1:]+face[:1]) if distance[a]*distance[b]<0]
  barriers.add(edge(*cross))
 # Union face-adjacency on every edge except the new cut; because the intact
 # body is one connected component this should yield exactly two pieces.
 parent=list(range(len(out)))
 def find(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 def union(a,b):
  a,b=find(a),find(b)
  if a!=b:parent[b]=a
 seen={}
 for i,face in enumerate(out):
  for a,b in zip(face,face[1:]+face[:1]):
   k=edge(a,b)
   if k in barriers:continue
   if k in seen:union(i,seen[k])
   else:seen[k]=i
 components={}
 for i in range(len(out)):components.setdefault(find(i),[]).append(i)
 if len(components)!=2:raise ValueError(f'{label}: expected 2 surface components, got {len(components)}')
 plus={find(i) for i,s in enumerate(marks) if s==1};minus={find(i) for i,s in enumerate(marks) if s==-1}
 if len(plus)!=1 or len(minus)!=1 or plus==minus:raise ValueError(f'{label}: cut did not separate +/- sides')
 positive=components[next(iter(plus))];negative=components[next(iter(minus))]
 if len(positive)>=len(negative):raise ValueError(f'{label}: distal side was not the small component')
 main=[out[i] for i in negative];parts[part]=[out[i] for i in positive]
 ring=[mapping[e] for e in loop];tris,area=triangulate(np.asarray(P)[ring],normal)
 caps[label+'_Proximal']=[[ring[a],ring[b],ring[c]] for a,b,c in tris]
 caps[label+'_Distal']=[[ring[a],ring[c],ring[b]] for a,b,c in tris]
 sites[label]={'part':part,'center':center.tolist(),'normalTowardDistal':normal.tolist(),'loopVertices':len(loop),'capAreaSquareMeters':area,'centroidOffsetMeters':float(dist),'barrierEdges':len(barriers)}
 print(label,'ring',len(loop),'area',round(area,6),'distal faces',len(positive),'remaining',len(negative))

for side in ('L','R'):
 upper=bones['Rig_UpperArm_'+side];elbow=bones['Rig_Forearm_'+side];hand=bones['Rig_Hand_'+side]
 thigh=bones['Rig_Thigh_'+side];knee=bones['Rig_Shin_'+side];foot=bones['Rig_Foot_'+side]
 # Distal before proximal, so each detached unit can carry both of its caps.
 cut('Wrist_'+side,hand,hand-elbow,'Hand_'+side)
 cut('Elbow_'+side,elbow,hand-upper,'Forearm_'+side)
 cut('Ankle_'+side,foot,foot-knee,'Foot_'+side)
 cut('Knee_'+side,knee,foot-thigh,'Shin_'+side)
parts['Main']=main

# Verify boundary edges after adding the relevant cap(s) to every piece.
closures={}
for name,faces in parts.items():
 included=[]
 if name=='Main':included=[k for k in caps if k.endswith('_Proximal') and (k.startswith('Elbow_') or k.startswith('Knee_'))]
 else:
  part,side=name.split('_');included=({'Hand':['Wrist_'+side+'_Distal'],'Forearm':['Wrist_'+side+'_Proximal','Elbow_'+side+'_Distal'],
    'Foot':['Ankle_'+side+'_Distal'],'Shin':['Ankle_'+side+'_Proximal','Knee_'+side+'_Distal']}[part])
 counts=Counter()
 for face in faces+[f for k in included for f in caps[k]]:
  for a,b in zip(face,face[1:]+face[:1]):counts[edge(a,b)]+=1
 boundary=sum(v==1 for v in counts.values());nonmanifold=sum(v>2 for v in counts.values())
 if nonmanifold or (name!='Main' and boundary):raise ValueError(f'{name}: boundary={boundary}, nonmanifold={nonmanifold}')
 if name=='Main' and boundary!=1208:raise ValueError(f'Main: expected inherited 1208 boundaries, got {boundary}')
 closures[name]={'boundaryEdgesWithCaps':boundary,'nonManifoldEdges':nonmanifold,'caps':included}
print('Closure checks:',closures,'max discarded interpolated weight',max(discard))
args.output.write_text(json.dumps({'positions':np.asarray(P,dtype='f4').ravel().tolist(),'normals':np.asarray(N,dtype='f4').ravel().tolist(),'joints':np.asarray(J,dtype='u2').ravel().tolist(),'weights':np.asarray(W,dtype='f4').ravel().tolist(),'parts':parts,'caps':caps,'sites':sites,'closures':closures,'maxCutInterpolationWeightLoss':max(discard)},separators=(',',':')))
