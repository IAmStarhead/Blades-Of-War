import assert from 'node:assert/strict';
import {createBowCharacter3D, poseBowCharacter, disposeBowCharacter} from '../src/engine3d/bow3d/bowCharacter.js';
const grad = {addColorStop(){}};
const ctx = new Proxy({}, {get:(o,k)=>o[k]||(k.startsWith('create')?()=>grad:()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const canvasFactory=(width,height)=>({width,height,getContext:()=>ctx});
for (const female of [false,true]) for (const kingdom of ['north','eden']) for (const outfit of ['underwear','villager','warrior']) {
 const rig = createBowCharacter3D({female,kingdom,outfit,canvasFactory});
 assert.equal(rig.bodyMesh.geometry,rig.bodyGeo);
 const original = rig.bodyGeo.attributes.position, fist = rig.fistGeo.attributes.position;
 let changes=0;
 for(let i=0;i<original.count;i++) {
  const changed=original.getX(i)!==fist.getX(i)||original.getY(i)!==fist.getY(i)||original.getZ(i)!==fist.getZ(i);
  if(changed){changes++; const r=rig.limbRanges; assert.ok((i>=r.armL[0]&&i<r.armL[1])||(i>=r.armR[0]&&i<r.armR[1]),'only hands change');}
 }
 assert.ok(changes>0,'fist shape must change hand geometry');
 poseBowCharacter(rig,'combat',0);assert.equal(rig.bodyMesh.geometry,rig.fistGeo);
 poseBowCharacter(rig,'idle',0);assert.equal(rig.bodyMesh.geometry,rig.bodyGeo);
 poseBowCharacter(rig,'combat',0);disposeBowCharacter(rig);
}
console.log('Hands: combat/idle switching, independent hand geometry and disposal OK');
