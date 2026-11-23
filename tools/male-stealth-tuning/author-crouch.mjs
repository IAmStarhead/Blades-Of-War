// Trial retarget of the CC0 Universal Animation Library crouch loops onto the
// pinned 52-bone body. Source clips and the accepted GLB are never modified.
import {NodeIO} from '@gltf-transform/core';
import {Bone,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const model=path.join(repo,'work/male-leg-volume/male_leg_volume_trial.glb');
const source=path.join(repo,'tools/male-library-motion/source/AnimationLibrary_Godot_Standard.gltf');
const sourceBin=path.join(repo,'tools/male-library-motion/source/AnimationLibrary_Godot_Standard.bin');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expected='eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484';
if(hash(model)!==expected||hash(source)!=='0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765'||
   hash(sourceBin)!=='6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c')throw Error('Unexpected model or animation source');
const io=new NodeIO(),dr=(await io.read(model)).getRoot(),sr=(await io.read(source)).getRoot();
const targetNodes=dr.listSkins()[0].listJoints(),names=targetNodes.map(n=>n.getName());
if(names.length!==52)throw Error('Expected the current 52-bone character');
function createRig(root,list,rootName){
  const ns=[...new Set(list)].map(name=>{const n=root.listNodes().find(x=>x.getName()===name);if(!n)throw Error('Missing '+name);return n});
  const bones=new Map(ns.map(n=>{const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());return [b.name,b]}));
  for(const n of ns){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()))}
  const top=bones.get(rootName);top.updateMatrixWorld(true);return {ns,bones,top};
}
const S=createRig(sr,['Rig',...sr.listSkins()[0].listJoints().map(n=>n.getName())],'Rig');
const T=createRig(dr,names,'Rig_Root');
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion()).normalize();
const bindQ=new Map([...S.bones].map(([k,b])=>[k,Q(b)])),bindP=new Map([...S.bones].map(([k,b])=>[k,P(b)]));
const mapping=[['Rig_Hips','DEF-hips'],['Rig_Spine','DEF-spine.002'],['Rig_Chest','DEF-spine.003'],['Rig_Neck','DEF-neck'],['Rig_Head','DEF-head']];
const align=new Map();
for(const side of ['L','R']){
  for(const [target,src] of [['Shoulder','shoulder'],['UpperArm','upper_arm'],['Forearm','forearm'],['Hand','hand'],['Thigh','thigh'],['Shin','shin'],['Foot','foot'],['Toes','toe']])
    mapping.push([`Rig_${target}_${side}`,`DEF-${src}.${side}`]);
  for(const [target,src,targetChild,srcChild] of [['UpperArm','upper_arm','Forearm','forearm'],['Forearm','forearm','Hand','hand'],['Thigh','thigh','Shin','shin'],['Shin','shin','Foot','foot'],['Foot','foot','Toes','toe']]){
    const a=P(T.bones.get(`Rig_${targetChild}_${side}`)).sub(P(T.bones.get(`Rig_${target}_${side}`))).normalize();
    const b=P(S.bones.get(`DEF-${srcChild}.${side}`)).sub(P(S.bones.get(`DEF-${src}.${side}`))).normalize();
    align.set(`Rig_${target}_${side}`,new Quaternion().setFromUnitVectors(a,b));
  }
  align.set(`Rig_Hand_${side}`,align.get(`Rig_Forearm_${side}`).clone());
  align.set(`Rig_Toes_${side}`,align.get(`Rig_Foot_${side}`).clone());
}
function length(r,a,b,c){return P(r.bones.get(a)).distanceTo(P(r.bones.get(b)))+P(r.bones.get(b)).distanceTo(P(r.bones.get(c)))}
const legScale=length(T,'Rig_Thigh_L','Rig_Shin_L','Rig_Foot_L')/length(S,'DEF-thigh.L','DEF-shin.L','DEF-foot.L');
function reset(r){for(const n of r.ns){const b=r.bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale())}r.top.updateMatrixWorld(true)}
function prepare(a){
  const channels=a.listChannels().map(c=>{const s=c.getSampler();return {name:c.getTargetNode().getName(),path:c.getTargetPath(),input:s.getInput(),output:s.getOutput(),method:s.getInterpolation()}}).filter(c=>S.bones.has(c.name));
  if(channels.some(c=>c.method!=='LINEAR'&&c.method!=='STEP'))throw Error('Unsupported source interpolation');
  return channels;
}
function sample(c,t){
  const N=c.input.getCount();if(N===1)return c.output.getElement(0,[]);
  let lo=0,hi=N-1;while(hi-lo>1){const m=(lo+hi)>>1;if(c.input.getScalar(m)<=t)lo=m;else hi=m}
  const t0=c.input.getScalar(lo),t1=c.input.getScalar(hi);if(t<=t0)return c.output.getElement(lo,[]);if(t>=t1)return c.output.getElement(hi,[]);if(c.method==='STEP')return c.output.getElement(lo,[]);
  const f=(t-t0)/(t1-t0),a=c.output.getElement(lo,[]),b=c.output.getElement(hi,[]);
  if(c.path==='rotation')return new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b),f).normalize().toArray();
  return a.map((v,i)=>v+(b[i]-v)*f);
}
function pose(channels,t){
  reset(S);for(const c of channels){const b=S.bones.get(c.name),v=sample(c,t);if(c.path==='translation')b.position.fromArray(v);else if(c.path==='rotation')b.quaternion.fromArray(v).normalize();else if(c.path==='scale')b.scale.fromArray(v)}S.top.updateMatrixWorld(true);
  reset(T);T.top.position.copy(P(S.bones.get('DEF-hips')).sub(bindP.get('DEF-hips')).multiplyScalar(legScale));T.top.updateMatrixWorld(true);
  for(const [tn,sn] of mapping){const bone=T.bones.get(tn),src=S.bones.get(sn),world=Q(src).multiply(bindQ.get(sn).clone().invert()).multiply(align.get(tn)||new Quaternion()).normalize();
    bone.quaternion.copy(Q(bone.parent).invert().multiply(world)).normalize();T.top.updateMatrixWorld(true)}
}
const node=dr.listNodes().find(n=>n.getName()==='NewBody'),primitive=node?.getMesh()?.listPrimitives()[0],skin=dr.listSkins()[0];
if(!primitive||!node.getSkin())throw Error('Missing body skin');
const pos=primitive.getAttribute('POSITION'),joint=primitive.getAttribute('JOINTS_0'),weight=primitive.getAttribute('WEIGHTS_0');
const inverse=targetNodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),matrices=targetNodes.map(()=>new Matrix4());
const sole={L:[],R:[]};for(let i=0;i<pos.getCount();i++){const p=pos.getElement(i,[]);if(p[1]>=.16||Math.abs(p[0])<=.035||Math.abs(p[0])>=.25)continue;
  sole[p[0]>0?'L':'R'].push({p,j:joint.getElement(i,[]),w:weight.getElement(i,[])})}
