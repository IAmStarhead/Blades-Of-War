import * as THREE from 'three';
import {MeshBVH, acceleratedRaycast} from 'three-mesh-bvh';
// Experimental boundary embedding, not a topological weld. Ear vertices stay
// attached to HEAD; a private raycast mesh uses the deformed head in rest pose.
export function fitBoundary(rig,ears){
 const head=rig.headMesh.geometry,oldTree=head.boundsTree;head.boundsTree=new MeshBVH(head,{indirect:true});const probe=new THREE.Mesh(head,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));probe.raycast=acceleratedRaycast;probe.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();ray.firstHitOnly=true;
 for(const ear of ears){const g=ear.geometry,p=g.attributes.position,idx=g.index,side=ear.name.endsWith('left')?-1:1,n=g.attributes.normal,old=n.clone(),edges=new Map(),adj=Array.from({length:p.count},()=>new Set());
  for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);for(const [u,v] of [[a,b],[b,c],[c,a]]){let key=u<v?`${u}:${v}`:`${v}:${u}`;let e=edges.get(key)||{u,v,count:0};e.count++;edges.set(key,e);adj[u].add(v);adj[v].add(u)}}
  const boundary=new Set();for(const e of edges.values())if(e.count===1){boundary.add(e.u);boundary.add(e.v)}
  // Feather the displacement into a narrow band; preserve the raised inner ear.
  let dist=new Int16Array(p.count).fill(-1),front=[...boundary];for(const i of front)dist[i]=0;
  for(let step=1;step<=3;step++){let next=[];for(const i of front)for(const j of adj[i])if(dist[j]<0){dist[j]=step;next.push(j)}front=next}
  g.computeVertexNormals();const base=g.attributes.normal.clone();let moved=0;
  for(let i=0;i<p.count;i++){
   if(dist[i]<0||dist[i]>3)continue;const x=side*p.getX(i),y=p.getY(i)+ear.position.y,z=p.getZ(i)+ear.position.z;
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(probe,false)[0];if(!hit)continue;
   const hx=Math.abs(hit.point.x),delta=x-hx;if(delta<-.002||delta>.012)continue;
   const feather=[.95,.48,.18,.04][dist[i]],goal=hx-.00035;p.setX(i,side*(x+(goal-x)*feather));moved++;
  }
  p.needsUpdate=true;g.computeVertexNormals();const n2=g.attributes.normal;for(let i=0;i<p.count;i++){let q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));q.add(new THREE.Vector3(n2.getX(i)-base.getX(i),n2.getY(i)-base.getY(i),n2.getZ(i)-base.getZ(i)).multiplyScalar(.5)).normalize();n2.setXYZ(i,q.x,q.y,q.z)}n2.needsUpdate=true;ear.userData.boundaryFitMoved=moved;
 }
 probe.material.dispose();head.boundsTree=oldTree;
}
