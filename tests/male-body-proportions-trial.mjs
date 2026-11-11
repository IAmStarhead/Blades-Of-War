import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkeleton,buildBaseBodyGeometry as oldBody,BONE_IDX} from '../src/male-body-surface-trial/body-character.js';
import {createHumanoidSkeleton as newSkeleton,buildBaseBodyGeometry as newBody} from '../src/male-body-proportions-trial/body-character.js';
for(const kingdom of ['north','eden'])for(const female of [false,true]){
 const a=oldSkeleton(female,kingdom),b=newSkeleton(female,kingdom),g=oldBody(female,a.metrics),h=newBody(female,b.metrics);
 assert.deepEqual(Array.from(g.index.array),Array.from(h.index.array));
 for(const name of ['uv','skinIndex','skinWeight'])assert.deepEqual(Array.from(g.attributes[name].array),Array.from(h.attributes[name].array));
 for(const n of ['upperArmLen','forearmLen','thighLen','shinLen','headY','neckY'])assert.equal(a.metrics[n],b.metrics[n]);
 if(female){assert.deepEqual(a.metrics,b.metrics);assert.deepEqual(Array.from(g.attributes.position.array),Array.from(h.attributes.position.array));}
 else {assert(b.metrics.shoulderX<a.metrics.shoulderX);assert(b.metrics.hipX>a.metrics.hipX);assert.equal(b.bones[BONE_IDX.UPPER_ARM_L].position.x,b.metrics.shoulderX);assert.equal(b.bones[BONE_IDX.THIGH_L].position.x,b.metrics.hipX);assert.notDeepEqual(Array.from(g.attributes.position.array),Array.from(h.attributes.position.array));}
 for(const v of h.attributes.position.array)assert(Number.isFinite(v));
}
console.log('Proportion changes male-only; limb lengths, topology, UV and weights preserved; shoulder/hip bones follow metrics.');
