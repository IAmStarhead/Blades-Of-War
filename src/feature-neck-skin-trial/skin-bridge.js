import * as THREE from 'three';
import {BONE_IDX} from '../engine3d/bow3d/bowCharacter.js';
import {connectNeck} from './neck-bridge.js';
// Experimental bridge only, NOT a welded single manifold mesh. Body edge has 20
// segments; bridge samples it at 64. Keep original meshes for instant comparison.
export function makeSkinnedBridge(rig,female){
 const originalBody=rig.bodyMesh.geometry, originalHead=rig.headMesh.geometry;
 rig.bodyMesh.geometry=originalBody.clone();rig.headMesh.geometry=originalHead.clone();
 connectNeck(rig,female);
 const body=rig.bodyMesh.geometry,g=rig.headMesh.geometry,p=g.attributes.position;
 const count=p.count,base=count-65,start=female?378:273;
 const bi=body.attributes.skinIndex,bw=body.attributes.skinWeight;
 const ids=new Uint16Array(count*4),weights=new Float32Array(count*4);
 for(let i=0;i<count;i++){
  p.setY(i,p.getY(i)+rig.metrics.headY);
  if(i<base){ids[4*i]=BONE_IDX.HEAD;weights[4*i]=1;}
  else {let t=(i-base)*20/64,j=Math.floor(t),f=t-j,a=start+Math.min(j,20),b=start+Math.min(j+1,20);
   // Ring weights have the same bone indices; interpolate their weights.
   for(let k=0;k<4;k++){ids[4*i+k]=bi.getComponent(a,k);weights[4*i+k]=THREE.MathUtils.lerp(bw.getComponent(a,k),bw.getComponent(b,k),f);}
  }
 }
 p.needsUpdate=true;g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
 const mesh=new THREE.SkinnedMesh(g,rig.headMesh.material.clone());mesh.frustumCulled=false;rig.group.add(mesh);mesh.bind(rig.skeleton,new THREE.Matrix4());mesh.visible=false;
 rig.headMesh.geometry=originalHead;rig.bodyMesh.geometry=originalBody;rig.bridgeTrial={mesh,body,originalBody};
}
