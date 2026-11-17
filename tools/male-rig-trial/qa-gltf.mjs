// Structural and numeric checks against the unchanged, approved nape trial.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-rig-trial'));
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const validator=req('gltf-validator');
const sha=x=>createHash('sha256').update(x).digest('hex');
const source=execFileSync('unzip',['-p',path.join(root,'work/male-nape-seam/BladesOfWar_Proba_Zatylka.zip'),'male_nape_smoothed_trial.glb'],{maxBuffer:20_000_000});
const rigged=await fs.readFile(path.join(output,'male_rig_trial.glb'));
assert.equal(sha(source),'009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(rigged)]),old=a.getRoot(),now=b.getRoot();
assert.equal(old.listSkins().length,0);assert.equal(old.listAnimations().length,0);
assert.equal(now.listSkins().length,1);const skin=now.listSkins()[0];assert.equal(skin.listJoints().length,22);
assert.equal(skin.getSkeleton().getName(),'Rig_Root');assert.equal(skin.getInverseBindMatrices().getCount(),22);
const node=(r,name)=>{const matches=r.listNodes().filter(n=>n.getName()===name);assert.equal(matches.length,1,name);return matches[0]};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
 double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
 texture:m.getBaseColorTexture()?sha(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(now.listMaterials().map(material),old.listMaterials().map(material));
assert.deepEqual(now.listTextures().map(t=>sha(t.getImage())),old.listTextures().map(t=>sha(t.getImage())));
const skinByPosition=new Map();let verticesWithWeights=0,maxWeightError=0;
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(sha(bytes(p.getIndices().getArray())),sha(bytes(q.getIndices().getArray())),name+' indices');
 for(const semantic of p.listSemantics()){
  const s=p.getAttribute(semantic),t=q.getAttribute(semantic);assert.ok(t,name+'/'+semantic);
  assert.equal(s.getCount(),t.getCount());assert.equal(s.getComponentType(),t.getComponentType());assert.equal(s.getNormalized(),t.getNormalized());
  assert.equal(sha(bytes(s.getArray())),sha(bytes(t.getArray())),name+'/'+semantic);
 }
 const skinned=name==='head_1'||name==='head_2';
 assert.deepEqual(q.listSemantics().sort(),[...p.listSemantics(),...(skinned?['JOINTS_0','WEIGHTS_0']:[])].sort());
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7,`${name} bind transform`));
 if(!skinned){assert.equal(y.getParentNode().getName(),'Rig_Head');assert.equal(y.getSkin(),null);continue}
 assert.equal(y.getSkin(),skin);const positions=q.getAttribute('POSITION'),joints=q.getAttribute('JOINTS_0'),weights=q.getAttribute('WEIGHTS_0');
 assert.equal(joints.getCount(),positions.getCount());assert.equal(weights.getCount(),positions.getCount());
 for(let i=0;i<positions.getCount();i++){
  const j=joints.getElement(i,[]),w=weights.getElement(i,[]),sum=w.reduce((a,v)=>a+v,0);
  for(let k=0;k<4;k++){assert.ok(Number.isFinite(w[k])&&w[k]>=0&&w[k]<=1);assert.ok(Number.isInteger(j[k])&&j[k]>=0&&j[k]<22)}
  const error=Math.abs(sum-1);maxWeightError=Math.max(maxWeightError,error);assert.ok(error<2e-6,`${name} unnormalized vertex ${i}`);
  assert.ok(w.some(v=>v>0));verticesWithWeights++;
  const pos=positions.getElement(i,[]),key=name+':'+pos.join(','),value=j.map((x,k)=>`${x}:${w[k]}`).join(',');
  if(skinByPosition.has(key))assert.equal(skinByPosition.get(key),value,`${name} UV/normal-split vertex weights`);else skinByPosition.set(key,value);
 }
}
console.log(`PASS: all original indices, vertex attributes, materials, textures, and bind transforms unchanged; ${verticesWithWeights} weighted vertices; max sum error ${maxWeightError}`);
console.log('PASS: duplicated seam vertices have matching weights; both ears are rigid head children');
const expected=['Idle_Breathing','Test_Arms','Test_Elbow','Test_Knee','Test_Head'];
assert.deepEqual(now.listAnimations().map(x=>x.getName()),expected);
for(const clip of now.listAnimations()){
 assert.ok(clip.listChannels().length>0);assert.equal(clip.listChannels().length,clip.listSamplers().length);
 for(const channel of clip.listChannels()){
  assert.ok(skin.listJoints().includes(channel.getTargetNode()));
  const sampler=channel.getSampler(),input=sampler.getInput(),output=sampler.getOutput(),n=input.getCount();
  assert.equal(n,21);assert.equal(output.getCount(),n);assert.equal(input.getScalar(0),0);assert.equal(input.getScalar(n-1),4);
  for(let i=1;i<n;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1));
  const first=output.getElement(0,[]),last=output.getElement(n-1,[]);assert.equal(first.length,last.length);
  first.forEach((v,i)=>assert.ok(Math.abs(v-last[i])<1e-6,`${clip.getName()} does not close`));
  if(channel.getTargetPath()==='rotation')for(let i=0;i<n;i++)assert.ok(Math.abs(Math.hypot(...output.getElement(i,[]))-1)<1e-6,'non-unit quaternion');
 }
 console.log(`PASS: ${clip.getName()} contains ${clip.listChannels().length} joint channels, 4 s, seamless endpoints`);
}
for(const [name,data] of [['source',source],['rigged',rigged]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:`${name}.glb`});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='rigged')assert.equal(report.info.animationCount,5);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos; ${report.info.totalTriangleCount} triangles`);
}
