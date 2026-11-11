import * as THREE from 'three';
import {splitTriangles} from './rework.js';
const bump=(x,c,r)=>{const t=Math.abs((x-c)/r);return t>=1?0:(1-t*t)**2};
// Refine without changing the original surface, then use compact, symmetric
// fields: ease the broad muzzle forwardness and give each lip a shallow plane.
export function sculptMouth(g){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();
 g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);
  const broad=-.0018*bump(a,0,.43)*bump(v,.325,.069);
  const upper=.00065*bump(a,0,.225)*bump(v,.335,.015);
  const lower=.00085*bump(a,0,.21)*bump(v,.319,.016);
  const dz=broad+upper+lower;
  if(dz)p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));
  v.add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i))).normalize();
  n.setXYZ(i,v.x,v.y,v.z);
 }n.needsUpdate=true;
}
export function drawMouth(rig){
 const old=rig.headMesh.material.map,im=old.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);
 const w=c.width,h=c.height,img=ctx.getImageData(0,0,w,h),d=img.data,src=d.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=x*512/w,Y=y*512/h;if(X<218||X>294||Y<330||Y>366)continue;
  const f=Math.max(0,Math.min(1,(X-218)/9,(294-X)/9,(Y-330)/6,(366-Y)/6)),t=(X-218)/76,i=(y*w+x)*4,l=(y*w+Math.round(218*w/512))*4,r=(y*w+Math.round(294*w/512))*4;
  for(let k=0;k<3;k++)d[i+k]=src[i+k]*(1-f)+(src[l+k]*(1-t)+src[r+k]*t)*f;
 }
 ctx.putImageData(img,0,0);ctx.save();ctx.scale(w/512,h/512);
 ctx.fillStyle='rgba(148,99,86,.42)';ctx.beginPath();ctx.moveTo(239,344);ctx.bezierCurveTo(245,342,249,340.5,253,341.5);ctx.quadraticCurveTo(256,342.5,259,341.5);ctx.bezierCurveTo(263,340.5,267,342,273,344);ctx.quadraticCurveTo(256,344.8,239,344);ctx.fill();
 ctx.fillStyle='rgba(175,123,108,.43)';ctx.beginPath();ctx.moveTo(239,344);ctx.quadraticCurveTo(256,345,273,344);ctx.bezierCurveTo(269,347,263,348.3,256,348.3);ctx.bezierCurveTo(249,348.3,243,347,239,344);ctx.fill();
 ctx.strokeStyle='rgba(97,65,55,.65)';ctx.lineWidth=1.05;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(239,344);ctx.quadraticCurveTo(256,345,273,344);ctx.stroke();
 ctx.strokeStyle='rgba(112,75,63,.25)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(247,351.5);ctx.quadraticCurveTo(256,353,265,351.5);ctx.stroke();ctx.restore();
 const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
export function shapeMouth(rig){const old=rig.headMesh.geometry;rig.headMesh.geometry=splitTriangles(old);old.dispose();sculptMouth(rig.headMesh.geometry);drawMouth(rig)}
