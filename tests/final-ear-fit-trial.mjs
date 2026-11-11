import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitFemaleEars} from '../src/final-ear-fit-trial/female-fit.js';
const ears=[-1,1].map(side=>{const g=new THREE.BoxGeometry(.01,.02,.01);const mesh=new THREE.Mesh(g);mesh.name=side<0?'reference-ear-left':'reference-ear-right';return mesh});
const prior=ears.map(e=>({pos:e.geometry.attributes.position.array.slice(),idx:e.geometry.index.array.slice(),p:e.position.clone()}));fitFemaleEars(ears);
ears.forEach((ear,i)=>{const side=i===0?-1:1;assert(Math.abs(ear.position.x-prior[i].p.x+side*.0018)<1e-9);assert.equal(ear.position.y,prior[i].p.y);assert.equal(ear.position.z,prior[i].p.z);assert.deepEqual(ear.geometry.attributes.position.array,prior[i].pos);assert.deepEqual(ear.geometry.index.array,prior[i].idx)});
console.log('Both female ear meshes move inward equally; ear shape and triangle indices are unchanged.');
