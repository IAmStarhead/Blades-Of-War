// Isolated idle/stop trial for the unchanged male_leg_volume_trial.glb.
// Walk and run remain the existing clips; idle and separate stop takes are
// retargeted in author.mjs, then blended here without modifying the model.
import {
  AdditiveAnimationBlendMode,AnimationClip,AnimationMixer,Matrix4,Quaternion,
  QuaternionKeyframeTrack,Vector3,VectorKeyframeTrack,
} from 'three';
import {PhaseClock,wrapPhase,WALK_SPEED,RUN_SPEED} from '../male-stealth-tuning/phase-clock.mjs';
import {floorEnvelope} from '../male-gait-transition/floor-envelope.mjs';
import {KneeVolumeCorrector} from '../male-leg-volume/knee-volume.mjs';
import {createFloorGuard} from '../male-stealth-crouch/floor-guard.mjs';
import {FootPlant} from './foot-plant.mjs';
import authored from './clips.json';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,t,delta)=>x<t?Math.min(t,x+delta):Math.max(t,x-delta);
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const axisX=new Vector3(1,0,0),rad=x=>x*Math.PI/180;
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x));
function qtrack(name,times,angles){return new QuaternionKeyframeTrack(name+'.quaternion',times,angles.flatMap(x=>qx(x).toArray()))}
function recorded(spec){return new AnimationClip(spec.name,spec.duration,spec.tracks.map(t=>new (t.type==='vector'?VectorKeyframeTrack:QuaternionKeyframeTrack)(t.name,t.times,t.values)))}
function inspectClip(){
  // An additive gesture over the actual idle, not a replacement T-pose.
  const t=[0,.35,.8,1.2,1.6,2.05],clip=new AnimationClip('Inspect_Well_Additive',2.05,[
    qtrack('Rig_Spine',t,[0,2,8,8,3,0]),qtrack('Rig_Chest',t,[0,2,7,7,2,0]),
    qtrack('Rig_Neck',t,[0,2,7,7,2,0]),qtrack('Rig_Head',t,[0,2,10,10,3,0]),
    qtrack('Rig_UpperArm_R',t,[0,-7,-20,-20,-7,0]),qtrack('Rig_Forearm_R',t,[0,-3,-8,-8,-3,0]),
  ]);
  clip.blendMode=AdditiveAnimationBlendMode;return clip;
}
// The same sampled sole region as the accepted flat gait. It is a vertical
// clearance guard, not horizontal foot locking, contact physics or full-body IK.
function createSoleGuard(model,root,mesh){
  const p=mesh.geometry.getAttribute('position'),j=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight');
  if(!p||!j||!w||!mesh.skeleton||!root.parent)throw Error('Не найдены данные стоп модели');
  const points=[],used=new Set();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>=.16||Math.abs(x)<=.035||Math.abs(x)>=.25)continue;
    const influences=[];for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);if(weight>1e-8){influences.push([joint,weight]);used.add(joint)}}
    if(influences.length)points.push({id:i,side:x>0?'L':'R',x,y,z,influences});
  }
  if(points.length<100)throw Error('Не найдены точки обеих стоп');
  const matrices=mesh.skeleton.bones.map(()=>new Matrix4()),prefix=new Matrix4(),inverseParent=new Matrix4(),delta=new Vector3();
  return function guard(phase,runWeight,anticipatedStrength){
    model.updateWorldMatrix(true,true);mesh.updateMatrixWorld(true);prefix.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
    for(const k of used)matrices[k].copy(prefix).multiply(mesh.skeleton.bones[k].matrixWorld).multiply(mesh.skeleton.boneInverses[k]).multiply(mesh.bindMatrix);
    const contacts={L:{minimum:Infinity,vertex:-1},R:{minimum:Infinity,vertex:-1}};
    let minimum=Infinity;for(const point of points){let y=0;for(const [k,weight] of point.influences){const e=matrices[k].elements;y+=weight*(e[1]*point.x+e[5]*point.y+e[9]*point.z+e[13])}
      minimum=Math.min(minimum,y);if(y<contacts[point.side].minimum)contacts[point.side]={minimum:y,vertex:point.id};}
    const x=.002-minimum,required=x<=0?0:x<.002?x*x/.004:x-.001;
    const anticipated=floorEnvelope(phase,runWeight)*clamp(anticipatedStrength,0,1),lift=Math.max(required,anticipated);
    if(lift>0){inverseParent.copy(root.parent.matrixWorld).invert();const e=inverseParent.elements;delta.set(e[4]*lift,e[5]*lift,e[6]*lift);root.position.add(delta);model.updateWorldMatrix(true,true)}
    for(const side of ['L','R'])contacts[side].minimum+=lift;
    return {minimumBefore:minimum,lift,required,anticipated,vertices:points.length,contacts};
  };
}
// Linear interpolation of a monotonically decreasing source-derived speed;
// the integral is exact for each piecewise-linear segment, including partial
// frames. Scaling by v0*duration makes distance continuous at brake start.
export function sampleBrakeCurve(kind,progress,start=44){
  const c=authored.curves[kind]?.variants[start];if(!c)throw Error('Unknown brake kind or start frame');
  const n=c.velocity.length-1,u=clamp(progress,0,1)*n,i=Math.min(n-1,Math.floor(u)),f=u-i;
  const a=c.velocity[i],b=c.velocity[i+1];
  return {speed:a+(b-a)*f,integral:c.integral[i]+(a*f+(b-a)*f*f/2)/n};
}
export function brakePlan(speed){
  const kind=speed>2.35?'run':'walk',bank=authored.curves[kind],curve=bank.variants[44],v=Math.max(0,speed);
  return {kind,duration:curve.nominalDuration,area:curve.area,distance:v*curve.nominalDuration*curve.area,
    maxDistance:v*Math.max(...Object.values(bank.variants).map(c=>c.nominalDuration*c.area))};
}

