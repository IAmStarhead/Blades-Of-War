import assert from 'node:assert/strict';
import {maskMaleEarGap} from '../src/male-ear-artifact-trial/mask-gap.js';
const ops=[];const context={drawImage:()=>ops.push('draw'),save(){},translate(x,y){ops.push([x,y])},scale(){},createRadialGradient(){return {addColorStop(){}}},beginPath(){},arc(){},fill(){},restore(){}};
globalThis.document={createElement:()=>({getContext:()=>context})};
const source={image:{width:512,height:512},flipY:true,clone(){return {...this}}};const rig={headMesh:{material:{map:source}}};maskMaleEarGap(rig);
assert.notEqual(rig.headMesh.material.map,source);assert.equal(source.image.width,512);assert.equal(rig.headMesh.material.map.needsUpdate,true);assert.equal(ops.filter(Array.isArray).length,2);
console.log('Gap mask is applied on an independent head map on both sides.');
