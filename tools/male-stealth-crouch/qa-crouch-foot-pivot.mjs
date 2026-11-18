// Sample low heel/toe patches during straight-line movement in the real viewer.
// These selected centroids are proxies, not a guarantee of exact ground contact,
// no sliding under turns/transitions, or a physics-based foot-lock system.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-stealth-crouch'));
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:960,height:700}});
const errors=[];
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});
 await page.waitForFunction('window.ready===true',{timeout:120_000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);d.setVariant('after');d.reset();d.player.position.set(6,0,5);
  d.setView('inspect');d.setYaw(0);d.player.rotation.y=0;d.setCrouched(true);d.keys.add('KeyS');
  for(let i=0;i<90;i++)d.step(1/60); // accelerate to constant .38 m/s
  const mesh=d.male.getObjectByName('head_2'),position=mesh.geometry.attributes.position,v=d.camera.position.clone();
  const ids={L:{heel:[],flat:[],toe:[]},R:{heel:[],flat:[],toe:[]}};
  for(let i=0;i<position.count;i++){
   const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
   if(Math.abs(x)<=.03||Math.abs(x)>=.22||y>=.025)continue;
   const side=x>0?'L':'R';if(z<-.065)ids[side].heel.push(i);
   if(z>.02&&z<.10)ids[side].flat.push(i);if(z>.09)ids[side].toe.push(i);
  }
  const windows={heel:[.004,.12],flat:[.15,.50],toe:[.54,.675]};
  const segments={L:{heel:[],flat:[],toe:[]},R:{heel:[],flat:[],toe:[]}},current={L:{},R:{}};
  const flush=(side,kind)=>{const c=current[side][kind];if(c?.length>=4)segments[side][kind].push(c);current[side][kind]=null};
  let minSpeed=Infinity,maxSpeed=0;
  for(let frame=0;frame<240;frame++){
   d.step(1/60);minSpeed=Math.min(minSpeed,d.state.actualSpeed);maxSpeed=Math.max(maxSpeed,d.state.actualSpeed);
   d.scene.updateMatrixWorld(true);mesh.skeleton.update();
   for(const side of ['L','R']){
    const phase=(d.state.phase+(side==='R'?.5:0))%1;
    for(const [kind,[lo,hi]] of Object.entries(windows)){
     if(phase<lo||phase>hi){flush(side,kind);continue}
     let sum=0;for(const i of ids[side][kind]){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);sum+=v.z}
     (current[side][kind]||= []).push(sum/ids[side][kind].length);
    }
   }
  }
  for(const side of ['L','R'])for(const kind of Object.keys(windows))flush(side,kind);
  const counts={},ranges={};
  for(const side of ['L','R']){
   counts[side]={};ranges[side]={};
   for(const kind of Object.keys(windows)){
    counts[side][kind]=ids[side][kind].length;
    ranges[side][kind]=segments[side][kind].map(v=>({samples:v.length,mm:1000*(Math.max(...v)-Math.min(...v))}));
   }
  }
  return {counts,minSpeed,maxSpeed,ranges};
 });
 assert.ok(Math.abs(result.minSpeed-.38)<1e-5&&Math.abs(result.maxSpeed-.38)<1e-5,'not steady straight-line crouch walking');
 for(const side of ['L','R'])for(const kind of ['heel','flat','toe']){
  assert.ok(result.counts[side][kind]>=10,'missing selected foot patch');
  assert.ok(result.ranges[side][kind].length>=2,'missing sampled support intervals');
  const max=Math.max(...result.ranges[side][kind].map(x=>x.mm));
  const tolerance={heel:3,flat:2,toe:8}[kind];
  assert.ok(max<tolerance,`${side} ${kind} selected patch moved ${max.toFixed(2)} mm`);
 }
 assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS: sampled heel, flat-foot and toe patches during steady straight-line crouch walking: '+JSON.stringify(result));
 console.log('NOTE: sampled patch centroids do not prove exact contact, or absence of sliding while turning/blending.');
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
