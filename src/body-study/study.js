import * as THREE from 'three';
import {createFigure} from './figure.js';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-16,16,10,-10,.1,100);camera.position.set(0,9,35);camera.lookAt(0,9,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfaf0e6,0x555666,1.25));const light=new THREE.DirectionalLight(0xffffff,2.25);light.position.set(-4,18,12);scene.add(light);const fill=new THREE.DirectionalLight(0xd9dfef,.38);fill.position.set(6,8,8);scene.add(fill);
const figures=[createFigure(true),createFigure(false)];figures[0].position.x=-7;figures[1].position.x=7;figures.forEach(f=>scene.add(f));
const floor=new THREE.GridHelper(40,40,0x626362,0x3b4142);floor.position.y=-.03;scene.add(floor);
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=Math.max(21,29*h/w);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{const a={front:0,three:.68,side:Math.PI/2,back:Math.PI}[b.dataset.view];figures.forEach(h=>h.rotation.y=a);renderer.render(scene,camera)};
window.addEventListener('resize',resize);resize();
