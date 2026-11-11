import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeEarSpace} from '../src/ear-surface-reveal-trial/recess.js';
for(const female of [true,false]){
 const g=new THREE.SphereGeometry(.08,128,64);g.translate(0,.08,0);const p=g.attributes.position,old=p.array.slice();makeEarSpace({headMesh:{geometry:g}},female);let changed=0,max=0;
 for(let i=0;i<p.count;i++){
  const dx=p.getX(i)-old[3*i];assert.equal(p.getY(i),old[3*i+1]);assert.equal(p.getZ(i),old[3*i+2]);if(dx)changed++;max=Math.max(max,Math.abs(dx));for(let j=0;j<3;j++)assert(Number.isFinite(g.attributes.normal.getComponent(i,j)));
 }assert(changed);assert(max<=.010001);console.log(female?'female':'male',changed,max);
}
