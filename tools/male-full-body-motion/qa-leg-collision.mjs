// Verify selected opposite-leg surfaces in cycles, blends and real controller
// transitions. BVH surface intersection sampling cannot prove perfect contact.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..'),output=path.resolve(process.argv[2]||path.join(root,'work/male-full-body-motion'));
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-leg-collision-')),bundle=path.join(temp,'helper.js'),errors=[];let injecting=false,ignored=0;
execFileSync(path.join(here,'node_modules/.bin/esbuild'),[path.join(here,'qa-leg-collision-helper.mjs'),'--bundle','--format=iife','--outfile='+bundle],{stdio:'pipe'});
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:960,height:700}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{
  if(injecting&&m.type()==='warn'&&m.text()==='THREE.WARNING: Multiple instances of Three.js being imported.'){ignored++;return}
  if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text());
 });
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});await page.waitForFunction('window.ready===true',{timeout:120_000});
 injecting=true;await page.addScriptTag({path:bundle});injecting=false;
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const selected=initLegCollision(),samples={};
  for(const mode of ['walk','run']){
   d.reset();d.setVariant('after');d.setMode(mode);d.setPlaying(false);samples[mode]=[];
   for(let i=0;i<240;i++){d.setPhase((i+.31)/240);samples[mode].push(testLegCollision())}
  }
  d.reset();d.player.position.set(6,0,5);d.setView('inspect');d.setYaw(0);d.player.rotation.y=Math.PI;d.keys.add('KeyW');samples.transition=[];
  for(let i=0;i<270;i++){if(i===90)d.keys.add('ShiftLeft');if(i===180)d.keys.clear();d.step(1/60);samples.transition.push(testLegCollision())}
  return {selected,samples};
 });
 for(const [name,arr] of Object.entries(result.samples)){
  const hits=arr.filter(x=>x.hit).length;
  console.log(`${name}: ${arr.length} samples, ${hits} selected surface intersections`);
  assert.equal(hits,0,name+' selected leg surface intersection');
 }
 assert.deepEqual(errors,[],errors.join('\n'));console.log('PASS: selected leg surfaces '+JSON.stringify(result.selected)+`; ${ignored} isolated helper warning(s) ignored`);
 console.log('NOTE: excludes hip join, ambiguous-weight regions, enclosed volumes and intermediate time.');
}catch(e){console.error(e);process.exitCode=1}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
