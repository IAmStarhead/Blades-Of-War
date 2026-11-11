import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/chin-ear-visible-trial/rework.js';
import {adjustChin} from '../src/chin-ear-visible-trial/chin-adjust.js';
import {shadeEarRecess} from '../src/chin-ear-visible-trial/ear-shading.js';
for(const female of [false,true]){
 const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();adjustChin(g,female);let count=0;
 for(let i=0;i<p.count;i++){
  assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);let dz=p.getZ(i)-before[3*i+2];assert(Number.isFinite(dz));
  if(dz){count++;assert(dz>0&&dz<.006);assert(Math.abs((uv.getX(i)-.5)*2*Math.PI)<.55);assert(uv.getY(i)>.155&&uv.getY(i)<.325)}
  for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
 }assert(count);
 const y=female?.077:.080,z=female?-.008:-.014,e=new THREE.BufferGeometry();e.setAttribute('position',new THREE.Float32BufferAttribute([.07,y,z,.07,y+.05,z],3));e.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1,1,1,1],3));const pos=e.attributes.position.array.slice();shadeEarRecess([{geometry:e}],female);assert(e.attributes.color.getX(0)<.6);assert(e.attributes.color.getX(1)>.999);assert.deepEqual(e.attributes.position.array,pos);
}console.log('Chin deformations bounded for both; ear tint fades without changing geometry.');
