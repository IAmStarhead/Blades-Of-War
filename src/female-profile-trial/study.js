import * as THREE from 'three';
import {connectNeck} from '../neck-bridge-trial/neck-bridge.js';
import {createBowCharacter3D,BONE_IDX} from '../engine3d/bow3d/bowCharacter.js';
import {makeHeadForm} from './head-form.js';
import {makeHeadForm as previousHead} from '../jaw-neck-trial/head-form.js';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color(0x292f33);
scene.add(new THREE.HemisphereLight(0xfff2e8,0x697077,1.35));const key=new THREE.DirectionalLight(0xfff7ee,2.1);key.position.set(-3,4,5);scene.add(key);const fill=new THREE.DirectionalLight(0xd9e1e9,.45);fill.position.set(3,2,3);scene.add(fill);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);camera.position.set(0,1.57,8);camera.lookAt(0,1.57,0);
const figures={};
for(const [sex,female] of [['female',true],['male',false]]){
 const variants=[];
 for(let k=0;k<2;k++){
  const rig=createBowCharacter3D({female,kingdom:'north',outfit:'villager',beard:false});rig.group.position.x=k?.38:-.38;rig.group.visible=false;
  {
  // Trial-only taper at the very top of the original body's neck, where it
  // otherwise pushes through the reshaped lower head. Never edit source geometry.
  const body=rig.bodyMesh.geometry.clone(), bp=body.attributes.position;
  const h=rig.metrics.hScale || .995, from=(female?1.455:1.535)*h, to=(female?1.510:1.590)*h;
  for(let i=0;i<bp.count;i++){
   const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);
   if(y>from && Math.abs(x)<.08 && Math.abs(z)<.08){let t=Math.max(0,Math.min(1,(y-from)/(to-from)));t=t*t*(3-2*t);const back=Math.max(0,Math.min(1,-z/.04));
    bp.setXYZ(i,x*(1-.16*t),y+.010*t*back,z*(1-.18*t)-.006*t*back);}
  }
  bp.needsUpdate=true;body.computeVertexNormals();rig.bodyMesh.geometry=body;
  const original=rig.headMesh.geometry;rig.headMesh.geometry=(k===1&&female?makeHeadForm:previousHead)(original,female,'north');original.dispose();rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.side=THREE.DoubleSide;
  if(female){
   const originalMap=rig.headMesh.material.map, image=originalMap.image;
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   // Enlarge only the mouth region on an independent copy of the texture.
   const patch=document.createElement('canvas');patch.width=80;patch.height=32;
   patch.getContext('2d').drawImage(image,216,330,80,32,0,0,80,32);
   ctx.drawImage(patch,0,0,80,32,208,326,96,40);
   const texture=originalMap.clone();texture.image=canvas;texture.needsUpdate=true;rig.headMesh.material.map=texture;
  }
  if(k===0){
   connectNeck(rig,female);
   const oldMap=rig.headMesh.material.map, img=oldMap.image;
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const bodyImage=rig.bodyMesh.material.map.image, sample=document.createElement('canvas');sample.width=bodyImage.width;sample.height=bodyImage.height;
   const sc=sample.getContext('2d');sc.drawImage(bodyImage,0,0);
   const skin=sc.getImageData(256,14,1,1).data;
   const image=ctx.getImageData(0,0,canvas.width,canvas.height),pixels=image.data;
   for(let yy=400;yy<512;yy++)for(let xx=0;xx<512;xx++){
    const t=Math.max(0,Math.min(1,(yy-410)/50)),w=t*t*(3-2*t),i=(yy*512+xx)*4;
    for(let q=0;q<3;q++)pixels[i+q]=pixels[i+q]*(1-w)+skin[q]*w;
   }
   ctx.putImageData(image,0,0);const map=oldMap.clone();map.image=canvas;map.needsUpdate=true;rig.headMesh.material.map=map;
  }}

  scene.add(rig.group);variants.push(rig);
 }figures[sex]=variants;
}
let sex='female',focus='face',angle=0;
function render(){for(const [key,arr] of Object.entries(figures))for(const rig of arr){rig.group.visible=sex===key;rig.group.rotation.y=angle}
 const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=focus==='face'?Math.max(.39,1.05*h/w):Math.max(1.95,1.8*h/w);camera.position.y=focus==='face'?(sex==='female'?1.54:1.62):.85;camera.lookAt(0,camera.position.y,0);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-sex]'))b.onclick=()=>{sex=b.dataset.sex;render()};for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{angle={front:0,three:.68,side:Math.PI/2}[b.dataset.view];render()};for(const b of document.querySelectorAll('[data-focus]'))b.onclick=()=>{focus=b.dataset.focus;render()};window.addEventListener('resize',render);render();window.previewCharacters=figures;window.ready=true;
