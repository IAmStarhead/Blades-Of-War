import assert from 'node:assert/strict';
import * as THREE from 'three';
import {makeEarSpace} from '../src/ear-skin-transition-trial/recess.js';
import {trimRearFlap} from '../src/ear-skin-transition-trial/cleanup.js';
for(const female of [true,false]){
 let g=new THREE.SphereGeometry(.08,128,64);g.translate(0,.08,0);let h=g.clone(),before=g.attributes.position.array.slice();makeEarSpace({headMesh:{geometry:g}},female,false);makeEarSpace({headMesh:{geometry:h}},female,true);let a=g.attributes.position,b=h.attributes.position,changed=0;
 for(let i=0;i<a.count;i++){assert.equal(a.getY(i),before[3*i+1]);assert.equal(b.getY(i),before[3*i+1]);assert.equal(a.getZ(i),before[3*i+2]);assert.equal(b.getZ(i),before[3*i+2]);if(a.getX(i)!==before[3*i]){changed++;assert(Math.abs(b.getX(i)-before[3*i])<=Math.abs(a.getX(i)-before[3*i])+1e-7)}for(let k=0;k<3;k++)assert(Number.isFinite(h.attributes.normal.getComponent(i,k)));}assert(changed);
}
for(const side of [-1,1]){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.080,.078,-.020,side*.080,.078,-.020,side*.080,.078,-.020,side*.09,.08,-.01,side*.09,.08,-.01,side*.09,.08,-.01],3));g.setIndex([0,1,2,3,4,5]);let ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};trimRearFlap([ear],true);assert.equal(ear.userData.rearFlapRemoved,1);assert.equal(g.index.count,3);}
console.log('Softer recess and selective mirrored trimming pass.');
