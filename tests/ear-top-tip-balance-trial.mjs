import assert from 'node:assert/strict';
import * as THREE from 'three';
import {easeUpperTip} from '../src/ear-top-tip-balance-trial/tip.js';
for(const female of [false,true])for(const side of [-1,1]){
 const x=female?.076:.081,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*x,.107,-.002,side*(x+.001),.103,-.004,side*(x-.001),.103,0,side*x,.07,-.002],3));g.setIndex([0,1,2,1,3,2]);g.computeVertexNormals();let before=g.attributes.position.array.slice(),idx=g.index.array.slice();const ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};easeUpperTip([ear],female);assert(ear.userData.tipEaseVertices>0);assert(ear.userData.tipEaseMax<=.0018);assert(g.attributes.position.getY(0)<before[1]);assert.deepEqual(g.attributes.position.array.slice(9),before.slice(9));assert.deepEqual(g.index.array,idx);for(const v of g.attributes.normal.array)assert(Number.isFinite(v));
}
console.log('Tip easing bounded, lower vertex and topology preserved on both sides.');
