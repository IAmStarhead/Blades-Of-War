// Structural, contact-profile and paired-cap checks on the published GLBs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from './pose.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(repo,'work/male-rig-rebuild'));
const validator=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator'),io=new NodeIO();
const digest=buffer=>createHash('sha256').update(buffer).digest('hex'),raw=a=>{assert.ok(a);const x=a.getArray();return Buffer.from(x.buffer,x.byteOffset,x.byteLength)},same=(a,b,msg)=>assert.equal(digest(raw(a)),digest(raw(b)),msg);
const near=(a,b,e=1e-6,msg='')=>assert.ok(Math.abs(a-b)<=e,`${msg}: ${a} != ${b}`);
const node=(r,n)=>{const list=r.listNodes().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]},prim=(r,n)=>node(r,n).getMesh().listPrimitives()[0];
const origBytes=fs.readFileSync(path.join(repo,'work/male-body-contour/male_body_contour.glb')),staticBytes=fs.readFileSync(path.join(repo,'work/male-static-rebuild/male_static_rebuild.glb'));
assert.equal(digest(origBytes),'db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5');
assert.equal(digest(staticBytes),'4ff3f49882d1544a856d1d9061a696e13224803fd58250782e456a3bca5982c2');
const original=(await io.readBinary(origBytes)).getRoot(),staticRoot=(await io.readBinary(staticBytes)).getRoot(),roots={};
for(const file of ['male_rig_rebuild.glb','male_cut_placeholders.glb','previous_walk_run_reference.glb']){
 const bytes=fs.readFileSync(path.join(output,file)),result=await validator.validateBytes(new Uint8Array(bytes),{uri:file,maxIssues:10000});
 if(result.issues.numErrors||result.issues.numWarnings)console.log(JSON.stringify(result.issues,null,2));
 assert.equal(result.issues.numErrors,0,file+' errors');assert.equal(result.issues.numWarnings,0,file+' warnings');
 roots[file]=(await io.readBinary(bytes)).getRoot();console.log(`PASS ${file}: glTF Validator 0 errors, 0 warnings (${result.issues.numInfos} infos)`);
}
const rig=roots['male_rig_rebuild.glb'],cut=roots['male_cut_placeholders.glb'],ref=roots['previous_walk_run_reference.glb'];
const sourceBody=prim(staticRoot,'New body and retained nape'),newBody=prim(rig,'NewBody');
for(const attr of ['POSITION','NORMAL'])same(sourceBody.getAttribute(attr),newBody.getAttribute(attr),'unchanged static body '+attr);
same(sourceBody.getIndices(),newBody.getIndices(),'unchanged static body faces');
assert.equal(newBody.getAttribute('POSITION').getCount(),14703);assert.equal(newBody.getIndices().getCount()/3,28196);
for(const attr of ['POSITION','NORMAL','TEXCOORD_0','COLOR_0'])same(prim(staticRoot,'head_1').getAttribute(attr),prim(rig,'head_1').getAttribute(attr),'retained face '+attr);
same(prim(staticRoot,'head_1').getIndices(),prim(rig,'head_1').getIndices(),'retained face indices');
assert.deepEqual(rig.listTextures().map(t=>digest(t.getImage())),staticRoot.listTextures().map(t=>digest(t.getImage())),'face texture');
for(const name of ['ear-makehuman-left','ear-makehuman-right'])node(staticRoot,name).getWorldMatrix().forEach((v,i)=>near(v,node(rig,name).getWorldMatrix()[i],1e-6,name));
const skin=rig.listSkins()[0];assert.equal(rig.listSkins().length,1);assert.equal(skin.listJoints().length,52);
const names=skin.listJoints().map(n=>n.getName());assert.deepEqual(names.slice(0,22),original.listSkins()[0].listJoints().map(n=>n.getName()));
assert.equal(names.filter(n=>n.startsWith('Rig_Finger')).length,30);
const inv=skin.getInverseBindMatrices().getArray();skin.listJoints().forEach((joint,i)=>{
 const m=new Matrix4().fromArray(joint.getWorldMatrix()).multiply(new Matrix4().fromArray(inv,i*16));
 m.elements.forEach((v,k)=>near(v,[0,5,10,15].includes(k)?1:0,2e-6,joint.getName()+' bind'));
});
for(const [root,label] of [[rig,'rig'],[cut,'cut'],[ref,'reference']])for(const n of root.listNodes().filter(n=>n.getSkin())){
 const p=n.getMesh().listPrimitives()[0],js=p.getAttribute('JOINTS_0').getArray(),ws=p.getAttribute('WEIGHTS_0').getArray(),count=n.getSkin().listJoints().length;
 for(let i=0;i<ws.length;i+=4){let total=0;for(let k=0;k<4;k++){const w=ws[i+k],j=js[i+k];assert.ok(Number.isFinite(w)&&w>=0&&j<count,`${label} ${n.getName()}`);if(w===0)assert.equal(j,0);total+=w}near(total,1,2e-6,label+' weight sum')}
}
const influenced=new Set();{const j=newBody.getAttribute('JOINTS_0').getArray(),w=newBody.getAttribute('WEIGHTS_0').getArray();for(let i=0;i<j.length;i++)if(w[i]>1e-5)influenced.add(names[j[i]])}
for(const name of names.filter(n=>n.startsWith('Rig_Finger')))assert.ok(influenced.has(name),'unweighted finger '+name);
for(const side of ['L','R']){
 for(const [a,b] of [['Rig_Thigh_','Rig_Shin_'],['Rig_Shin_','Rig_Foot_'],['Rig_UpperArm_','Rig_Forearm_'],['Rig_Forearm_','Rig_Hand_']])
  assert.ok(node(rig,a+side).getWorldTranslation()[1]>node(rig,b+side).getWorldTranslation()[1],`${a}/${b} order`);
}
console.log('PASS: exact approved body positions/normals/faces, retained face/ears, 52 joints, normalized weights and valid bind matrices');
assert.deepEqual(rig.listAnimations().map(a=>a.getName()),['Walk_NewBody','Run_NewBody']);
assert.deepEqual(cut.listAnimations().map(a=>a.getName()),['Walk_NewBody','Run_NewBody']);
for(const [root,label] of [[rig,'rig'],[cut,'cuts'],[ref,'reference']])for(const animation of root.listAnimations()){
 let duration=null;
 for(const c of animation.listChannels()){
  const input=c.getSampler().getInput().getArray(),output=c.getSampler().getOutput().getArray(),size=output.length/input.length;
  assert.equal(input[0],0,`${label} loop start`);if(duration===null)duration=input.at(-1);else assert.equal(input.at(-1),duration,`${label} common loop duration`);
  for(let k=0;k<size;k++)assert.equal(output[k],output[output.length-size+k],`${label} ${animation.getName()} ${c.getTargetNode().getName()} loop endpoint`);
 }
}
console.log('PASS: all tracks in both gaits span the same duration and match exactly at loop endpoints (rig, cuts and reference)');
const channel=(r,anim,name,target)=>r.listAnimations().find(a=>a.getName()===anim)?.listChannels().find(c=>c.getTargetNode().getName()===name&&c.getTargetPath()===target);
for(const [oldName,newName] of [['Torso_Walk','Walk_NewBody'],['Polish_Run','Run_NewBody']]){
 const src=original.listAnimations().find(a=>a.getName()===oldName),dest=rig.listAnimations().find(a=>a.getName()===newName);assert.equal(dest.listChannels().length,22);
 for(const c of dest.listChannels())if(c.getTargetPath()==='rotation'){
  const o=channel(original,oldName,c.getTargetNode().getName(),'rotation');assert.ok(o);same(o.getSampler().getInput(),c.getSampler().getInput(),'rotation times');same(o.getSampler().getOutput(),c.getSampler().getOutput(),'rotation values');
 }
 for(const c of dest.listChannels()){
  const x=channel(cut,newName,c.getTargetNode().getName(),c.getTargetPath());assert.ok(x);same(c.getSampler().getInput(),x.getSampler().getInput(),'segmented animation times');same(c.getSampler().getOutput(),x.getSampler().getOutput(),'segmented animation values');
 }
 const old=makeEvaluator(original,'head_2',oldName),fresh=makeEvaluator(rig,'NewBody',newName),tiny=makeEvaluator(ref,'head_2',oldName);
 const errors=[],heights=[],oldHeights=[];let maxReferenceError=0,maxXZError=0;
 for(let i=0;i<4096;i++){
  const t=old.duration*(i+.31)/4096,lo=Math.min(...old.lows(t)),ln=Math.min(...fresh.lows(t)),lr=Math.min(...tiny.lows(t));
  errors.push(Math.abs(lo-ln));heights.push(ln);oldHeights.push(lo);maxReferenceError=Math.max(maxReferenceError,Math.abs(lo-lr));
  const x=old.rootTranslation(t),y=fresh.rootTranslation(t);maxXZError=Math.max(maxXZError,Math.abs(x[0]-y[0]),Math.abs(x[2]-y[2]));
 }
 errors.sort((a,b)=>a-b);const max=errors.at(-1),p99=errors[Math.floor(.99*errors.length)];
 assert.ok(max<.0015,`${newName} worst sole-profile difference ${max}`);assert.ok(maxReferenceError<2e-6,`reference gait mismatch ${maxReferenceError}`);assert.ok(maxXZError<2e-6,`root XZ mismatch ${maxXZError}`);
 assert.ok(Math.min(...heights)>-.001,`${newName} floor penetration`);
 if(newName==='Run_NewBody')assert.ok(Math.max(...heights)>.09&&Math.min(...heights)<.005,'run must retain airborne and near-ground phases');
 console.log(`PASS ${newName}: 4096 off-key samples, sole profile max ${(max*1000).toFixed(3)} mm, p99 ${(p99*1000).toFixed(3)} mm; Y ${(Math.min(...heights)*1000).toFixed(2)}..${(Math.max(...heights)*1000).toFixed(2)} mm; previous-reference error ${(maxReferenceError*1000).toFixed(5)} mm`);
}
const keep=[1,2,3,4,5,10,16,17,18,19,20,21,22,23],sourceHead=prim(original,'head_2'),referenceHead=prim(ref,'head_2');
for(const s of ['POSITION','NORMAL','TEXCOORD_0','COLOR_0','WEIGHTS_0'])same(sourceHead.getAttribute(s),referenceHead.getAttribute(s),'reference '+s);
same(sourceHead.getIndices(),referenceHead.getIndices(),'reference faces');
keep.forEach((i,k)=>{const a=sourceHead.listTargets()[i],b=referenceHead.listTargets()[k];for(const s of ['POSITION','NORMAL']){const x=a.getAttribute(s),y=b.getAttribute(s);if(x||y)same(x,y,'reference morph '+i+' '+s)}});
for(const name of ['Torso_Walk','Polish_Run']){
 const src=original.listAnimations().find(a=>a.getName()===name),dst=ref.listAnimations().find(a=>a.getName()===name);assert.equal(src.listChannels().length,dst.listChannels().length);
 for(const c of src.listChannels()){
  const r=channel(ref,name,c.getTargetNode().getName(),c.getTargetPath());assert.ok(r);same(c.getSampler().getInput(),r.getSampler().getInput(),'reference times');
  if(c.getTargetPath()!=='weights')same(c.getSampler().getOutput(),r.getSampler().getOutput(),'reference track');
  else{const x=c.getSampler().getOutput().getArray(),y=r.getSampler().getOutput().getArray();for(let i=0;i<x.length/26;i++)for(let k=0;k<keep.length;k++)assert.equal(x[i*26+keep[k]],y[i*keep.length+k])}
 }
}
console.log('PASS: reference keeps the previous visible body, active morphs and both original clip tracks');
const partFor=(joint,side,half)=>{
 const x={Wrist:['Forearm','Hand'],Elbow:['Main','Forearm'],Ankle:['Shin','Foot'],Knee:['Main','Shin']}[joint][half==='Proximal'?0:1];return 'Part_'+x+(x==='Main'?'':'_'+side);
};
const attr=(p,k)=>p.getAttribute(k).getArray(),key=(array,i)=>`${array[i*3]}:${array[i*3+1]}:${array[i*3+2]}`;
for(const joint of ['Elbow','Wrist','Knee','Ankle'])for(const side of ['L','R']){
 const a=prim(cut,`Cap_${joint}_${side}_Proximal`),b=prim(cut,`Cap_${joint}_${side}_Distal`);
 for(const s of ['POSITION','JOINTS_0','WEIGHTS_0'])same(a.getAttribute(s),b.getAttribute(s),'paired cap '+s);
 const ai=a.getIndices().getArray(),bi=b.getIndices().getArray();assert.equal(ai.length,bi.length);for(let i=0;i<ai.length;i+=3)assert.deepEqual([ai[i],ai[i+1],ai[i+2]],[bi[i],bi[i+2],bi[i+1]],'opposite cap winding');
 for(const [half,p] of [['Proximal',a],['Distal',b]]){
  const surface=prim(cut,partFor(joint,side,half)),pos=attr(surface,'POSITION'),jp=attr(surface,'JOINTS_0'),wp=attr(surface,'WEIGHTS_0'),lookup=new Map();
  for(let i=0;i<pos.length/3;i++)lookup.set(key(pos,i),i);
  const cp=attr(p,'POSITION'),cj=attr(p,'JOINTS_0'),cw=attr(p,'WEIGHTS_0');
  for(let i=0;i<cp.length/3;i++){const j=lookup.get(key(cp,i));assert.notEqual(j,undefined,`${joint} ${side} ${half} missing rim`);for(let k=0;k<4;k++){assert.equal(cj[4*i+k],jp[4*j+k]);assert.equal(cw[4*i+k],wp[4*j+k])}}
 }
}
function closure(part,capNames){
 const count=new Map();for(const name of [part,...capNames]){const p=prim(cut,name),pos=attr(p,'POSITION'),idx=p.getIndices().getArray();for(let i=0;i<idx.length;i+=3)for(const [a,b] of [[idx[i],idx[i+1]],[idx[i+1],idx[i+2]],[idx[i+2],idx[i]]]){const ka=key(pos,a),kb=key(pos,b),edge=ka<kb?ka+'|'+kb:kb+'|'+ka;count.set(edge,(count.get(edge)||0)+1)}}
 return {boundary:[...count.values()].filter(x=>x===1).length,nonmanifold:[...count.values()].filter(x=>x>2).length};
}
for(const side of ['L','R'])for(const [part,caps] of [
 [`Hand_${side}`,[`Wrist_${side}_Distal`]], [`Forearm_${side}`,[`Wrist_${side}_Proximal`,`Elbow_${side}_Distal`]],
 [`Foot_${side}`,[`Ankle_${side}_Distal`]], [`Shin_${side}`,[`Ankle_${side}_Proximal`,`Knee_${side}_Distal`]],
])assert.deepEqual(closure('Part_'+part,caps.map(c=>'Cap_'+c)),{boundary:0,nonmanifold:0},part+' closure');
const mainCaps=['L','R'].flatMap(side=>[`Cap_Elbow_${side}_Proximal`,`Cap_Knee_${side}_Proximal`]);assert.deepEqual(closure('Part_Main',mainCaps),{boundary:1208,nonmanifold:0});
console.log('PASS: 8 opposite-winding cap pairs exactly match surface positions/skin weights; 8 detached segment shells close at rest. Main retains 1208 inherited head-region boundaries.');
console.log('NOTE: finite joint/collision sampling and fixed caps do not establish arbitrary-pose, runtime physics or whole-model watertightness.');
