// Small, separate comparison reference: preserve the prior walk/run, skin,
// visible geometry and their active morphs, but omit other clips and archival
// custom attributes. The full original remains untouched.
import fs from 'node:fs';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
if(process.argv.length!==4)throw Error('Usage: node trim-reference.mjs previous.glb reference.glb');
const io=new NodeIO(),doc=await io.read(process.argv[2]),root=doc.getRoot();
const names=['Torso_Walk','Polish_Run'],body=root.listNodes().find(n=>n.getName()==='head_2'),mesh=body.getMesh(),p=mesh.listPrimitives()[0];
const targets=p.listTargets(),defaults=mesh.getWeights(),active=new Set();
defaults.forEach((w,i)=>{if(w!==0)active.add(i)});
for(const name of names){
 const a=root.listAnimations().find(x=>x.getName()===name),c=a?.listChannels().find(x=>x.getTargetNode()===body&&x.getTargetPath()==='weights');
 if(!c)throw Error('Missing original morph track '+name);const vals=c.getSampler().getOutput().getArray();
 if(vals.length%targets.length)throw Error('Unexpected morph dimensions');
 for(let i=0;i<vals.length;i++)if(vals[i]!==0)active.add(i%targets.length);
}
const keep=[...active].sort((a,b)=>a-b);
for(const name of names){
 const c=root.listAnimations().find(x=>x.getName()===name).listChannels().find(x=>x.getTargetNode()===body&&x.getTargetPath()==='weights');
 const a=c.getSampler().getOutput(),v=a.getArray(),out=new Float32Array(v.length/targets.length*keep.length);
 for(let frame=0;frame<v.length/targets.length;frame++)for(let k=0;k<keep.length;k++)out[frame*keep.length+k]=v[frame*targets.length+keep[k]];
 a.setArray(out);
}
for(let i=0;i<targets.length;i++)if(!active.has(i)){p.removeTarget(targets[i]);targets[i].dispose()}
mesh.setWeights(keep.map(i=>defaults[i]));let extra=mesh.getExtras();if(Array.isArray(extra.targetNames))mesh.setExtras({...extra,targetNames:keep.map(i=>extra.targetNames[i])});
for(const node of root.listNodes().filter(n=>n.getMesh()))for(const prim of node.getMesh().listPrimitives()){
 for(const s of prim.listSemantics())if(s.startsWith('_')||s==='COLOR_1'||s==='COLOR_2')prim.setAttribute(s,null);
 if(prim.getAttribute('JOINTS_0')){const j=prim.getAttribute('JOINTS_0').getArray(),w=prim.getAttribute('WEIGHTS_0').getArray();for(let i=0;i<j.length;i++)if(w[i]===0)j[i]=0}
}
for(const a of root.listAnimations())if(!names.includes(a.getName())){
 for(const c of a.listChannels())c.dispose();for(const s of a.listSamplers())s.dispose();a.dispose();
}
let removed=0;for(const a of root.listAccessors())if(a.listParents().every(p=>p.propertyType==='Root')){a.dispose();removed++}
await io.write(process.argv[3],doc);console.log('Reference:',fs.statSync(process.argv[3]).size,'bytes; kept morph indices',keep,'removed unused accessors',removed);
