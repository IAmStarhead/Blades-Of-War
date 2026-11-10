import * as THREE from 'three';
import data from '../head-balance/heads.json';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Existing CC0 MakeHuman-derived anatomical head; not a newly sculpted head.
export function buildHead(sex,faceted=false){
 const female=sex==='female',raw=data['3800'][sex],scale=female?2.31/(7.8665-5.72):1,center=female?(7.8665+5.72)/2:(9.303+7)/2;
 let pos=Float32Array.from(raw.positions);for(let i=0;i<pos.length;i+=3){pos[i]*=scale;pos[i+1]=(pos[i+1]-center)*scale;pos[i+2]=(pos[i+2]-.45)*scale}
 let geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(raw.indices);geo.computeVertexNormals();if(faceted)geo=toCreasedNormals(geo,.85);
 const mat=new THREE.MeshStandardMaterial({color:0xbcaea4,roughness:1});const group=new THREE.Group();const mesh=new THREE.Mesh(geo,mat);group.add(mesh);
 // Plain inset eye surfaces are only clay guides, without irises or painted expression.
 const eyey=female?6.7949:8.2164, eyex=female?.2885:.2931,front=female?1.28:1.48;
 for(const s of [-1,1]){let eye=new THREE.Mesh(new THREE.SphereGeometry(.13*scale,20,12),mat);eye.position.set(s*eyex*scale,(eyey-center)*scale,(front-.45-.17)*scale);group.add(eye)}
 return group;
}
