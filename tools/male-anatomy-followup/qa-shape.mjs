// Selected geometric regressions in the actual offline viewer; not an anatomy proof.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-anatomy-followup'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 const data=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const body=d.male.getObjectByName('head_2'),head=d.male.getObjectByName('head_1'),g=body.geometry,old=g.attributes._last_torso_position,now=g.attributes.position,normal=g.attributes._last_torso_normal,groups={chest:[],belly:[],rear:[]},lower=[],face=[];
  for(let i=0;i<old.count;i++){
   const x=old.getX(i),y=old.getY(i),z=old.getZ(i);if(y<.65)lower.push(i);if(y>=1.5)face.push(i);
   if(Math.abs(x)<.12&&z>.07&&normal.getZ(i)>.4){if(y>1.31&&y<1.38)groups.chest.push(i);if(y>1.13&&y<1.22)groups.belly.push(i)}
   if(Math.abs(x)>.04&&Math.abs(x)<.15&&y>.80&&y<.98&&z<-.065)groups.rear.push(i);
  }
  const surface=Object.fromEntries(Object.entries(groups).map(([k,ids])=>[k,{count:ids.length,meanZ:ids.reduce((s,i)=>s+now.getZ(i)-old.getZ(i),0)/ids.length}]));
  const maxdiff=(a,b)=>Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
  function sample(mode,variant,phase){
   d.reset();d.setVariant(variant);d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setPhase(phase);d.scene.updateMatrixWorld(true);body.skeleton.update();
   const v=d.camera.position.clone(),extract=(m,ids)=>ids.flatMap(i=>m.getVertexPosition(i,v).toArray());
   return {lower:extract(body,lower),face:extract(body,face),head:extract(head,Array.from({length:head.geometry.attributes.position.count},(_,i)=>i).filter(i=>i%5===0)),bones:d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),weights:body.morphTargetInfluences.slice()};
  }
  let delta={lower:0,face:0,head:0,bones:0,weights:0};
  for(const mode of ['walk','run','crouch'])for(let i=0;i<32;i++){
   const before=sample(mode,'before',(i+.37)/32),after=sample(mode,'after',(i+.37)/32);
   for(const k of Object.keys(delta))delta[k]=Math.max(delta[k],maxdiff(before[k],after[k]));
  }
  return {surface,delta};
 });
 assert.deepEqual(errors,[]);for(const x of Object.values(data.surface))assert.ok(x.count>10);
 assert.ok(data.surface.chest.meanZ<-.005&&data.surface.belly.meanZ>.005&&data.surface.rear.meanZ>.005,JSON.stringify(data.surface));
 for(const [k,v] of Object.entries(data.delta))assert.ok(v<2e-5,`${k} changed: ${v}`);
 console.log('PASS: selected bind-space chest, abdomen and rear mean depth changes (m) vs last trial '+JSON.stringify(data.surface));
 console.log('PASS: 32 phases each of walk, run and crouch: sampled calves/feet and face, all bones and morph weights unchanged '+JSON.stringify(data.delta));
 console.log('NOTE: region-specific averages do not measure silhouette or establish anatomical quality.');
}finally{await browser.close()}
