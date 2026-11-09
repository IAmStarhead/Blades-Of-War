import * as THREE from 'three';
import {createFigure} from '../body-study/figure.js';
import {createMedievalWell3D} from '../engine3d/bow3d/bowProp.js';
import {stylizeFigure, adjustFemaleFigure} from './stylize.js';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-3,3,2,-2,.01,100);camera.position.set(0,1.1,10);camera.lookAt(0,1.1,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfaf0e6,0x555666,1.25));const light=new THREE.DirectionalLight(0xffffff,2.25);light.position.set(-4,7,10);scene.add(light);const fill=new THREE.DirectionalLight(0xd9dfef,.38);fill.position.set(6,1,7);scene.add(fill);
const well=createMedievalWell3D();well.group.position.set(0,0,-.8);well.group.rotation.y=-.22;scene.add(well.group);
const figs={female:[],adjusted:[],male:[]};
for(const [sex,female] of [['female',true],['adjusted',true],['male',false]])for(let i=0;i<2;i++){
 const f=createFigure(female);if(i) { if(sex==='adjusted') adjustFemaleFigure(f); else stylizeFigure(f,female); }f.scale.setScalar(.1);f.position.set(i?1.12:-1.12,0,0);f.visible=sex==='female';figs[sex].push(f);scene.add(f);
}
const floor=new THREE.GridHelper(12,24,0x626362,0x3b4142);floor.position.y=-.006;scene.add(floor);
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=Math.max(2.9,5*h/w);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-sex]'))b.onclick=()=>{const sex=b.dataset.sex;document.querySelector('#variant-label').textContent=sex==='adjusted'?'Только пропорции':'Проба стиля';for(const key of ['female','adjusted','male'])figs[key].forEach(f=>f.visible=key===sex);document.querySelector('#description').textContent=sex==='female'?'Женщина: справа — более длинные ноги и уменьшенный объём таза, проба материала':sex==='adjusted'?'Женщина: справа — исправленные пропорции, одинаковые сетка и материал':'Мужчина: пропорции сохранены; справа — упрощённая сетка и проба материала';renderer.render(scene,camera)};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{const a={front:0,three:.68,side:Math.PI/2}[b.dataset.view];for(const fs of Object.values(figs))fs.forEach(f=>f.rotation.y=a);renderer.render(scene,camera)};
window.addEventListener('resize',resize);resize();
