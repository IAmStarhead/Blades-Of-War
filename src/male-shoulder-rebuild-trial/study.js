import {setNeutralMaleArms} from '../male-arm-neutral-pose-trial/neutral-arms.js';
import {closeUpperOpening} from '../ear-upper-opening-order-trial/close-upper-opening.js';
import {blendFrontContour} from '../ear-upper-opening-order-trial/blend-front.js';
import {addInnerRelief} from '../ear-upper-opening-order-trial/inner-relief.js';
import {easeUpperTip} from '../ear-upper-opening-order-trial/tip.js';
import {softenInnerEar} from '../ear-upper-opening-order-trial/soften-inner.js';
import {repairUpperRoot} from '../ear-upper-opening-order-trial/root-mesh.js';
import {fitFemaleEars} from '../ear-upper-opening-order-trial/female-fit.js';
import {softenRootTips} from '../ear-upper-opening-order-trial/upper-contour.js';
import {closeInnerGap} from '../ear-upper-opening-order-trial/close-inner-gap.js';
import {settleUpperRoot} from '../ear-upper-opening-order-trial/soften-root.js';
import {softenEarStrip} from '../ear-upper-opening-order-trial/soften-strip.js';
import {roundUpperEar} from '../ear-upper-opening-order-trial/round-upper.js';
import {maskMaleEarGap} from '../ear-upper-opening-order-trial/mask-gap.js';
import {shadeCanal} from '../ear-upper-opening-order-trial/canal.js';
import * as THREE from 'three';
import {adjustDetails} from '../ear-upper-opening-order-trial/align-details.js';
import {finalFace,matchNeckNormals} from '../ear-upper-opening-order-trial/final-retouch.js';
import {reworkFace} from '../ear-upper-opening-order-trial/rework.js';
import {neutralMouth} from '../ear-upper-opening-order-trial/neutral.js';
import {fixMaleFace} from '../ear-upper-opening-order-trial/repair.js';
import {shapeMouth} from '../ear-upper-opening-order-trial/mouth-form.js';
import {rebalanceMouth} from '../ear-upper-opening-order-trial/rebalance.js';
import {repairProfile} from '../ear-upper-opening-order-trial/profile.js';
import {addIrisDepth} from '../ear-upper-opening-order-trial/iris-depth.js';
import {addAdjustedIris} from '../ear-upper-opening-order-trial/iris-adjusted.js';
import {softenUnderNoseNormals} from '../ear-upper-opening-order-trial/nose-light.js';
import {narrowIris} from '../ear-upper-opening-order-trial/iris-shape.js';
import {innerOrbit} from '../ear-upper-opening-order-trial/inner-orbit.js';
import {shapeNose} from '../ear-upper-opening-order-trial/nose-form.js';
import {projectMouth} from '../ear-upper-opening-order-trial/mouth-projection.js';
import {projectChin} from '../ear-upper-opening-order-trial/chin.js';
import {projectChin as previousChin} from '../male-chin-upper-trial/chin.js';
import {shadeEarRecess} from '../ear-upper-opening-order-trial/ear-shading.js';
import {shadeEarRecess as previousEarShade} from '../chin-ear-shading-trial/ear-shading.js';
import {adjustChin} from '../ear-upper-opening-order-trial/chin-adjust.js';
import {forwardFemaleChin} from '../ear-upper-opening-order-trial/female-chin.js';
import {makeEarSpace} from '../ear-upper-opening-order-trial/recess.js';
import {revealLobe} from '../ear-upper-opening-order-trial/lobe.js';
import {fitBoundary} from '../ear-upper-opening-order-trial/boundary.js';
import {extendFemaleLobe} from '../ear-upper-opening-order-trial/lobe-bridge.js';
import {copyMaleEarShape} from '../ear-upper-opening-order-trial/copy-ear.js';
import {balanceEarEdge} from '../ear-upper-opening-order-trial/balance.js';
import {trimRearFlap} from '../ear-upper-opening-order-trial/cleanup.js';
import {addTrialEars as restoredMale} from '../ear-upper-opening-order-trial/male-source-ear.js';
import {addTrialEars as restoredFemale} from '../ear-upper-opening-order-trial/female-source-ear.js';
import {innerOrbit as previousOrbit} from '../inner-orbit-transition-trial/inner-orbit.js';
import {retouch} from '../ear-upper-opening-order-trial/retouch.js';
import {hideFaceDrawing, softenEarContour} from '../ear-upper-opening-order-trial/base.js';
import {settleEars} from '../ear-upper-opening-order-trial/ears-front.js';
import {shapeFaceRelief} from '../ear-upper-opening-order-trial/relief.js';
import {refineFace} from '../ear-upper-opening-order-trial/refine.js';
import {alignOrbit} from '../ear-upper-opening-order-trial/orbit.js';
import {reshapeFace} from '../ear-upper-opening-order-trial/structure.js';
import {headPlanes} from '../ear-upper-opening-order-trial/head-planes.js';
import {sculptSurface} from '../ear-upper-opening-order-trial/surface.js';
import {roundEars} from '../ear-upper-opening-order-trial/ear-smooth.js';
import {redrawEyes} from '../ear-upper-opening-order-trial/eyes.js';
import {redrawLips} from '../ear-upper-opening-order-trial/lips.js';
import {enhanceRelief} from '../ear-upper-opening-order-trial/enhance.js';
import {softenBrowShadow} from '../ear-upper-opening-order-trial/calm.js';
import {trimBackFragment} from '../ear-upper-opening-order-trial/fragment.js';
import {harmonizeEarSkin} from '../ear-upper-opening-order-trial/skin.js';
import {stitchConcha} from '../ear-upper-opening-order-trial/stitch.js';
import {adjustEarDetail} from '../ear-upper-opening-order-trial/detail.js';
import {addTrialEars} from '../ear-fit-trial/ears.js';
import {joinEars} from '../ear-join-trial/join.js';
import {addTrialEars as femaleEars} from '../female-ear-fit-trial/female-ears.js';
import {fitEarEdge} from '../female-ear-edge-trial/edge.js';
import {fitEarEdge as fitMargin} from '../ear-upper-opening-order-trial/edge.js';
import {softenNeckColour,trimEarMargins} from '../ear-upper-opening-order-trial/seam.js';
import {kingdomNose} from '../nose-kingdom-trial/nose-variants.js';
import {straightenBridge} from '../straight-nose-trial/straighten.js';
import {createBowCharacter3D as createTrialCharacter3D} from './body-character.js';
import {createBowCharacter3D,BONE_IDX} from '../male-deltoid-anatomy-trial/body-character.js';
import {makeHeadForm as previousHead} from '../head-refinement-trial/head-form.js';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color(0x292f33);
scene.add(new THREE.HemisphereLight(0xfff2e8,0x697077,1.35));const key=new THREE.DirectionalLight(0xfff7ee,2.1);key.position.set(-3,4,5);key.target.position.set(0,1.55,0);scene.add(key.target);scene.add(key);const fill=new THREE.DirectionalLight(0xd9e1e9,.45);fill.position.set(3,2,3);scene.add(fill);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);camera.position.set(0,1.57,8);camera.lookAt(0,1.57,0);
const figures={};
for(const [sex,female] of [['female',true],['male',false]]){
 const variants=[];
 for(let k=0;k<2;k++){
  const rig=(k ? createTrialCharacter3D : createBowCharacter3D)({female,kingdom:'north',outfit:'villager',beard:false});rig.group.position.x=k?.38:-.38;rig.group.visible=false;
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
  if(k>=0)for(let i=0;i<bp.count;i++){
   const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i);
   // Affect only neck rings, not shoulders: retain their height and depth.
   const lo=(female?1.405:1.475)*h, hi=(female?1.455:1.535)*h;
   if(i<500 && y>lo && Math.abs(x)<.085 && Math.abs(z)<.085){
    let t=Math.max(0,Math.min(1,(y-lo)/(hi-lo)));t=t*t*(3-2*t);
    bp.setX(i,x*(1-.075*t));
   }
  }
  bp.needsUpdate=true;body.computeVertexNormals();rig.bodyMesh.geometry=body;
  const original=rig.headMesh.geometry;rig.headMesh.geometry=previousHead(original,female,'north');original.dispose();rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.side=THREE.DoubleSide;
  if(female){
   const originalMap=rig.headMesh.material.map, image=originalMap.image;
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
   // Enlarge only the mouth region on an independent copy of the texture.
   const patch=document.createElement('canvas');patch.width=80;patch.height=32;
   patch.getContext('2d').drawImage(image,216,330,80,32,0,0,80,32);
   ctx.drawImage(patch,0,0,80,32,208,326,96,40);
   if(k>=0){
    // Subtle cupid bow and fuller lower lip, drawn on the independent texture.
    const y=346.5;
    ctx.fillStyle='#b77f79';ctx.beginPath();ctx.moveTo(232,y+1);
    ctx.bezierCurveTo(240,y-1,245,y-5,250,y-4);ctx.quadraticCurveTo(253,y-3,256,y-4);
    ctx.quadraticCurveTo(259,y-3,262,y-4);ctx.bezierCurveTo(267,y-5,272,y-1,280,y+1);
    ctx.quadraticCurveTo(256,y+3,232,y+1);ctx.fill();
    ctx.fillStyle='#c7938c';ctx.beginPath();ctx.moveTo(232,y+1);ctx.quadraticCurveTo(256,y+2,280,y+1);
    ctx.bezierCurveTo(274,y+5,266,y+8,256,y+8);ctx.bezierCurveTo(246,y+8,238,y+5,232,y+1);ctx.fill();
    ctx.strokeStyle='rgba(111,66,64,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(232,y+1);
    ctx.bezierCurveTo(242,y+2,249,y+.5,256,y+1.7);ctx.bezierCurveTo(263,y+.5,270,y+2,280,y+1);ctx.stroke();
   }
   const texture=originalMap.clone();texture.image=canvas;texture.needsUpdate=true;rig.headMesh.material.map=texture;
  }
  {const oldHead=rig.headMesh.geometry;rig.headMesh.geometry=kingdomNose(oldHead,female,true);oldHead.dispose();straightenBridge(rig.headMesh.geometry);rig.trialEars=(female?restoredFemale:restoredMale)(rig,female,true);if(female)fitEarEdge(rig,rig.trialEars);else rig.earJoins=joinEars(rig,rig.trialEars);}
  {
   // Blend only a clone of the bottom head texture towards the adjacent skin;
   // this can soften colour contrast, not weld or smooth separate surfaces.
   const oldMap=rig.headMesh.material.map,img=oldMap.image;
   const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
   const sample=document.createElement('canvas');sample.width=512;sample.height=512;
   const sc=sample.getContext('2d');sc.drawImage(rig.bodyMesh.material.map.image,0,0);
   const skin=sc.getImageData(256,14,1,1).data, im=ctx.getImageData(0,0,512,512),px=im.data;
   for(let y=425;y<512;y++)for(let x=0;x<512;x++){
    let t=Math.max(0,Math.min(1,(y-430)/65));t=t*t*(3-2*t);
    const j=(y*512+x)*4;for(let q=0;q<3;q++)px[j+q]=px[j+q]*(1-t)+skin[q]*t;
   }
   ctx.putImageData(im,0,0);const map=oldMap.clone();map.image=canvas;map.needsUpdate=true;rig.headMesh.material.map=map;
  }
  }

  softenNeckColour(rig);trimEarMargins(rig.trialEars,female);
  {if(!female)for(const mesh of rig.earJoins){mesh.removeFromParent();mesh.geometry.dispose()} fitMargin(rig,rig.trialEars,female);}
  adjustEarDetail(rig.trialEars,female);
  for(const ear of rig.trialEars)ear.userData.root.visible=false;
  harmonizeEarSkin(rig,rig.trialEars,female);
  rig.group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  if(!female)trimBackFragment(rig,rig.trialEars,true);
  settleEars(rig.trialEars,female);
  refineFace(rig.headMesh.geometry,female,true);
  headPlanes(rig.headMesh.geometry,female,true);
  
  softenEarContour(rig.trialEars);softenEarContour(rig.trialEars);
  roundEars(rig.trialEars);
  softenBrowShadow(rig);
  {softenEarContour(rig.trialEars);retouch(rig,female,true,true);}
  {
   for(const ear of rig.trialEars){
    // Rise both ears with the head, and incline female ears slightly backwards.
    const side=ear.name.endsWith('left')?-1:1, g=ear.geometry,p=g.attributes.position;
    if(female){g.computeBoundingBox();const cy=(g.boundingBox.min.y+g.boundingBox.max.y)/2,cz=(g.boundingBox.min.z+g.boundingBox.max.z)/2; const a=-.12;
     for(let i=0;i<p.count;i++){const y=p.getY(i)-cy,z=p.getZ(i)-cz;p.setY(i,cy+y*Math.cos(a)-z*Math.sin(a));p.setZ(i,cz+y*Math.sin(a)+z*Math.cos(a));}p.needsUpdate=true;g.computeVertexNormals();}
    ear.position.y+=.008;if(ear.userData.root)ear.userData.root.position.y+=.008;
   }
   adjustDetails(rig,female);
   finalFace(rig,female);matchNeckNormals(rig);
   reworkFace(rig,female,!female);
   if(!female)neutralMouth(rig);
   if(!female)fixMaleFace(rig);
   if(!female){shapeMouth(rig);rebalanceMouth(rig);}
   if(!female)repairProfile(rig);
   if(!female){narrowIris(rig);innerOrbit(rig.headMesh.geometry);}
   shapeNose(rig.headMesh.geometry,female);
   if(!female){projectMouth(rig.headMesh.geometry);projectChin(rig.headMesh.geometry);}
   if(!female)softenUnderNoseNormals(rig.headMesh.geometry);
   adjustChin(rig.headMesh.geometry,female);shadeEarRecess(rig.trialEars,female);if(female)forwardFemaleChin(rig.headMesh.geometry);makeEarSpace(rig,female,true);if(!female)trimRearFlap(rig.trialEars,true,'partial');if(female)revealLobe(rig.trialEars);fitBoundary(rig,rig.trialEars);if(female)extendFemaleLobe(rig,rig.trialEars);
  }

  scene.add(rig.group);variants.push(rig);
 }figures[sex]=variants;
}
copyMaleEarShape(figures.female[0],figures.male[0],true);
copyMaleEarShape(figures.female[1],figures.male[1],true);
balanceEarEdge(figures.female[0],figures.female[0].trialEars);
balanceEarEdge(figures.female[1],figures.female[1].trialEars);
shadeCanal(figures.female[0],true);
shadeCanal(figures.female[1],true);
shadeCanal(figures.male[0],false);
shadeCanal(figures.male[1],false);
maskMaleEarGap(figures.male[0]);
maskMaleEarGap(figures.male[1]);
roundUpperEar(figures.male[0].trialEars);
roundUpperEar(figures.male[1].trialEars);
roundUpperEar(figures.female[0].trialEars);
roundUpperEar(figures.female[1].trialEars);
softenEarStrip(figures.male[1].trialEars,false);
softenEarStrip(figures.female[1].trialEars,true);
settleUpperRoot(figures.female[0].trialEars);
settleUpperRoot(figures.female[1].trialEars);
softenEarStrip(figures.male[0].trialEars,false);
softenEarStrip(figures.female[0].trialEars,true);
closeInnerGap(figures.male[0].trialEars);
closeInnerGap(figures.male[1].trialEars);
closeInnerGap(figures.female[0].trialEars);
closeInnerGap(figures.female[1].trialEars);
softenRootTips(figures.male[0].trialEars,false);
softenRootTips(figures.male[1].trialEars,false);
softenRootTips(figures.female[0].trialEars,true);
softenRootTips(figures.female[1].trialEars,true);
fitFemaleEars(figures.female[0].trialEars);
fitFemaleEars(figures.female[1].trialEars);
softenInnerEar(figures.female[0].trialEars, 20);
softenInnerEar(figures.female[1].trialEars, 20);
for (const variant of [0,1]) {
 roundUpperEar(figures.female[variant].trialEars);
 roundUpperEar(figures.male[variant].trialEars);
 addInnerRelief(figures.female[variant].trialEars,true,.0036);
 addInnerRelief(figures.male[variant].trialEars,false,.0036);
 easeUpperTip(figures.female[variant].trialEars,true);
 easeUpperTip(figures.male[variant].trialEars,false);
}
// Load the preserved earlier trial in an isolated same-origin frame. It
// supplies reference geometry only, and never changes either game's models.
const referenceFrame=document.createElement('iframe');
referenceFrame.style.cssText='position:fixed;left:-10000px;top:0;width:1000px;height:800px;visibility:hidden;pointer-events:none';
await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Earlier ear reference timed out')),90000);referenceFrame.onload=()=>{const check=()=>{if(referenceFrame.contentWindow.ready){clearTimeout(timer);resolve()}else setTimeout(check,50)};check()};referenceFrame.onerror=()=>{clearTimeout(timer);reject(new Error('Earlier ear reference unavailable'))};referenceFrame.src='../female-chin-forward-trial/';document.body.appendChild(referenceFrame)});
for(const sex of ['female','male'])for(const variant of [0,1])blendFrontContour(figures[sex][variant].trialEars,referenceFrame.contentWindow.previewCharacters[sex][1].trialEars);
referenceFrame.remove();
closeUpperOpening(figures.male[0].trialEars);
closeUpperOpening(figures.male[1].trialEars);
repairUpperRoot(figures.female[0],figures.female[0].trialEars,true,true);
repairUpperRoot(figures.female[1],figures.female[1].trialEars,true,true);
repairUpperRoot(figures.male[0],figures.male[0].trialEars,false,true);
repairUpperRoot(figures.male[1],figures.male[1].trialEars,false,true);

