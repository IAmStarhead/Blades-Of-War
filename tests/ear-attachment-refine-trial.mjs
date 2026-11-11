import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trimRearFlap} from '../src/ear-attachment-refine-trial/cleanup.js';
for(const side of [-1,1]){
 let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.071,.069,-.026,side*.072,.068,-.027,side*.073,.070,-.025,side*.09,.08,-.01,side*.091,.08,-.01,side*.09,.081,-.01],3));g.setIndex([0,1,2,3,4,5]);let before=g.attributes.position.array.slice(),ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};trimRearFlap([ear]);assert.equal(ear.userData.rearFlapRemoved,1);assert.equal(g.index.count,3);assert.deepEqual(before,g.attributes.position.array);
}console.log('Rear flap test preserves geometry positions and the retained triangle.');
