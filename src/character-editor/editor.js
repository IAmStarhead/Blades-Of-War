import * as THREE from 'three';
import {createFigure} from '../body-study/figure.js';
import {morphBody} from './morph.js';
import {createAppearanceMaterial} from './appearance.js';
const $=id=>document.getElementById(id), controls=['armLength','height','legLength','hipWidth','bust','skin'];
const defaults={armLength:88,height:100,legLength:100,hipWidth:100,bust:110,skin:'#bda79a'};
let state={...defaults};
const host=$('view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-2.2,2.2,1.2,-1.2,.01,100);camera.position.set(0,1.06,10);camera.lookAt(0,1.06,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xf5eadf,0x40494d,.8));
const key=new THREE.DirectionalLight(0xfff2e2,2.25);key.position.set(-2.5,4,3);key.target.position.set(0,.9,0);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-2.6;key.shadow.camera.right=2.6;key.shadow.camera.top=2.6;key.shadow.camera.bottom=-2.6;key.shadow.camera.near=.1;key.shadow.camera.far=12;key.shadow.bias=-.00015;key.shadow.normalBias=.012;scene.add(key,key.target);
const fill=new THREE.DirectionalLight(0xcddbf0,.42);fill.position.set(3,1.5,2);scene.add(fill);
const figures={female:createFigure(true),male:createFigure(false)}, originals={};
for(const [sex,figure] of Object.entries(figures)) {
 figure.scale.setScalar(.1);figure.visible=sex==='male';scene.add(figure);
 const body=figure.children[0];originals[sex]=Float32Array.from(body.geometry.attributes.position.array);
 body.material.dispose();body.material=createAppearanceMaterial(sex==='female',body.position.y,state.skin);body.castShadow=true;body.receiveShadow=true;
}
const ground=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({color:0x343d3d,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.008;ground.receiveShadow=true;scene.add(ground);
const floor=new THREE.GridHelper(5,20,0x626362,0x3b4142);floor.position.y=-.003;scene.add(floor);
let angle=0;
function snapshot(){return {schema:'blades-of-war.appearance',version:1,base:'makehuman-cc0-body-study-v1',name:$('name').value.trim(),kingdom:$('kingdom').value,sex:$('sex').value,settings:{...state},presentation:{skin:'procedural-v1',underwear:'linen-charcoal-v1'}};}
function refresh(){
 const sex=$('sex').value,f=figures[sex],body=f.children[0];
 for(const [key,figure] of Object.entries(figures))figure.visible=key===sex;
 const a=body.geometry.attributes.position;a.array.set(morphBody(originals[sex],body.position.y,sex==='female',state));a.needsUpdate=true;body.geometry.computeVertexNormals();
 body.material.color.set(state.skin);f.scale.setScalar(.1*state.height/100);f.rotation.y=angle;
 for(const k of controls) {$(k).value=state[k];const label=$(k+'-value');if(label)label.textContent=state[k]+'%';}
 $('bust-label').classList.toggle('hidden',sex!=='female');$('output').value=JSON.stringify(snapshot(),null,2);
 renderer.render(scene,camera);
}
for(const k of controls) $(k).addEventListener('input',()=>{state[k]=k==='skin'?$(k).value:Number($(k).value);refresh()});
for(const k of ['name','kingdom','sex'])$(k).addEventListener('input',refresh);
$('reset').onclick=()=>{state={...defaults};refresh()};
$('export').onclick=()=>{const json=JSON.stringify(snapshot(),null,2)+'\n';const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`blades-appearance-${$('sex').value}-${$('kingdom').value}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{angle={front:0,three:.68,side:Math.PI/2,back:Math.PI}[b.dataset.view];refresh()};
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=2.5;camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();refresh()}
window.addEventListener('resize',resize);resize();
