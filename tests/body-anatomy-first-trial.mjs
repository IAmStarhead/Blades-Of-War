import assert from 'node:assert/strict';
import {createHumanoidSkeleton as original,buildBaseBodyGeometry as oldBody,BONE_IDX} from '../src/engine3d/bow3d/bowCharacter.js';
import {createHumanoidSkeleton as trial,buildBaseBodyGeometry as newBody} from '../src/body-anatomy-first-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const a=original(female,kingdom), b=trial(female,kingdom), ga=oldBody(female,a.metrics),gb=newBody(female,b.metrics);
 assert(b.metrics.upperArmLen<a.metrics.upperArmLen);assert(b.metrics.forearmLen<a.metrics.forearmLen);
 assert.equal(b.bones[BONE_IDX.FOREARM_L].position.y,-b.metrics.upperArmLen);assert.equal(b.bones[BONE_IDX.HAND_R].position.y,-b.metrics.forearmLen);
 assert.equal(ga.attributes.position.count,gb.attributes.position.count);assert.deepEqual(Array.from(ga.index.array),Array.from(gb.index.array));
 for(const attr of ['position','normal','skinWeight'])for(const v of gb.attributes[attr].array)assert(Number.isFinite(v));
 const w=gb.attributes.skinWeight;for(let i=0;i<w.count;i++)assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5);
 for(const [i,v] of Object.entries(ga.userData.limbRanges))assert.deepEqual(gb.userData.limbRanges[i],v);
}
console.log('Both sexes and kingdoms: shorter bones, unchanged topology, finite geometry and normalized skin weights.');
