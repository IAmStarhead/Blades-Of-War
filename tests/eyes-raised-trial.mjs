import assert from 'node:assert/strict';
import * as THREE from 'three';
import {featureShiftY,enlargeEars} from '../src/eyes-raised-trial/retouch.js';
assert(featureShiftY(true)<0,'canvas Y decreases when raised');assert(featureShiftY(true)<featureShiftY(false));
const left=new THREE.SphereGeometry(1,12,8),right=left.clone();enlargeEars([{geometry:left}],false);enlargeEars([{geometry:right}],true);const height=g=>g.boundingBox.max.y-g.boundingBox.min.y;assert(Math.abs(height(right)/height(left)-1.23/1.14)<1e-5);console.log('Feature shift is upward and ears are enlarged on the right.');
