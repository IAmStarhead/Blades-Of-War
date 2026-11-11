import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/female-chin-forward-trial/rework.js';
import {forwardFemaleChin} from '../src/female-chin-forward-trial/female-chin.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,old=p.array.slice();forwardFemaleChin(g);let count=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),old[3*i]);assert.equal(p.getY(i),old[3*i+1]);const d=p.getZ(i)-old[3*i+2];assert(Number.isFinite(d));
 if(d){count++;assert(d>0&&d<.0046);assert(Math.abs((uv.getX(i)-.5)*2*Math.PI)<.50);assert(uv.getY(i)>.17&&uv.getY(i)<.30);}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}assert(count);console.log('Female chin deformation bounded and finite.');
