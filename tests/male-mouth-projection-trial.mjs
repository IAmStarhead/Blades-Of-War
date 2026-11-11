import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/male-mouth-projection-trial/rework.js';
import {projectMouth} from '../src/male-mouth-projection-trial/mouth-projection.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,original=p.array.slice();projectMouth(g);let changes=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),original[3*i]);assert.equal(p.getY(i),original[3*i+1]);
 const dz=p.getZ(i)-original[3*i+2];assert(Number.isFinite(dz));
 if(dz){changes++;assert(dz>0&&dz<.012);assert(Math.abs((uv.getX(i)-.5)*2*Math.PI)<.52);assert(uv.getY(i)>.262&&uv.getY(i)<.419);}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}assert(changes);console.log('Male mouth projection bounded and finite.');
