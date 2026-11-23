// Compare ground-near skin vertices in real, straight-line crouch movement.
// This is a geometric diagnostic, NOT a contact/force sensor or naturalness test.
// Usage: node measure-foot-contact.mjs [output.json] [trial-index.html]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const trial=path.resolve(process.argv[3]||path.join(repo,'work/male-stealth-posture-trial/index.html'));
const old=path.join(repo,'work/male-leg-human-trial/index.html');
const dest=path.resolve(process.argv[2]||path.join(repo,'work/male-stealth-posture-trial/foot-contact-report.json'));
if(process.argv.length>4||dest===repo||(dest.startsWith(repo+path.sep)&&dest!==path.join(repo,'work/male-stealth-posture-trial/foot-contact-report.json')))
  throw Error('Output must be foot-contact-report.json or a path outside the repository');
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
const errors=[];const measured={};
try{
  for(const [label,file] of [['previous',old],['trial',trial]]){
    const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.setViewport({width:800,height:600,deviceScaleFactor:1});await page.setOfflineMode(true);
    await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.ready===true',{timeout:60000});
    measured[label]=await page.evaluate(()=>{
      const d=demo,m=d.motion,dt=1/60,frames=192,threshold=.012,minimumSamples=6;
      d.setManual(true);d.reset();d.player.position.set(5,0,5);d.player.rotation.y=Math.PI;d.state.yaw=0;d.setCrouched(true);
      for(let i=0;i<120;i++)d.step(dt); // settled crouch before moving
      d.keys.add('KeyW');for(let i=0;i<120;i++)d.step(dt); // steady movement and cycle warmup
      const mesh=d.male.getObjectByName('NewBody'),rest=mesh.geometry.attributes.position,V=d.player.position.constructor;
      const sides={L:[],R:[]};
      for(let i=0;i<rest.count;i++){
        const x=rest.getX(i),y=rest.getY(i);if(y<.12&&Math.abs(x)>.03&&Math.abs(x)<.22)sides[x>0?'L':'R'].push(i);
      }
      const active={L:new Map(),R:new Map()},episodes={L:[],R:[]},minima={L:[],R:[]},floorFrames={L:0,R:0};
      let neitherNear=0,minimum=Infinity,maximumJointStep=0,wrapJointStep=0,wraps=0,lastPhase=m.crouchPhase,lastJoints=null,lastDeltas=null,maxSecondDifference=0,maximumJointSample=null;
      const speed=[],crouch=[],v=new V(),jointNames=['Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R'];
      function finish(side,id,complete){
        const e=active[side].get(id);if(!e)return;
        if(complete&&e.startFrame>0&&e.count>=minimumSamples){
          e.net=Math.hypot(e.lastX-e.startX,e.lastZ-e.startZ);e.seconds=(e.count-1)*dt;delete e.lastX;delete e.lastZ;delete e.startX;delete e.startZ;
          episodes[side].push(e);
        }
        active[side].delete(id);
      }
      for(let frame=0;frame<frames;frame++){
        d.step(dt);d.player.updateMatrixWorld(true);mesh.updateMatrixWorld(true);mesh.skeleton.update();
        speed.push(d.state.actualSpeed);crouch.push(m.crouch);
        const joints=jointNames.map(name=>d.player.worldToLocal(d.male.getObjectByName(name).getWorldPosition(new V())));
        let jointStep=0,deltas=null;
        if(lastJoints){
          deltas=joints.map((p,i)=>p.clone().sub(lastJoints[i]));
          for(let i=0;i<joints.length;i++){
            const amount=deltas[i].length();jointStep=Math.max(jointStep,amount);
            if(amount>maximumJointStep){maximumJointStep=amount;maximumJointSample={frame,phase:m.crouchPhase,joint:jointNames[i]}}
            if(lastDeltas)maxSecondDifference=Math.max(maxSecondDifference,deltas[i].clone().sub(lastDeltas[i]).length());
          }
          if(lastPhase>.9&&m.crouchPhase<.1){wraps++;wrapJointStep=Math.max(wrapJointStep,jointStep)}
        }
        lastDeltas=deltas;lastJoints=joints;lastPhase=m.crouchPhase;
        const current={};
        for(const side of ['L','R']){
          let low=Infinity;
          for(const id of sides[side]){
            mesh.getVertexPosition(id,v);mesh.localToWorld(v);low=Math.min(low,v.y);
            if(v.y<=threshold){
              const e=active[side].get(id);
              if(e){e.path+=Math.hypot(v.x-e.lastX,v.z-e.lastZ);e.lastX=v.x;e.lastZ=v.z;e.count++;e.minY=Math.min(e.minY,v.y)}
              else active[side].set(id,{vertexIndex:id,startFrame:frame,startPhase:m.crouchPhase,startX:v.x,startZ:v.z,lastX:v.x,lastZ:v.z,count:1,path:0,minY:v.y});
            }else finish(side,id,true);
          }
          current[side]=low;minima[side].push(low);minimum=Math.min(minimum,low);if(low<=threshold)floorFrames[side]++;
        }
        if(current.L>threshold&&current.R>threshold)neitherNear++;
      }
      const quantile=(arr,p)=>{if(!arr.length)return null;arr.sort((a,b)=>a-b);return arr[Math.min(arr.length-1,Math.floor(p*(arr.length-1)))]};
      const out={};
      for(const side of ['L','R']){
        const list=episodes[side],worst=list.reduce((a,b)=>!a||a.net<b.net?b:a,null);
        out[side]={sampledVertices:sides[side].length,minimumHeightM:Math.min(...minima[side]),maximumOfFrameMinimaM:Math.max(...minima[side]),
          framesWithVertexWithinThreshold:floorFrames[side],completeVertexEpisodes:list.length,
          netHorizontalM:{median:quantile(list.map(e=>e.net),.5),p90:quantile(list.map(e=>e.net),.9),max:quantile(list.map(e=>e.net),1)},
          worstEpisode:worst};
      }
      return {frames,fps:60,speedMps:{min:Math.min(...speed),max:Math.max(...speed)},crouchWeight:{min:Math.min(...crouch),max:Math.max(...crouch)},
        thresholdM:threshold,minimumSamples,frameCountNeitherFootNearGround:neitherNear,minimumVertexY:minimum,
        loopContinuity:{wraps,maximumJointStepM:maximumJointStep,maximumJointSample,maximumJointSecondDifferenceM:maxSecondDifference,maximumJointStepAtWrapM:wrapJointStep},sides:out};
    });
    await page.close();
    const r=measured[label];assert.ok(r.speedMps.min>.375&&r.speedMps.max<.385,'Straight-line gait was not steady');
    assert.ok(r.crouchWeight.min>.999,'Crouch did not settle');assert.ok(r.loopContinuity.wraps>=1,'No whole cycle sampled');
    assert.ok(r.sides.L.sampledVertices>100&&r.sides.R.sampledVertices>100,'Foot sample was empty');
    console.log(`${label}: ${r.loopContinuity.wraps} cycle wraps, near-floor vertex episodes L/R ${r.sides.L.completeVertexEpisodes}/${r.sides.R.completeVertexEpisodes}, max net movement ${r.sides.L.netHorizontalM.max?.toFixed(4)}/${r.sides.R.netHorizontalM.max?.toFixed(4)} m`);
  }
  assert.deepEqual(errors,[]);
  const report={status:'measured, not a pass/fail judgement',htmlSha256:{previous:sha(old),trial:sha(trial)},
    method:'60 Hz, straight travel at 0.38 m/s after settling and warming up. Actual morphed and skinned vertices in the rest-space foot regions, in world coordinates. A complete episode tracks the SAME vertex while y <= 0.012 m for at least 6 samples. Ground ray is y=0; rendered ground top is y=-0.002 m. Episodes touching either end of the sample are excluded.',
    limitations:'Near-floor is not known physical contact. Net horizontal travel is not a force measurement or a direct measurement of the whole foot sliding; heel-to-toe roll, clearance threshold, sampling, and vertex clustering affect it. Vertices/episodes are not independent. No foot lock is implemented. Limited straight-line sample only; no medical or naturalness claim.',results:measured};
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');console.log(`Wrote ${dest}`);
}finally{await browser.close()}
