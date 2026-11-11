import * as THREE from 'three';
import {eyePatch} from './iris-adjusted.js';
// Fixed almond-shaped sclera and iris patches, parented to the head. These
// are a visual experiment, not eyeballs or animated eyelids.
export function addEyePatches(rig){
 for(const side of [-1,1]){
  const group=new THREE.Group();group.name='trial-forward-iris';
  group.position.set(side*.0328,.1000,.0875);
  group.add(eyePatch(.010,.0030,.0115,0,0xd6cec5));
  group.add(eyePatch(.0050,.0025,.0115,.00010,0x384954));
  group.add(eyePatch(.0026,.0019,.0115,.00020,0x211f1d));
  const glint=eyePatch(.00048,.00048,.0115,.00030,0xf7f2e9);
  glint.position.set(-.0009,.00055,-(.0115-Math.sqrt(.0115**2-.0009**2-.00055**2)));
  group.add(glint);rig.headMesh.add(group);
 }
}
