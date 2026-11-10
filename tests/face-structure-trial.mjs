import assert from 'node:assert/strict';
import * as THREE from 'three';
import {roundEars} from '../src/face-structure-trial/ear-smooth.js';
import {reshapeFace} from '../src/face-structure-trial/structure.js';
// Closed tetrahedron is a simple manifold to exercise subdivision topology and
// interpolation of the vertex colours used by the actual ear material.
const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([1,1,1,-1,-1,1,-1,1,-1,1,-1,-1],3));g.setAttribute('color',new THREE.Float32BufferAttribute([1,.5,.5,.5,1,.5,.5,.5,1,1,1,1],3));g.setIndex([0,2,1,0,1,3,0,3,2,1,2,3]);const ear=new THREE.Mesh(g);roundEars([ear]);assert.equal(ear.geometry.index.count,48);assert.equal(ear.geometry.attributes.position.count,10);assert.equal(ear.geometry.attributes.color.count,10);for(const v of ear.geometry.attributes.normal.array)assert.ok(Number.isFinite(v));
// Mirrored UV samples remain mirrored; nose and mouth samples are untouched.
const face=new THREE.BufferGeometry();face.setAttribute('position',new THREE.Float32BufferAttribute([-.06,.08,.07,.06,.08,.07,0,.08,.1,0,.04,.1],3));face.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1,0,0,1],3));face.setAttribute('uv',new THREE.Float32BufferAttribute([.37,.45,.63,.45,.5,.48,.5,.33],2));face.setIndex([0,2,1,0,3,2,1,2,3]);const old=face.attributes.position.array.slice();reshapeFace(face,false);const p=face.attributes.position;assert.ok(Math.abs(p.getX(0)+p.getX(1))<1e-7);assert.ok(Math.abs(p.getZ(0)-p.getZ(1))<1e-7);for(let i=6;i<12;i++)assert.equal(p.array[i],old[i]);assert.ok(face.userData.structureMaxDisplacement>0);console.log('face-structure trial: topology, colors, symmetry and protected vertices passed');
