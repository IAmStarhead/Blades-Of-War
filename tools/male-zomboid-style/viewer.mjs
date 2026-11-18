import {
  Scene,Color,HemisphereLight,DirectionalLight,WebGLRenderer,SRGBColorSpace,
  Mesh,BoxGeometry,MeshLambertMaterial,MeshBasicMaterial,RingGeometry,DoubleSide,
  PerspectiveCamera,AnimationMixer,SkeletonHelper,Group,Vector2,Vector3,Plane,Raycaster,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createApprovedWell} from './well-source.mjs';
import {WELL,plan,slide} from './navigation.mjs';
import {createFloorGuard} from './floor-guard.mjs';

const view=document.querySelector('#view');
const WALK=.9,RUN=1.9,RUN_OLD=2.2,WALK_DURATION=1.0,WALK_OLD_DURATION=1.0,RUN_DURATION=.72,RUN_OLD_DURATION=.75;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,target,step)=>x<target?Math.min(x+step,target):Math.max(x-step,target);
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
async function start(){
  const scene=new Scene();scene.background=new Color(0x2e3930);
  scene.add(new HemisphereLight(0xf8efe8,0x3b4452,1.08));
  const key=new DirectionalLight(0xfff5ec,1.55);key.position.set(-2.6,4.2,4.8);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0004;key.shadow.normalBias=.02;
  const fill=new DirectionalLight(0xc8dcf5,.72);fill.position.set(3.2,2.5,-2);
  const eye=new DirectionalLight(0xffffff,.38);eye.position.set(.2,1.9,5.2);scene.add(key,fill,eye);
  const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
  renderer.outputColorSpace=SRGBColorSpace;renderer.shadowMap.enabled=true;view.appendChild(renderer.domElement);
  const floor=new Mesh(new BoxGeometry(80,.04,80),new MeshLambertMaterial({color:0x36443b}));
  floor.name='neutral-display-floor';floor.position.y=-.022;floor.receiveShadow=true;scene.add(floor);
  const wellProp=createApprovedWell();wellProp.group.position.set(-.7,0,0);scene.add(wellProp.group);
  const marker=new Mesh(new RingGeometry(.10,.155,40),new MeshBasicMaterial({color:0xe4c98e,transparent:true,opacity:.82,side:DoubleSide,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;marker.position.y=.004;marker.visible=false;scene.add(marker);
  const gltf=await new GLTFLoader().loadAsync(RIGGED_URI),male=gltf.scene,player=new Group();
  player.name='controlled-man';player.position.set(1,0,.15);player.add(male);scene.add(player);
  male.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false}});
  const bones=[];male.traverse(o=>{if(o.isBone)bones.push(o)});if(bones.length!==22)throw new Error(`Ожидалось 22 кости, найдено ${bones.length}`);
  const clips=new Map(gltf.animations.map(c=>[c.name,c]));
  const headMesh=male.getObjectByName('head_1'),bodyMesh=male.getObjectByName('head_2');
  if(headMesh.morphTargetInfluences?.length!==1||bodyMesh.morphTargetInfluences?.length!==10)throw new Error('Не найдена обратимая коррекция профиля');
  const clipFor={soft:'Idle_Breathing',old:'Previous_Refined_Idle',walk:'Game_Style_Walk',previousWalk:'Adjusted_Walk',run:'Game_Style_Jog',previousRun:'Adjusted_Run'};
  for(const name of Object.values(clipFor))if(!clips.has(name))throw new Error(`Не найдена анимация ${name}`);
  const mixer=new AnimationMixer(male),actions={};
  for(const [kind,name] of Object.entries(clipFor)){
    const a=mixer.clipAction(clips.get(name));a.reset().play();a.paused=true;a.setEffectiveWeight(0);actions[kind]=a;
  }
  const skeleton=new SkeletonHelper(male);skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.78;skeleton.visible=false;scene.add(skeleton);
  const camera=new PerspectiveCamera(35,1,.01,100),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableZoom=false;controls.enablePan=false;controls.enableDamping=false;controls.touches.TWO=null;
  const views={
    game:{distance:10.6,elevation:52*Math.PI/180,startYaw:25*Math.PI/180,offset:[-1.18,.65,-.10]},
    normal:{get distance(){return Math.max(6.5,6.8*view.clientHeight/Math.max(1,view.clientWidth))},elevation:5*Math.PI/180,startYaw:0,offset:[-1.3,1.2,-.10]},
    inspect:{get distance(){return Math.max(3.9,2.3*view.clientHeight/Math.max(1,view.clientWidth))},elevation:5*Math.PI/180,startYaw:0,offset:[0,.9,0]},
    upper:{get distance(){return Math.max(2.1,1.8*view.clientHeight/Math.max(1,view.clientWidth))},elevation:3*Math.PI/180,startYaw:0,offset:[0,1.21,0]},
    legs:{get distance(){return Math.max(3.1,2.20*view.clientHeight/Math.max(1,view.clientWidth))},elevation:5*Math.PI/180,startYaw:0,offset:[0,.54,0]},
    neck:{get distance(){return Math.max(1.20,.90*view.clientHeight/Math.max(1,view.clientWidth))},elevation:3*Math.PI/180,startYaw:Math.PI/2,offset:[0,1.53,-.02]},
  };
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state={mode:'control',pace:'walk',breath:'soft',variant:'after',neck:'refined',view:'game',speed:0,actualSpeed:0,motionBlend:0,phase:0,breathTime:0,runBlend:0,
    target:null,waypoints:[],detour:false,shiftTarget:false,skeleton:false,playing:true,rate:1,manual:false,reducedMotion:reduced,
    yaws:Object.fromEntries(Object.entries(views).map(([n,v])=>[n,v.startYaw]))};
  const keys=new Set(),lastDirection={x:0,z:1},pointer=new Vector2(),ray=new Raycaster(),ground=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
  const guardFloor=createFloorGuard(player,male,bodyMesh);
  function preventFloorPenetration(){const result=guardFloor(true);state.floorCorrection=result.correction;state.footIK=result.ik;return result}
  let needsRender=true,lastFrame=null,gesture=null;const pointers=new Set();
  const cameraTarget=()=>{const o=views[state.view].offset;return new Vector3(player.position.x+o[0],o[1],player.position.z+o[2])};
  function currentYaw(){return Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z)}
  controls.addEventListener('change',()=>{state.yaws[state.view]=currentYaw();needsRender=true});
  function setYaw(yaw){
    const v=views[state.view],h=v.distance*Math.cos(v.elevation);
    camera.position.set(controls.target.x+h*Math.sin(yaw),controls.target.y+v.distance*Math.sin(v.elevation),controls.target.z+h*Math.cos(yaw));
    controls.update();state.yaws[state.view]=currentYaw();needsRender=true;
  }
  function updateDescription(){
    const label={game:'ИГРОВАЯ ДИСТАНЦИЯ',normal:'МУЖЧИНА И КОЛОДЕЦ',inspect:'ОСМОТР ДВИЖЕНИЯ',upper:'ТОРС И РУКИ',legs:'НОГИ КРУПНЕЕ',neck:'ШЕЯ В ПРОФИЛЬ'}[state.view];
    document.querySelector('#view-label').textContent=label;
    const mode={control:'Управление персонажем',walk:'Шаг на месте',run:'Бег на месте'}[state.mode];
    document.querySelector('#view-description').textContent=mode+(state.view==='game'||state.view==='normal'?' · подробный колодец':' · колодец временно скрыт');
  }
  function follow(){
    const t=cameraTarget(),dx=t.x-controls.target.x,dy=t.y-controls.target.y,dz=t.z-controls.target.z;
    controls.target.copy(t);camera.position.x+=dx;camera.position.y+=dy;camera.position.z+=dz;controls.update();
  }
  function setView(name){
    if(!Object.hasOwn(views,name))return;
    if(['normal','inspect','upper','legs'].includes(name)&&['normal','inspect','upper','legs'].includes(state.view))state.yaws[name]=currentYaw();
    if(name==='neck'&&state.view!=='neck')state.yaws.neck=player.rotation.y+Math.PI/2;
    state.view=name;document.querySelector('main').dataset.mode=name;const v=views[name];controls.target.copy(cameraTarget());
    controls.minPolarAngle=controls.maxPolarAngle=Math.PI/2-v.elevation;controls.minDistance=controls.maxDistance=v.distance;
    wellProp.group.visible=name==='game'||name==='normal';scene.background.setHex(name==='game'?0x27312c:0x2e3930);
    setYaw(state.yaws[name]);resize();updateDescription();
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true;
  }
  function clearTarget(){state.target=null;state.waypoints=[];state.detour=false;state.shiftTarget=false;marker.visible=false}
  function updatePhaseControls(){
    document.querySelector('#phase-tools').hidden=state.mode==='control';
    document.querySelector('[data-play]').textContent=state.playing?'Пауза':'Пуск';
    document.querySelector('#phase').value=String(Math.round(state.phase*1000));
  }
  function stop(){keys.clear();clearTarget();state.speed=0;state.actualSpeed=0;
    if(state.mode!=='control'){state.mode='control';document.querySelectorAll('button[data-mode]').forEach(b=>{const active=b.dataset.mode==='control';b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});updateDescription()}
    updatePhaseControls();animate(.001,0,false);needsRender=true}
  function setMode(mode){
    if(!['control','walk','run'].includes(mode))return;
    stop();state.mode=mode;state.phase=0;state.playing=true;state.runBlend=mode==='run'?1:0;updateDescription();updatePhaseControls();
    document.querySelectorAll('button[data-mode]').forEach(b=>{const active=b.dataset.mode===mode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true;
  }
  function setPace(pace){if(!['walk','run'].includes(pace))return;state.pace=pace;
    document.querySelectorAll('[data-pace]').forEach(b=>{const active=b.dataset.pace===pace;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true}
  function setRate(rate){
    if(![.5,1].includes(rate))return;state.rate=rate;
    document.querySelectorAll('[data-rate]').forEach(b=>{const active=Number(b.dataset.rate)===rate;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  }
  function setFacing(facing){
    const offsets={front:0,side:Math.PI/2,back:Math.PI};if(!Object.hasOwn(offsets,facing))return;
    setYaw(player.rotation.y+offsets[facing]);
  }
  function setBreath(breath){if(!['soft','old'].includes(breath))return;state.breath=breath;
    document.querySelectorAll('[data-breath]').forEach(b=>{const active=b.dataset.breath===breath;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true}
  function setSkeleton(on){state.skeleton=!!on;skeleton.visible=state.skeleton;const b=document.querySelector('[data-skeleton]');b.classList.toggle('active',state.skeleton);b.setAttribute('aria-pressed',String(state.skeleton));needsRender=true}
  function setVariant(variant){
    if(!['before','after'].includes(variant))return;state.variant=variant;
    document.querySelectorAll('[data-variant]').forEach(b=>{const active=b.dataset.variant===variant;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
    animate(0,state.actualSpeed,state.mode==='run'||state.pace==='run'||state.shiftTarget);needsRender=true;
  }
  function setNeck(neck){
    if(!['original','refined'].includes(neck))return;state.neck=neck;
    headMesh.morphTargetInfluences[0]=bodyMesh.morphTargetInfluences[1]=neck==='refined'?1:0;
    document.querySelectorAll('[data-neck]').forEach(b=>{const active=b.dataset.neck===neck;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true;
  }
  function setPlaying(on){
    if(state.mode==='control')return;state.playing=!!on;
    if(!state.playing){state.motionBlend=1;state.runBlend=state.mode==='run'?1:0}
    updatePhaseControls();animate(0,state.mode==='run'?(state.variant==='before'?RUN_OLD:RUN):WALK,state.mode==='run');needsRender=true;
  }
  function setPhase(phase){if(state.mode==='control'||!Number.isFinite(phase))return;state.phase=clamp(phase,0,1);setPlaying(false)}
  function reset(){stop();state.motionBlend=0;state.runBlend=0;player.position.set(1,0,.15);player.rotation.y=0;state.phase=0;follow();animate(.001,0,false);needsRender=true}
  function moveTo(x,z,run=false){
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    if(state.mode!=='control')setMode('control');
    const result=plan({x:player.position.x,z:player.position.z},{x,z});
    state.target=result.target;state.waypoints=result.waypoints;state.detour=result.detour;state.shiftTarget=!!run;
    marker.position.set(result.target.x,.004,result.target.z);marker.visible=true;needsRender=true;
  }
  const motionKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  window.addEventListener('keydown',e=>{
    if(e.code==='Escape'){stop();return}
    if(e.code==='ShiftLeft'||e.code==='ShiftRight'){keys.add(e.code);return}
    if(!motionKeys.has(e.code)||e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    e.preventDefault();if(state.mode!=='control')setMode('control');keys.add(e.code);clearTarget();
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code)});
  // Release held keys on focus loss, but do not silently cancel an autonomous
  // click route (or a deliberate in-place preview) when the tab is hidden.
  window.addEventListener('blur',()=>{keys.clear();lastFrame=null});
  document.addEventListener('visibilitychange',()=>{lastFrame=null;if(document.hidden)keys.clear()});
  // Capture before OrbitControls: it can release pointer capture on pointerup,
  // causing a lostpointercapture event before a bubbling listener sees the click.
  renderer.domElement.addEventListener('pointerdown',e=>{
    pointers.add(e.pointerId);if(pointers.size!==1||e.button!==0){gesture=null;return}
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,max:0};
  },true);
  renderer.domElement.addEventListener('pointermove',e=>{if(gesture&&gesture.id===e.pointerId)gesture.max=Math.max(gesture.max,Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y))},true);
  renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);gesture=null},true);
  renderer.domElement.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);gesture=null},true);
  renderer.domElement.addEventListener('pointerup',e=>{
    const click=gesture&&gesture.id===e.pointerId&&gesture.max<8&&pointers.size===1;gesture=null;pointers.delete(e.pointerId);
    if(!click)return;const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return;
    pointer.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(pointer,camera);
    if(ray.ray.intersectPlane(ground,hit))moveTo(hit.x,hit.z,e.shiftKey);
  },true);
  document.querySelectorAll('button[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  document.querySelectorAll('[data-pace]').forEach(b=>b.addEventListener('click',()=>setPace(b.dataset.pace)));
  document.querySelectorAll('[data-breath]').forEach(b=>b.addEventListener('click',()=>setBreath(b.dataset.breath)));
  document.querySelectorAll('[data-rate]').forEach(b=>b.addEventListener('click',()=>setRate(Number(b.dataset.rate))));
  document.querySelectorAll('[data-facing]').forEach(b=>b.addEventListener('click',()=>setFacing(b.dataset.facing)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('[data-rotate]').forEach(b=>b.addEventListener('click',()=>setYaw(currentYaw()+Number(b.dataset.rotate)*Math.PI/4)));
  document.querySelector('[data-reset-camera]').addEventListener('click',()=>setYaw(state.view==='neck'?player.rotation.y+Math.PI/2:views[state.view].startYaw));
  document.querySelector('[data-reset-player]').addEventListener('click',reset);
  document.querySelector('[data-skeleton]').addEventListener('click',()=>setSkeleton(!state.skeleton));
  document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>setVariant(b.dataset.variant)));
  document.querySelectorAll('[data-neck]').forEach(b=>b.addEventListener('click',()=>setNeck(b.dataset.neck)));
  document.querySelector('[data-play]').addEventListener('click',()=>setPlaying(!state.playing));
  document.querySelector('#phase').addEventListener('input',e=>setPhase(Number(e.target.value)/1000));
  document.querySelector('[data-stop]').addEventListener('click',stop);
  function resize(){
    const w=Math.max(1,view.clientWidth),h=Math.max(1,view.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
    const yaw=currentYaw(),d=views[state.view].distance;controls.minDistance=controls.maxDistance=d;setYaw(yaw);needsRender=true;
  }
  window.addEventListener('resize',resize);
  function keyboardDirection(){
    const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const y=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    const length=Math.hypot(x,y);if(!length)return null;
    const yaw=currentYaw(),sx=Math.sin(yaw),cx=Math.cos(yaw);
    return {x:(x*cx-y*sx)/length,z:(-x*sx-y*cx)/length};
  }
  function animate(dt,speed,running){
    const desired=clamp(speed/.45,0,1),targetRun=running?1:0;
    state.motionBlend=approach(state.motionBlend,desired,dt*3);state.runBlend=approach(state.runBlend,targetRun,dt*3);
    const walkDuration=state.variant==='before'?WALK_OLD_DURATION:WALK_DURATION;
    const runDuration=state.variant==='before'?RUN_OLD_DURATION:RUN_DURATION;
    const runSpeed=state.variant==='before'?RUN_OLD:RUN;
    const moving=state.motionBlend,stride=(1-state.runBlend)*WALK*walkDuration+state.runBlend*runSpeed*runDuration;
    if(dt>0)state.phase=(state.phase+(stride>0?speed*dt/stride:0))%1;
    if(!state.reducedMotion)state.breathTime=(state.breathTime+dt)%4;
    actions.soft.time=actions.old.time=state.breathTime;actions.walk.time=state.phase*WALK_DURATION;
    actions.previousWalk.time=state.phase*WALK_OLD_DURATION;actions.run.time=state.phase*RUN_DURATION;actions.previousRun.time=state.phase*RUN_OLD_DURATION;
    actions.soft.setEffectiveWeight(state.breath==='soft'?1-moving:0);actions.old.setEffectiveWeight(state.breath==='old'?1-moving:0);
    actions.walk.setEffectiveWeight(state.variant==='after'?moving*(1-state.runBlend):0);
    actions.previousWalk.setEffectiveWeight(state.variant==='before'?moving*(1-state.runBlend):0);
    actions.run.setEffectiveWeight(state.variant==='after'?moving*state.runBlend:0);actions.previousRun.setEffectiveWeight(state.variant==='before'?moving*state.runBlend:0);
    mixer.update(0);headMesh.morphTargetInfluences[0]=bodyMesh.morphTargetInfluences[1]=state.neck==='refined'?1:0;preventFloorPenetration();
    if(state.mode!=='control')document.querySelector('#phase').value=String(Math.round(state.phase*1000));needsRender=true;
  }
  function step(seconds){
    const dt=clamp(seconds,0,.05);if(!dt)return;
    const runSpeed=state.variant==='before'?RUN_OLD:RUN;
    if(state.mode!=='control'){
      const running=state.mode==='run',speed=running?runSpeed:WALK;state.actualSpeed=speed;state.speed=0;
      if(state.playing)animate(dt*state.rate,speed,running);return;
    }
    let direction=keyboardDirection(),running=keys.has('ShiftLeft')||keys.has('ShiftRight')||state.pace==='run';
    let remaining=Infinity,isFinal=false;
    if(direction){clearTarget()} else {
      while(state.waypoints.length){const next=state.waypoints[0],dx=next.x-player.position.x,dz=next.z-player.position.z,d=Math.hypot(dx,dz);
        if(d<.045){state.waypoints.shift();continue}direction={x:dx/d,z:dz/d};remaining=d;isFinal=state.waypoints.length===1;break}
      if(!state.waypoints.length&&state.target){clearTarget();state.speed=0}
      if(state.shiftTarget)running=true;
    }
    let wanted=direction?(running?runSpeed:WALK):0;
    if(direction&&isFinal)wanted=Math.min(wanted,Math.sqrt(2*5*Math.max(0,remaining-.02)));
    state.speed=approach(state.speed,wanted,dt*(direction?4.5:6));
    if(direction){lastDirection.x=direction.x;lastDirection.z=direction.z}else if(state.speed>1e-4)direction=lastDirection;
    let amount=0;
    if(direction&&state.speed>1e-4){
      const targetYaw=Math.atan2(direction.x,direction.z),diff=angleDelta(player.rotation.y,targetYaw);
      player.rotation.y+=clamp(diff,-9*dt,9*dt);
      // Do not start translating sideways while the model is still facing away.
      const facing=Math.cos(angleDelta(player.rotation.y,targetYaw));
      const alignment=clamp((facing-.7)/.3,0,1);
      amount=state.speed*dt*alignment;if(Number.isFinite(remaining))amount=Math.min(amount,remaining);
      const p=slide({x:player.position.x,z:player.position.z},{x:direction.x*amount,z:direction.z*amount});
      const moved=Math.hypot(p.x-player.position.x,p.z-player.position.z);player.position.x=p.x;player.position.z=p.z;state.actualSpeed=moved/dt;
      if(moved>0)follow();
    }else state.actualSpeed=0;
    animate(dt,state.actualSpeed,running);
  }
  function draw(){renderer.render(scene,camera);needsRender=false}
  function tick(now){
    requestAnimationFrame(tick);if(!state.manual){if(lastFrame!==null)step(Math.min((now-lastFrame)/1000,.05));lastFrame=now}else lastFrame=null;
    if(needsRender)draw();
  }
  setView('inspect');setMode('walk');animate(.001,0,false);resize();requestAnimationFrame(tick);
  window.demo={scene,renderer,camera,controls,well:wellProp.group,floor,marker,male,player,gltf,mixer,clips,actions,skeleton,bones,state,views,keys,obstacle:WELL,
    setView,setYaw,currentYaw,setFacing,setMode,setPace,setRate,setBreath,setSkeleton,setVariant,setNeck,setPlaying,setPhase,moveTo,stop,reset,step,draw,preventFloorPenetration,
    setManual(on){state.manual=!!on;lastFrame=null},
  };window.ready=true;
}
start().catch(error=>{const box=document.querySelector('#error');box.style.display='block';box.textContent='Не удалось открыть пробу. Нужен современный браузер с поддержкой WebGL. '+(error?.message||error);console.error(error)});