export class CharacterMotion{
  constructor(model,animations,{reducedMotion=false}={}){
    this.model=model;this.root=model.getObjectByName('Rig_Root');const mesh=model.getObjectByName('NewBody');
    const walk=animations.find(x=>x.name==='Walk_Game_Trial'),run=animations.find(x=>x.name==='Run_Game_Trial');
    if(!this.root||!mesh?.isSkinnedMesh||!walk||!run||!walk.tracks.some(t=>t.name==='Rig_Root.position')||!run.tracks.some(t=>t.name==='Rig_Root.position'))throw Error('Модель не совпадает с пробой ходьбы и бега');
    this.clock=new PhaseClock(walk.duration,run.duration);this.mixer=new AnimationMixer(model);
    const adapted=Object.fromEntries(authored.clips.map(s=>[s.name,recorded(s)]));
    this.clips={walk,run,idle:adapted.Living_Idle_Trial,brakeWalk:adapted.Walk_Brake_Trial,brakeWalkMirror:adapted.Walk_Brake_Trial_Mirror,
      brakeRun:adapted.Run_Brake_Trial,brakeRunMirror:adapted.Run_Brake_Trial_Mirror,inspect:inspectClip()};
    this.actions={};for(const [name,clip] of Object.entries(this.clips)){
      const action=this.mixer.clipAction(clip).reset().play();action.paused=true;action.setEffectiveWeight(0);this.actions[name]=action;
    }
    this.bones=mesh.skeleton.bones;this.legBones=['Thigh','Shin','Foot'].flatMap(part=>['L','R'].map(side=>model.getObjectByName(`Rig_${part}_${side}`)));
    if(this.legBones.some(b=>!b))throw Error('Не найдены кости ног');
    this.samplers={};for(const name of ['walk','run','brakeWalk','brakeWalkMirror','brakeRun','brakeRunMirror']){
      this.samplers[name]=new Map(this.clips[name].tracks.filter(t=>t.name.endsWith('.quaternion')).map(t=>[t.name,t.createInterpolant()]));
    }
    this.guard=createSoleGuard(model,this.root,mesh);this.blendGuard=createFloorGuard(model.parent,model,mesh);this.volume=new KneeVolumeCorrector(model);
    this.plant=new FootPlant(model.parent,model,mesh);
    this.reducedMotion=reducedMotion;this.raw=null;this.rendered=null;this.snapshot=null;this.brake=null;this.move=0;this.idleTime=0;this.floor=null;this.weights={};this.speed=0;this.turning=0;
    this.render({inspectTime:null});
  }
  dropSnapshot(){if(!this.snapshot)return;const {action,clip}=this.snapshot;action.stop();this.mixer.uncacheAction(clip,this.model);this.mixer.uncacheClip(clip);this.snapshot=null}
  captureSnapshot(){
    const pose=this.rendered||this.raw;if(!pose)return;
    // A rapid reversal may happen during a plant or a crossfade. Preserve the
    // visible evaluated pose, then blend that pose into the new requested gait.
    const tracks=[new VectorKeyframeTrack('Rig_Root.position',[0],pose.root.toArray())];
    for(let i=0;i<this.bones.length;i++)if(this.bones[i]!==this.root)tracks.push(new QuaternionKeyframeTrack(this.bones[i].name+'.quaternion',[0],pose.rotations[i].toArray()));
    this.dropSnapshot();const clip=new AnimationClip('Interrupted_Pose',.001,tracks),action=this.mixer.clipAction(clip).reset().play();
    action.paused=true;action.time=0;action.setEffectiveWeight(0);this.snapshot={clip,action,elapsed:0,duration:.26};
  }
  reset(){this.dropSnapshot();this.plant.reset();this.clock.reset('walk',0);this.move=0;this.idleTime=0;this.speed=this.turning=0;this.brake=null;this.render({inspectTime:null})}
  chooseBrake(kind,speed){
    if(!['walk','run'].includes(kind)||!Number.isFinite(speed)||speed<0)throw Error('Invalid brake request');
    const options=kind==='run'?['brakeRun','brakeRunMirror']:['brakeWalk','brakeWalkMirror'],bank=authored.curves[kind];
    const sample=this.raw?.rotations||this.bones.map(b=>b.quaternion),weights={Thigh:2,Shin:1.2,Foot:.45};
    const rotation=(clip,bone,time)=>new Quaternion().fromArray(this.samplers[clip].get(bone.name+'.quaternion').evaluate(time)).normalize();
    // Select both foot and entry point by comparing several poses through the
    // fade, not just the first frame. This avoids joining opposite strides.
    let best=null;
    for(const name of options)for(const [startKey,curve] of Object.entries(bank.variants)){
      const start=Number(startKey),duration=curve.nominalDuration,horizon=Math.min(.25,duration*.45),w=this.clock.weight;
      let score=0;for(const [fraction,importance] of [[0,.18],[.25,.18],[.5,.24],[.75,.24],[1,.16]]){
        const t=horizon*fraction,rate=((1-w)/this.clock.walkDuration+w/this.clock.runDuration)*clamp(speed/this.clock.speed,0,1.25);
        const walkPhase=wrapPhase(this.clock.phase+t*rate),runPhase=wrapPhase(walkPhase-3/32);
        const stopTime=((start-bank.from)+(bank.to-start)*clamp(t/duration,0,1))/(bank.to-bank.from)*this.clips[name].duration;
        for(const b of this.legBones){
          const part=b.name.split('_')[1],from=t===0?sample[this.bones.indexOf(b)]:rotation('walk',b,walkPhase*this.clock.walkDuration).slerp(rotation('run',b,runPhase*this.clock.runDuration),w);
          const to=rotation(name,b,stopTime);score+=importance*(weights[part]||1)*from.angleTo(to)**2;
        }
      }
      const result={kind,choice:name,start,duration,area:curve.area,distance:speed*duration*curve.area,score};
      if(!best||score<best.score)best=result;
    }return best;
  }
  beginBrake({kind,speed,duration,selection}){
    if(!selection||selection.kind!==kind||!(duration>0))throw Error('Invalid brake selection');
    if(this.snapshot)this.captureSnapshot();
    this.brake={kind,choice:selection.choice,start:selection.start,speed,duration,progress:0,startMove:this.move,startRun:this.clock.weight,
      power:ease((speed-.12)/.8),score:selection.score};
  }
  interrupt(){if(this.brake||this.snapshot){this.captureSnapshot();this.brake=null}}
  interruptGesture(){this.captureSnapshot()}
  step(dt,{speed=0,turning=0,inspectTime=null,brakeProgress=null}={}){
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame time');
    this.speed=speed;this.turning=turning;
    const active=this.brake&&Number.isFinite(brakeProgress);
    if(active)this.brake.progress=clamp(brakeProgress,0,1);
    const target=active?this.brake.startRun:clamp((speed-WALK_SPEED)/(RUN_SPEED-WALK_SPEED),0,1);
    this.clock.setTargetWeight(target);const previous=this.clock.phase;this.clock.step(dt);
    const increment=(this.clock.phase-previous+1)%1,ratio=clamp(Math.max(speed/Math.max(.001,this.clock.speed),active?0:turning*.18),0,1.25);
    this.clock.phase=wrapPhase(previous+increment*ratio);
    if(!active){const desired=clamp(Math.max(speed/WALK_SPEED,turning*.28),0,1);this.move=approach(this.move,desired,dt*3.6)}
    if(!this.reducedMotion)this.idleTime=(this.idleTime+dt)%this.clips.idle.duration;
    if(this.snapshot)this.snapshot.elapsed=Math.min(this.snapshot.duration,this.snapshot.elapsed+dt);
    this.render({inspectTime,dt});
    if(active&&this.brake.progress>=1){this.brake=null;this.move=0}
    if(this.snapshot&&this.snapshot.elapsed>=this.snapshot.duration)this.dropSnapshot();
  }
  render({inspectTime=null,dt=0}={}){
    if(this.raw){this.root.position.copy(this.raw.root);this.bones.forEach((b,i)=>b.quaternion.copy(this.raw.rotations[i]))}
    const a=this.actions,c=this.clips,brake=this.brake;
    a.idle.time=this.idleTime%c.idle.duration;a.walk.time=this.clock.phase*this.clock.walkDuration;a.run.time=this.clock.runPhase*this.clock.runDuration;
    let brakeWeight=0,baseMove=this.move;
    if(brake){
      const p=brake.progress,bank=authored.curves[brake.kind];
      this.actions[brake.choice].time=((brake.start-bank.from)+(bank.to-brake.start)*p)/(bank.to-bank.from)*this.clips[brake.choice].duration;
      // Enter with the outgoing gait still advancing; release into idle only
      // after the generated stop has brought the legs back under the body.
      const entry=ease(p*brake.duration/.25),tail=1-ease((p-.68)/.32);
      brakeWeight=brake.power*entry*tail;baseMove=brake.startMove*(1-ease((p-.58)/.28));this.move=baseMove;
    }
    const runWeight=brake?brake.startRun:this.clock.weight;
    const snapshotWeight=this.snapshot?1-ease(this.snapshot.elapsed/this.snapshot.duration):0,normal=1-snapshotWeight;
    const base=(1-brakeWeight)*normal,idle=base*(1-baseMove),walk=base*baseMove*(1-runWeight),run=base*baseMove*runWeight;
    a.idle.setEffectiveWeight(idle);a.walk.setEffectiveWeight(walk);a.run.setEffectiveWeight(run);
    for(const name of ['brakeWalk','brakeWalkMirror','brakeRun','brakeRunMirror'])a[name].setEffectiveWeight(brake&&name===brake.choice?brakeWeight*normal:0);
    if(this.snapshot)this.snapshot.action.setEffectiveWeight(snapshotWeight);
    const isInspect=Number.isFinite(inspectTime)&&inspectTime>=0&&inspectTime<=c.inspect.duration;
    a.inspect.time=isInspect?inspectTime:0;a.inspect.setEffectiveWeight(isInspect?1:0);
    this.mixer.update(0);this.raw={root:this.root.position.clone(),rotations:this.bones.map(b=>b.quaternion.clone())};
    // Preserve the previous pure gait exactly; use vertical fitting only in
    // blended/idle/stop poses. It cannot prevent horizontal foot sliding.
    const strength=Math.max(ease((1-baseMove)/.25),brakeWeight,snapshotWeight);
    const fitting=strength>1e-7?this.blendGuard(true,strength):{correction:0,ik:0};
    const initial=this.guard(this.clock.phase,this.clock.weight,walk+run);
    // Only engage the support fit once the stop is settling. During the
    // fast stride itself a near-floor toe may still be swinging; locking it
    // there can force the knee or produce a larger slide on release.
    const plantable=brake?brake.progress>.60:this.speed<.10&&this.turning<.10;
    const plant=this.plant.apply(dt,initial.contacts,{plantable,speed:this.speed});
    this.floor=plant.active||plant.lower>1e-6?this.guard(this.clock.phase,this.clock.weight,0):initial;
    this.floor.locomotionLift=plant.active||plant.lower>1e-6?initial.lift:0;
    this.floor.blendLift=fitting.correction;this.floor.ik=fitting.ik;this.floor.plant=plant;
    this.volume.apply();this.rendered={root:this.root.position.clone(),rotations:this.bones.map(b=>b.quaternion.clone())};
    this.weights={idle,walk,run,brake:brakeWeight*normal,snapshot:snapshotWeight};
  }
}
