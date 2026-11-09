import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {blendHeadGeometry} from '../src/head-blend/blend.js';
const data=JSON.parse(fs.readFileSync('src/head-reference/anatomical-heads.json','utf8')).male;
const geometry=new THREE.BufferGeometry();
const arr=Float32Array.from(data.positions);
for(let i=0;i<arr.length;i+=3){arr[i+1]-=(9.303+7)/2;arr[i+2]-=.45;}
geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));geometry.setIndex(data.indices);geometry.computeVertexNormals();
const original=Float32Array.from(arr);blendHeadGeometry(geometry,7);
assert.equal(geometry.attributes.position.count, original.length/3);
let max=0,changed=0;
for(let i=0;i<arr.length;i++){assert.ok(Number.isFinite(arr[i]));let d=Math.abs(arr[i]-original[i]);max=Math.max(max,d);if(d>1e-6)changed++;}
assert.ok(changed>100,'smoothing actually changes the face');
assert.ok(max<.10,'displacement stays bounded');
console.log(`Head blend: ${changed} changed coordinates, max displacement ${max.toFixed(4)}`);