if(sole.L.length<50||sole.R.length<50)throw Error('Missing sole samples');
function footMin(){
  T.top.updateMatrixWorld(true);for(let i=0;i<names.length;i++)matrices[i].multiplyMatrices(T.bones.get(names[i]).matrixWorld,inverse[i]);
  const mins={L:Infinity,R:Infinity};for(const side of ['L','R'])for(const v of sole[side]){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p[0]+e[5]*v.p[1]+e[9]*v.p[2]+e[13])}mins[side]=Math.min(mins[side],y)}return mins;
}
// Fit both soles in the stationary crouch, preserving the existing ankle
// orientation, horizontal ankle position and current knee-bend plane. This is
// an authored adjustment of that pose, not planted-foot physics at runtime.
function fitAnkle(side,dy){
  const thigh=T.bones.get('Rig_Thigh_'+side),shin=T.bones.get('Rig_Shin_'+side),foot=T.bones.get('Rig_Foot_'+side);
  T.top.updateMatrixWorld(true);const a=P(thigh);let b=P(shin),c=P(foot);
  const footQ=Q(foot),l1=a.distanceTo(b),l2=b.distanceTo(c),goal=c.clone().add(new Vector3(0,dy,0));
  const direction=goal.clone().sub(a);let distance=direction.length();
  if(distance<1e-8)throw Error('Degenerate ankle target');
  const miss=Math.max(0,distance-(l1+l2-.0002),Math.abs(l1-l2)+.0002-distance);
  distance=Math.max(Math.abs(l1-l2)+.0002,Math.min(l1+l2-.0002,distance));direction.normalize();
  const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  let plane=b.clone().sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction));
  if(plane.lengthSq()<1e-10)plane.set(0,0,1).addScaledVector(direction,-direction.z);
  plane.normalize();const desired=a.clone().addScaledVector(direction,along).addScaledVector(plane,height);
  let turn=new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desired.clone().sub(a).normalize());
  thigh.quaternion.copy(Q(thigh.parent).invert().multiply(turn.multiply(Q(thigh)))).normalize();T.top.updateMatrixWorld(true);
  b=P(shin);c=P(foot);const target=a.clone().addScaledVector(direction,distance);
  turn.setFromUnitVectors(c.clone().sub(b).normalize(),target.sub(b).normalize());
  shin.quaternion.copy(Q(shin.parent).invert().multiply(turn.multiply(Q(shin)))).normalize();T.top.updateMatrixWorld(true);
  foot.quaternion.copy(Q(foot.parent).invert().multiply(footQ)).normalize();T.top.updateMatrixWorld(true);
  return miss;
}
const animated=names.filter(n=>n!=='Rig_Root'&&!n.startsWith('Rig_Finger'));
const previousPath=path.join(repo,'tools/male-game-scene/crouch-clips.json');
if(hash(previousPath)!=='e7db813e8d875e29fdcfa7711ac5eceb18c23b0d4472b0c7757b653666c12ccd')throw Error('Unexpected earlier crouch source');
const earlier=JSON.parse(fs.readFileSync(previousPath,'utf8'));
const SOURCE_WEIGHT=.45;
const specs=[['Crouch_Idle_Loop','Crouch_Hybrid_Idle',0,0,0],['Crouch_Fwd_Loop','Crouch_Hybrid_Walk',.38,1,-1/15]];
function oldSample(track,phase){
  const p=((phase%1)+1)%1,count=track.times.length-1,x=p*count,i=Math.min(count-1,Math.floor(x)),f=x-i,v=track.values;
  if(track.type==='vector')return new Vector3(...[0,1,2].map(k=>v[i*3+k]+(v[(i+1)*3+k]-v[i*3+k])*f));
  return new Quaternion().fromArray(v,i*4).slerp(new Quaternion().fromArray(v,(i+1)*4),f).normalize();
}
function makeClip(sourceName,name,speed,oldIndex,phaseOffset){
  const animation=sr.listAnimations().find(a=>a.getName()===sourceName);if(!animation)throw Error('Missing '+sourceName);
  const channels=prepare(animation),sourceDuration=Math.max(...channels.map(c=>c.input.getScalar(c.input.getCount()-1)));
  const old=earlier.clips[oldIndex],oldTracks=new Map(old.tracks.map(t=>[t.name,t])),duration=old.duration,steps=120,frames=[];
  if(!oldTracks.has('Rig_Root.position')||animated.some(n=>!oldTracks.has(n+'.quaternion')))throw Error('Earlier crouch incompatible with this rig');
  let maxSourceCorrection=0,maxBlendCorrection=0,minRaw=Infinity,maxRaw=-Infinity,minKnee=Infinity,maxKnee=0,maxIdleFootGap=0,maxFitMiss=0,maxIdleResidual=0;
  for(let i=0;i<=steps;i++){
    const phase=i/steps,sourcePhase=((phase+phaseOffset)%1+1)%1;pose(channels,sourceDuration*sourcePhase);
    const floor=footMin(),raw=Math.min(floor.L,floor.R),sourceCorrection=.002-raw;
    maxSourceCorrection=Math.max(maxSourceCorrection,Math.abs(sourceCorrection));T.top.position.y+=sourceCorrection;T.top.updateMatrixWorld(true);
    const sourceRoot=T.top.position.clone(),sourceRotations=new Map(animated.map(n=>[n,T.bones.get(n).quaternion.clone()]));
    // The untouched library retarget is a very deep kneeling-like crouch on
    // this body. Combine it with the previous fitted pose and align its feet
    // by phase; this is an adaptation, not the original animation unchanged.
    T.top.position.copy(oldSample(oldTracks.get('Rig_Root.position'),phase)).lerp(sourceRoot,SOURCE_WEIGHT);
    for(const n of animated)T.bones.get(n).quaternion.copy(oldSample(oldTracks.get(n+'.quaternion'),phase)).slerp(sourceRotations.get(n),SOURCE_WEIGHT).normalize();
    T.top.updateMatrixWorld(true);const floors=footMin(),minimum=Math.min(floors.L,floors.R),correction=.002-minimum;
    maxBlendCorrection=Math.max(maxBlendCorrection,Math.abs(correction));minRaw=Math.min(minRaw,minimum);maxRaw=Math.max(maxRaw,minimum);
    T.top.position.y+=correction;T.top.updateMatrixWorld(true);
    if(oldIndex===0){
      const before=footMin();maxIdleFootGap=Math.max(maxIdleFootGap,before.L-.002,before.R-.002);
      for(let iteration=0;iteration<7;iteration++)for(const side of ['L','R']){
        const missing=.002-footMin()[side];const miss=fitAnkle(side,missing);
        if(iteration===6)maxFitMiss=Math.max(maxFitMiss,miss);
      }
      const after=footMin();maxIdleResidual=Math.max(maxIdleResidual,Math.abs(after.L-.002),Math.abs(after.R-.002));
    }
    for(const side of ['L','R']){const a=P(T.bones.get(`Rig_Thigh_${side}`)),b=P(T.bones.get(`Rig_Shin_${side}`)),c=P(T.bones.get(`Rig_Foot_${side}`));
      const angle=b.clone().sub(a).normalize().angleTo(c.sub(b).normalize())*180/Math.PI;minKnee=Math.min(minKnee,angle);maxKnee=Math.max(maxKnee,angle)}
    frames.push({root:T.top.position.toArray(),rotations:new Map(animated.map(n=>[n,T.bones.get(n).quaternion.clone()]))});
  }
  const round=v=>Math.round(v*1e7)/1e7,times=frames.map((_,i)=>round(duration*i/steps));
  const tracks=[{name:'Rig_Root.position',type:'vector',times,values:frames.flatMap(f=>f.root.map(round))}];
  for(const n of animated){const values=[];let prev=null;for(const f of frames){const q=f.rotations.get(n).clone();if(prev&&prev.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));prev=q}tracks.push({name:n+'.quaternion',type:'quaternion',times,values})}
  if(maxIdleResidual>.005||maxFitMiss>.005)throw Error('Idle crouch sole fitting failed');
  return {name,sourceName,duration,speed,tracks,stats:{legScale,sourceWeight:SOURCE_WEIGHT,phaseOffset,sourceDuration,maxSourceCorrection,maxBlendCorrection,rawMinimum:[minRaw,maxRaw],kneeDegrees:[minKnee,maxKnee],maxIdleFootGap,maxFitMiss,maxIdleResidual}};
}
const data={modelSha256:expected,source:'Quaternius Universal Animation Library Standard, J-Ponzo mirror e24c23cf2a1323488a3faa226ea7ea21f644b73e',
  notes:'A 45% retarget of the library loops combined with the prior fitted crouch; phase aligned and vertically adjusted. No dedicated crouch-entry clip.',clips:specs.map(x=>makeClip(...x))};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'crouch-clips.json');
if(output===model||(output.startsWith(repo+path.sep)&&output!==path.join(here,'crouch-clips.json')))throw Error('Refusing to overwrite another repository artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');console.log(JSON.stringify(data.clips.map(({name,sourceName,duration,speed,stats})=>({name,sourceName,duration,speed,stats})),null,2));
