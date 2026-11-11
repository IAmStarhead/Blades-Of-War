import assert from 'node:assert/strict';
import * as THREE from 'three';
import {cleanLowerEdge} from '../src/female-ear-edge-cleanup-trial/edge-clean.js';
for(const side of [-1,1]){let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.070,.051,.006,side*.071,.051,.006,side*.070,.052,.007,side*.08,.06,0,side*.08,.06,.001,side*.08,.061,0],3));g.setIndex([0,1,2,3,4,5]);const before=g.attributes.position.array.slice(),ear={geometry:g,name:side<0?'reference-ear-left':'reference-ear-right',userData:{}};cleanLowerEdge([ear]);assert.equal(ear.userData.lowerEdgeRemoved,1);assert.deepEqual([...g.index.array],[3,4,5]);assert.deepEqual(g.attributes.position.array,before)}console.log('Lower-overlap trim is mirrored and preserves remaining positions.');
