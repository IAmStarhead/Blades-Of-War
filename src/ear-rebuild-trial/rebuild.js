import * as THREE from 'three';
// Build a shallow, softly coloured inner-ear surface. It conforms to the head
// under the cut-out ear, and overlaps the ear rim; it is not a topology weld.
export function rebuildConcha(rig,ears,female){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(const ear of ears){
  ear.userData.root.visible=false;
  const side=ear.name.endsWith('left')?-1:1,segments=24,rings=5;
  const cy=female?.078:.082,cz=female?-.006:-.012,ry=.0125,rz=.0095;
  const pos=[],colors=[],idx=[];
  for(let vertex=0;vertex<1+rings*segments;vertex++){
   const ring=vertex===0?0:Math.floor((vertex-1)/segments)+1, j=vertex===0?0:(vertex-1)%segments;
   const r=ring/rings,theta=j*Math.PI*2/segments;
   // An asymmetric concha rather than a circular insert.
   const y=cy+Math.sin(theta)*ry*r, z=cz+Math.cos(theta)*rz*r*(1-.12*Math.sin(theta));
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));
   const hit=ray.intersectObject(head,false)[0];
   const hx=hit?Math.abs(hit.point.x):(female?.070:.078);
   // Small relief over head: centre sits deeper than the gently raised rim.
   const x=hx+.00035+.00055*r*r;
   pos.push(side*x,y,z);
   const t=(1-r)*(1-r)*.16;colors.push(1-t*.12,1-t*.60,1-t*.62);
  }
  for(let j=0;j<segments;j++)idx.push(0,1+j,1+(j+1)%segments);
  for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++){
   let a=1+(ring-1)*segments+j,b=1+(ring-1)*segments+(j+1)%segments,c=1+ring*segments+j,d=1+ring*segments+(j+1)%segments;
   idx.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();
  const mat=ear.material.clone();mat.vertexColors=true;mat.side=THREE.DoubleSide;
  const mesh=new THREE.Mesh(g,mat);mesh.name='trial-concha-patch';ear.parent.add(mesh);ear.userData.conchaPatch=mesh;
 }
 head.material.dispose();
}
