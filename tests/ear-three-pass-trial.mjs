import assert from 'node:assert/strict';
import * as THREE from 'three';
import {closeInnerGap} from '../src/ear-three-pass-trial/close-inner-gap.js';
import {softenRootTips} from '../src/ear-three-pass-trial/upper-contour.js';
for(const count of [6,8])for(const side of [-1,1]){
 const vertices=[];for(const scale of [1,2])for(let j=0;j<count;j++){const a=2*Math.PI*j/count;vertices.push(side*(.078+.0075*scale*Math.cos(a)),.079+.002*scale*Math.sin(a),-.013)}
 const triangles=[];for(let i=0;i<count;i++){let j=(i+1)%count;triangles.push(i,j,count+i,j,count+j,count+i)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(triangles);g.computeVertexNormals();const before=g.attributes.position.array.slice(),ear={geometry:g,name:side<0?'reference-ear-left':'reference-ear-right',userData:{}};
 closeInnerGap([ear]);assert.equal(ear.userData.closedGapTriangles,count-2);assert.equal(g.index.count,triangles.length+3*(count-2));assert.deepEqual(g.attributes.position.array,before);
 closeInnerGap([ear]);assert.equal(ear.userData.closedGapTriangles,0);
 const index=g.index.array.slice();softenRootTips([ear],false);assert.deepEqual(g.index.array,index);for(const v of g.attributes.normal.array)assert(Number.isFinite(v));
}
console.log('Small inner loops are closed once on both sides; root smoothing preserves indices.');
