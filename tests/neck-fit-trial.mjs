import assert from 'node:assert/strict';
import {buildBaseBodyGeometry,buildSculptedHeadGeometry,createHumanoidSkeleton} from '../src/engine3d/bow3d/bowCharacter.js';
import {connectNeck} from '../src/neck-fit-trial/neck-bridge.js';
for(const female of [false,true]){
 const {metrics}=createHumanoidSkeleton(female,'north');
 const original=buildBaseBodyGeometry(female,metrics),body=original.clone(),head=buildSculptedHeadGeometry(female,false,'north');
 const before=Float32Array.from(original.attributes.position.array),count=head.attributes.position.count,start=female?357:252;
 connectNeck({metrics,bodyMesh:{geometry:body},headMesh:{geometry:head}},female);
 assert.deepEqual(original.attributes.position.array,before);
 assert.equal(head.attributes.position.count,count+65);
 for(let s=0;s<=64;s++){
  const t=s*20/64,j=Math.floor(t),f=t-j,a=start+Math.min(j,20),b=start+Math.min(j+1,20);
  for(const [component,get] of [[0,'getX'],[1,'getY'],[2,'getZ']]){
   let expected=body.attributes.position[get](a)*(1-f)+body.attributes.position[get](b)*f-(component===1?metrics.headY:0);
   assert(Math.abs(head.attributes.position.array[(count+s)*3+component]-expected)<1e-6);
  }
 }
 assert([...head.attributes.position.array].every(Number.isFinite));
 for(const g of [original,body,head])g.dispose();
}
console.log('Trial bridge ring matches copied body; original remains unchanged');
