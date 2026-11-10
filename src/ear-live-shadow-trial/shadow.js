import * as THREE from 'three';
// Soft translucent shadow projected onto the nearer head/ear surface inside
// the concha. Not a physical cavity, not a weld, and lighting-independent.
export function shadeConcha(rig,ears,female){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),segments=32,rings=6;
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,cy=female?.073:.078,cz=female?-.006:-.004,ry=.010,rz=.007;
  const pos=[],color=[],index=[];
  const earSurface=new THREE.Mesh(ear.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));earSurface.updateMatrixWorld(true);
  for(let i=0;i<1+rings*segments;i++){
   const ring=i===0?0:Math.floor((i-1)/segments)+1,j=i===0?0:(i-1)%segments,r=ring/rings,theta=j*Math.PI*2/segments;
   const y=cy+ry*r*Math.sin(theta),z=cz+rz*r*Math.cos(theta);
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(head,false)[0];
   if(!hit)throw Error('concha shadow projection missed head');
   const earHit=ray.intersectObject(earSurface,false)[0];
   const surfaceX=earHit && Math.abs(earHit.point.x)>Math.abs(hit.point.x)?earHit.point.x:hit.point.x;
   pos.push(surfaceX+side*.00045,y,z);
   const alpha=.62*(1-r*r)**2;color.push(.33,.22,.19,alpha);
  }
  for(let j=0;j<segments;j++)index.push(0,1+j,1+(j+1)%segments);
  for(let ring=1;ring<rings;ring++)for(let j=0;j<segments;j++){
   const a=1+(ring-1)*segments+j,b=1+(ring-1)*segments+(j+1)%segments,c=1+ring*segments+j,d=1+ring*segments+(j+1)%segments;index.push(a,c,b,b,c,d);
  }
  earSurface.material.dispose();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(color,4));g.setIndex(index);
  const m=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(g,m);mesh.name='trial-concha-shadow';ear.parent.add(mesh);ear.userData.shadow=mesh;
 }
 head.material.dispose();
}
