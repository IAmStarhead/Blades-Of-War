// Reproduce two frames from the published comparison and isolate pose,
// corrective morph and skin-weight effects. This is a diagnostic, not a fix.
// Usage: node tools/male-leg-diagnosis/diagnose.mjs /path/to/NEW-output-folder
// The output folder must be outside the repository and must not already exist.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
if(process.argv.length!==3)throw Error('Pass a new output directory outside the repository');
const output=path.resolve(process.argv[2]);
if(output===repo||output.startsWith(repo+path.sep)||fs.existsSync(output))throw Error('Output must be a new directory outside the repository');
fs.mkdirSync(output,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files={
  author:['tools/male-stealth-tuning/author-crouch.mjs','bc55697d5b2f50a53f1e375383b27276943d0c5aa6c761bb7eb48dce0bb00516'],
  currentClips:['tools/male-stealth-tuning/crouch-clips.json','b30767fdf85b9a310f837be7986f58b2f0d3667354a36e6a03b5ba961484fa38'],
  earlierClips:['tools/male-game-scene/crouch-clips.json','e7db813e8d875e29fdcfa7711ac5eceb18c23b0d4472b0c7757b653666c12ccd'],
  html:['work/male-stealth-tuning/index.html','552a72e26a33274422041cac7c584b325fb276d22e8ba5370ed1b97d8f3584b1'],
  video:['work/male-stealth-tuning/sravnenie.mp4','70db77ecf18ef7c1ea30c1d862f7e349c73694ba009135ec4096bd046f57daa8'],
  model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
};
for(const [key,[file,expected]] of Object.entries(files))if(sha(path.join(repo,file))!==expected)throw Error(`Pinned ${key} changed: ${file}`);
const replaceOnce=(text,from,to)=>{
  const first=text.indexOf(from);if(first<0||text.indexOf(from,first+from.length)>=0)throw Error(`Expected exactly one occurrence: ${from}`);
  return text.slice(0,first)+to+text.slice(first+from.length);
};
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'bow-leg-isolates-'));
const author=fs.readFileSync(path.join(repo,files.author[0]),'utf8');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
let browser;
try{
  // The shipped authoring source is not modified. A temporary copy changes
  // only the source blend factor or the stationary ankle fit. The unmodified
  // control must reproduce the shipped JSON byte for byte.
  fs.symlinkSync(path.join(repo,'tools/male-library-motion/node_modules'),path.join(scratch,'node_modules'),'dir');
  function authorVariant(label,weight,fit=true,probe=false){
    let code=replaceOnce(author,"repo=path.resolve(here,'../..')",`repo=${JSON.stringify(repo)}`);
    code=replaceOnce(code,'const SOURCE_WEIGHT=.45;',`const SOURCE_WEIGHT=${weight};`);
    if(!fit)code=replaceOnce(code,'if(oldIndex===0){','if(oldIndex===0&&false){');
    if(probe){
      const anchor='const phase=i/steps,sourcePhase=((phase+phaseOffset)%1+1)%1;pose(channels,sourceDuration*sourcePhase);';
      const extra=`
        // Measure source and *raw* retarget at the phases of the two captures,
        // then restore the ordinary authoring phase before continuing.
        if((oldIndex===0&&i===115)||(oldIndex===1&&i===20)){
          const exactPhase=oldIndex===0?0.9583333333333334:((0.1662554824561091-1/15+1)%1);
          pose(channels,sourceDuration*exactPhase);
          const result={animation:sourceName,sourcePhase:exactPhase,legs:{}};
          for(const side of ['L','R']){
            const points=(rig,names)=>names.map(n=>P(rig.bones.get(n)));
            const bend=p=>p[1].clone().sub(p[0]).normalize().angleTo(p[2].clone().sub(p[1]).normalize())*180/Math.PI;
            const s=points(S,[\`DEF-thigh.\${side}\`,\`DEF-shin.\${side}\`,\`DEF-foot.\${side}\`]);
            const t=points(T,[\`Rig_Thigh_\${side}\`,\`Rig_Shin_\${side}\`,\`Rig_Foot_\${side}\`]);
            result.legs[side]={sourceBend:bend(s),rawRetargetBend:bend(t)};
          }
          console.error('SOURCE_PROBE:'+JSON.stringify(result));
          pose(channels,sourceDuration*sourcePhase);
        }`;
      code=replaceOnce(code,anchor,anchor+extra);
    }
    const script=path.join(scratch,`${label}.mjs`),out=path.join(scratch,`${label}.json`);
    fs.writeFileSync(script,code);
    const child=spawnSync(process.execPath,[script,out],{encoding:'utf8',maxBuffer:4*1024*1024});
    if(child.error||child.status!==0)throw Error(`Variant ${label} failed: ${child.error||child.stderr}`);
    const probes=child.stderr.split('\n').filter(x=>x.startsWith('SOURCE_PROBE:')).map(x=>JSON.parse(x.slice('SOURCE_PROBE:'.length)));
    return {path:out,data:JSON.parse(fs.readFileSync(out,'utf8')),probes};
  }
  const control=authorVariant('control',.45);
  if(sha(control.path)!==files.currentClips[1])throw Error('Control did not reproduce shipped clips');
  const variants={zero:authorVariant('zero',0).data,nofit:authorVariant('nofit',.45,false).data};
  const full=authorVariant('full',1,true,true);variants.full=full.data;
  variants.old=JSON.parse(fs.readFileSync(path.join(repo,files.earlierClips[0]),'utf8'));
  if(full.probes.length!==2)throw Error('Source measurements missing');

  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
    args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:960,height:673,deviceScaleFactor:1});await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(repo,files.html[0])).href,{waitUntil:'load',timeout:60000});
  await page.waitForFunction('window.ready===true',{timeout:60000});
  await page.evaluate(sources=>{
    const d=demo,m=d.motion;d.setManual(true);d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;
    const sample=m.clips.crouchIdle,Clip=sample.constructor,Vec=sample.tracks.find(t=>t.name.endsWith('.position')).constructor,
      Quat=sample.tracks.find(t=>t.name.endsWith('.quaternion')).constructor;
    const packs={hybrid:[m.clips.crouchIdle,m.clips.crouchWalk]};
    for(const [key,pack] of Object.entries(sources))packs[key]=pack.clips.map(spec=>
      new Clip(spec.name,spec.duration,spec.tracks.map(t=>new (t.type==='vector'?Vec:Quat)(t.name,t.times,t.values))));
    window.useDiagnosticClip=key=>{
      for(let i=0;i<2;i++){
        const k=['crouchIdle','crouchWalk'][i];m.actions[k].stop();m.clips[k]=packs[key][i];
        m.actions[k]=m.mixer.clipAction(m.clips[k]).reset().play();m.actions[k].paused=true;m.actions[k].setEffectiveWeight(0);
      }
      m.render({inspectTime:null});
    };
  },variants);
  const result={schema:'bow-leg-diagnosis-v1',inputs:Object.fromEntries(Object.entries(files).map(([k,[file,hash]])=>[k,{file,sha256:hash}])),
    assumptions:{fps:30,controllerHz:60,frames:[68,293],screenshotMatching:'color-mask IoU; neighboring frames may look alike',
      variant:'0, 45, 100 percent source retarget; all are authored for this target; floor fitting remains in the variants',
      weightExperiment:'For vertices influenced by the same thigh and shin, sharpen only their ratio with p^3/(p^3+(1-p)^3), keeping their sum and other weights. Diagnostic only.'},
    sourceProbes:full.probes,frames:{}};
  for(let frame=0;frame<=293;frame++){
    const frameResult=await page.evaluate(i=>{
      const d=demo;
      if(i===24)d.setCrouched(true);if(i===72)d.setCrouched(false);if(i===93)d.keys.add('KeyW');
      if(i===135)d.keys.add('ShiftLeft');if(i===189)d.keys.delete('ShiftLeft');if(i===225)d.keys.add('ShiftLeft');if(i===255)d.setCrouched(true);
      d.player.position.set(6,0,8);d.step(1/60);d.step(1/60);if(i!==68&&i!==293)return null;
      const model=d.male,mesh=model.getObjectByName('NewBody'),geo=mesh.geometry,p=geo.attributes.position,
        j=geo.attributes.skinIndex,w=geo.attributes.skinWeight,idx=geo.index,V=d.camera.position.constructor,Q=d.camera.quaternion.constructor;
      model.updateWorldMatrix(true,true);mesh.updateMatrixWorld(true);mesh.skeleton.update();
      const names=mesh.skeleton.bones.map(b=>b.name),boneId=Object.fromEntries(names.map((b,k)=>[b,k])),
        pos=b=>b.getWorldPosition(new V()),rot=b=>b.getWorldQuaternion(new Q());
      function boneReport(){
        const report={};for(const side of ['L','R']){
          const a=model.getObjectByName('Rig_Thigh_'+side),b=model.getObjectByName('Rig_Shin_'+side),c=model.getObjectByName('Rig_Foot_'+side),A=pos(a),B=pos(b),C=pos(c);
          report[side]={thighLength:A.distanceTo(B),shinLength:B.distanceTo(C),expectedThigh:b.position.length(),expectedShin:c.position.length(),
            bendDegrees:B.clone().sub(A).normalize().angleTo(C.clone().sub(B).normalize())*180/Math.PI,
            hip:d.player.worldToLocal(A.clone()).toArray(),knee:d.player.worldToLocal(B.clone()).toArray(),ankle:d.player.worldToLocal(C.clone()).toArray(),
            morph:mesh.morphTargetInfluences[mesh.morphTargetDictionary['KneeVolume_'+side]]};
        }return report;
      }
      function influence(i,id){let v=0;for(let k=0;k<4;k++)if(j.getComponent(i,k)===id)v+=w.getComponent(i,k);return v;}
      function makeRing(y,side){
        const sign=side==='L'?1:-1,edges=new Map(),shin=boneId['Rig_Shin_'+side];
        for(let a=0;a<idx.count;a+=3){
          const tri=[idx.getX(a),idx.getX(a+1),idx.getX(a+2)];if(!tri.every(k=>p.getX(k)*sign>.015&&p.getX(k)*sign<.25))continue;
          for(let k=0;k<3;k++){
            let x=tri[k],z=tri[(k+1)%3],yx=p.getY(x),yz=p.getY(z);if((yx-y)*(yz-y)>=0)continue;
            let t=(y-yx)/(yz-yx);if(x>z){[x,z]=[z,x];t=1-t;}
            const rest=new V(p.getX(x),p.getY(x),p.getZ(x)).lerp(new V(p.getX(z),p.getY(z),p.getZ(z)),t);
            edges.set(x+','+z,{x,z,t,rest,shin:influence(x,shin)*(1-t)+influence(z,shin)*t});
          }
        }
        const pts=[...edges.values()];if(pts.length<12)throw Error('Missing material ring');
        const blend=pts.reduce((s,e)=>s+e.shin,0)/pts.length,z=pts.map(x=>x.rest.z);
        return {y,side,pts,blend,rest:Math.max(...z)-Math.min(...z)};
      }
      function width(r){
        const a=model.getObjectByName('Rig_Thigh_'+r.side),b=model.getObjectByName('Rig_Shin_'+r.side),
          axis=new V(0,0,1).applyQuaternion(rot(a)).multiplyScalar(1-r.blend).addScaledVector(new V(0,0,1).applyQuaternion(rot(b)),r.blend).normalize();
        let min=Infinity,max=-Infinity;for(const e of r.pts){
          const pa=mesh.localToWorld(mesh.getVertexPosition(e.x,new V())),pb=mesh.localToWorld(mesh.getVertexPosition(e.z,new V()));
          const v=pa.lerp(pb,e.t).dot(axis);min=Math.min(min,v);max=Math.max(max,v);
        }return max-min;
      }
      function take(angle,overlay=false,volume=true){
        d.motion.volume.setEnabled(volume);const {x,z}=d.player.position;
        if(angle==='side')d.camera.position.set(x+3.5,1.45,z);
        else if(angle==='front')d.camera.position.set(x,1.45,z-3.5);
        else d.camera.position.set(x+2.6,1.45,z-2.6);
        d.camera.lookAt(x,.88,z);d.camera.updateMatrixWorld();d.draw();
        const canvas=document.createElement('canvas');canvas.width=d.renderer.domElement.width;canvas.height=d.renderer.domElement.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(d.renderer.domElement,0,0);
        if(overlay)for(const [side,color] of [['L','#ffbf00'],['R','#32dbff']]){
          const pts=['Thigh','Shin','Foot','Toes'].map(n=>pos(model.getObjectByName('Rig_'+n+'_'+side)).project(d.camera))
            .map(v=>[(v.x+1)*canvas.width/2,(1-v.y)*canvas.height/2]);
          ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();pts.forEach((v,k)=>k?ctx.lineTo(...v):ctx.moveTo(...v));ctx.stroke();
          ctx.fillStyle=color;for(const [x,y] of pts){ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
        }
        return canvas.toDataURL('image/png');
      }
      const state={crouch:d.motion.crouch,move:d.motion.move,idleTime:d.motion.idleTime,crouchPhase:d.motion.crouchPhase,speed:d.state.actualSpeed,
        floor:{...d.motion.floor},weights:Object.fromEntries(Object.entries(d.motion.actions).map(([k,a])=>[k,a.getEffectiveWeight()]))};
      const baseline=boneReport(),rings={};
      for(const side of ['L','R'])rings[side]=[.46,.50,.5332,.56,.60].map(y=>makeRing(y,side));
      const on=Object.fromEntries(['L','R'].map(s=>[s,rings[s].map(r=>({y:r.y,rest:r.rest,width:width(r),shinBlend:r.blend}))]));
      d.motion.volume.setEnabled(false);
      const off=Object.fromEntries(['L','R'].map(s=>[s,rings[s].map(r=>({y:r.y,width:width(r)}))]));
      const images={side:take('side'),skeleton:take('side',true),three:take('three',true),noMorph:take('side',false,false)};
      d.motion.volume.setEnabled(true);
      const variantData={};
      for(const key of ['old','zero','nofit','hybrid','full']){
        window.useDiagnosticClip(key);model.updateWorldMatrix(true,true);
        variantData[key]={root:d.motion.root.position.toArray(),floor:{...d.motion.floor},bones:boneReport()};
        if(['zero','hybrid','full'].includes(key))images['pose-'+key]=take('side');
      }
      window.useDiagnosticClip('hybrid');model.updateWorldMatrix(true,true);mesh.updateMatrixWorld(true);d.motion.volume.setEnabled(true);
      // The skin attributes can be interleaved: never index .array as if it
      // were a packed four-component array. Use the attribute accessors.
      const original=new Float32Array(w.count*4),affectedSet=new Set();
      for(let v=0;v<w.count;v++)for(let k=0;k<4;k++){const x=w.getComponent(v,k);if(x<0||x>1)throw Error('Invalid skin weight');original[4*v+k]=x;}
      for(let v=0;v<w.count;v++)for(const side of ['L','R']){
        let a=0,b=0;for(let k=0;k<4;k++){if(j.getComponent(v,k)===boneId['Rig_Thigh_'+side])a+=original[4*v+k];if(j.getComponent(v,k)===boneId['Rig_Shin_'+side])b+=original[4*v+k];}
        if(a>0&&b>0)affectedSet.add(v);
      }
      // Two symmetric vertices also have a tiny opposite-leg influence. Count
      // those vertices once, while adjusting each separate weight pair.
      const affected=[...affectedSet],originalPoints=affected.map(v=>mesh.getVertexPosition(v,new V()));
      const originalBones=['L','R'].flatMap(s=>['Thigh','Shin','Foot'].map(n=>pos(model.getObjectByName('Rig_'+n+'_'+s))));
      let maxWeightChange=0,n=0,maxSumError=0;
      for(const side of ['L','R'])for(let v=0;v<w.count;v++){
        let ia=-1,ib=-1;for(let k=0;k<4;k++){const id=j.getComponent(v,k);if(id===boneId['Rig_Thigh_'+side])ia=k;if(id===boneId['Rig_Shin_'+side])ib=k;}
        if(ia<0||ib<0||!original[4*v+ia]||!original[4*v+ib])continue;
        const sum=original[4*v+ia]+original[4*v+ib],ratio=original[4*v+ib]/sum,a=ratio**3,b=(1-ratio)**3,newRatio=a/(a+b);
        w.setComponent(v,ib,sum*newRatio);w.setComponent(v,ia,sum*(1-newRatio));
        maxWeightChange=Math.max(maxWeightChange,Math.abs(w.getComponent(v,ib)-original[4*v+ib]));
        maxSumError=Math.max(maxSumError,Math.abs(w.getComponent(v,ib)+w.getComponent(v,ia)-sum));n++;
      }
      w.needsUpdate=true;const shifts=affected.map((v,k)=>mesh.getVertexPosition(v,new V()).distanceTo(originalPoints[k])).sort((a,b)=>a-b);
      const maxBonePositionDelta=Math.max(...['L','R'].flatMap((s,h)=>['Thigh','Shin','Foot'].map((n,k)=>pos(model.getObjectByName('Rig_'+n+'_'+s)).distanceTo(originalBones[h*3+k]))));
      const weightExperiment={affectedVertices:affected.length,affectedPairs:n,maxWeightChange,maxSumError,maxBonePositionDelta,meanShift:shifts.reduce((a,b)=>a+b,0)/shifts.length,
        medianShift:shifts[Math.floor(shifts.length/2)],p95Shift:shifts[Math.floor(shifts.length*.95)],maxShift:shifts.at(-1)};
      images.sharpWeights=take('side');
      for(let v=0;v<w.count;v++)for(let k=0;k<4;k++)w.setComponent(v,k,original[4*v+k]);w.needsUpdate=true;
      images.restored=take('side');
      return {frame:i,time:i/30,state,baseline,on,off,variants:variantData,weightExperiment,images};
    },frame);
    if(!frameResult)continue;
    for(const [name,data] of Object.entries(frameResult.images)){
      if(!data.startsWith('data:image/png;base64,'))throw Error('Missing rendered image');
      fs.writeFileSync(path.join(output,`frame${frame}-${name}.png`),Buffer.from(data.split(',')[1],'base64'));
    }
    if(sha(path.join(output,`frame${frame}-side.png`))!==sha(path.join(output,`frame${frame}-restored.png`)))throw Error('Weight restoration changed the scene');
    delete frameResult.images;result.frames[frame]=frameResult;
    console.log(`Captured frame ${frame} (${(frame/30).toFixed(3)} s)`);
  }
  if(errors.length)throw Error(errors.join('; '));
  for(const frame of [68,293]){
    const r=result.frames[frame];if(!r)throw Error('Missing frame');
    for(const b of Object.values(r.baseline))if(Math.abs(b.thighLength-b.expectedThigh)>1e-8||Math.abs(b.shinLength-b.expectedShin)>1e-8)throw Error('Unexpected segment length');
    if(r.weightExperiment.affectedVertices!==490||r.weightExperiment.affectedPairs!==492||r.weightExperiment.maxBonePositionDelta>1e-10||r.weightExperiment.maxSumError>1e-6)throw Error('Invalid controlled weight experiment');
    if(Math.abs(r.variants.hybrid.bones.R.bendDegrees-r.baseline.R.bendDegrees)>1e-5)throw Error('Failed to restore hybrid pose');
  }
  const measuredIdlePhase=(result.frames[68].state.idleTime%2.4)/2.4;
  const measuredWalkSourcePhase=(result.frames[293].state.crouchPhase-1/15+1)%1;
  if(Math.abs(measuredIdlePhase-full.probes[0].sourcePhase)>1e-6||Math.abs(measuredWalkSourcePhase-full.probes[1].sourcePhase)>1e-6)
    throw Error('Source probes do not correspond to the captured phases');
  fs.writeFileSync(path.join(output,'diagnosis.json'),JSON.stringify(result,null,2)+'\n');
  console.log(`Diagnostic outputs: ${output}`);
}finally{if(browser)await browser.close();fs.rmSync(scratch,{recursive:true,force:true});}
