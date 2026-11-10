import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry,buildBaseBodyGeometry,createHumanoidSkeleton} from '../src/engine3d/bow3d/bowCharacter.js';
import {makeHeadForm} from '../src/neck-bridge-trial/base-head.js';
import {connectNeck} from '../src/neck-bridge-trial/neck-bridge.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const {metrics}=createHumanoidSkeleton(female,kingdom);
 const originalBody=buildBaseBodyGeometry(female,metrics), originalHead=buildSculptedHeadGeometry(female,false,kingdom);
 const body=originalBody.clone(),head=makeHeadForm(originalHead,female,kingdom),bodyBefore=Float32Array.from(originalBody.attributes.position.array),headBefore=Float32Array.from(originalHead.attributes.position.array);
 const oldCount=head.attributes.position.count, oldBodyIndex=body.index.count;
 connectNeck({metrics,bodyMesh:{geometry:body},headMesh:{geometry:head}},female);
 assert.deepEqual(originalBody.attributes.position.array,bodyBefore);assert.deepEqual(originalHead.attributes.position.array,headBefore);
 assert.equal(head.attributes.position.count,oldCount+65);assert(body.index.count<oldBodyIndex);
 assert([...head.attributes.position.array].every(Number.isFinite));assert([...head.attributes.normal.array].every(Number.isFinite));
 const cut=(female?1.422:1.490)*metrics.hScale;
 for(let i=0;i<65;i++)assert(Math.abs(head.attributes.position.getY(oldCount+i)+metrics.headY-cut)<1e-6);
 assert([...head.index.array].some(i=>i>=oldCount));
 body.dispose();head.dispose();originalBody.dispose();originalHead.dispose();
}
console.log('Bridge trial: isolated copies, matching neck-ring heights, finite geometry');
