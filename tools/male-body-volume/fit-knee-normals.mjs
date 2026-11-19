// Fit ordinary glTF normal morphs to the *posed* change of the knee surface.
// Computing their normals in the straight bind pose overstated the darkening
// in the crouch. This fits the normal change over representative crouch poses,
// preserving the authored smooth/hard-normal splits. It is an approximation;
// it does not change vertices, bone keys, or skinning.
import {Matrix3,Matrix4,Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';

export function fitKneeNormals({base,baseNormal,shaped,shapedNormal,oldPositionMorph,oldNormalMorph,indices,J,W,shapes,pose,samples,strength}){
 const count=base.length/3,groups=new Map(),id=new Int32Array(count);
 for(let i=0;i<count;i++){
  const k=3*i,key=[...Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(baseNormal.subarray(k,k+3),v=>Math.round(v*100))].join(',');
  if(!groups.has(key))groups.set(key,groups.size);id[i]=groups.get(key);
 }
 const sum=new Float64Array(count*3);let total=0;
 for(const [animation,frames] of samples)for(const frame of frames){
  const {morph,mats}=pose(animation,frame),active=morph.map((v,i)=>v?i:-1).filter(i=>i>=0);
  const before=new Float32Array(count*3),after=new Float32Array(count*3);
  for(let i=0;i<count;i++){
   const k=3*i,p=new Vector3().fromArray(shaped,k),m=new Matrix4();m.elements.fill(0);
   for(const j of active)p.addScaledVector(new Vector3().fromArray(oldPositionMorph[j],k),morph[j]);
   for(let j=0;j<4;j++){const w=W[i][j],n=J[i][j];if(w)for(let t=0;t<16;t++)m.elements[t]+=w*mats[n].elements[t]}
   p.clone().applyMatrix4(m).toArray(before,k);
   p.addScaledVector(new Vector3().fromArray(shapes[0],k),strength).addScaledVector(new Vector3().fromArray(shapes[1],k),strength).applyMatrix4(m).toArray(after,k);
  }
  const area0=new Float64Array(groups.size*3),area1=new Float64Array(groups.size*3);
  for(let n=0;n<indices.getCount();n+=3){
   const t=[0,1,2].map(j=>indices.getScalar(n+j));
   const a=t.map(i=>new Vector3().fromArray(before,3*i)),b=t.map(i=>new Vector3().fromArray(after,3*i));
   const u=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])),v=b[1].clone().sub(b[0]).cross(b[2].clone().sub(b[0]));
   for(const i of t){const k=3*id[i];area0[k]+=u.x;area0[k+1]+=u.y;area0[k+2]+=u.z;area1[k]+=v.x;area1[k+1]+=v.y;area1[k+2]+=v.z}
  }
  for(let i=0;i<count;i++){
   const k=3*i,y=base[k+1];if(y<.16||y>.78)continue;
   const a=new Vector3().fromArray(area0,3*id[i]).normalize(),b=new Vector3().fromArray(area1,3*id[i]).normalize();
   if(a.distanceToSquared(b)<1e-12)continue;
   const blended=new Matrix4();blended.elements.fill(0);
   for(let j=0;j<4;j++){const w=W[i][j],n=J[i][j];if(w)for(let t=0;t<16;t++)blended.elements[t]+=w*mats[n].elements[t]}
   const mat=new Matrix3().setFromMatrix4(blended);if(Math.abs(mat.determinant())<.06)throw Error('Degenerate normal skin blend');
   const rest=new Vector3().fromArray(shapedNormal,k);
   for(const j of active)rest.addScaledVector(new Vector3().fromArray(oldNormalMorph[j],k),morph[j]);
   const raw=rest.clone().applyMatrix3(mat),target=raw.clone().normalize().add(b.sub(a)).normalize().multiplyScalar(raw.length());
   const delta=target.applyMatrix3(mat.invert()).sub(rest).multiplyScalar(1/strength);
   if(!delta.toArray().every(Number.isFinite))throw Error('Nonfinite fitted knee normal');
   sum[k]+=delta.x;sum[k+1]+=delta.y;sum[k+2]+=delta.z;
  }
  total++;
 }
 if(total!==20)throw Error('Unexpected normal-fit sample count '+total);
 const result=[new Float32Array(count*3),new Float32Array(count*3)];let max=0,moved=0;
 for(let i=0;i<count;i++){
  const k=3*i,out=result[base[k]>=0?0:1];for(let j=0;j<3;j++)out[k+j]=sum[k+j]/total;
  const n=Math.hypot(out[k],out[k+1],out[k+2]);max=Math.max(max,n);if(n>.001)moved++;
 }
 if(max>.6||moved<250||moved>900)throw Error(`Unexpected fitted knee normals ${moved}/${max}`);
 return {normals:result,info:{samples:total,verticesOverThreshold:moved,maxDelta:max}};
}
