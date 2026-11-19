// Sample detailed armpit triangles, including transition and locomotion blends.
// This is a small model-specific region, not a full-body collision proof.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const input=path.resolve(process.argv[2]||path.join(root,'work/male-library-motion')),output=path.resolve(process.argv[3]||'/tmp/bow-library-armpit.json'),errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files'],protocolTimeout:180000});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(input,'index.html')).href);await page.waitForFunction('window.ready');
 const data=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes.position,ix=g.index,v=d.camera.position.clone(),P=[];for(let i=0;i<p.count;i++)P.push([p.getX(i),p.getY(i),p.getZ(i)]);
  const groups={L:[],R:[]};for(let i=0;i<ix.count;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)],pts=ids.map(j=>P[j]),ys=pts.map(a=>a[1]);if(Math.max(...ys)<1.24||Math.min(...ys)>1.54)continue;for(const [side,sign] of [['L',1],['R',-1]]){const xs=pts.map(a=>a[0]*sign);if(Math.max(...xs)>.085&&Math.min(...xs)<.38)groups[side].push(...ids)}}
  const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),local=new Map(selected.map((x,i)=>[x,i]));for(const k of Object.keys(groups))groups[k]=groups[k].map(x=>local.get(x));const states={};
  function sample(name){d.scene.updateMatrixWorld(true);m.skeleton.update();const a=new Float32Array(selected.length*3);for(let j=0;j<selected.length;j++){m.getVertexPosition(selected[j],v);a.set([v.x,v.y,v.z],3*j)}let s='',u=new Uint8Array(a.buffer);for(let k=0;k<u.length;k+=8192)s+=String.fromCharCode(...u.subarray(k,k+8192));states[name]=btoa(s)}
  for(const mode of ['walk','run','crouch']){d.reset();d.setVariant('after');d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}for(let i=0;i<96;i++){d.setPhase((i+.37)/96);sample(`${mode}-steady-${i}`)}}
  for(const mode of ['walk','run'])for(const playing of [false,true])for(const phase of [0,.25,.5,.75])for(const direction of ['enter','exit']){d.reset();d.setVariant('after');d.setMode(mode);d.setPhase(phase);d.setPlaying(playing);if(direction==='exit'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}d.setCrouched(direction==='enter');for(let k=0;k<16;k++){d.step(.05);sample(`${mode}-${playing?'playing':'paused'}-${phase}-${direction}-${k}`)}}
  for(const kind of ['idle-walk','walk-run'])for(let mix=0;mix<=10;mix++)for(let i=0;i<24;i++){
   d.reset();d.setVariant('after');d.setMode('walk');d.setPhase((i+.37)/24);
   if(kind==='idle-walk'){d.state.motionBlend=mix/10;d.state.runBlend=0}else{d.state.motionBlend=1;d.state.runBlend=mix/10}
   d.setCrouched(false);sample(`${kind}-${mix}-${i}`);
  }
  // The viewer uses the existing breathing idle, but the exported GLB also
  // contains Library_Idle. Play that clip directly rather than silently
  // testing the viewer's different idle animation under its name.
  d.reset();d.setVariant('after');for(const a of Object.values(d.actions))a.setEffectiveWeight(0);
  const clip=d.clips.get('Library_Idle'),idle=d.mixer.clipAction(clip);idle.reset().play();idle.paused=true;idle.setEffectiveWeight(1);
  for(let i=0;i<96;i++){idle.time=(i+.37)/96*clip.duration;d.mixer.update(0);sample(`library-idle-${i}`)}
  return {base:selected.flatMap(i=>P[i]),groups,states};
 });
 if(errors.length)throw Error(errors.join('; '));fs.writeFileSync(output,JSON.stringify(data));console.log('Exported',Object.keys(data.states).length,'poses,',data.base.length/3,'armpit vertices to',output);
}finally{await browser.close()}
