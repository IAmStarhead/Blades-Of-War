import * as THREE from 'three';
import data from './styled-bodies.json';
import {adjustFemaleVertices} from './proportions.js';
export function adjustFemaleFigure(figure) {
 const body=figure.children[0],geometry=body.geometry.clone();
 adjustFemaleVertices(geometry.attributes.position.array,body.position.y);
 geometry.attributes.position.needsUpdate=true;geometry.computeVertexNormals();
 body.geometry.dispose();body.geometry=geometry;
 return figure;
}
// Work only on the isolated copy. Keep feet and upper torso fixed, lift the
// pelvic/upper-leg area gently; fade deformation before the arms and hands.
export function stylizeFigure(figure,female) {
 const body=figure.children[0],old=body.geometry,raw=data[female?'female':'male'];
 const scale=female?2.31/(7.8665-5.72):1;
 const centerY=female?(7.8665+5.72)/2:(9.303+7)/2;
 const v=Float32Array.from(raw.positions);let min=Infinity;
 for(let i=0;i<v.length;i+=3){v[i]*=scale;v[i+1]=(v[i+1]-centerY)*scale;v[i+2]=(v[i+2]-.45)*scale;min=Math.min(min,v[i+1]);}
 const floor=-min;
 if(female) adjustFemaleVertices(v,floor);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(v,3));geometry.setIndex(raw.indices);geometry.computeVertexNormals();
 body.geometry=geometry;body.position.y=floor;old.dispose();
 body.material=new THREE.MeshLambertMaterial({color:0xbca99d});
 // Keep the unchanged eye guides in their previous head-space position.
 return figure;
}
