import * as THREE from 'three';
import {createFigure} from '../body-study/figure.js';
import {morphBody} from './morph.js';
const $=id=>document.getElementById(id), controls=['armLength','height','legLength','hipWidth','bust','skin'];
const defaults={armLength:88,height:100,legLength:100,hipWidth:100,bust:110,skin:'#bda79a'};
let state={...defaults};
const host=$('view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-2.2,2.2,1.2,-1.2,.01,100);camera.position.set(0,1.06,10);camera.lookAt(0,1.06,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfaf0e6,0x555666,1.25));const key=new THREE.DirectionalLight(0xffffff,2.25);key.position.set(-4,7,10);scene.add(key);const fill=new THREE.DirectionalLight(0xd9dfef,.38);fill.position.set(6,1,7);scene.add(fill);
const figures={female:createFigure(true),male:createFigure(false)}, originals={};
for(const [sex,figure] of Object.entries(figures)) {
 figure.scale.setScalar(.1);figure.visible=sex==='male';scene.add(figure);
 originals[sex]=Float32Array.from(figure.children[0].geometry.attributes.position.array);
}
const floor=new THREE.GridHelper(5,20,0x626362,0x3b4142);floor.position.y=-.004;scene.add(floor);
let angle=0;
function snapshot(){return {schema:'blades-of-war.appearance',version:1,base:'makehuman-cc0-body-study-v1',name:$('name').value.trim(),kingdom:$('kingdom').value,sex:$('sex').value,settings:{...state}};}
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
