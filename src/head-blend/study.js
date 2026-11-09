import * as THREE from 'three';
import {createHead, STUDIES} from '../head-reference/head.js';
import {blendHeadGeometry} from './blend.js';
const host=document.querySelector('#view');
const scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-6.9,6.9,3.5,-3.5,.1,100);camera.position.set(0,0,20);camera.lookAt(0,0,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfaf0e6,0x555666,2));const light=new THREE.DirectionalLight(0xffffff,2.3);light.position.set(-4,7,10);scene.add(light);
const heads=[], comparisons=[], pairs=[];
for(let i=0;i<3;i++) for(let variant=0;variant<2;variant++) {
  const head=createHead(false,STUDIES[1]);
  if(variant) blendHeadGeometry(head.children[0].geometry,[3,7,12][i]);
  head.position.set((i-1)*4.35+(variant ? .94:-.94),0,0);scene.add(head);heads.push(head);comparisons.push(head);
}
for(let i=0;i<3;i++) for(let sex=0;sex<2;sex++) {
  const head=createHead(sex===0,STUDIES[i]);
  if(sex===1) blendHeadGeometry(head.children[0].geometry,[3,7,12][i]);
  head.position.set((i-1)*4.35+(sex ? .94:-.94),0,0);head.visible=false;
  scene.add(head);heads.push(head);pairs.push(head);
}
for(const button of document.querySelectorAll('[data-layout]')) button.onclick=()=>{
  const showingPairs=button.dataset.layout==='pairs';
  comparisons.forEach(h=>h.visible=!showingPairs);pairs.forEach(h=>h.visible=showingPairs);
  document.querySelector('header p').textContent=showingPairs
    ? 'В каждой паре слева исходная женщина, справа сглаженный мужчина · без волос и текстур'
    : 'Сравнение: слева исходная голова, справа сглаженная · без волос и текстур';
  renderer.render(scene,camera);
};
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=Math.max(7,14.8*h/w);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-view]')) b.onclick=()=>{const a={front:0,three:.68,side:Math.PI/2}[b.dataset.view];heads.forEach(h=>h.rotation.y=a);renderer.render(scene,camera)};
window.addEventListener('resize',resize);resize();
