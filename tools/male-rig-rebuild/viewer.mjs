import {
 Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
 PerspectiveCamera, Vector3, Mesh, CircleGeometry, MeshBasicMaterial,
 AnimationMixer, SkeletonHelper, DetachedBindMode,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const container=document.querySelector('#stage'),status=document.querySelector('#status');
const controlsList=[...document.querySelectorAll('[data-model],[data-motion],[data-view],[data-focus],[data-action],#cut,#piece,#phase')];
const state={model:'new',motion:'stand',playing:false,phase:0,slow:false,skeleton:false,cut:'none',showPiece:true,view:'front',focus:'body',ready:false};
const views={front:0,back:Math.PI,side:Math.PI/2,rear45:Math.PI*.75};
const focuses={
 body:{target:[0,.91,0],distance:3.65,label:'Весь рост'},
 head:{bone:'Rig_Head',offset:[0,.04,0],distance:.95,label:'Лицо и шея'},
 upper:{target:[0,1.25,0],distance:2.05,label:'Торс и руки'},
 pelvis:{target:[0,.94,0],distance:1.65,label:'Таз'},
 leftHand:{bone:'Rig_Hand_L',offset:[0,-.05,.025],distance:.75,label:'Левая кисть'},
 rightHand:{bone:'Rig_Hand_R',offset:[0,-.05,.025],distance:.75,label:'Правая кисть'},
 leftKnee:{bone:'Rig_Shin_L',offset:[0,0,0],distance:.8,label:'Левое колено'},
 feet:{bones:['Rig_Foot_L','Rig_Foot_R'],offset:[0,-.02,.04],distance:1.35,label:'Стопы'},
 cut:{distance:1.20,label:'Выбранный срез'},
};
function bytesFromBase64(text){const raw=atob(text),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
async function start(){
 const scene=new Scene();scene.background=new Color(0x2e3930);scene.add(new HemisphereLight(0xf8efe8,0x3b4452,1.08));
 for(const [color,intensity,position] of [[0xfff5ec,1.55,[-2.6,4.2,4.8]],[0xc8dcf5,.72,[3.2,2.5,-2]],[0xffffff,.38,[.2,1.9,5.2]]]){const light=new DirectionalLight(color,intensity);light.position.set(...position);scene.add(light)}
 // Keep the floor one-sided: inspecting an ankle from below must not hide it.
 const floor=new Mesh(new CircleGeometry(.85,80),new MeshBasicMaterial({color:0x465347}));floor.rotation.x=-Math.PI/2;floor.position.y=0;scene.add(floor);
 const renderer=new WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6));renderer.outputColorSpace=SRGBColorSpace;
 renderer.domElement.setAttribute('aria-label','Трёхмерная модель. Перетащите для вращения.');container.prepend(renderer.domElement);
 const camera=new PerspectiveCamera(35,1,.01,100),orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=false;orbit.enablePan=false;orbit.minDistance=.3;orbit.maxDistance=7;orbit.minPolarAngle=.08;orbit.maxPolarAngle=Math.PI-.08;
 let needsRender=true;const invalidate=()=>{needsRender=true};orbit.addEventListener('change',invalidate);orbit.addEventListener('start',()=>{state.view=null;updateControls()});
 const modelBytes={new:bytesFromBase64(window.EMBEDDED_MODELS.new),previous:bytesFromBase64(window.EMBEDDED_MODELS.previous),cuts:bytesFromBase64(window.EMBEDDED_MODELS.cuts)};delete window.EMBEDDED_MODELS;
 const loader=new GLTFLoader(),parsed=await Promise.all(Object.values(modelBytes).map(bytes=>loader.parseAsync(bytes.buffer,'')));
 const models={};Object.keys(modelBytes).forEach((key,i)=>{
  const gltf=parsed[i],mixer=new AnimationMixer(gltf.scene),rig=gltf.scene.getObjectByName('Rig_Root');if(!rig)throw Error('Нет скелета '+key);
  const rest=[];gltf.scene.traverse(o=>{
   if(o.isBone)rest.push({object:o,position:o.position.clone(),quaternion:o.quaternion.clone(),scale:o.scale.clone()});
   // Three.js may cache a skinned mesh's bounding sphere in an earlier pose;
   // a close-up of another pose can otherwise cull an entire body segment.
   if(o.isSkinnedMesh){o.frustumCulled=false;if(key==='cuts')o.bindMode=DetachedBindMode}
  });
  const morph=[];gltf.scene.traverse(o=>{if(o.morphTargetInfluences)morph.push({object:o,values:o.morphTargetInfluences.slice()})});
  const helper=new SkeletonHelper(rig);helper.frustumCulled=false;helper.material.depthTest=false;helper.material.transparent=true;helper.material.opacity=.8;helper.visible=false;
  scene.add(gltf.scene,helper);models[key]={gltf,mixer,rig,helper,rest,morph,action:null};
 });
 const cutGroups={Wrist:['Hand'],Elbow:['Forearm','Hand'],Ankle:['Foot'],Knee:['Shin','Foot']};
 function currentKey(){return state.model==='previous'?'previous':state.cut==='none'?'new':'cuts'}
 function updateVisibility(){const key=currentKey();for(const [k,m] of Object.entries(models)){m.gltf.scene.visible=k===key;m.helper.visible=state.skeleton&&k===key}invalidate()}
 function applyCut(){
  const model=models.cuts.gltf.scene;
  model.traverse(o=>{if(o.name.startsWith('Cap_'))o.visible=false;if(o.name.startsWith('Part_')||o.name.startsWith('Cap_')){o.position.set(0,0,0);if(o.name.startsWith('Part_'))o.visible=true}});
  if(state.cut!=='none'){
   const [joint,side]=state.cut.split('_'),group=cutGroups[joint];if(!group||!['L','R'].includes(side))throw Error('Неизвестный срез');
   const shift=side==='L'?.26:-.26;
   for(const part of group){const node=model.getObjectByName('Part_'+part+'_'+side);if(!node)throw Error('Нет сегмента '+part);node.visible=state.showPiece;if(state.showPiece)node.position.set(shift,-.015,0)}
   for(const half of ['Proximal','Distal']){const cap=model.getObjectByName('Cap_'+state.cut+'_'+half);if(!cap)throw Error('Нет заглушки '+half);cap.visible=half==='Proximal'||state.showPiece;if(half==='Distal'&&state.showPiece)cap.position.set(shift,-.015,0)}
  }
  updateVisibility();
 }
 function restore(m){for(const r of m.rest){r.object.position.copy(r.position);r.object.quaternion.copy(r.quaternion);r.object.scale.copy(r.scale)}for(const x of m.morph)x.object.morphTargetInfluences.splice(0,x.values.length,...x.values)}
 function samplePose(){
  for(const m of Object.values(models)){if(m.action){m.action.time=state.phase*m.action.getClip().duration;m.mixer.update(0)}m.gltf.scene.updateMatrixWorld(true)}
  followFocus();invalidate();
 }
 function setMotion(motion){
  if(!['stand','walk','run'].includes(motion))throw Error('Неизвестное движение');state.motion=motion;state.phase=0;
  state.playing=motion!=='stand'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for(const [key,m] of Object.entries(models)){
   m.mixer.stopAllAction();restore(m);m.action=null;
   if(motion!=='stand'){
    const name=key==='previous'?({walk:'Torso_Walk',run:'Polish_Run'}[motion]):({walk:'Walk_NewBody',run:'Run_NewBody'}[motion]);
    const clip=m.gltf.animations.find(c=>c.name===name);if(!clip)throw Error('Нет анимации '+name);
    m.action=m.mixer.clipAction(clip);m.action.reset().play();m.action.paused=true;
   }
  }
  samplePose();updateControls();
 }
 function setPhase(value){state.phase=Math.min(1,Math.max(0,value));state.playing=false;samplePose();updateControls()}
 function chooseModel(which){
  if(!['new','previous'].includes(which))throw Error('Неизвестная модель');const reset=which==='previous'&&state.focus==='cut',yaw=currentYaw();
  state.model=which;if(which==='previous')state.cut='none';if(reset)state.focus='body';applyCut();if(reset)positionCamera(yaw);else followFocus();updateControls();
 }
 function selectCut(value){
  if(value!=='none'&&!/^(Wrist|Elbow|Ankle|Knee)_[LR]$/.test(value))throw Error('Неизвестный срез');const wasFocused=state.focus==='cut',yaw=currentYaw();
  state.cut=value;if(value!=='none')state.model='new';if(wasFocused&&value==='none')state.focus='body';applyCut();if(wasFocused)positionCamera(yaw);else followFocus();updateControls();
 }
 function targetForFocus(){
  const f=focuses[state.focus];if(f.target)return new Vector3().fromArray(f.target);
  if(state.focus==='cut'){
   if(state.cut==='none')throw Error('Нет выбранного среза');const model=models.cuts.gltf.scene;model.updateMatrixWorld(true);
   const caps=['Proximal',...(state.showPiece?['Distal']:[])].map(half=>model.getObjectByName(`Cap_${state.cut}_${half}`)),target=new Vector3(),point=new Vector3();
   for(const cap of caps){cap.skeleton.update();const count=cap.geometry.attributes.position.count;for(let i=0;i<count;i++){cap.getVertexPosition(i,point).applyMatrix4(cap.matrixWorld);target.addScaledVector(point,1/(count*caps.length))}}
   return target;
  }
  const rig=models[currentKey()].rig,names=f.bones||[f.bone],target=new Vector3();rig.updateWorldMatrix(true,true);
  for(const name of names){const bone=rig.getObjectByName(name);if(!bone)throw Error('Нет кости '+name);target.add(bone.getWorldPosition(new Vector3()))}
  return target.multiplyScalar(1/names.length).add(new Vector3().fromArray(f.offset||[0,0,0]));
 }
 function followFocus(){if(!orbit.target||!camera.position)return;const target=targetForFocus(),delta=target.clone().sub(orbit.target);if(delta.lengthSq()>1e-16){orbit.target.copy(target);camera.position.add(delta);orbit.update();invalidate()}}
 function currentYaw(){return Math.atan2(camera.position.x-orbit.target.x,camera.position.z-orbit.target.z)}
 function positionCamera(yaw){const target=targetForFocus(),distance=focuses[state.focus].distance;orbit.target.copy(target);camera.position.set(target.x+distance*Math.sin(yaw),target.y+distance*.07,target.z+distance*Math.cos(yaw));camera.lookAt(target);orbit.update();invalidate()}
 function chooseView(which){if(!(which in views))throw Error('Неизвестный ракурс');state.view=which;positionCamera(views[which]);updateControls()}
 function chooseFocus(which){if(!(which in focuses))throw Error('Неизвестная область');if(which==='cut'&&state.cut==='none')return;const yaw=currentYaw();state.focus=which;positionCamera(yaw);updateControls()}
 function updateControls(){
  for(const b of controlsList){if(b.dataset.model)b.setAttribute('aria-pressed',String(b.dataset.model===state.model));if(b.dataset.motion)b.setAttribute('aria-pressed',String(b.dataset.motion===state.motion));if(b.dataset.view)b.setAttribute('aria-pressed',String(b.dataset.view===state.view));if(b.dataset.focus)b.setAttribute('aria-pressed',String(b.dataset.focus===state.focus));if(b.dataset.action==='skeleton')b.setAttribute('aria-pressed',String(state.skeleton));if(b.dataset.action==='slow')b.setAttribute('aria-pressed',String(state.slow))}
  document.querySelector('#model-name').textContent=state.model==='previous'?'Предыдущая модель':state.cut==='none'?'Новая модель':'Проба среза';document.querySelector('#model-number').textContent=state.model==='previous'?'02':'01';document.querySelector('#focus-name').textContent=focuses[state.focus].label;
  document.querySelector('#cut').value=state.cut;document.querySelector('#piece').checked=state.showPiece;document.querySelector('#piece').disabled=!state.ready||state.cut==='none';
  document.querySelector('[data-action="focus-cut"]').disabled=!state.ready||state.cut==='none';
  document.querySelector('#phase').disabled=!state.ready||state.motion==='stand';document.querySelector('#phase').value=String(Math.round(state.phase*1000));document.querySelector('#phase-value').textContent=Math.round(state.phase*100)+'%';
  const play=document.querySelector('[data-action="play"]');play.disabled=!state.ready||state.motion==='stand';play.textContent=state.playing?'Пауза':'Пуск';
 }
 function download(key,name){const url=URL.createObjectURL(new Blob([modelBytes[key]],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 for(const b of controlsList){b.disabled=false;b.addEventListener('click',()=>{
  if(b.dataset.model)chooseModel(b.dataset.model);else if(b.dataset.motion)setMotion(b.dataset.motion);else if(b.dataset.view)chooseView(b.dataset.view);else if(b.dataset.focus)chooseFocus(b.dataset.focus);
  else if(b.dataset.action==='skeleton'){state.skeleton=!state.skeleton;updateVisibility();updateControls()}
  else if(b.dataset.action==='reset'){state.focus='body';chooseView('front')}
  else if(b.dataset.action==='focus-cut')chooseFocus('cut');
  else if(b.dataset.action==='play'){if(state.motion!=='stand')state.playing=!state.playing;updateControls()}
  else if(b.dataset.action==='slow'){state.slow=!state.slow;updateControls()}
  else if(b.dataset.action==='download-rig')download('new','male_rig_rebuild.glb');
  else if(b.dataset.action==='download-cuts')download('cuts','male_cut_placeholders.glb');
 })}
 document.querySelector('#cut').addEventListener('change',e=>selectCut(e.target.value));
 document.querySelector('#piece').addEventListener('change',e=>{state.showPiece=e.target.checked;applyCut();followFocus();updateControls()});
 document.querySelector('#phase').addEventListener('input',e=>setPhase(Number(e.target.value)/1000));
 const resize=()=>{const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();invalidate()};
 new ResizeObserver(resize).observe(container);window.addEventListener('resize',resize);
 state.ready=true;setMotion('stand');applyCut();positionCamera(views.front);resize();updateControls();status.textContent='Готово к просмотру';status.dataset.state='ready';
 let last=null;document.addEventListener('visibilitychange',()=>{last=null});
 function tick(now){requestAnimationFrame(tick);if(last!==null&&state.playing&&state.motion!=='stand'){
   const dt=Math.min(.1,Math.max(0,(now-last)/1000)),duration=models.new.action.getClip().duration;
   state.phase=(state.phase+dt*(state.slow?.5:1)/duration)%1;samplePose();updateControls();
  }last=now;if(needsRender){renderer.render(scene,camera);needsRender=false}}
 requestAnimationFrame(tick);
 window.rigTrial={state,models,scene,camera,orbit,renderer,chooseModel,chooseView,chooseFocus,setMotion,setPhase,selectCut,applyCut,samplePose};
}
start().catch(error=>{console.error(error);status.textContent='Не удалось открыть модели. Попробуйте другой браузер с WebGL.';status.dataset.state='error'});
