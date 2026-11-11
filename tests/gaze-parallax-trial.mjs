import assert from 'node:assert/strict';
import {updateGazeMap} from '../src/gaze-parallax-trial/gaze.js';
const maps=Array.from({length:17},(_,i)=>({i})),rig={gazeMaps:maps,headMesh:{material:{map:null,needsUpdate:false}}};
for(const [angle,index] of [[0,8],[Math.PI/2,16],[-Math.PI/2,0],[Math.PI,8]]){updateGazeMap(rig,angle);assert.equal(rig.headMesh.material.map,maps[index]);assert(rig.headMesh.material.needsUpdate)}
console.log('Gaze study selects a bounded map for front and both profiles.');
