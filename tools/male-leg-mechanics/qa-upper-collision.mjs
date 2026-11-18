// Selected upper-arm/torso surface checks. The shoulder join is excluded;
// neither enclosed volumes nor the rest of the mesh or continuous time is covered.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-leg-mechanics'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-upper-contact-')),bundle=path.join(temp,'collision.js');
execFileSync(path.join(here,'node_modules/.bin/esbuild'),[path.join(here,'qa-upper-collision-helper.mjs'),'--bundle','--format=iife','--outfile='+bundle],{stdio:'pipe'});
const errors=[];let injecting=false,ignored=0;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{
  if(injecting&&m.type()==='warn'&&m.text()==='THREE.WARNING: Multiple instances of Three.js being imported.'){ignored++;return}
  if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text());
 });
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});injecting=true;await page.addScriptTag({path:bundle});injecting=false;
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const stats=initCollision(),cycles={},blends={};
  function comparison(){
   d.setVariant('before');d.setPhase(d.state.phase);const before=testCollision();
   d.setVariant('after');d.setPhase(d.state.phase);const after=testCollision();return {before,after};
  }
  for(const mode of ['walk','run','crouch']){
   d.reset();d.setVariant('after');d.setMode(mode==='run'?'run':'walk');
   if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<12;i++)d.step(.05)}
   d.setPlaying(false);cycles[mode]=[];
   for(let i=0;i<120;i++){d.setPhase(i/120);cycles[mode].push(comparison())}
  }
  function blend(variant,sequence,phase,amount){
   d.setVariant(variant);for(const a of Object.values(d.actions))a.setEffectiveWeight(0);
   const [from,to]=sequence.split('-');
   const key=n=>n==='idle'?'softNew':n==='crouch'?(variant==='before'?'crouchWalkLast':'crouchWalk'):variant==='before'?(n==='walk'?'lastWalk':'lastRun'):n;
   for(const [n,w] of [[from,1-amount],[to,amount]]){const action=d.actions[key(n)];action.setEffectiveWeight(w);action.time=phase*action.getClip().duration}
   d.mixer.update(0);d.preventFloorPenetration();return testCollision();
  }
  for(const sequence of ['idle-walk','idle-run','walk-run','idle-crouch','walk-crouch','run-crouch']){
   blends[sequence]=[];d.reset();for(let i=0;i<24;i++)for(const w of [.2,.4,.6,.8]){
    const before=blend('before',sequence,i/24,w),after=blend('after',sequence,i/24,w);blends[sequence].push({before,after});
   }
  }
  return {stats,cycles,blends};
 });
 console.log('Selected upper-arm/torso regions: '+JSON.stringify(result.stats));
 let introduced=0;
 for(const [kind,sets] of [['cycle',result.cycles],['artificial blend',result.blends]])for(const [name,arr] of Object.entries(sets)){
  const summary={samples:arr.length,previous:0,trial:0,introduced:0,minDistance:Infinity};
  for(const pair of arr)for(const side of ['L','R']){
   if(pair.before[side].hit)summary.previous++;if(pair.after[side].hit)summary.trial++;
   if(pair.after[side].hit&&!pair.before[side].hit){summary.introduced++;introduced++}
   if(pair.after[side].dist!==null)summary.minDistance=Math.min(summary.minDistance,pair.after[side].dist);
  }
  if(!Number.isFinite(summary.minDistance))summary.minDistance=null;
  console.log(`${kind} ${name}: `+JSON.stringify(summary));
 }
 assert.equal(introduced,0,'new selected upper-arm/torso intersection');assert.deepEqual(errors,[],errors.join('\n'));
 console.log(`PASS: no newly introduced selected intersections in the sampled pairs; ${ignored} expected isolated helper warning ignored`);
 console.log('NOTE: the shoulder join, other surfaces, enclosed volumes and intermediate time are not proven collision-free.');
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
