import assert from 'node:assert/strict';
import fs from 'node:fs';
import {morphBody} from '../src/character-editor/morph.js';
const data=JSON.parse(fs.readFileSync('src/body-study/bodies.json','utf8'));
for(const female of [false,true]) {
 const sex=female?'female':'male',v=Float32Array.from(data[sex].positions);
 const scale=female?2.31/(7.8665-5.72):1,center=female?(7.8665+5.72)/2:(9.303+7)/2;let ymin=Infinity;
 for(let i=0;i<v.length;i+=3){v[i]*=scale;v[i+1]=(v[i+1]-center)*scale;v[i+2]=(v[i+2]-.45)*scale;ymin=Math.min(ymin,v[i+1]);}
 const identity={armLength:100,legLength:100,hipWidth:100,bust:100};
 assert.ok(morphBody(v,-ymin,female,identity).every((n,i)=>Math.abs(n-v[i])<1e-7),'100 controls retain original base');
 for(const settings of [
  {armLength:88,legLength:100,hipWidth:100,bust:110},
  {armLength:80,legLength:90,hipWidth:85,bust:85},
  {armLength:100,legLength:110,hipWidth:115,bust:130}
 ]) {
  const next=morphBody(v,-ymin,female,settings);assert.ok([...next].every(Number.isFinite));
  let min=Infinity,max=0;
  for(let i=0;i<next.length;i+=3){min=Math.min(min,next[i+1]);max=Math.max(max,Math.abs(next[i]-v[i]),Math.abs(next[i+1]-v[i+1]),Math.abs(next[i+2]-v[i+2]));}
  assert.ok(Math.abs(min-ymin)<1e-4,'feet remain grounded');assert.ok(max<1.3,'deformations bounded');
 }
}
console.log('Appearance prototype: both bases, identity, slider extremes and grounding');
