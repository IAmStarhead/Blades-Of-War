import * as THREE from 'three';
import bodies from './bodies.json';
import {createHead, STUDIES} from '../head-balance/head.js';
import {centerGaze} from '../head-gaze/gaze.js';
export function createFigure(female) {
 const raw=bodies[female?'female':'male'];const scale=female?2.31/(7.8665-5.72):1;
 const centerY=female?(7.8665+5.72)/2:(9.303+7)/2;
 const vertices=Float32Array.from(raw.positions);let minY=Infinity;
 for(let i=0;i<vertices.length;i+=3){vertices[i]*=scale;vertices[i+1]=(vertices[i+1]-centerY)*scale;vertices[i+2]=(vertices[i+2]-.45)*scale;minY=Math.min(minY,vertices[i+1]);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex(raw.indices);geometry.computeVertexNormals();
 const material=new THREE.MeshStandardMaterial({color:0xbda79a,roughness:1});
 const figure=new THREE.Group(), body=new THREE.Mesh(geometry,material);body.position.y=-minY;figure.add(body);
 // Same MakeHuman source as head B: the full surface is a single mesh, so
 // there is no severed boundary at the neck. Reuse only the eye/brow guides.
 const guides=createHead(female,STUDIES[1]);centerGaze(guides);
 const features=new THREE.Group();while(guides.children.length>1)features.add(guides.children[1]);
 features.position.y=-minY;figure.add(features);
 figure.userData={bodyTriangles:raw.indices.length/3,footY:0,headOffset:-minY};
 return figure;
}
