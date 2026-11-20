// Assemble a separate rigged copy of the approved body with the two prior gaits.
import {Document,NodeIO,Accessor} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4} from '../male-library-motion/node_modules/three/build/three.module.js';
import fs from 'node:fs';
if(process.argv.length!==6)throw Error('Usage: node author.mjs previous.glb static.glb geometry.json output.glb');
const [previous,staticFile,geometry,output]=process.argv.slice(2),io=new NodeIO(),geom=JSON.parse(fs.readFileSync(geometry,'utf8'));
const orig=(await io.read(previous)).getRoot(),stat=(await io.read(staticFile)).getRoot();
const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('New body rig trial');doc.getRoot().setDefaultScene(scene);
const nodes=new Map(),byName=(r,n)=>{let list=r.listNodes().filter(x=>x.getName()===n);if(list.length!==1)throw Error('Expected one node '+n);return list[0]};
for(const item of geom.bones){const v=doc.createNode(item.name);nodes.set(item.name,v);const parent=item.parent?geom.bones.find(b=>b.name===item.parent):null;v.setTranslation(item.world.map((x,i)=>x-(parent?parent.world[i]:0)));if(parent)nodes.get(item.parent).addChild(v);else scene.addChild(v)}
const skin=doc.createSkin('New_body_experimental_skin').setSkeleton(nodes.get('Rig_Root'));for(const item of geom.bones)skin.addJoint(nodes.get(item.name));
const inv=new Float32Array(geom.bones.length*16);geom.bones.forEach(({world:[x,y,z]},i)=>inv.set([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1],16*i));
skin.setInverseBindMatrices(doc.createAccessor('Inverse_bind',buffer).setType(Accessor.Type.MAT4).setArray(inv));
const mats=new Map(),material=source=>{
 if(mats.has(source))return mats.get(source);
 const d=doc.createMaterial(source.getName()).setBaseColorFactor(source.getBaseColorFactor()).setMetallicFactor(source.getMetallicFactor()).setRoughnessFactor(source.getRoughnessFactor()).setDoubleSided(source.getDoubleSided()).setAlphaMode(source.getAlphaMode());
 let s=source.getBaseColorTexture();if(s){let t=doc.createTexture(s.getName()).setImage(s.getImage().slice()).setMimeType(s.getMimeType());d.setBaseColorTexture(t);const a=source.getBaseColorTextureInfo(),b=d.getBaseColorTextureInfo();b.setTexCoord(a.getTexCoord()).setMagFilter(a.getMagFilter()).setMinFilter(a.getMinFilter()).setWrapS(a.getWrapS()).setWrapT(a.getWrapT())}
 mats.set(source,d);return d;
};
const acc=(name,s)=>doc.createAccessor(name,buffer).setType(s.getType()).setArray(s.getArray().slice()).setNormalized(s.getNormalized());
function addCopy(name){
 let node=byName(stat,name),p=node.getMesh().listPrimitives()[0],q=doc.createPrimitive().setMaterial(material(p.getMaterial()));
 for(const attr of p.listSemantics())q.setAttribute(attr,acc(name+'_'+attr,p.getAttribute(attr)));
 q.setIndices(acc(name+'_indices',p.getIndices()));const n=doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(q));
 if(name==='head_1'){
  // The static face already includes its default morph. Its source skin uses
  // the first 22 joint indices, preserved in this new hierarchy.
  let old=byName(orig,name).getMesh().listPrimitives()[0],j=old.getAttribute('JOINTS_0').getArray().slice(),w=old.getAttribute('WEIGHTS_0').getArray();
  for(let i=0;i<j.length;i++)if(w[i]===0)j[i]=0;
  q.setAttribute('JOINTS_0',doc.createAccessor(name+'_JOINTS_0',buffer).setType(Accessor.Type.VEC4).setArray(j));
  q.setAttribute('WEIGHTS_0',acc(name+'_WEIGHTS_0',old.getAttribute('WEIGHTS_0')));n.setSkin(skin);scene.addChild(n);
 }else{
  let head=geom.bones.find(x=>x.name==='Rig_Head').world,world=new Matrix4().fromArray(node.getWorldMatrix()),local=new Matrix4().makeTranslation(-head[0],-head[1],-head[2]).multiply(world);
  n.setMatrix(local.elements);nodes.get('Rig_Head').addChild(n);
 }
}
addCopy('head_1');addCopy('ear-makehuman-left');addCopy('ear-makehuman-right');
function data(name,type,array){return doc.createAccessor(name,buffer).setType(type).setArray(array)}
const p=doc.createPrimitive().setMaterial(material(byName(stat,'New body and retained nape').getMesh().listPrimitives()[0].getMaterial()));
p.setAttribute('POSITION',data('body_position',Accessor.Type.VEC3,new Float32Array(geom.positions)));
p.setAttribute('NORMAL',data('body_normal',Accessor.Type.VEC3,new Float32Array(geom.normals)));
p.setAttribute('JOINTS_0',data('body_joints',Accessor.Type.VEC4,new Uint16Array(geom.joints)));
p.setAttribute('WEIGHTS_0',data('body_weights',Accessor.Type.VEC4,new Float32Array(geom.weights)));
p.setIndices(data('body_indices',Accessor.Type.SCALAR,new Uint32Array(geom.indices)));
scene.addChild(doc.createNode('NewBody').setMesh(doc.createMesh('NewBody').addPrimitive(p)).setSkin(skin));
for(const [sourceName,targetName] of [['Torso_Walk','Walk_NewBody'],['Polish_Run','Run_NewBody']]){
 const src=orig.listAnimations().find(x=>x.getName()===sourceName);if(!src)throw Error('Missing '+sourceName);const dst=doc.createAnimation(targetName);
 for(const c of src.listChannels()){
  const name=c.getTargetNode().getName(),target=c.getTargetPath();if(!nodes.has(name))continue; // old body-specific morph tracks are not transferable
  const s=c.getSampler(),a=doc.createAnimationSampler().setInput(acc(targetName+'_'+name+'_time',s.getInput())).setOutput(acc(targetName+'_'+name+'_'+target,s.getOutput())).setInterpolation(s.getInterpolation());
  dst.addSampler(a).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(name)).setTargetPath(target).setSampler(a));
 }
 if(dst.listChannels().length!==22)throw Error('Unexpected channel count '+targetName);console.log(targetName,dst.listChannels().length);
}
await io.write(output,doc);console.log(output,fs.statSync(output).size);
