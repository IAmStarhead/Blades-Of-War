import * as THREE from 'three';
import {createAngularFigure} from './figure.js';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color('#292e32');
const camera=new THREE.OrthographicCamera(-2,2,1.5,-1.5,.01,100);camera.position.set(0,1.08,10);camera.lookAt(0,1.08,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffe9d5,0x4a5050,.95));const key=new THREE.DirectionalLight(0xfff3e7,2);key.position.set(-2.5,4,3);key.target.position.set(0,.9,0);key.castShadow=true;key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-2.6,right:2.6,top:2.6,bottom:-2.6,near:.1,far:12});key.shadow.bias=-.00015;key.shadow.normalBias=.012;scene.add(key,key.target);const fill=new THREE.DirectionalLight(0xd9e1ee,.48);fill.position.set(3,1.5,2);scene.add(fill);
const figures=[createAngularFigure(true),createAngularFigure(false)];figures.forEach((f,i)=>{f.scale.setScalar(.1);f.position.x=i?.77:-.77;scene.add(f)});
const ground=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({color:0x343d3d,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.008;ground.receiveShadow=true;scene.add(ground);
let focus='body';
function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.position.y=focus==='face'?1.53:1.08;camera.lookAt(0,camera.position.y,0);const height=focus==='face'?Math.max(1.05,2.25*h/w):Math.max(2.45,3.4*h/w);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-focus]'))b.onclick=()=>{focus=b.dataset.focus;resize()};
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{const a={front:0,three:.68,side:Math.PI/2,back:Math.PI}[b.dataset.view];figures.forEach(f=>f.rotation.y=a);renderer.render(scene,camera)};
window.addEventListener('resize',resize);resize();
