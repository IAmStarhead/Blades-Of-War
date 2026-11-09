import * as THREE from 'three';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {createFigure} from '../body-study/figure.js';
import {morphBody} from '../character-editor/morph.js';
import bodies from './body.json';
import {makeGarment} from '../angular-trial/garment.js';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
export function createAngularFigure(female) {
 const figure=createFigure(female),body=figure.children[0],raw=bodies[female?'female':'male'];
 const scale=female?2.31/(7.8665-5.72):1,centerY=female?(7.8665+5.72)/2:(9.303+7)/2;
 const v=Float32Array.from(raw.positions);let min=Infinity;
 for(let i=0;i<v.length;i+=3){v[i]*=scale;v[i+1]=(v[i+1]-centerY)*scale;v[i+2]=(v[i+2]-.45)*scale;min=Math.min(min,v[i+1]);}
 const floor=-min,settings={armLength:88,legLength:100,hipWidth:100,bust:110};
 const morphed=morphBody(v,floor,female,settings);
 const features=figure.children[1],eyeY=features.position.y+features.children[0].position.y;
 const shoulderY=female?14.05:14.25,shoulderX=female?1.5:1.7;
 for(let i=0;i<morphed.length;i+=3){
  const x=morphed[i],y=morphed[i+1]+floor,z=morphed[i+2],side=Math.sign(x),ax=Math.abs(x);
  // Relax the A-pose by rotating distal arms towards the torso; the local
  // weight fades at the shoulder and keeps thighs and torso unmoved.
  const weight=smooth((ax-shoulderX)/1.65)*smooth((y-8.5)/1.0);
  const angle=-.28*weight,dx=ax-shoulderX,dy=y-shoulderY,c=Math.cos(angle),s=Math.sin(angle);
  if(weight>0){morphed[i]=side*(shoulderX+dx*c-dy*s);morphed[i+1]=shoulderY+dx*s+dy*c-floor;}
  // A restrained upper-lid deformation, on the same surface as the head.
  const lid=gauss(ax-(female?.31:.293),.12)*gauss(y-eyeY-.055,.075)*smooth((z-.45)/.25);
  morphed[i+1]-=(female?.035:.012)*lid;
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(morphed,3));geometry.setIndex(raw.indices);geometry.computeVertexNormals();
 body.geometry.dispose();body.geometry=geometry;body.position.y=floor;
 body.material=new THREE.MeshStandardMaterial({color:0xc4a191,roughness:.96});body.castShadow=true;body.receiveShadow=true;
 // Reproject the brow guides onto the actual simplified skin surface; the
 // old guide meshes were fitted to a different mesh and could disappear.
 while(features.children.length>6) {const old=features.children[6];features.remove(old);old.geometry.dispose();}
 figure.updateMatrixWorld(true);
 const ray=new THREE.Raycaster(),browMaterial=new THREE.MeshBasicMaterial({color:0x67544a,side:THREE.DoubleSide});
 for(const side of [-1,1]) {
  const vertices=[],indices=[],steps=16;
  for(let i=0;i<=steps;i++) {
   const u=i/steps,x=side*(.16+.30*u)*scale,y=eyeY+(.115+.018*Math.sin(Math.PI*u))*scale;
   const half=(.009+.012*Math.sin(Math.PI*u))*scale;
   for(const edge of [-1,1]) {
    ray.set(new THREE.Vector3(x,y+edge*half,4),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObject(body,false)[0];
    vertices.push(x,y+edge*half-features.position.y,hit?hit.point.z+.016:1.0);
   }
   if(i<steps){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setIndex(indices);
  features.add(new THREE.Mesh(g,browMaterial));
 }
 figure.add(makeGarment(body,female,'briefs'));
 if(female) for(const part of ['top','strapL','strapR']) figure.add(makeGarment(body,female,part));
 const faceted=toCreasedNormals(geometry,0.01);body.geometry=faceted;geometry.dispose();
 figure.userData={...figure.userData,trial:'angular-static',bodyTriangles:raw.indices.length/3};
 return figure;
}
