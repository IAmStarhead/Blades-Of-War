// Actual skinned foot-region vertices during steady straight walk/run cycles. This is
// a near-floor movement proxy, not a contact-force test or quality judgment.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=path.join(repo,'work/male-unarmed-combat-trial/index.html'),dest=path.resolve(process.argv[2]||path.join(repo,'work/male-unarmed-combat-trial/gait-report.json'));
if(process.argv.length>3||dest===repo||(dest.startsWith(repo+path.sep)&&dest!==path.join(repo,'work/male-unarmed-combat-trial/gait-report.json')))throw Error('Use the trial report or a path outside the repository');
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(html).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true');
 const result=await page.evaluate(()=>{
  const d=demo,dt=1/60,frames=150,threshold=.012,minimumSamples=6,mesh=d.male.getObjectByName('NewBody'),rest=mesh.geometry.attributes.position,V=d.player.position.constructor;
  const sides={L:[],R:[]};for(let i=0;i<rest.count;i++){const x=rest.getX(i),y=rest.getY(i);if(y<.12&&Math.abs(x)>.03&&Math.abs(x)<.22)sides[x>0?'L':'R'].push(i)}
  const rows=[];d.setManual(true);
  for(const mode of ['walk','run','combat'])for(let seed=0;seed<1;seed++){
    d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');if(mode==='combat')d.setFighting(true);
    for(let i=0;i<90;i++)d.step(dt);d.motion.clock.phase=(seed+.37)/8;d.motion.render({inspectTime:null});
    const active={L:new Map(),R:new Map()},episodes=[],v=new V();let minimum=Infinity;
    function finish(side,id,truncated){const e=active[side].get(id);if(!e)return;
      if(e.count>=minimumSamples){e.net=Math.hypot(e.lastX-e.startX,e.lastZ-e.startZ);e.truncated=truncated;delete e.startX;delete e.startZ;delete e.lastX;delete e.lastZ;episodes.push(e)}active[side].delete(id)}
    for(let frame=0;frame<frames;frame++){
      d.step(dt);
      d.player.updateMatrixWorld(true);mesh.updateMatrixWorld(true);mesh.skeleton.update();
      for(const side of ['L','R'])for(const id of sides[side]){
        mesh.getVertexPosition(id,v);mesh.localToWorld(v);minimum=Math.min(minimum,v.y);let e=active[side].get(id);
        if(v.y<=threshold){if(!e){e={side,vertex:id,startFrame:frame,count:0,startX:v.x,startZ:v.z,lastX:v.x,lastZ:v.z,path:0};active[side].set(id,e)}
          e.path+=Math.hypot(v.x-e.lastX,v.z-e.lastZ);e.lastX=v.x;e.lastZ=v.z;e.count++;}
        else if(e)finish(side,id,false);
      }
    }
    for(const side of ['L','R'])for(const id of [...active[side].keys()])finish(side,id,true);
    const sorted=episodes.map(e=>e.net).sort((a,b)=>a-b),q=p=>sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;
    const worst=episodes.reduce((a,e)=>!a||e.net>a.net?e:a,null);
    rows.push({mode,seed,frames,minimumVertexY:minimum,
      episodes:episodes.length,netHorizontalM:{median:q(.5),p90:q(.9),max:q(1)},worst});
  }
  return {fps:60,thresholdM:threshold,minimumSamples,footVertices:{L:sides.L.length,R:sides.R.length},rows};
 });
 assert.deepEqual(errors,[]);for(const row of result.rows){assert.ok(row.minimumVertexY>=-.0025,`${row.mode}/${row.seed}: below ground`);
  assert.ok(row.episodes>0)}
 const report={status:'measured',htmlSha256:createHash('sha256').update(fs.readFileSync(html)).digest('hex'),
  method:'Two and a half seconds at 60 Hz of steady straight walking, running and combat walking (one starting phase each). A near-floor episode follows the SAME skinned vertex while y <= 0.012 m for at least six samples; an episode still active at the end is marked truncated. Ground surface is at y=-0.002 m.',
  limitations:'Near-floor is not known physical contact. Net movement is not a force measurement or the motion of an entire foot; toe roll, threshold and correlated vertices matter. No horizontal foot lock is implemented, and blends and short/reversed routes can still slide. Does not assess all poses, surfaces or naturalness.',...result};
 fs.writeFileSync(dest,JSON.stringify(report,null,2)+'\n');console.log(`Measured ${result.rows.length} steady gaits; min Y ${Math.min(...result.rows.map(r=>r.minimumVertexY)).toFixed(4)} m; largest near-floor episode ${Math.max(...result.rows.map(r=>r.netHorizontalM.max||0)).toFixed(3)} m.`);
}finally{await browser.close()}
