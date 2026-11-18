// Browser-only selected lower-limb triangle test. The hip join, surfaces with
// ambiguous weights, enclosed volumes and continuous time are not covered.
import {BufferGeometry,BufferAttribute,Matrix4,Vector3,Box3} from 'three';
import {MeshBVH} from 'three-mesh-bvh';
window.initLegCollision=()=>{
 const d=window.demo,mesh=d.male.getObjectByName('head_2'),g=mesh.geometry,p=g.attributes.position,
  j=g.attributes.skinIndex,w=g.attributes.skinWeight,names=mesh.skeleton.bones.map(b=>b.name);
 const belong=Array.from({length:p.count},(_,i)=>{
  let left=0,right=0;for(let k=0;k<4;k++){
   const name=names[j.getComponent(i,k)],value=w.getComponent(i,k);
   if(/^Rig_(Thigh|Shin|Foot|Toes)_L$/.test(name))left+=value;
   if(/^Rig_(Thigh|Shin|Foot|Toes)_R$/.test(name))right+=value;
  }
  return left>.6?'L':right>.6?'R':null;
 });
 const indices={L:[],R:[]};
 for(let i=0;i<g.index.count;i+=3){
  const ids=[0,1,2].map(k=>g.index.getX(i+k));
  if(Math.max(...ids.map(n=>p.getY(n)))>=.78)continue;
  for(const side of ['L','R'])if(ids.every(n=>belong[n]===side))indices[side].push(...ids);
 }
 const selected=new Set([...indices.L,...indices.R]),a=new Float32Array(p.count*3),attr=new BufferAttribute(a,3),geo={};
 for(const i of selected){a[3*i]=p.getX(i);a[3*i+1]=p.getY(i);a[3*i+2]=p.getZ(i)}
 for(const side of ['L','R']){
  if(indices[side].length<300)throw Error('Missing selected leg triangles: '+side);
  const part=new BufferGeometry();part.setAttribute('position',attr);part.setIndex(indices[side]);
  part.boundsTree=new MeshBVH(part,{maxLeafTris:8});geo[side]=part;
 }
 const v=new Vector3(),identity=new Matrix4();
 window.testLegCollision=()=>{
  d.scene.updateMatrixWorld(true);mesh.skeleton.update();
  for(const i of selected){mesh.getVertexPosition(i,v);a[3*i]=v.x;a[3*i+1]=v.y;a[3*i+2]=v.z}
  for(const part of Object.values(geo)){part.boundsTree.refit();part.boundingBox=part.boundsTree.getBoundingBox(part.boundingBox||new Box3())}
  return {hit:geo.L.boundsTree.intersectsGeometry(geo.R,identity)};
 };
 return {vertices:selected.size,triangles:{L:indices.L.length/3,R:indices.R.length/3}};
};
