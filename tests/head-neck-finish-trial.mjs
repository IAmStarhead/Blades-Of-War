import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/head-neck-finish-trial/rework.js';
import {templePlanes,blendNeckSeam} from '../src/head-neck-finish-trial/finish.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,old=p.array.slice();templePlanes(g);let count=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getY(i),old[3*i+1]);assert.equal(p.getZ(i),old[3*i+2]);const dx=p.getX(i)-old[3*i];
 if(dx){count++;let a=Math.abs((uv.getX(i)-.5)*2*Math.PI);assert(a>.63&&a<1.73&&uv.getY(i)>.52&&uv.getY(i)<.78);assert(Math.abs(dx)<.00181);}
 for(let j=0;j<3;j++)assert(Number.isFinite(g.attributes.normal.getComponent(i,j)));
}assert(count);
const head=new THREE.SphereGeometry(.1,32,20),body=new THREE.SphereGeometry(.09,32,20),bp=body.attributes.position,before=bp.array.slice(),hp=head.attributes.position,hbefore=hp.array.slice();blendNeckSeam({headMesh:{geometry:head},bodyMesh:{geometry:body},metrics:{headY:0}});assert.deepEqual(bp.array,before);assert.deepEqual(hp.array,hbefore);for(const n of head.attributes.normal.array)assert(Number.isFinite(n));
console.log('Temple adjustment bounded; seam experiment changes no positions.');
