import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addFaceRelief,matchNeckNormals} from '../src/face-final-review-trial/final-retouch.js';
for(const female of [false,true]){
 const g=new THREE.SphereGeometry(.1,64,40),before=g.attributes.position.array.slice();addFaceRelief(g,female);const p=g.attributes.position,uv=g.attributes.uv,n=g.attributes.normal;let max=0;
 for(let i=0;i<p.count;i++){const dz=p.getZ(i)-before[3*i+2];assert(Number.isFinite(dz));assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);max=Math.max(max,Math.abs(dz));assert(Number.isFinite(n.getX(i)+n.getY(i)+n.getZ(i)))}assert(max>.001&&max<.006);
 // Mirror UV samples represent mirrored relief on symmetric original geometry.
 for(let r=0;r<=40;r++)for(let s=1;s<32;s++){let a=r*65+s,b=r*65+64-s;assert(Math.abs((p.getZ(a)-before[3*a+2])-(p.getZ(b)-before[3*b+2]))<1e-6)}
 const body=new THREE.SphereGeometry(.08,20,12);body.translate(0,1.45,0);const rig={headMesh:{geometry:g},bodyMesh:{geometry:body},metrics:{headY:1.45}},headBefore=p.array.slice(),bodyBefore=body.attributes.position.array.slice();matchNeckNormals(rig);assert.deepEqual(p.array,headBefore);assert.deepEqual(body.attributes.position.array,bodyBefore);for(const x of [...g.attributes.normal.array,...body.attributes.normal.array])assert(Number.isFinite(x));
}console.log('Relief is bounded and symmetric; neck normal matching preserves positions and finite normals.');
