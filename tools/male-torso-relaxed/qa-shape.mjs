// Numerical intent/regressions in the actual offline viewer; these measurements
// complement visual review and do not prove anatomical correctness.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-torso-relaxed'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setOfflineMode(true);
 await page.goto(pathToFileURL(path.join(output,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 const data=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const body=d.male.getObjectByName('head_2'),head=d.male.getObjectByName('head_1'),g=body.geometry,old=g.attributes._torso_old_position,now=g.attributes.position,nn=g.attributes._torso_old_normal;
  const groups={chest:[],belly:[],rear:[]},lower=[],chin=[];
  for(let i=0;i<old.count;i++){
   const x=old.getX(i),y=old.getY(i),z=old.getZ(i);if(y<.65)lower.push(i);if(y>=1.5)chin.push(i);
   if(Math.abs(x)<.12&&z>.07&&nn.getZ(i)>.4){if(y>1.31&&y<1.38)groups.chest.push(i);if(y>1.13&&y<1.22)groups.belly.push(i)}
   if(Math.abs(x)>.04&&Math.abs(x)<.15&&y>.80&&y<.98&&z<-.065)groups.rear.push(i);
  }
  const surface=Object.fromEntries(Object.entries(groups).map(([key,ids])=>[key,{count:ids.length,meanZ:ids.reduce((sum,i)=>sum+now.getZ(i)-old.getZ(i),0)/ids.length}]));
  function sample(mode,variant,phase){
   d.reset();d.setVariant(variant);d.setMode(mode);d.setPhase(phase);d.scene.updateMatrixWorld(true);body.skeleton.update();
   const chest=d.male.getObjectByName('Rig_Chest'),v=d.camera.position.clone(),arms=[];
   for(const side of ['L','R']){
    const shoulder=d.male.getObjectByName('Rig_UpperArm_'+side),hand=d.male.getObjectByName('Rig_Hand_'+side),s=chest.worldToLocal(shoulder.getWorldPosition(v.clone())),h=chest.worldToLocal(hand.getWorldPosition(v.clone()));
    arms.push({outward:(side==='L'?1:-1)*(h.x-s.x),height:h.y-s.y});
   }
   const extract=(m,ids)=>{const out=[];for(const i of ids){m.getVertexPosition(i,v);out.push(v.x,v.y,v.z)}return out};
   return {arms,lower:extract(body,lower),chin:extract(body,chin),head:extract(head,Array.from({length:head.geometry.attributes.position.count},(_,i)=>i).filter(i=>i%5===0))};
  }
  let oldOut=0,newOut=0,oldY=0,newY=0,maxFoot=0,maxFace=0;
  const maxdiff=(a,b)=>{let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max};
  for(const mode of ['walk','run'])for(let i=0;i<64;i++){
   const before=sample(mode,'before',(i+.37)/64),after=sample(mode,'after',(i+.37)/64);maxFoot=Math.max(maxFoot,maxdiff(before.lower,after.lower));
   if(mode==='walk'){for(let j=0;j<2;j++){oldOut+=before.arms[j].outward;newOut+=after.arms[j].outward;oldY+=before.arms[j].height;newY+=after.arms[j].height}}
   else maxFace=Math.max(maxFace,maxdiff(before.chin,after.chin),maxdiff(before.head,after.head));
  }
  return {surface,wrists:{oldMeanOutward:oldOut/128,newMeanOutward:newOut/128,oldMeanHeight:oldY/128,newMeanHeight:newY/128},maxLowerDifference:maxFoot,maxRunFaceDifference:maxFace};
 });
 assert.deepEqual(errors,[]);for(const v of Object.values(data.surface))assert.ok(v.count>10);assert.ok(data.surface.chest.meanZ>.005&&data.surface.belly.meanZ<-.005&&data.surface.rear.meanZ<-.005,JSON.stringify(data.surface));
 assert.ok(data.wrists.newMeanOutward<data.wrists.oldMeanOutward-.015&&data.wrists.newMeanHeight<data.wrists.oldMeanHeight-.005,JSON.stringify(data.wrists));
 assert.ok(data.maxLowerDifference<1e-6&&data.maxRunFaceDifference<1e-6,JSON.stringify(data));
 console.log('PASS: anatomical intent on selected bind-space vertices, mean Z change in metres: '+JSON.stringify(data.surface));
 console.log('PASS: 64 walking phases, mean wrist position in chest coordinates (metres): '+JSON.stringify(data.wrists));
 console.log('PASS: 64 phases per cycle, sampled lower-leg positions unchanged; 64 run phases, sampled head/upper-face positions unchanged. Max difference '+Math.max(data.maxLowerDifference,data.maxRunFaceDifference));
 console.log('NOTE: measurements use selected vertices and sampled phases, not proof of attractive anatomy.');
}finally{await browser.close()}
