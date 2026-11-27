import {
  Scene,Color,HemisphereLight,DirectionalLight,WebGLRenderer,SRGBColorSpace,
  Mesh,BoxGeometry,MeshLambertMaterial,MeshBasicMaterial,RingGeometry,DoubleSide,
  PerspectiveCamera,Group,Vector2,Vector3,Plane,Raycaster,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createApprovedWell} from '../male-rig-trial/well-source.mjs';
import {WELL,plan,slide,EXTENT} from '../male-stealth-crouch/navigation.mjs';
import {CharacterMotion,brakePlan,sampleBrakeCurve} from './motion.mjs';

const view=document.querySelector('#view'),status=document.querySelector('#status');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,target,step)=>x<target?Math.min(target,x+step):Math.max(target,x-step);
const angleDelta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
const START={x:1,z:.15,yaw:0};
async function start(){
  const scene=new Scene();scene.background=new Color(0x667566);
  scene.add(new HemisphereLight(0xf8efe8,0x3b4452,1.08));
  const key=new DirectionalLight(0xfff5ec,1.55);key.position.set(-2.6,4.2,4.8);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.bias=-.0004;key.shadow.normalBias=.02;
  Object.assign(key.shadow.camera,{left:-9,right:9,top:9,bottom:-9,near:.1,far:30});
  const fill=new DirectionalLight(0xc8dcf5,.72);fill.position.set(3.2,2.5,-2);
  const eye=new DirectionalLight(0xffffff,.38);eye.position.set(.2,1.9,5.2);scene.add(key,key.target,fill,eye);
  const renderer=new WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.75));renderer.outputColorSpace=SRGBColorSpace;
  renderer.shadowMap.enabled=true;view.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Трёхмерная сцена: нажмите на землю для движения или на колодец для осмотра');
  const floor=new Mesh(new BoxGeometry(80,.04,80),new MeshLambertMaterial({color:0x506b56}));
  floor.position.y=-.022;floor.name='neutral-ground';floor.receiveShadow=true;scene.add(floor);
  const wellProp=createApprovedWell();wellProp.group.position.set(-.7,0,0);scene.add(wellProp.group);
  const marker=new Mesh(new RingGeometry(.105,.155,40),new MeshBasicMaterial({color:0xf5d58d,transparent:true,opacity:.9,side:DoubleSide,depthWrite:false}));
  marker.rotation.x=-Math.PI/2;marker.position.y=.005;marker.visible=false;scene.add(marker);
  const gltf=await new GLTFLoader().loadAsync(MODEL_URI),male=gltf.scene,player=new Group();
  player.name='controlled-man';player.position.set(START.x,0,START.z);player.rotation.y=START.yaw;player.add(male);scene.add(player);
  male.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false;o.frustumCulled=false}});
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion=new CharacterMotion(male,gltf.animations,{reducedMotion:reduced});
  const camera=new PerspectiveCamera(35,1,.03,100);
  const state={pace:'walk',speed:0,actualSpeed:0,turning:0,target:null,waypoints:[],detour:false,targetId:0,
    forcedRun:false,interaction:'none',inspectTime:null,interactionCount:0,yaw:25*Math.PI/180,focus:true,
    brake:null,manual:false,reducedMotion:reduced,floor:null,currentlyRunning:false};
  const keys=new Set(),motionKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  const lastDirection={x:0,z:1},mouse=new Vector2(),ray=new Raycaster(),ground=new Plane(new Vector3(0,1,0),0),hit=new Vector3();
  let lastFrame=null,gesture=null;const pointers=new Set();
  function cameraTarget(){return state.focus?new Vector3(player.position.x,.86,player.position.z):new Vector3(player.position.x-.88,.65,player.position.z-.05)}
  function follow(){
    const target=cameraTarget(),aspect=Math.max(.05,camera.aspect),tan=Math.tan(camera.fov*Math.PI/360);
    const fit=state.focus?2.2/(2*tan*Math.min(1,aspect)):4.75/(2*tan*aspect);
    const distance=state.focus?Math.max(3.6,fit):Math.max(10.6,fit),elevation=(state.focus?12:52)*Math.PI/180;
    const horizontal=distance*Math.cos(elevation);
    camera.position.set(target.x+horizontal*Math.sin(state.yaw),target.y+distance*Math.sin(elevation),target.z+horizontal*Math.cos(state.yaw));
    camera.lookAt(target);camera.updateMatrixWorld();key.position.set(player.position.x-2.6,4.2,player.position.z+4.8);key.target.position.set(player.position.x,0,player.position.z);
  }
  function setFocus(on){
    state.focus=!!on;const button=document.querySelector('#focus');button.textContent=state.focus?'−':'+';
    button.setAttribute('aria-pressed',String(state.focus));button.setAttribute('aria-label',state.focus?'Вернуть общий план':'Крупный план персонажа');
    button.title=state.focus?'Вернуть общий план':'Крупный план персонажа';follow();
  }
  function resize(){const width=Math.max(1,view.clientWidth),height=Math.max(1,view.clientHeight);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();follow()}
  new ResizeObserver(resize).observe(view);window.addEventListener('resize',resize);resize();
  function syncButtons(){
    const pace=document.querySelector('#pace');pace.innerHTML=state.pace==='run'?'Бег <span class="key">⇧</span>':'Ходьба <span class="key">⇧</span>';
    pace.classList.toggle('active',state.pace==='run');pace.setAttribute('aria-pressed',String(state.pace==='run'));
  }
  function updateStatus(){
    let text;
    if(state.brake)text=state.brake.kind==='run'?'Тормозит после бега':'Тормозит после ходьбы';
    else if(state.interaction==='approach')text='Идёт к колодцу';
    else if(state.interaction==='face')text='Поворачивается к колодцу';
    else if(state.interaction==='inspect')text='Осматривает колодец';
    else if(state.actualSpeed>.05)text=state.currentlyRunning?'Бежит':'Идёт';
    else if(state.turning>.1)text='Поворачивается';
    else text='Стоит';
    if(status.textContent!==text)status.textContent=text;
  }
  function clearTarget(){state.target=null;state.waypoints=[];state.detour=false;state.forcedRun=false;marker.visible=false}
  function cancelInteraction(preservePose=true){
    if(preservePose&&state.interaction==='inspect')motion.interruptGesture();
    state.interaction='none';state.inspectTime=null;
  }
  function stop(){
    keys.clear();clearTarget();cancelInteraction();
    // Esc/the phone button requests a real deceleration; it is not a teleport
    // or an immediate zero of speed. An already-running stop may finish.
    if(state.brake)state.brake.reason='release';updateStatus();
  }
  function reset(){
    keys.clear();clearTarget();cancelInteraction(false);state.pace='walk';state.speed=state.actualSpeed=state.turning=0;state.brake=null;
    player.position.set(START.x,0,START.z);player.rotation.y=START.yaw;state.yaw=25*Math.PI/180;
    lastDirection.x=0;lastDirection.z=1;motion.reset();syncButtons();setFocus(true);updateStatus();
  }
  function moveTo(x,z,forceRun=false){
    if(!Number.isFinite(x)||!Number.isFinite(z))return;
    keys.clear();cancelInteraction();const result=plan({x:player.position.x,z:player.position.z},{x,z});
    state.target=result.target;state.waypoints=result.waypoints;state.detour=result.detour;state.forcedRun=!!forceRun;state.targetId++;
    marker.position.set(result.target.x,.005,result.target.z);marker.visible=true;
  }
  function inspect(){
    keys.clear();clearTarget();cancelInteraction();const dx=player.position.x-WELL.x,dz=player.position.z-WELL.z,d=Math.hypot(dx,dz);
    const x=WELL.x+(d>.01?dx/d:1)*1.58,z=WELL.z+(d>.01?dz/d:0)*1.58;
    moveTo(x,z,false);state.interaction='approach';updateStatus();
  }
  function keyboardDirection(){
    const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const y=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    const length=Math.hypot(x,y);if(!length)return null;const sx=Math.sin(state.yaw),cx=Math.cos(state.yaw);
    return {x:(x*cx-y*sx)/length,z:(-x*sx-y*cx)/length};
  }
  function beginBrake(reason,direction,remaining=Infinity,selection=null){
    const speed=state.speed;if(speed<=.04)return false;
    const spec=brakePlan(speed),chosen=selection||motion.chooseBrake(spec.kind,speed);
    // For a clicked destination begin at the stopping-distance threshold.
    // Fit the selected curve into the remaining space if the click was close.
    const duration=reason==='target'&&Number.isFinite(remaining)?clamp(remaining/(speed*chosen.area),.08,chosen.duration*1.2):chosen.duration;
    const len=Math.hypot(direction.x,direction.z)||1;
    state.brake={reason,kind:spec.kind,start:chosen.start,speed,duration,elapsed:0,progress:0,direction:{x:direction.x/len,z:direction.z/len},targetId:state.targetId};
    motion.beginBrake({kind:spec.kind,speed,duration,selection:chosen});return true;
  }
  function step(seconds){
    const dt=clamp(seconds,0,.05);if(!dt)return;
    let direction=keyboardDirection(),remaining=Infinity,isFinal=false,keyboard=!!direction;
    if(keyboard){if(state.target)clearTarget();if(state.interaction!=='none')cancelInteraction()}
    else if(state.interaction!=='face'&&state.interaction!=='inspect'){
      while(state.waypoints.length){
        const next=state.waypoints[0],dx=next.x-player.position.x,dz=next.z-player.position.z,d=Math.hypot(dx,dz);
        const final=state.waypoints.length===1,tolerance=final?.012:.045;
        if(final&&d<tolerance&&!state.brake&&state.speed>.04){
          // A very short click should not be popped and then followed by a
          // long release brake away from the target. At low speed finish in
          // place; at high speed decelerate first and then return to the point.
          const toward=d>1e-8?{x:dx/d,z:dz/d}:lastDirection;
          beginBrake(state.speed<.18?'target':'short',state.speed<.18?toward:lastDirection,d);
        }
        if(d<tolerance&&!(final&&['target','short'].includes(state.brake?.reason))){state.waypoints.shift();continue}
        remaining=d;isFinal=final;if(d>1e-8)direction={x:dx/d,z:dz/d};break;
      }
      if(!state.waypoints.length&&state.target&&!state.brake){
        // A destination can be placed directly under a moving actor. Do not
        // enter the well-facing state by abruptly zeroing that momentum.
        if(state.speed>.04)beginBrake('release',lastDirection);
        else{const isInteraction=state.interaction==='approach';clearTarget();if(isInteraction)state.interaction='face'}
      }
    }
    const running=keys.has('ShiftLeft')||keys.has('ShiftRight')||state.pace==='run'||state.forcedRun;
    state.currentlyRunning=running;const commanded=Boolean(direction);
    state.actualSpeed=0;state.turning=0;
    if(state.brake){
      const b=state.brake,sameTarget=['target','short'].includes(b.reason)&&!keyboard&&state.target&&b.targetId===state.targetId;
      if(commanded&&!sameTarget){
        // New keyboard or touch/mouse commands always take priority, including
        // a 180-degree reversal. Animation never blocks the controller.
        motion.interrupt();state.brake=null;
      }else if(!commanded&&!sameTarget&&b.reason==='target')b.reason='release';
    }
    if(!state.brake&&commanded){
      const yaw=Math.atan2(direction.x,direction.z),diff=angleDelta(player.rotation.y,yaw);
      // Turn immediately. Slow the translation during a sharp turn, rather
      // than locking input behind a long stopping animation.
      player.rotation.y+=clamp(diff,-12*dt,12*dt);
      state.turning=clamp(Math.abs(diff)/(Math.PI/2),0,1);
    }
    if(!state.brake&&!commanded&&state.interaction!=='face'&&state.interaction!=='inspect'&&state.speed>.04)beginBrake('release',lastDirection);
    if(!state.brake&&commanded&&isFinal&&state.speed>.12&&Math.abs(angleDelta(player.rotation.y,Math.atan2(direction.x,direction.z)))<.35){
      const spec=brakePlan(state.speed),ahead=state.speed*dt*1.1;
      if(remaining<=spec.maxDistance+ahead){
        const selected=motion.chooseBrake(spec.kind,state.speed);
        if(remaining<=selected.distance+ahead)beginBrake('target',direction,remaining,selected);
      }
    }
    if(state.brake){
      const b=state.brake,from=b.elapsed/b.duration; b.elapsed=Math.min(b.duration,b.elapsed+dt);const to=b.elapsed/b.duration;
      const a=sampleBrakeCurve(b.kind,from,b.start),z=sampleBrakeCurve(b.kind,to,b.start);
      let amount=b.speed*b.duration*Math.max(0,z.integral-a.integral);
      if(b.reason==='target'&&b.targetId===state.targetId&&Number.isFinite(remaining))amount=Math.min(amount,remaining);
      const point=slide({x:player.position.x,z:player.position.z},{x:b.direction.x*amount,z:b.direction.z*amount});
      const moved=Math.hypot(point.x-player.position.x,point.z-player.position.z);player.position.x=point.x;player.position.z=point.z;
      state.actualSpeed=moved/dt;state.speed=b.speed*z.speed;b.progress=to;
      motion.step(dt,{speed:state.actualSpeed,turning:0,inspectTime:null,brakeProgress:to});
      if(to>=1){
        const arrived=b.reason==='target'&&b.targetId===state.targetId&&state.target;
        state.brake=null;state.speed=0;
        if(arrived){const isInteraction=state.interaction==='approach';clearTarget();if(isInteraction)state.interaction='face'}
      }
    }else{
      if(state.interaction==='face'){
        const yaw=Math.atan2(WELL.x-player.position.x,WELL.z-player.position.z),diff=angleDelta(player.rotation.y,yaw);
        player.rotation.y+=clamp(diff,-5*dt,5*dt);state.turning=clamp(Math.abs(diff)/(Math.PI/2),0,1);
        if(Math.abs(angleDelta(player.rotation.y,yaw))<.03){player.rotation.y=yaw;state.turning=0;
          if(motion.move<.08){state.interaction='inspect';state.inspectTime=0}}
      }else if(state.interaction==='inspect'){
        state.inspectTime+=dt;if(state.inspectTime>=motion.clips.inspect.duration){state.interactionCount++;state.interaction='none';state.inspectTime=null}
      }
      let wanted=0;if(commanded&&state.interaction!=='face'&&state.interaction!=='inspect'){
        const yaw=Math.atan2(direction.x,direction.z),left=Math.abs(angleDelta(player.rotation.y,yaw));
        const turnScale=clamp(1-left/(Math.PI*.8),.15,1);
        wanted=(running?2.15:.98)*turnScale;
      }
      const before=state.speed;state.speed=approach(state.speed,wanted,dt*(wanted<state.speed?8:4.5));
      if(commanded&&state.speed>1e-5&&state.interaction!=='face'&&state.interaction!=='inspect'){
        const yaw=Math.atan2(direction.x,direction.z),left=Math.abs(angleDelta(player.rotation.y,yaw));
        const travel=left>.18?{x:Math.sin(player.rotation.y),z:Math.cos(player.rotation.y)}:direction;
        let amount=(before+state.speed)*.5*dt;if(Number.isFinite(remaining))amount=Math.min(amount,remaining);
        const point=slide({x:player.position.x,z:player.position.z},{x:travel.x*amount,z:travel.z*amount});
        const moved=Math.hypot(point.x-player.position.x,point.z-player.position.z);player.position.x=point.x;player.position.z=point.z;
        state.actualSpeed=moved/dt;lastDirection.x=travel.x;lastDirection.z=travel.z;
        if(amount>1e-6&&moved<amount*.15)state.speed=Math.min(state.speed,state.actualSpeed);
      }
      motion.step(dt,{speed:state.actualSpeed,turning:state.turning,inspectTime:state.inspectTime});
    }
    state.floor=motion.floor;follow();updateStatus();
  }
  function advanceElapsed(seconds){let remaining=clamp(seconds,0,.25);while(remaining>1e-8){const dt=Math.min(.04,remaining);remaining-=dt;step(dt)}}
  function rotate(amount){state.yaw+=amount;follow()}
  function draw(){renderer.render(scene,camera)}
  function tick(now){requestAnimationFrame(tick);if(state.manual){lastFrame=null;return}if(lastFrame!==null)advanceElapsed((now-lastFrame)/1000);lastFrame=now;draw()}
  window.addEventListener('keydown',e=>{
    if(e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
    if(e.code==='Escape'){stop();return}
    if(e.code==='KeyE'){e.preventDefault();if(!e.repeat)inspect();return}
    if(e.code==='KeyQ'){e.preventDefault();if(!e.repeat)rotate(-Math.PI/6);return}
    if(e.code==='KeyV'){e.preventDefault();if(!e.repeat)setFocus(!state.focus);return}
    if(e.code==='ShiftLeft'||e.code==='ShiftRight'){keys.add(e.code);return}
    if(!motionKeys.has(e.code))return;e.preventDefault();keys.add(e.code);clearTarget();cancelInteraction();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();lastFrame=null});
  document.addEventListener('visibilitychange',()=>{lastFrame=null;if(document.hidden)keys.clear()});
  renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(e.button!==0&&e.button!==2)return;e.preventDefault();pointers.add(e.pointerId);if(pointers.size!==1){gesture=null;return}
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,max:0,button:e.button,shift:e.shiftKey};renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;const total=Math.hypot(e.clientX-gesture.x,e.clientY-gesture.y);gesture.max=Math.max(gesture.max,total);
    if(gesture.max>=8||gesture.button===2)rotate(-(e.clientX-gesture.lastX)*.007);gesture.lastX=e.clientX;
  });
  renderer.domElement.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);gesture=null});
  renderer.domElement.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);if(gesture?.id===e.pointerId)gesture=null});
  renderer.domElement.addEventListener('pointerup',e=>{
    const click=gesture&&gesture.id===e.pointerId&&gesture.button===0&&gesture.max<8&&pointers.size===1;
    const shifted=gesture?.shift||e.shiftKey;gesture=null;pointers.delete(e.pointerId);if(!click)return;
    const r=renderer.domElement.getBoundingClientRect();if(!r.width||!r.height)return;
    mouse.set((e.clientX-r.left)/r.width*2-1,1-(e.clientY-r.top)/r.height*2);ray.setFromCamera(mouse,camera);
    if(ray.intersectObject(wellProp.group,true).length){inspect();return}if(ray.ray.intersectPlane(ground,hit))moveTo(hit.x,hit.z,shifted);
  });
  document.querySelector('#pace').addEventListener('click',()=>{state.pace=state.pace==='walk'?'run':'walk';syncButtons()});
  document.querySelector('#stop').addEventListener('click',stop);document.querySelector('#interact').addEventListener('click',inspect);
  document.querySelector('#reset').addEventListener('click',reset);document.querySelector('#focus').addEventListener('click',()=>setFocus(!state.focus));
  document.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>rotate(Number(button.dataset.camera)*Math.PI/6)));
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();const box=document.querySelector('#error');box.hidden=false;box.textContent='Графический контекст был потерян. Обновите страницу, чтобы открыть сцену снова.'});
  syncButtons();setFocus(true);updateStatus();requestAnimationFrame(tick);
  window.demo={scene,renderer,camera,well:wellProp.group,floor,marker,male,player,gltf,motion,state,keys,obstacle:WELL,extent:EXTENT,
    moveTo,inspect,stop,reset,rotate,setFocus,step,advanceElapsed,draw,follow,brakePlan,sampleBrakeCurve,
    setManual(on){state.manual=!!on;lastFrame=null},
  };window.ready=true;
}
start().catch(error=>{const box=document.querySelector('#error');box.hidden=false;box.textContent='Не удалось открыть сцену. Нужен современный браузер с поддержкой WebGL. '+(error?.message||error);status.textContent='Сцена не загрузилась';console.error(error)});
