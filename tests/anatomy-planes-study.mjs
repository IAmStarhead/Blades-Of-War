import fs from 'node:fs';import assert from 'node:assert/strict';
const data=JSON.parse(fs.readFileSync('src/head-balance/heads.json','utf8'))['3800'];
for(const sex of ['male','female']){const {positions,indices}=data[sex];assert.equal(positions.length%3,0);assert.equal(indices.length%3,0);assert(positions.length>1000);for(const n of positions)assert(Number.isFinite(n));for(const i of indices)assert(Number.isInteger(i)&&i>=0&&i<positions.length/3);console.log(`${sex}: ${positions.length/3} vertices, ${indices.length/3} triangles`)}
