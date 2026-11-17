// Deterministic unit test for the one round obstacle, not a physics test.
import assert from 'node:assert/strict';
import {plan,slide,segmentDistance,WELL,EXTENT} from './navigation.mjs';
let seed=0x1984;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
let detours=0,worst=Infinity;
for(let i=0;i<50000;i++){
 const start={x:(rand()-.5)*20,z:(rand()-.5)*20},end={x:(rand()-.5)*26,z:(rand()-.5)*26};
 if(Math.hypot(start.x-WELL.x,start.z-WELL.z)<WELL.radius+.003)continue;
 const path=plan(start,end);if(path.detour)detours++;
 assert.ok(path.waypoints.length>0&&path.waypoints.length<100);
 assert.ok(Math.abs(path.target.x)<=EXTENT+.1&&Math.abs(path.target.z)<=EXTENT+.1);
 let a=start;for(const point of path.waypoints){
  assert.ok(Number.isFinite(point.x)&&Number.isFinite(point.z));const d=segmentDistance(a,point);
  worst=Math.min(worst,d);assert.ok(d>=WELL.radius-1e-6,`segment through well: ${d}`);a=point;
 }
 assert.deepEqual(path.waypoints.at(-1),path.target);
 const next=slide(start,{x:(rand()-.5)*2,z:(rand()-.5)*2});
 assert.ok(Math.hypot(next.x-WELL.x,next.z-WELL.z)>=WELL.radius-1e-6);
 assert.ok(segmentDistance(start,next)>=WELL.radius-1e-6,'slide crossed the obstacle');
 assert.ok(Math.abs(next.x)<=EXTENT&&Math.abs(next.z)<=EXTENT);
}
const inside=plan({x:1,z:.15},{x:WELL.x,z:WELL.z});
assert.ok(Math.hypot(inside.target.x-WELL.x,inside.target.z-WELL.z)>=WELL.radius+.1);
assert.ok(detours>4000);console.log(`PASS: 50,000 random targets, ${detours} round-well detours; minimum path clearance ${worst.toFixed(4)} m; clamp and destination inside well`);
