import * as THREE from 'three';
import {createHead,STUDIES} from '../head-balance/head.js';
import {makeHeadForm as baseShape} from './base-head.js';
// Isolated geometry construction; the original head and game are untouched.
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
export function makeHeadForm(source,female,kingdom='north'){
 const g=baseShape(source,female,kingdom),p=g.attributes.position,uv=g.attributes.uv;
 const segs=64, main=41*65,firstEar=main+2;
 if(p.count!==firstEar+104)throw Error('unexpected head layout');
 const template=createHead(female,STUDIES[1]);
 const mesh=template.children[0], refGeo=mesh.geometry.clone();
 refGeo.applyMatrix4(new THREE.Matrix4().makeScale(female?.10:.11,.10,.10));
 refGeo.translate(0,female?.092:.096,-.008);
 const ref=new THREE.Mesh(refGeo,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
 const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),dir=new THREE.Vector3();
 ref.updateMatrixWorld();
 const deltaX=new Float32Array(main),deltaZ=new Float32Array(main);
 for(let i=0;i<main;i++){
  const v=uv.getY(i),phi=(uv.getX(i)-.5)*2*Math.PI,c=Math.cos(phi),sn=Math.sin(phi);
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
  // Transfer the broad lower-head contour sampled from an anatomical mesh,
  // retaining the original mesh, facial texture and upper cranium.
  if(v>.045&&v<.43){
   origin.set(sn,y,c-.008);dir.set(-sn,0,-c);ray.set(origin,dir);
   const hit=ray.intersectObject(ref,false)[0];
   if(hit && hit.distance<1){
    const weight=.8*smooth((v-.08)/.09)*(1-smooth((v-.28)/.14))*(1-smooth((Math.abs(phi)-1.2)/.45));
    deltaX[i]=(hit.point.x-x)*weight;deltaZ[i]=(hit.point.z-z)*weight;
   }
  }
  if(female){
   y-=.004*smooth((v-.60)/.40);
   // Narrow the high cranium and the outer lower jaw without scaling the face.
   x*=1-.055*gauss(v-.76,.20)-.035*gauss(v-.27,.09);
  }
  if(female && c>0){
   z-=.002*gauss(v-.325,.04)*gauss(phi,.28);
   // Slightly soften the forward lower chin, while retaining lip projection.
   z+=.006*gauss(v-.19,.085)*Math.pow(c,4);
   // Forehead volume above the brow without moving the eyes or head top.
   z+=.010*gauss(v-.71,.13)*Math.pow(c,4);
   // Shape a continuous bridge and a slightly clearer nose tip on this mesh.
   z+=.004*gauss(v-.465,.075)*gauss(phi,.14);
   z+=.003*gauss(v-.403,.035)*gauss(phi,.11);
  }
  p.setXYZ(i,x,y,z);
 }
 // Relax the transfer field rather than the original face, keeping the UV
 // seam periodic and leaving eye and mouth texture coordinates untouched.
 for(let pass=0;pass<4;pass++){
  const a=deltaX.slice(),b=deltaZ.slice();
  for(let r=1;r<40;r++)for(let t=0;t<64;t++){
   const i=r*65+t, prev=r*65+(t+63)%64,next=r*65+(t+1)%64;
   deltaX[i]=(a[i]*4+a[prev]+a[next]+a[i-65]+a[i+65])/8;
   deltaZ[i]=(b[i]*4+b[prev]+b[next]+b[i-65]+b[i+65])/8;
  }
  for(let r=0;r<41;r++){deltaX[r*65+64]=deltaX[r*65];deltaZ[r*65+64]=deltaZ[r*65]}
 }
 for(let i=0;i<main;i++)p.setXYZ(i,p.getX(i)+deltaX[i],p.getY(i),p.getZ(i)+deltaZ[i]);
 if(female)p.setY(main+1,p.getY(main+1)-.004);
 refGeo.dispose();ref.material.dispose();
 template.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});
 p.needsUpdate=true;g.computeVertexNormals();return g;
}
