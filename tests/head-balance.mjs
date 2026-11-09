import assert from 'node:assert/strict';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('src/head-balance/heads.json','utf8'));
for (const sex of ['female','male']) {
  let previous=0;
  for(const level of ['1600','2200','3800']) {
    const {positions,indices}=data[level][sex], tris=indices.length/3;
    assert.ok(tris>previous);previous=tris;
    assert.equal(positions.length%3,0);assert.equal(indices.length%3,0);
    assert.ok(positions.every(Number.isFinite));
    assert.ok(indices.every(i=>Number.isInteger(i)&&i>=0&&i<positions.length/3));
  }
}
console.log('Head balance: six finite valid meshes, strictly increasing triangle counts');
