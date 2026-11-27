// Standalone natural-motion trial. The model is unchanged; locomotion and
// the walk stop are adapted from 100STYLE, the run stop from CMU 104_56.
import {
  AdditiveAnimationBlendMode,AnimationClip,AnimationMixer,Matrix4,Quaternion,
  QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack,
} from 'three';
import {PhaseClock,wrapPhase,WALK_SPEED,RUN_SPEED,RUN_PHASE_OFFSET} from './phase-clock.mjs';
import {KneeVolumeCorrector} from '../male-leg-volume/knee-volume.mjs';
import authored from './clips.json';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,t,delta)=>x<t?Math.min(t,x+delta):Math.max(t,x-delta);
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const axisX=new Vector3(1,0,0),rad=x=>x*Math.PI/180;
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x));
function qtrack(name,times,angles){return new QuaternionKeyframeTrack(name+'.quaternion',times,angles.flatMap(x=>qx(x).toArray()))}
function recorded(spec){return new AnimationClip(spec.name,spec.duration,spec.tracks.map(t=>new (t.type==='vector'?VectorKeyframeTrack:QuaternionKeyframeTrack)(t.name,t.times,t.values)))}
function inspectClip(){
 const t=[0,.35,.8,1.2,1.6,2.05],clip=new AnimationClip('Inspect_Well_Additive',2.05,[
  qtrack('Rig_Spine',t,[0,2,8,8,3,0]),qtrack('Rig_Chest',t,[0,2,7,7,2,0]),
  qtrack('Rig_Neck',t,[0,2,7,7,2,0]),qtrack('Rig_Head',t,[0,2,10,10,3,0]),
  qtrack('Rig_UpperArm_R',t,[0,-7,-20,-20,-7,0]),qtrack('Rig_Forearm_R',t,[0,-3,-8,-8,-3,0]),
 ]);clip.blendMode=AdditiveAnimationBlendMode;return clip;
}
// Height-only safety guard for the selected skin points. No runtime foot lock,
// inverse-kinematic knee corrections, contact physics or uneven terrain here.
function createSoleGuard(model,root,mesh){
 const p=mesh.geometry.getAttribute('position'),j=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight');
 if(!p||!j||!w||!mesh.skeleton||!root.parent)throw Error('Не найдены данные стоп модели');
 const points=[],used=new Set();for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>=.16||Math.abs(x)<=.035||Math.abs(x)>=.25)continue;
  const influences=[];for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);if(weight>1e-8){influences.push([joint,weight]);used.add(joint)}}
  if(influences.length)points.push({id:i,side:x>0?'L':'R',x,y,z,influences});
 }
 if(points.length<100)throw Error('Не найдены точки обеих стоп');
 const matrices=mesh.skeleton.bones.map(()=>new Matrix4()),prefix=new Matrix4(),inverseParent=new Matrix4(),delta=new Vector3();
 return function guard(){
  model.updateWorldMatrix(true,true);mesh.updateMatrixWorld(true);prefix.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
  for(const k of used)matrices[k].copy(prefix).multiply(mesh.skeleton.bones[k].matrixWorld).multiply(mesh.skeleton.boneInverses[k]).multiply(mesh.bindMatrix);
  const contacts={L:{minimum:Infinity,vertex:-1},R:{minimum:Infinity,vertex:-1}};let minimum=Infinity;
  for(const point of points){let y=0;for(const [k,weight] of point.influences){const e=matrices[k].elements;y+=weight*(e[1]*point.x+e[5]*point.y+e[9]*point.z+e[13])}
   minimum=Math.min(minimum,y);if(y<contacts[point.side].minimum)contacts[point.side]={minimum:y,vertex:point.id}}
  const lift=Math.max(0,.001-minimum);
  if(lift>0){inverseParent.copy(root.parent.matrixWorld).invert();const e=inverseParent.elements;delta.set(e[4]*lift,e[5]*lift,e[6]*lift);root.position.add(delta);model.updateWorldMatrix(true,true)}
  for(const side of ['L','R'])contacts[side].minimum+=lift;
  return {minimumBefore:minimum,lift,vertices:points.length,contacts};
 };
}
export function sampleBrakeCurve(kind,progress,start=kind==='run'?130:150){
 const c=authored.curves[kind]?.variants[start];if(!c)throw Error('Unknown brake kind or start frame');
 const n=c.velocity.length-1,u=clamp(progress,0,1)*n,i=Math.min(n-1,Math.floor(u)),f=u-i,a=c.velocity[i],b=c.velocity[i+1];
 return {speed:a+(b-a)*f,integral:c.integral[i]+(a*f+(b-a)*f*f/2)/n};
}
export function brakePlan(speed){
 const kind=speed>1.45?'run':'walk',bank=authored.curves[kind],curve=bank.variants[kind==='run'?130:150],v=Math.max(0,speed);
 return {kind,duration:curve.nominalDuration,area:curve.area,distance:v*curve.nominalDuration*curve.area,
  maxDistance:v*Math.max(...Object.values(bank.variants).map(c=>c.nominalDuration*c.area))};
}
export class CharacterMotion{
 constructor(model,animations,{reducedMotion=false}={}){
  this.model=model;this.root=model.getObjectByName('Rig_Root');const mesh=model.getObjectByName('NewBody');
  if(!this.root||!mesh?.isSkinnedMesh)throw Error('Модель не совпадает с пробой');
  const adapted=Object.fromEntries(authored.clips.map(s=>[s.name,recorded(s)]));
  this.clips={idle:adapted.Neutral_Idle,walk:adapted.Neutral_Walk,run:adapted.Neutral_Run,
   brakeWalk:adapted.Neutral_Stop,brakeWalkMirror:adapted.Neutral_Stop_Mirror,
   brakeRun:adapted.CMU_Run_Stop,brakeRunMirror:adapted.CMU_Run_Stop_Mirror,inspect:inspectClip()};
  // Equal phase on the two cycles follows the same supporting foot; the
  // offset was found by comparing leg directions at 96 phases. The source
  // cycle distances set the playback rate against actual world speed.
  this.clock=new PhaseClock(this.clips.walk.duration*.856/WALK_SPEED,this.clips.run.duration*1.866/RUN_SPEED);
  this.mixer=new AnimationMixer(model);this.actions={};
  for(const [name,clip] of Object.entries(this.clips)){const action=this.mixer.clipAction(clip).reset().play();action.paused=true;action.setEffectiveWeight(0);this.actions[name]=action}
  this.bones=mesh.skeleton.bones;this.legBones=['Thigh','Shin','Foot'].flatMap(part=>['L','R'].map(side=>model.getObjectByName(`Rig_${part}_${side}`)));
  if(this.legBones.some(b=>!b))throw Error('Не найдены кости ног');
  this.samplers={};for(const name of ['walk','run','brakeWalk','brakeWalkMirror','brakeRun','brakeRunMirror']){
   this.samplers[name]=new Map(this.clips[name].tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>[t.name,t.createInterpolant()]));
  }
  this.guard=createSoleGuard(model,this.root,mesh);this.volume=new KneeVolumeCorrector(model);
  this.reducedMotion=reducedMotion;this.raw=null;this.rendered=null;this.snapshot=null;this.brake=null;this.move=0;this.idleTime=0;this.floor=null;this.weights={};this.speed=0;this.turning=0;
  this.render({inspectTime:null});
 }
 sample(name,bone,time){return new Quaternion().fromArray(this.samplers[name].get(bone.name+'.quaternion').evaluate(time)).normalize()}
 choosePhase(speed){
  const pose=this.rendered||this.raw;if(!pose)return;
  const run=clamp((speed-WALK_SPEED)/(RUN_SPEED-WALK_SPEED),0,1),weights={Thigh:2,Shin:1.2,Foot:.4};let best=null;
  for(let i=0;i<96;i++){const phase=i/96;let score=0;
   for(const b of this.legBones){const a=this.sample('walk',b,phase*this.clips.walk.duration),z=this.sample('run',b,wrapPhase(phase+RUN_PHASE_OFFSET)*this.clips.run.duration);
    const q=a.slerp(z,run),current=pose.rotations[this.bones.indexOf(b)],part=b.name.split('_')[1];score+=(weights[part]||1)*q.angleTo(current)**2}
   if(!best||score<best.score)best={phase,score};
  }this.clock.setPhase(best.phase);
 }
 dropSnapshot(){if(!this.snapshot)return;const {action,clip}=this.snapshot;action.stop();this.mixer.uncacheAction(clip,this.model);this.mixer.uncacheClip(clip);this.snapshot=null}
 captureSnapshot(){
  const pose=this.rendered||this.raw;if(!pose)return;
  const tracks=[new VectorKeyframeTrack('Rig_Root.position',[0],pose.root.toArray())];
  for(let i=0;i<this.bones.length;i++)if(this.bones[i]!==this.root)tracks.push(new QuaternionKeyframeTrack(this.bones[i].name+'.quaternion',[0],pose.rotations[i].toArray()));
  this.dropSnapshot();const clip=new AnimationClip('Interrupted_Pose',.001,tracks),action=this.mixer.clipAction(clip).reset().play();
  action.paused=true;action.time=0;action.setEffectiveWeight(0);this.snapshot={clip,action,elapsed:0,duration:.20};
 }
 reset(){this.dropSnapshot();this.clock.reset('walk',0);this.move=0;this.idleTime=0;this.speed=this.turning=0;this.brake=null;this.render({inspectTime:null})}
 chooseBrake(kind,speed){
  if(!['walk','run'].includes(kind)||!Number.isFinite(speed)||speed<0)throw Error('Invalid brake request');
  const options=kind==='run'?['brakeRun','brakeRunMirror']:['brakeWalk','brakeWalkMirror'],bank=authored.curves[kind];
  const current=this.raw?.rotations||this.bones.map(b=>b.quaternion),weights={Thigh:2,Shin:1.2,Foot:.5};let best=null;
  for(const name of options)for(const [startKey,curve] of Object.entries(bank.variants)){
   const start=Number(startKey),duration=curve.nominalDuration,horizon=Math.min(.20,duration*.4),w=this.clock.weight;let score=0;
   for(const [fraction,importance] of [[0,.3],[.33,.25],[.66,.25],[1,.2]]){
    const t=horizon*fraction,rate=((1-w)/this.clock.walkDuration+w/this.clock.runDuration)*clamp(speed/this.clock.speed,0,1.35);
    const phase=wrapPhase(this.clock.phase+t*rate),runPhase=wrapPhase(phase+RUN_PHASE_OFFSET);
    const stopTime=((start-bank.from)+(bank.to-start)*clamp(t/duration,0,1))/(bank.to-bank.from)*this.clips[name].duration;
    for(const b of this.legBones){const part=b.name.split('_')[1],from=t===0?current[this.bones.indexOf(b)]:this.sample('walk',b,phase*this.clips.walk.duration).slerp(this.sample('run',b,runPhase*this.clips.run.duration),w);
     score+=importance*(weights[part]||1)*from.angleTo(this.sample(name,b,stopTime))**2}
   }
   const result={kind,choice:name,start,duration,area:curve.area,distance:speed*duration*curve.area,score};if(!best||score<best.score)best=result;
  }return best;
 }
 beginBrake({kind,speed,duration,selection}){
  if(!selection||selection.kind!==kind||!(duration>0))throw Error('Invalid brake selection');
  if(this.snapshot)this.captureSnapshot();
  this.brake={kind,choice:selection.choice,start:selection.start,speed,duration,progress:0,startMove:this.move,startRun:this.clock.weight,
   power:ease((speed-.08)/.5),score:selection.score};
 }
 interrupt(){if(this.brake||this.snapshot){this.captureSnapshot();this.brake=null;this.needsPhase=true}}
 interruptGesture(){this.captureSnapshot();this.needsPhase=true}
 step(dt,{speed=0,turning=0,inspectTime=null,brakeProgress=null}={}){
  if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame time');
  const wasStill=this.move<.02&&this.speed<.04;this.speed=speed;this.turning=turning;
  const active=this.brake&&Number.isFinite(brakeProgress);if(active)this.brake.progress=clamp(brakeProgress,0,1);
  if(!active&&speed>.04&&(wasStill||this.needsPhase)){this.choosePhase(speed);this.needsPhase=false}
  const target=active?this.brake.startRun:clamp((speed-WALK_SPEED)/(RUN_SPEED-WALK_SPEED),0,1);
  this.clock.setTargetWeight(target);const previous=this.clock.phase;this.clock.step(dt);
  const increment=(this.clock.phase-previous+1)%1,ratio=clamp(Math.max(speed/Math.max(.001,this.clock.speed),active?0:turning*.12),0,1.35);
  this.clock.phase=wrapPhase(previous+increment*ratio);
  if(!active){const desired=clamp(Math.max(speed/WALK_SPEED,turning*.18),0,1);this.move=approach(this.move,desired,dt*4)}
  if(!this.reducedMotion)this.idleTime=(this.idleTime+dt)%this.clips.idle.duration;
  if(this.snapshot)this.snapshot.elapsed=Math.min(this.snapshot.duration,this.snapshot.elapsed+dt);
  this.render({inspectTime});
  if(active&&this.brake.progress>=1){this.brake=null;this.move=0}
  if(this.snapshot&&this.snapshot.elapsed>=this.snapshot.duration)this.dropSnapshot();
 }
 render({inspectTime=null}={}){
  if(this.raw){this.root.position.copy(this.raw.root);this.bones.forEach((b,i)=>b.quaternion.copy(this.raw.rotations[i]))}
  const a=this.actions,c=this.clips,brake=this.brake;
  a.idle.time=this.idleTime%c.idle.duration;a.walk.time=this.clock.phase*c.walk.duration;a.run.time=this.clock.runPhase*c.run.duration;
  let brakeWeight=0,baseMove=this.move;
  if(brake){const p=brake.progress,bank=authored.curves[brake.kind];
   a[brake.choice].time=((brake.start-bank.from)+(bank.to-brake.start)*p)/(bank.to-bank.from)*c[brake.choice].duration;
   const entry=ease(p*brake.duration/.20),tail=1-ease((p-.76)/.24);
   brakeWeight=brake.power*entry*tail;baseMove=brake.startMove*(1-ease((p-.64)/.36));this.move=baseMove;
  }
  const runWeight=brake?brake.startRun:this.clock.weight,snapshotWeight=this.snapshot?1-ease(this.snapshot.elapsed/this.snapshot.duration):0,normal=1-snapshotWeight;
  const base=(1-brakeWeight)*normal,idle=base*(1-baseMove),walk=base*baseMove*(1-runWeight),run=base*baseMove*runWeight;
  a.idle.setEffectiveWeight(idle);a.walk.setEffectiveWeight(walk);a.run.setEffectiveWeight(run);
  for(const name of ['brakeWalk','brakeWalkMirror','brakeRun','brakeRunMirror'])a[name].setEffectiveWeight(brake&&name===brake.choice?brakeWeight*normal:0);
  if(this.snapshot)this.snapshot.action.setEffectiveWeight(snapshotWeight);
  const isInspect=Number.isFinite(inspectTime)&&inspectTime>=0&&inspectTime<=c.inspect.duration;
  a.inspect.time=isInspect?inspectTime:0;a.inspect.setEffectiveWeight(isInspect?1:0);
  this.mixer.update(0);this.raw={root:this.root.position.clone(),rotations:this.bones.map(b=>b.quaternion.clone())};
  this.floor=this.guard();this.volume.apply();this.rendered={root:this.root.position.clone(),rotations:this.bones.map(b=>b.quaternion.clone())};
  this.weights={idle,walk,run,brake:brakeWeight*normal,snapshot:snapshotWeight};
 }
}
