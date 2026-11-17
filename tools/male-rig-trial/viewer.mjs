import {
  Scene,Color,HemisphereLight,DirectionalLight,WebGLRenderer,SRGBColorSpace,
  Mesh,BoxGeometry,MeshLambertMaterial,PerspectiveCamera,AnimationMixer,
  SkeletonHelper,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createApprovedWell} from './well-source.mjs';

const view=document.querySelector('#view');
const motionNames={idle:'Дыхание в покое',arms:'Плечи и руки',elbow:'Локоть с одной стороны',knee:'Колено с одной стороны',head:'Поворот головы',rest:'Исходная поза без движения'};
const clipNames={idle:'Idle_Breathing',arms:'Test_Arms',elbow:'Test_Elbow',knee:'Test_Knee',head:'Test_Head'};
async function start(){
  const scene=new Scene();scene.background=new Color(0x2e3930);
  const ambient=new HemisphereLight(0xf8efe8,0x3b4452,1.08);
  const key=new DirectionalLight(0xfff5ec,1.55);key.position.set(-2.6,4.2,4.8);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);key.shadow.bias=-0.0004;key.shadow.normalBias=0.02;
  const fill=new DirectionalLight(0xc8dcf5,0.72);fill.position.set(3.2,2.5,-2.0);
  const eye=new DirectionalLight(0xffffff,0.38);eye.position.set(0.2,1.9,5.2);scene.add(ambient,key,fill,eye);
  const renderer=new WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=SRGBColorSpace;renderer.shadowMap.enabled=true;
  view.appendChild(renderer.domElement);
  const floor=new Mesh(new BoxGeometry(80,.04,80),new MeshLambertMaterial({color:0x36443b}));
  floor.name='neutral-display-floor';floor.position.y=-.022;floor.receiveShadow=true;scene.add(floor);
  // Exact same procedural prop as the previously approved detailed well.
  const wellProp=createApprovedWell();wellProp.group.position.set(-.7,0,0);scene.add(wellProp.group);
  const gltf=await new GLTFLoader().loadAsync(RIGGED_URI),male=gltf.scene;
  male.position.set(1,0,.15);male.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=false}});scene.add(male);
  const boneList=[];male.traverse(o=>{if(o.isBone)boneList.push(o)});
  if(boneList.length!==22)throw new Error(`Найдено костей: ${boneList.length}, ожидалось 22`);
  const bind=new Map(boneList.map(b=>[b,{position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()}]));
  const mixer=new AnimationMixer(male),clips=new Map(gltf.animations.map(c=>[c.name,c]));
  for(const name of Object.values(clipNames))if(!clips.has(name))throw new Error(`Отсутствует анимация ${name}`);
  const skeleton=new SkeletonHelper(male);skeleton.name='trial-skeleton-overlay';
  skeleton.material.depthTest=false;skeleton.material.transparent=true;skeleton.material.opacity=.78;skeleton.visible=false;scene.add(skeleton);
  const views={
    game:{distance:10.6,elevation:52*Math.PI/180,startYaw:25*Math.PI/180,target:[-.18,.65,.05]},
    normal:{get distance(){return Math.max(6.5,6.8*Math.max(1,view.clientHeight)/Math.max(1,view.clientWidth))},elevation:5*Math.PI/180,startYaw:0,target:[-.3,1.2,.05]},
    // On very tall, narrow screens leave room for the raised hands. This is
    // showcase framing only; the tactical camera retains its fixed distance.
    inspect:{get distance(){return Math.max(3.9,2.3*Math.max(1,view.clientHeight)/Math.max(1,view.clientWidth))},elevation:5*Math.PI/180,startYaw:0,target:[1,.9,.15]},
    head:{distance:.95,elevation:0,startYaw:0,target:[1.004,1.67,.15]},
  };
  const camera=new PerspectiveCamera(35,1,.01,100),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableZoom=false;controls.enablePan=false;controls.enableDamping=false;controls.touches.TWO=null;
  const state={motion:'idle',view:'inspect',playing:false,skeleton:false,yaws:Object.fromEntries(Object.entries(views).map(([k,v])=>[k,v.startYaw]))};
  let activeAction=null,lastFrame=null,needsRender=true;
  function currentYaw(){return Math.atan2(camera.position.x-controls.target.x,camera.position.z-controls.target.z)}
  controls.addEventListener('change',()=>{state.yaws[state.view]=currentYaw();needsRender=true});
  function setYaw(yaw){
    const v=views[state.view],horizontal=v.distance*Math.cos(v.elevation);
    camera.position.set(controls.target.x+horizontal*Math.sin(yaw),controls.target.y+v.distance*Math.sin(v.elevation),controls.target.z+horizontal*Math.cos(yaw));
    controls.update();state.yaws[state.view]=currentYaw();needsRender=true;
  }
  function updateSceneDescription(){
    const labels={game:'ВИД СВЕРХУ ПОД УГЛОМ',normal:'ОБЫЧНЫЙ РАКУРС',inspect:'ОСМОТР МУЖЧИНЫ',head:'ГОЛОВА КРУПНЕЕ'};
    document.querySelector('#view-label').textContent=labels[state.view];
    const withWell=state.view==='game'||state.view==='normal';
    document.querySelector('#view-description').textContent=`${motionNames[state.motion]} · ${withWell?'мужчина и колодец':'колодец временно скрыт'}`;
  }
  function setView(name){
    if(!Object.hasOwn(views,name))return;
    if(['normal','inspect'].includes(name)&&['normal','inspect'].includes(state.view))state.yaws[name]=currentYaw();
    state.view=name;document.querySelector('main').dataset.mode=name;
    const v=views[name];controls.target.set(...v.target);
    controls.minPolarAngle=controls.maxPolarAngle=Math.PI/2-v.elevation;controls.minDistance=controls.maxDistance=v.distance;
    wellProp.group.visible=name==='game'||name==='normal';scene.background.setHex(name==='game'?0x27312c:0x2e3930);
    setYaw(state.yaws[name]);resize();updateSceneDescription();
    document.querySelectorAll('[data-view]').forEach(b=>{const active=b.dataset.view===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true;
  }
  function resetRig(){for(const [bone,value] of bind){bone.position.copy(value.position);bone.quaternion.copy(value.quaternion);bone.scale.copy(value.scale)}}
  function updatePlaybackUi(){
    const button=document.querySelector('[data-play]'),phase=document.querySelector('#phase');
    button.disabled=!activeAction;phase.disabled=!activeAction;
    button.textContent=state.playing?'Пауза':'Пуск';button.setAttribute('aria-label',state.playing?'Поставить движение на паузу':'Продолжить движение');
    phase.value=activeAction?String(Math.round(activeAction.time/activeAction.getClip().duration*1000)):'0';
  }
  function setMotion(name,play=true){
    if(!Object.hasOwn(motionNames,name))return;
    mixer.stopAllAction();resetRig();state.motion=name;activeAction=null;state.playing=false;
    if(name!=='rest'){
      activeAction=mixer.clipAction(clips.get(clipNames[name]));activeAction.reset().play();activeAction.paused=!play;state.playing=play;
      mixer.update(0);
    }
    lastFrame=null;updatePlaybackUi();updateSceneDescription();
    document.querySelectorAll('[data-motion]').forEach(b=>{const active=b.dataset.motion===name;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});needsRender=true;
  }
  function setPlaying(play){if(!activeAction)return;state.playing=!!play;activeAction.paused=!state.playing;lastFrame=null;updatePlaybackUi();needsRender=true}
  function setPhase(fraction){
    if(!activeAction)return;
    setPlaying(false);activeAction.time=Math.max(0,Math.min(.999999,fraction))*activeAction.getClip().duration;
    mixer.update(0);updatePlaybackUi();needsRender=true;
  }
  function setSkeleton(visible){
    state.skeleton=!!visible;skeleton.visible=state.skeleton;
    const b=document.querySelector('[data-skeleton]');b.classList.toggle('active',state.skeleton);b.setAttribute('aria-pressed',String(state.skeleton));needsRender=true;
  }
  document.querySelectorAll('[data-motion]').forEach(b=>b.addEventListener('click',()=>setMotion(b.dataset.motion)));
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('[data-rotate]').forEach(b=>b.addEventListener('click',()=>setYaw(currentYaw()+Number(b.dataset.rotate)*Math.PI/4)));
  document.querySelector('[data-reset]').addEventListener('click',()=>setYaw(views[state.view].startYaw));
  document.querySelector('[data-play]').addEventListener('click',()=>setPlaying(!state.playing));
  document.querySelector('#phase').addEventListener('input',e=>setPhase(Number(e.target.value)/1000));
  document.querySelector('[data-skeleton]').addEventListener('click',()=>setSkeleton(!state.skeleton));
  function resize(){
    const w=Math.max(1,view.clientWidth),h=Math.max(1,view.clientHeight);renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();
    if(state.view==='normal'||state.view==='inspect'){const yaw=currentYaw(),distance=views[state.view].distance;controls.minDistance=controls.maxDistance=distance;setYaw(yaw)}needsRender=true;
  }
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{lastFrame=null});
  function draw(){renderer.render(scene,camera);needsRender=false}
  function tick(now){
    requestAnimationFrame(tick);
    if(state.playing&&activeAction){if(lastFrame!==null)mixer.update(Math.min((now-lastFrame)/1000,.1));lastFrame=now;updatePlaybackUi();needsRender=true}else lastFrame=null;
    if(needsRender)draw();
  }
  setView('inspect');setMotion('idle',!window.matchMedia('(prefers-reduced-motion: reduce)').matches);resize();requestAnimationFrame(tick);
  window.demo={scene,renderer,camera,controls,well:wellProp.group,wellProp,floor,male,gltf,mixer,clips,skeleton,bones:boneList,bind,state,views,
    setView,setYaw,currentYaw,setMotion,setPlaying,setPhase,setSkeleton,draw,
    get action(){return activeAction},get distance(){return views[state.view].distance}};
  window.ready=true;
}
start().catch(error=>{
  const box=document.querySelector('#error');box.style.display='block';box.textContent='Не удалось загрузить сцену. Проверьте поддержку WebGL и откройте HTML в современном браузере. '+(error?.message||error);
  console.error(error);
});
