import * as THREE from 'three';
import data from './anatomical-heads.json';
// The three variants share a decimated MakeHuman mesh, not three separate sculpts.
export const STUDIES = [
  {name:'А',width: .97, jaw:.94, depth:.97},
  {name:'Б',width:1, jaw:1, depth:1},
  {name:'В',width:1.04, jaw:1.10, depth:1.03}
];
export function createHead(female, style) {
  const raw=data[female?'female':'male'];
  const scale=female ? 2.31 / (7.8665-5.72) : 1;
  const centerY=female ? (7.8665+5.72)/2 : (9.303+7)/2;
  const values=Float32Array.from(raw.positions);
  for(let i=0;i<values.length;i+=3) {
    const y=(values[i+1]-centerY)*scale;
    const jaw=Math.exp(-(((y+.52)/.39)**2));
    values[i]*=scale*style.width*(1+(style.jaw-1)*jaw);
    values[i+1]=y;
    values[i+2]=(values[i+2]-.45)*scale*style.depth;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(values,3));geometry.setIndex(raw.indices);geometry.computeVertexNormals();
  const group=new THREE.Group(); const skin=new THREE.MeshStandardMaterial({color:0xbda79a,roughness:1});
  group.add(new THREE.Mesh(geometry,skin));
  // The small globes are embedded inside the socket; the lids are on the head mesh.
  const white=new THREE.MeshStandardMaterial({color:0xc9c4bb,roughness:1});
  const iris=new THREE.MeshStandardMaterial({color:0x434946,roughness:1});
  const pupil=new THREE.MeshStandardMaterial({color:0x202322,roughness:1});
  const eyey=female?6.7949:8.2164, eyex=female?.2885:.2931, front=female?1.28:1.48;
  for(const side of [-1,1]) {
    const x=side*eyex*scale*style.width,y=(eyey-centerY)*scale,z=(front-.45)*scale*style.depth;
    const globe=new THREE.Mesh(new THREE.SphereGeometry(.13*scale,20,12),white);globe.position.set(x,y,z-.17*scale);group.add(globe);
    const disk=new THREE.Mesh(new THREE.SphereGeometry(.045*scale,16,10),iris);disk.position.set(x,y,z-.061*scale);group.add(disk);
    const p=new THREE.Mesh(new THREE.SphereGeometry(.020*scale,12,8),pupil);p.position.set(x,y,z-.023*scale);group.add(p);
  }
  return group;
}
