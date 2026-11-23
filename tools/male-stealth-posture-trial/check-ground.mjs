// Sample actual skinned/morphed foot vertices during crouch entry, exit,
// reversals and turns. Proximity to a flat floor is not physical contact.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=path.join(repo,'work/male-stealth-posture-trial/index.html');
const dest=path.resolve(process.argv[2]||path.join(repo,'work/male-stealth-posture-trial/ground-transitions.json'));
if(process.argv.length>3||dest===repo||(dest.startsWith(repo+path.sep)&&dest!==path.join(repo,'work/male-stealth-posture-trial/ground-transitions.json')))throw Error('Use the trial report or a path outside the repository');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(html).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true');
 const results=await page.evaluate(()=>{
  const d=demo,dt=1/60,threshold=.012,mesh=d.male.getObjectByName('NewBody'),p=mesh.geometry.attributes.position,V=d.player.position.constructor;
  const sides={L:[],R:[]};for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);if(y<.12&&Math.abs(x)>.03&&Math.abs(x)<.22)sides[x>0?'L':'R'].push(i)}
  function feet(){d.player.updateMatrixWorld(true);mesh.updateMatrixWorld(true);mesh.skeleton.update();const v=new V(),out={L:Infinity,R:Infinity};
   for(const side of ['L','R'])for(const i of sides[side]){mesh.getVertexPosition(i,v);mesh.localToWorld(v);out[side]=Math.min(out[side],v.y)}return out;}
  const specs=[
   ...['idle','walk','run'].flatMap(mode=>[{name:'enter-'+mode,mode,initial:false,action:'enter'},{name:'exit-'+mode,mode,initial:true,action:'exit'}]),
   {name:'reverse-walk',mode:'walk',initial:false,action:'reverse'},
   {name:'turn-crouched',mode:'walk',initial:true,action:'turn'},
   {name:'stop-crouched',mode:'walk',initial:true,action:'stop'},
  ],out=[];
  d.setManual(true);
  for(const s of specs){
   d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;
   if(s.mode!=='idle')d.keys.add('KeyW');if(s.mode==='run')d.keys.add('ShiftLeft');d.setCrouched(s.initial);
   for(let i=0;i<120;i++)d.step(dt);
   let minimum=Infinity,maxDeepGap=0,deepFrames=0,farFrames=0,streak=0,maxStreak=0,worst=null;
   let maxGapAll=0,farFramesAll=0,worstAll=null;
   for(let i=0;i<120;i++){
    if(i===0&&s.action==='enter')d.setCrouched(true);
    if(i===0&&s.action==='exit')d.setCrouched(false);
    if(s.action==='reverse'&&[0,12,26,40].includes(i))d.setCrouched(!d.state.crouched);
    if(s.action==='turn'&&i===0){d.keys.delete('KeyW');d.keys.add('KeyA')}
    if(s.action==='turn'&&i===60){d.keys.delete('KeyA');d.keys.add('KeyW')}
    if(s.action==='stop'&&i===0)d.keys.clear();
    d.step(dt);const low=feet(),gap=Math.min(low.L,low.R);minimum=Math.min(minimum,low.L,low.R);
    if(gap>threshold)farFramesAll++;
    if(gap>maxGapAll){maxGapAll=gap;worstAll={frame:i,seconds:(i+1)*dt,heights:low,speed:d.state.actualSpeed,crouch:d.motion.crouch};}
    if(d.motion.crouch>=.95){
     deepFrames++;if(gap>maxDeepGap){maxDeepGap=gap;worst={frame:i,seconds:(i+1)*dt,heights:low,speed:d.state.actualSpeed,crouch:d.motion.crouch};}
     if(gap>threshold){farFrames++;streak++;maxStreak=Math.max(maxStreak,streak)}else streak=0;
    }else streak=0;
   }
   out.push({name:s.name,samples:120,minimumVertexY:minimum,maxGapAll,framesWithNeitherFootWithinThreshold:farFramesAll,worstAll,
    deepFrames,maxDeepGap,deepFramesWithNeitherFootWithinThreshold:farFrames,longestSuchRunFrames:maxStreak,worst});
  }
  return {thresholdM:threshold,footVertices:{L:sides.L.length,R:sides.R.length},results:out};
 });
 assert.deepEqual(errors,[]);assert.ok(results.footVertices.L>100&&results.footVertices.R>100);
 for(const r of results.results){
  assert.ok(r.minimumVertexY>=-.0025,`${r.name}: sampled foot penetrated the rendered ground: ${r.minimumVertexY}`);
  assert.equal(r.deepFramesWithNeitherFootWithinThreshold,0,`${r.name}: both sampled feet too far above the floor in a deep crouch`);
 }
 const report={status:'measured',htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  scope:'60 Hz samples in nine flat-ground scenarios; foot-region vertices only. Near-floor is not proof of physical contact or zero sliding. Flight while running is not assessed as an error.',...results};
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
