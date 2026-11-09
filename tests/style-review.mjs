import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adjustFemaleVertices} from '../src/style-review/proportions.js';
for(const [name,path,expected] of [['original','src/body-study/bodies.json',16000],['trial','src/style-review/styled-bodies.json',9500]]) {
 const data=JSON.parse(fs.readFileSync(path,'utf8'));
 for(const sex of ['female','male']) {
  const {positions,indices}=data[sex];assert.equal(indices.length/3,expected);
  assert.ok(positions.every(Number.isFinite));assert.ok(indices.every(i=>i>=0&&i<positions.length/3));
  const edges=new Map();for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
   const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);
  }
  assert.ok([...edges.values()].every(n=>n===2),`${name}/${sex} is closed`);
 }
}
const female=JSON.parse(fs.readFileSync('src/body-study/bodies.json','utf8')).female;
const scale=2.31/(7.8665-5.72),center=(7.8665+5.72)/2;
const arr=Float32Array.from(female.positions);let ymin=Infinity;
for(let i=0;i<arr.length;i+=3){arr[i]*=scale;arr[i+1]=(arr[i+1]-center)*scale;arr[i+2]=(arr[i+2]-.45)*scale;ymin=Math.min(ymin,arr[i+1]);}
const before=Float32Array.from(arr);adjustFemaleVertices(arr,-ymin);
let changed=0,raise=0;for(let i=0;i<arr.length;i+=3){
 const y=before[i+1]-ymin;assert.ok(Number.isFinite(arr[i]+arr[i+1]+arr[i+2]));
 if(y<.4||y>12) assert.ok(Math.abs(arr[i+1]-before[i+1])<1e-5,'feet and upper torso retain height');
 if(Math.abs(arr[i+1]-before[i+1])>.01)changed++;
 raise=Math.max(raise,arr[i+1]-before[i+1]);
}
assert.ok(changed>100 && raise>.2 && raise<.5);
console.log('Style review: watertight meshes, female adjustment bounded, feet and upper torso retained');
