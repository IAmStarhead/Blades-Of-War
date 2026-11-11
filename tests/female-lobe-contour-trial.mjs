import assert from 'node:assert/strict';
import * as THREE from 'three';
import {roundLobe} from '../src/female-lobe-contour-trial/round-lobe.js';
for(const side of [-1,1]){let g=new THREE.SphereGeometry(.01,32,16);g.translate(side*.075,.054,.004);let p=g.attributes.position,old=p.array.slice();roundLobe([{geometry:g}]);let changed=0;for(let i=0;i<p.count;i++){assert.equal(p.getX(i),old[3*i]);let dy=p.getY(i)-old[3*i+1],dz=p.getZ(i)-old[3*i+2];assert(dy<=1e-7&&dy>=-.001001&&dz>=-1e-7&&dz<=.004001);if(dz)changed++;for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)))}assert(changed);}
console.log('Lobe contour bounded and normals finite.');
