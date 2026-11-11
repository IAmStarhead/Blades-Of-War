import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/chin-ear-shading-trial/rework.js';
import {projectChin} from '../src/chin-ear-shading-trial/chin.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,original=p.array.slice();projectChin(g);let changes=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),original[3*i]);assert.equal(p.getY(i),original[3*i+1]);
 const dz=p.getZ(i)-original[3*i+2];assert(Number.isFinite(dz));
 if(dz){changes++;assert(dz>0&&dz<.0093);assert(Math.abs((uv.getX(i)-.5)*2*Math.PI)<.52);assert(uv.getY(i)>.16&&uv.getY(i)<.327);}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}assert(changes);console.log('Male chin projection bounded and finite.');
const {shadeEarRecess}=await import('../src/chin-ear-shading-trial/ear-shading.js');
for(const female of [true,false]){
 const y=female?.077:.080,z=female?-.008:-.014;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([.07,y,z,.07,y+.05,z],3));g.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1,1,1,1],3));
 const before=g.attributes.position.array.slice();shadeEarRecess([{geometry:g}],female);
 assert(g.attributes.color.getX(0)<.85);assert(g.attributes.color.getX(1)>.999);assert.deepEqual(g.attributes.position.array,before);
}
console.log('Ear tint is local and leaves geometry intact.');
