import assert from 'node:assert/strict';
import {createBowCharacter3D,disposeBowCharacter} from '../src/engine3d/bow3d/bowCharacter.js';
const grad={addColorStop(){}};
const ctx=new Proxy({}, {get:(o,k)=>o[k]||(k.startsWith('create')?()=>grad:()=>{}),set:(o,k,v)=>(o[k]=v,true)});
const canvasFactory=(width,height)=>({width,height,getContext:()=>ctx});
for(const female of [true,false]) for(const kingdom of ['north','eden']) for(const start of ['classic','short','long','headwear']) {
 const rig=createBowCharacter3D({female,kingdom,hairStyle:start,canvasFactory});
 assert.equal(rig.hairMesh.visible,start==='headwear');
 for(const style of ['classic','short','long','headwear','classic']) {
   rig.setHairStyle(style,canvasFactory);
   assert.equal(rig.hairMesh.visible,style==='headwear',`${kingdom} ${style}`);
 }
 disposeBowCharacter(rig);
}
console.log('Bald characters: hidden hairstyles, optional headwear and switching OK');
