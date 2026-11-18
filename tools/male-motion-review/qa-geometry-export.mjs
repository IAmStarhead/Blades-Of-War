// Export selected posed vertices from the actual offline viewer for FCL QA.
// Output is scratch data, not an asset. Sampling is not a proof of no contacts.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const pp=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const directory=path.resolve(process.argv[2]||path.join(root,'work/male-motion-review'));
const output=path.resolve(process.argv[3]||path.join(os.tmpdir(),'bow-motion-review-geometry-samples.json'));
const browser=await pp.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files'],protocolTimeout:180000});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(path.join(directory,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const out=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes.position,index=g.index,v=d.camera.position.clone(),states={};
  const P=[];for(let i=0;i<p.count;i++)P.push([p.getX(i),p.getY(i),p.getZ(i)]);
  // Broad bind-space subsets. A hip set covers the crotch and upper thighs;
  // separate hand and lower-body sets test contact with nonadjacent surfaces.
  const groups={hip:[],body:[],left:[],right:[]};
  for(let i=0;i<index.count;i+=3){
   const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)],pts=ids.map(k=>P[k]),mean=k=>pts.reduce((a,x)=>a+x[k],0)/3,x=mean(0),y=mean(1);
   if(Math.max(...pts.map(a=>a[1]))>.55&&Math.min(...pts.map(a=>a[1]))<1.05&&Math.min(...pts.map(a=>Math.abs(a[0])))<.23)groups.hip.push(...ids);
   if(Math.abs(x)<.205&&y>.55&&y<1.05)groups.body.push(...ids);
   if(x>.20&&y>.75&&y<.995)groups.left.push(...ids);
   if(x<-.20&&y>.75&&y<.995)groups.right.push(...ids);
  }
  const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),local=new Map(selected.map((x,i)=>[x,i]));
  for(const k of Object.keys(groups))groups[k]=groups[k].map(x=>local.get(x));
  function sample(name){
   d.scene.updateMatrixWorld(true);m.skeleton.update();const arr=new Float32Array(selected.length*3);
   for(let j=0;j<selected.length;j++){m.getVertexPosition(selected[j],v);arr.set([v.x,v.y,v.z],3*j)}
   const bytes=new Uint8Array(arr.buffer);let str='';for(let k=0;k<bytes.length;k+=8192)str+=String.fromCharCode(...bytes.subarray(k,k+8192));
   states[name]={binary:btoa(str),crouch:d.state.crouchBlend,phase:d.state.phase,morph:m.morphTargetInfluences.slice(10),floor:d.state.floorCorrection,ik:d.state.footIK};
  }
  for(const mode of ['walk','run'])for(const variant of ['before','after']){
   d.reset();d.setVariant(variant);d.setMode(mode);const N=48;
   for(let i=0;i<N;i++){d.setPhase(i/N);sample(`${mode}-${variant}-${i}`)}
  }
  for(const variant of ['before','after']){d.reset();d.setVariant(variant);d.setMode('walk');d.setCrouched(true);for(let i=0;i<15;i++)d.step(.05);
   for(let i=0;i<48;i++){d.setPhase(i/48);sample(`crouchwalk-${variant}-${i}`)}
  }
  d.reset();d.setCrouched(true);for(let i=0;i<15;i++)d.step(.05);for(let i=0;i<12;i++){d.step(.05);sample(`crouchidle-${i}`)}
  // Entry/exit from running, walking in control, and stationary idle. Test
  // several starting phases; the real vertical floor guard runs on each step.
  for(const mode of ['control','run','idle'])for(const start of (mode==='idle'?[0]:[0,.25,.5,.75])){
   d.reset();d.setMode(mode==='idle'?'control':mode);
   if(mode==='run')d.setPhase(start);else if(mode==='control'){d.player.position.set(5,0,5);d.keys.add('KeyW');for(let i=0;i<15;i++)d.step(.05)}
   d.setCrouched(true);for(let i=0;i<8;i++){d.step(.05);sample(`enter-${mode}-${start}-${i}`)}
   d.setCrouched(false);for(let i=0;i<8;i++){d.step(.05);sample(`exit-${mode}-${start}-${i}`)}
  }
  d.reset();for(let i=0;i<10;i++)d.step(.05);sample('idle-after');d.setVariant('before');sample('idle-before');
  // Stop actions only after all motion samples; this is a true rest/bind pose.
  d.mixer.stopAllAction();d.mixer.update(0);sample('bind-pose');
  return {selected,base:selected.map(i=>P[i]).flat(),groups,states};
 });
 if(errors.length)throw Error(errors.join('\n'));
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(out));
 console.log(`Exported ${Object.keys(out.states).length} poses and ${out.selected.length} selected vertices to ${output}`);
 console.log('Triangle subsets:',Object.fromEntries(Object.entries(out.groups).map(([k,v])=>[k,v.length/3])));
}finally{await browser.close()}
