import assert from 'node:assert/strict';
import fs from 'node:fs';
const bodies=JSON.parse(fs.readFileSync('src/body-study/bodies.json','utf8'));
for(const sex of ['female','male']) {
 const {positions,indices}=bodies[sex], count=positions.length/3;
 assert.equal(positions.length%3,0);assert.equal(indices.length%3,0);
 assert.ok(indices.length/3>=15500 && indices.length/3<=16500);
 assert.ok(positions.every(Number.isFinite));
 assert.ok(indices.every(i=>Number.isInteger(i)&&i>=0&&i<count));
 const edges=new Map();
 for(let i=0;i<indices.length;i+=3){
  const tri=indices.slice(i,i+3);assert.equal(new Set(tri).size,3);
  for(let j=0;j<3;j++){const a=tri[j],b=tri[(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
 }
 assert.ok([...edges.values()].every(v=>v===2),`${sex}: surface is closed, including neck`);
 const ys=positions.filter((_,i)=>i%3===1), height=Math.max(...ys)-Math.min(...ys);
 assert.ok(height>15 && height<18,`${sex}: bounds retain adult body scale`);
}
console.log('Body study: two closed continuous surfaces, finite geometry, expected height');