for(const arr of Object.values(figures))for(const rig of arr)if(rig.garmentMesh)rig.garmentMesh.visible=false;
let sex='female',focus='body',angle=0,pose='rest';
for(const arr of Object.values(figures))for(const rig of arr)rig.headMesh.userData.faceMap=rig.headMesh.material.map;
let drawing=true;
for(const b of document.querySelectorAll('[data-material]'))b.onclick=()=>{drawing=b.dataset.material==='skin';for(const arr of Object.values(figures))for(const rig of arr){rig.headMesh.material.map=b.dataset.material==='clay'?null:rig.headMesh.userData.faceMap;rig.headMesh.material.needsUpdate=true;for(const eye of rig.headMesh.children)if(eye.name==='trial-forward-iris')eye.visible=b.dataset.material!=='clay';}render()};
function render(){for(const [key,arr] of Object.entries(figures))for(const rig of arr){rig.group.visible=sex===key;rig.group.position.x=(arr.indexOf(rig)?1:-1)*(focus==='face'?.115:.38);rig.group.rotation.y=angle;rig.bones[BONE_IDX.HEAD].rotation.y=pose==='turn'?.45:0;rig.bones[BONE_IDX.HEAD].rotation.x=pose==='tilt'?-.25:0;rig.bones[BONE_IDX.UPPER_ARM_L].rotation.z=pose==='bend'?-.7:0;rig.bones[BONE_IDX.FOREARM_L].rotation.x=pose==='bend'?-1.1:0;rig.bones[BONE_IDX.THIGH_R].rotation.x=pose==='bend'?-.45:0;rig.bones[BONE_IDX.SHIN_R].rotation.x=pose==='bend'?1.0:0;
 if(key==='male'){ 
  // Comparison-only neutral pose, mirrored in character space, not a mesh edit.
  setNeutralMaleArms(rig.bones,BONE_IDX);
  if(pose==='bend'){rig.bones[BONE_IDX.UPPER_ARM_L].rotation.z=-.7;rig.bones[BONE_IDX.FOREARM_L].rotation.x=-1.1}
 }
}
 const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);const height=focus==='face'?Math.max(.38,.48*h/w):Math.max(1.95,1.8*h/w);camera.position.y=focus==='face'?(sex==='female'?1.54:1.62):.85;camera.lookAt(0,camera.position.y,0);camera.top=height/2;camera.bottom=-height/2;camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-sex]'))b.onclick=()=>{sex=b.dataset.sex;render()};for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{angle={front:0,three:.68,otherthree:-.68,back:Math.PI,side:Math.PI/2,other:-Math.PI/2}[b.dataset.view];render()};for(const b of document.querySelectorAll('[data-focus]'))b.onclick=()=>{focus=b.dataset.focus;render()};for(const b of document.querySelectorAll('[data-light]'))b.onclick=()=>{key.position.x=b.dataset.light==='left'?-3:3;render()};window.addEventListener('resize',render);render();window.previewCharacters=figures;window.trialShadowLight=key;window.ready=true;

for(const b of document.querySelectorAll('[data-pose]'))b.onclick=()=>{pose=b.dataset.pose;render()};










for(const b of document.querySelectorAll('[data-clothing]'))b.onclick=()=>{for(const arr of Object.values(figures))for(const rig of arr)if(rig.garmentMesh)rig.garmentMesh.visible=b.dataset.clothing==='on';render()};
