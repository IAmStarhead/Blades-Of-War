import * as THREE from 'three';
// Trial-only surface skirt from open reference-ear edges to the actual head.
// It overlaps the head; it is not a shared-topology weld or skinned union.
export function joinEars(rig,ears){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 head.updateMatrixWorld(true);const ray=new THREE.Raycaster(),out=[];
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,p=ear.geometry.attributes.position;
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  const edges=new Map();for(let i=0;i<p.count;i+=3)for(const [a,b] of [[i,i+1],[i+1,i+2],[i+2,i]]){
   const ka=key(a),kb=key(b),k=ka<kb?ka+'|'+kb:kb+'|'+ka;
   const e=edges.get(k);if(e)e.count++;else edges.set(k,{a,b,count:1});
  }
  function project(i){
   const y=p.getY(i),z=p.getZ(i);ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));
   const hit=ray.intersectObject(head,false)[0];if(!hit)return null;
   const x=p.getX(i);if(Math.abs(x-hit.point.x)>.025)return null;
   return new THREE.Vector3(hit.point.x+side*.00015,y,z);
  }
  let coords=[],indices=[];
  for(const e of edges.values())if(e.count===1){
   const a=new THREE.Vector3(p.getX(e.a),p.getY(e.a),p.getZ(e.a)),b=new THREE.Vector3(p.getX(e.b),p.getY(e.b),p.getZ(e.b));
   const c=project(e.a),d=project(e.b);if(!c||!d||a.distanceTo(b)>.014||(a.z+b.z)*.5<-.007)continue;
   const base=coords.length/3;for(const v of [a,b,c,d])coords.push(v.x,v.y,v.z);indices.push(base,base+1,base+2,base+1,base+3,base+2);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));geo.setIndex(indices);geo.computeVertexNormals();
  // Keep small strips lit as side-facing skin instead of letting crossed
  // winding produce random dark slashes at the attachment.
  const normals=geo.attributes.normal;for(let i=0;i<normals.count;i++)normals.setXYZ(i,side,0,0);normals.needsUpdate=true;
  const mesh=new THREE.Mesh(geo,ear.material);mesh.name='trial-ear-join';rig.headMesh.parent.add(mesh);out.push(mesh);
 }
 head.material.dispose();return out;
}
