import assert from 'node:assert/strict';
import * as THREE from 'three';
import {closeUpperOpening} from '../src/ear-upper-opening-order-trial/close-upper-opening.js';
for(const side of [-1,1]){
 const pos=[];for(const r of [.002,.008])for(let i=0;i<12;i++){const a=2*Math.PI*i/12;pos.push(side*(.081+r*Math.cos(a)),.097+r*.5*Math.sin(a),-.011)}
 const ind=[];for(let i=0;i<12;i++){const j=(i+1)%12;ind.push(i,12+i,12+j,i,12+j,j)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(ind);g.computeVertexNormals();const before=Array.from(g.attributes.normal.array);
 const ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};closeUpperOpening([ear]);
 assert.equal(ear.userData.upperOpeningTriangles,10);assert.equal(g.index.count,ind.length+30);assert.deepEqual(Array.from(g.attributes.position.array),Array.from(new Float32Array(pos)));assert.deepEqual(Array.from(g.attributes.normal.array),before);
 const edges=new Map();for(let i=0;i<g.index.count;i+=3)for(let j=0;j<3;j++){let a=g.index.getX(i+j),b=g.index.getX(i+(j+1)%3),k=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(k,(edges.get(k)||0)+(a<b?1:-1))}for(let i=0;i<12;i++){let j=(i+1)%12,k=i<j?`${i}:${j}`:`${j}:${i}`;assert.equal(edges.get(k),0)}
}
console.log('Compact opening triangulated with consistent boundary winding; positions and normals preserved.');
// Guard the order: the strip alters the boundary and can make the fill a no-op.
const {readFileSync}=await import('node:fs');
const study=readFileSync(new URL('../src/ear-upper-opening-order-trial/study.js',import.meta.url),'utf8');
assert(study.indexOf('closeUpperOpening(figures.male[1].trialEars)')<study.indexOf('repairUpperRoot(figures.male[1]'));
assert.equal((study.match(/closeUpperOpening\(figures\./g)||[]).length,1);
