import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const q=new URLSearchParams(location.search), who=q.get('who')||'both',angle=Number(q.get('angle')||0),face=q.get('face')==='1';
document.querySelector('#label').textContent=who==='both'?'Женщина · Мужчина':who==='woman'?'Женщина':'Мужчина';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x292f32);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight-65);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xfff3e9,0x66717e,2));let key=new THREE.DirectionalLight(0xfff3e8,2);key.position.set(-3,5,-5);scene.add(key);let fill=new THREE.DirectionalLight(0xe2eaff,.5);fill.position.set(3,2,4);scene.add(fill);
const height=face?.52:2.15, aspect=innerWidth/(innerHeight-65),camera=new THREE.OrthographicCamera(-height*aspect/2,height*aspect/2,height/2,-height/2,.01,100);camera.position.set(0,face?1.58:.93,-6);camera.lookAt(0,face?1.58:.93,0);
const loader=new GLTFLoader();const names=who==='both'?['woman','man']:[who];for(let i=0;i<names.length;i++){const gltf=await loader.loadAsync(`/default_${names[i]}_lowpoly.glb`);const pivot=new THREE.Group();pivot.rotation.y=angle;pivot.add(gltf.scene);pivot.position.x=names.length===2?(i===0?.55:-.55):0;scene.add(pivot);}
renderer.render(scene,camera);window.previewReady=true;
