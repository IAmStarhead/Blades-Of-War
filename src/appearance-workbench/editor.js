import * as THREE from 'three';
import {createAngularFigure} from '../neutral-figure-trial/figure.js';
import {shapeBody} from './shape.js';
import {createTunic} from './tunic.js';
const $=id=>document.getElementById(id),controls=['height','bust','skin','build','muscle'];
const defaults={height:100,bust:110,skin:'#c4a191',build:100,muscle:110};let state={...defaults};
// Unimplemented controls from the previous prototype are hidden rather than
// suggesting they operate on this differently posed mesh.
for(const id of ['armLength','legLength','hipWidth'])$(id).closest('label').remove();
const host=$('view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-2,2,1,-1,.01,100);camera.position.set(0,1.06,10);camera.lookAt(0,1.06,0);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.prepend(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffebdd,0x555d64,1.2));const key=new THREE.DirectionalLight(0xfff4e8,2);key.position.set(-2.5,4,3);scene.add(key);const fill=new THREE.DirectionalLight(0xd9e1ef,.4);fill.position.set(3,1.5,2);scene.add(fill);
const figures={female:createAngularFigure(true),male:createAngularFigure(false)},originals={};
for(const [sex,f] of Object.entries(figures)){
 while(f.children.length>2){const m=f.children[2];f.remove(m);m.geometry.dispose();m.material.dispose();}
 f.add(createTunic(sex==='female'));f.scale.setScalar(.1);scene.add(f);originals[sex]=Float32Array.from(f.children[0].geometry.attributes.position.array);
 f.children[2].userData.original=Float32Array.from(f.children[2].geometry.attributes.position.array);
}
let angle=0;
function snapshot(){return {schema:'blades-of-war.appearance',version:2,base:'neutral-standing-study',name:$('name').value.trim(),kingdom:$('kingdom').value,sex:$('sex').value,settings:{...state},limitations:['static-preview','no-rig','no-facial-animation','no-hair','temporary-tunic']};}
function refresh(){const sex=$('sex').value,f=figures[sex],body=f.children[0];for(const [key,item] of Object.entries(figures))item.visible=key===sex;
 const a=body.geometry.attributes.position;a.array.set(shapeBody(originals[sex],body.position.y,sex==='female',state));a.needsUpdate=true;body.geometry.computeVertexNormals();body.material.color.set(state.skin);f.scale.setScalar(.1*state.height/100);f.rotation.y=angle;
 // Loose tunic widens for bulk; it is not a clothing fitting system.
 const tunic=f.children[2],tp=tunic.geometry.attributes.position,tbase=tunic.userData.original;
 for(let i=0;i<tp.count;i++){const x=tbase[i*3],y=tbase[i*3+1],z=tbase[i*3+2];let extra=sex==='female'&&z>0?Math.exp(-(((Math.abs(x)-.8)/.65)**2)-(((y-12.55)/.8)**2))*(.10+(state.bust-110)*.004):0;tp.setXYZ(i,x,y,z+extra);}tp.needsUpdate=true;tunic.geometry.computeVertexNormals();
 tunic.scale.x=1+Math.max(0,state.build-100)*.006;tunic.scale.z=1+Math.max(0,state.build-100)*.007;
 for(const k of controls){$(k).value=state[k];let value=$(k+'-value');if(value)value.textContent=state[k]+'%'}$('bust-label').classList.toggle('hidden',sex!=='female');$('output').value=JSON.stringify(snapshot(),null,2);renderer.render(scene,camera)}
for(const k of controls)$(k).addEventListener('input',()=>{state[k]=k==='skin'?$(k).value:Number($(k).value);refresh()});for(const k of ['name','kingdom','sex'])$(k).addEventListener('input',refresh);
$('reset').onclick=()=>{state={...defaults};refresh()};$('export').onclick=()=>{let blob=new Blob([JSON.stringify(snapshot(),null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`blades-appearance-${$('sex').value}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{angle={front:0,three:.68,side:Math.PI/2,back:Math.PI}[b.dataset.view];refresh()};
function resize(){let w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);let height=2.5;camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();refresh()}window.addEventListener('resize',resize);resize();
