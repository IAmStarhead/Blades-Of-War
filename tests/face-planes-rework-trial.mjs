import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles,reworkGeometry} from '../src/face-planes-rework-trial/rework.js';
for(const female of [false,true]){
 const source=new THREE.SphereGeometry(.1,64,40),original=source.attributes.position.array.slice();const g=splitTriangles(source);assert.equal(g.index.count,source.index.count*4);assert.deepEqual(source.attributes.position.array,original);
 const before=g.attributes.position.array.slice(),uv=g.attributes.uv,position=g.attributes.position;reworkGeometry(g,female);let max=0;
 for(let i=0;i<position.count;i++){assert.equal(position.getX(i),before[3*i]);assert.equal(position.getY(i),before[3*i+1]);let dz=position.getZ(i)-before[3*i+2];assert(Number.isFinite(dz));max=Math.max(max,Math.abs(dz));if(uv.getY(i)<.25||uv.getY(i)>.75)assert(Math.abs(dz)<1e-7)}assert(max>.001&&max<.03);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
 for(let r=0;r<=40;r++)for(let s=1;s<32;s++){let a=r*65+s,b=r*65+64-s;assert(Math.abs((position.getZ(a)-before[3*a+2])-(position.getZ(b)-before[3*b+2]))<1e-6)}
}console.log('Refinement retains original; displacement is bounded, finite and symmetric.');
