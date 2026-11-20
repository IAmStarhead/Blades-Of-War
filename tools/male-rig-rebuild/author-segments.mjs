// Assemble an additional segmented GLB; the intact animation model is untouched.
// Caps are visible as nodes in ordinary GLB importers. In the review viewer they
// are hidden until a matching cut is selected.
import fs from 'node:fs';
import {NodeIO,Accessor} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
if(process.argv.length!==5)throw Error('Usage: node author-segments.mjs rigged.glb segments.json output.glb');
const [input,segfile,output]=process.argv.slice(2),io=new NodeIO(),doc=await io.read(input),root=doc.getRoot(),scene=root.getDefaultScene(),buffer=root.listBuffers()[0];
const body=root.listNodes().find(n=>n.getName()==='NewBody');if(!body)throw Error('Missing NewBody');
const oldMesh=body.getMesh(),skin=body.getSkin(),skinMaterial=oldMesh.listPrimitives()[0].getMaterial();
body.dispose();oldMesh.dispose();
const s=JSON.parse(fs.readFileSync(segfile,'utf8')),P=s.positions,N=s.normals,J=s.joints,W=s.weights;
const capMaterial=doc.createMaterial('Cut placeholder - non-final').setBaseColorFactor([.48,.19,.16,1]).setMetallicFactor(0).setRoughnessFactor(.9).setDoubleSided(false);
const acc=(name,type,arr)=>doc.createAccessor(name,buffer).setType(type).setArray(arr);
function mesh(name,faces,material,capNormal=null,extras={}){
 const used=[...new Set(faces.flat())].sort((a,b)=>a-b),map=new Map(used.map((x,i)=>[x,i]));
 const positions=new Float32Array(used.length*3),normals=new Float32Array(used.length*3),joints=new Uint16Array(used.length*4),weights=new Float32Array(used.length*4),indices=new Uint16Array(faces.length*3);
 used.forEach((id,i)=>{
  positions.set(P.slice(id*3,id*3+3),i*3);normals.set(capNormal || N.slice(id*3,id*3+3),i*3);
  joints.set(J.slice(id*4,id*4+4),i*4);weights.set(W.slice(id*4,id*4+4),i*4);
 });
 faces.forEach((face,i)=>indices.set(face.map(id=>map.get(id)),i*3));
 const p=doc.createPrimitive().setMaterial(material)
  .setAttribute('POSITION',acc(name+'_POSITION',Accessor.Type.VEC3,positions))
  .setAttribute('NORMAL',acc(name+'_NORMAL',Accessor.Type.VEC3,normals))
  .setAttribute('JOINTS_0',acc(name+'_JOINTS_0',Accessor.Type.VEC4,joints))
  .setAttribute('WEIGHTS_0',acc(name+'_WEIGHTS_0',Accessor.Type.VEC4,weights))
  .setIndices(acc(name+'_indices',Accessor.Type.SCALAR,indices));
 const n=doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(p)).setSkin(skin).setExtras(extras);scene.addChild(n);
}
for(const [name,faces] of Object.entries(s.parts))mesh('Part_'+name,faces,skinMaterial,null,{kind:'surface',part:name});
for(const [name,faces] of Object.entries(s.caps)){
 const match=name.match(/^(.*)_(Proximal|Distal)$/);if(!match)throw Error(name);
 const normal=s.sites[match[1]].normalTowardDistal.map(x=>match[2]==='Proximal'?x:-x);
 mesh('Cap_'+name,faces,capMaterial,normal,{kind:'cut-placeholder',site:match[1],side:match[2]});
}
await io.write(output,doc);console.log('Segmented GLB:',output,fs.statSync(output).size,'parts',Object.keys(s.parts).length,'caps',Object.keys(s.caps).length);
