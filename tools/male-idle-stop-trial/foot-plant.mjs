import {Quaternion,Vector3} from 'three';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,t,d)=>x<t?Math.min(t,x+d):Math.max(t,x-d);

// A limited, character-specific two-bone plant for the idle/stop trial.
// It follows a selected low skin vertex while a foot is near the flat floor;
// it is not a physics contact sensor, a general terrain solver, or a promise
// of zero sliding. The lock fades on movement, release and large errors.
export class FootPlant{
  constructor(player,model,mesh){
    this.player=player;this.model=model;this.mesh=mesh;this.root=model.getObjectByName('Rig_Root');
    this.legs=Object.fromEntries(['L','R'].map(side=>[side,{thigh:model.getObjectByName('Rig_Thigh_'+side),
      shin:model.getObjectByName('Rig_Shin_'+side),foot:model.getObjectByName('Rig_Foot_'+side)}]));
    if(Object.values(this.legs).some(x=>!x.thigh||!x.shin||!x.foot))throw Error('Не найдены кости стоп');
    this.reset();
  }
  reset(){this.sides=Object.fromEntries(['L','R'].map(s=>[s,{active:false,weight:0,vertex:-1,anchor:new Vector3(),cooldown:0,
    plane:null,correction:[new Quaternion(),new Quaternion(),new Quaternion()]}]));this.lower=0}
  position(b){return b.getWorldPosition(new Vector3())}
  rotation(b){return b.getWorldQuaternion(new Quaternion()).normalize()}
  point(id){const p=new Vector3();this.mesh.updateMatrixWorld(true);this.mesh.skeleton.update();this.mesh.getVertexPosition(id,p);return this.mesh.localToWorld(p)}
  setWorld(b,q){b.quaternion.copy(this.rotation(b.parent).invert().multiply(q)).normalize();this.player.updateMatrixWorld(true)}
  fit(side,goal,dt){
    const {thigh,shin,foot}=this.legs[side],hip=this.position(thigh);let knee=this.position(shin),ankle=this.position(foot);
    const oldFoot=this.rotation(foot),upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle);
    let dir=goal.clone().sub(hip),distance=dir.length();if(distance<1e-8)return;
    distance=clamp(distance,Math.abs(upper-lower)+.0002,upper+lower-.0005);dir.normalize();
    const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    let plane=knee.clone().sub(hip);plane.addScaledVector(dir,-plane.dot(dir));
    // Preserve the existing knee bend direction. If the pose is almost
    // straight, use the character's forward direction, never a backwards knee.
    const forward=new Vector3(0,0,1).applyQuaternion(this.rotation(this.player));forward.addScaledVector(dir,-forward.dot(dir));
    if(forward.lengthSq()<1e-10)return;forward.normalize();
    if(plane.lengthSq()<1e-8)plane.copy(forward);else plane.normalize();
    if(plane.dot(forward)<.15)plane.copy(forward);
    const state=this.sides[side];
    if(state.plane){
      const previous=state.plane.clone().addScaledVector(dir,-state.plane.dot(dir));
      if(previous.lengthSq()>1e-8){previous.normalize();if(previous.dot(plane)<0)plane.copy(forward);
        plane.copy(previous.lerp(plane,1-Math.exp(-dt*8)).normalize());}
    }
    state.plane=plane.clone();
    const newKnee=hip.clone().addScaledVector(dir,along).addScaledVector(plane,height);
    this.setWorld(thigh,new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),newKnee.sub(hip).normalize()).multiply(this.rotation(thigh)));
    knee=this.position(shin);ankle=this.position(foot);const target=hip.clone().addScaledVector(dir,distance);
    this.setWorld(shin,new Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.sub(knee).normalize()).multiply(this.rotation(shin)));
    this.setWorld(foot,oldFoot);
  }
  apply(dt,contacts,{plantable,speed=0}={}){
    if(!(dt>0))return {active:0,maximumCorrection:0,lower:this.lower};
    let active=0,maxCorrection=0;this.player.updateMatrixWorld(true);
    for(const side of ['L','R']){
      const s=this.sides[side],c=contacts[side];s.cooldown=Math.max(0,s.cooldown-dt);
      if(s.active&&(!plantable||c.minimum>.035))s.active=false;
      if(!s.active&&plantable&&s.cooldown<=0&&c.minimum<=.014){
        s.vertex=c.vertex;s.anchor.copy(this.point(s.vertex));s.active=true;s.plane=null;
      }
      if(s.active){
        const delta=this.point(s.vertex).sub(s.anchor);
        if(speed>.3&&Math.hypot(delta.x,delta.z)>.23){s.active=false;s.cooldown=.10}
      }
      s.weight=approach(s.weight,s.active?1:0,dt*(s.active?12:9));if(s.weight>1e-4&&s.vertex>=0)active++;
    }
    // Lower the hips very slightly if the two planted ankles would otherwise
    // exceed the available leg length during the transition to a narrow idle.
    let needed=0;
    for(const side of ['L','R']){
      const s=this.sides[side];if(s.weight<1e-4||s.vertex<0)continue;
      const {thigh,shin,foot}=this.legs[side],hip=this.position(thigh),knee=this.position(shin),ankle=this.position(foot);
      const delta=s.anchor.clone().sub(this.point(s.vertex)).multiplyScalar(s.weight),target=ankle.clone().add(delta);
      const reach=hip.distanceTo(knee)+knee.distanceTo(ankle)-.001,horizontal=Math.hypot(target.x-hip.x,target.z-hip.z);
      if(horizontal<reach){const maxY=Math.sqrt(Math.max(0,reach*reach-horizontal*horizontal));needed=Math.max(needed,(hip.y-target.y)-maxY)}
    }
    needed=clamp(needed,0,.035);this.lower=approach(this.lower,needed,dt*.24);
    if(this.lower>1e-6){this.root.position.y-=this.lower;this.player.updateMatrixWorld(true)}
    for(const side of ['L','R']){
      const s=this.sides[side],leg=this.legs[side],bones=[leg.thigh,leg.shin,leg.foot],raw=bones.map(b=>b.quaternion.clone());
      if(s.weight>=1e-4&&s.vertex>=0){
        const current=this.point(s.vertex),delta=s.anchor.clone().sub(current).multiplyScalar(s.weight);
        const horizontal=Math.hypot(delta.x,delta.z);if(horizontal>.18){delta.x*=.18/horizontal;delta.z*=.18/horizontal}
        delta.y=clamp(delta.y,-.04,.04);maxCorrection=Math.max(maxCorrection,delta.length());
        this.fit(side,this.position(leg.foot).add(delta),dt);
      }
      // Filter only the IK correction, not the source animation. A knee
      // close to full extension otherwise changes its bend plane abruptly.
      const wanted=bones.map((b,i)=>raw[i].clone().invert().multiply(b.quaternion).normalize()),alpha=1-Math.exp(-dt/.075);
      for(let i=0;i<bones.length;i++){
        s.correction[i].slerp(wanted[i],alpha).normalize();bones[i].quaternion.copy(raw[i]).multiply(s.correction[i]).normalize();
      }
      this.player.updateMatrixWorld(true);
      if(!s.active&&s.weight<1e-4&&s.correction.some(q=>q.angleTo(new Quaternion())>1e-4))active++;
    }
    return {active,maximumCorrection:maxCorrection,lower:this.lower};
  }
}
