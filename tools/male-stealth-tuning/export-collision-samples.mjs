// Export actual Three.js-skinned vertices for sampled poses. The result is
// scratch data for ../male-gait-transition/qa-blend-regions.py, not an asset.
import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const output=path.resolve(process.argv[2]||'/dev/shm/bow-stealth-collision-samples.json');
if(output===repo||output.startsWith(repo+path.sep))throw Error('Sample data must be written outside the repository');
const target=process.argv[3]||pathToFileURL(path.join(repo,'work/male-stealth-tuning/index.html')).href;
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
try{
  const page=await browser.newPage();await page.setViewport({width:960,height:673});if(target.startsWith('file:'))await page.setOfflineMode(true);
  await page.goto(target,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.ready===true',{timeout:60000});
  const data=await page.evaluate(()=>{
    const d=demo;d.setManual(true);d.reset();const mesh=d.male.getObjectByName('NewBody'),g=mesh.geometry,p=g.attributes.position,idx=g.index;
    const predicates={
      kneeL:([x,y])=>x>.03&&x<.25&&y>.39&&y<.69,kneeR:([x,y])=>x<-.03&&x>-.25&&y>.39&&y<.69,
      hip:([x,y])=>Math.abs(x)<.29&&y>.72&&y<1.11,
      handL:([x,y])=>x>.24&&y<1.04&&y>.74,handR:([x,y])=>x<-.24&&y<1.04&&y>.74,
      footL:([x,y])=>x>.035&&x<.25&&y<.2,footR:([x,y])=>x<-.035&&x>-.25&&y<.2,
    };
    const basePoints=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]);
    const groups=Object.fromEntries(Object.keys(predicates).map(k=>[k,[]]));
    for(let i=0;i<idx.count;i+=3){const tri=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];
      for(const [name,test] of Object.entries(predicates))if(tri.some(id=>test(basePoints[id])))groups[name].push(...tri)}
    const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),map=new Map(selected.map((id,i)=>[id,i]));
    for(const key of Object.keys(groups))groups[key]=groups[key].map(id=>map.get(id));
    const base=selected.flatMap(i=>basePoints[i]),states={},poses={};let count=0;
    function snapshot(label,details){
      d.male.updateWorldMatrix(true,true);mesh.skeleton.update();const values=new Float32Array(selected.length*3),v=d.camera.position.clone();
      for(let i=0;i<selected.length;i++){mesh.getVertexPosition(selected[i],v);values.set(v.toArray(),i*3)}
      const bytes=new Uint8Array(values.buffer);let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const name=label+'-'+String(count++).padStart(3,'0');states[name]=btoa(raw);poses[name]=details;
    }
    for(let i=0;i<12;i++){
      d.reset();d.motion.crouch=1;d.motion.move=0;d.motion.idleTime=i*2.4/12;d.motion.render({inspectTime:null});snapshot('crouch-idle',{phase:i/12});
    }
    for(let i=0;i<16;i++)for(const move of [.5,1]){
      d.reset();d.motion.crouch=1;d.motion.move=move;d.motion.idleTime=i*2.4/16;d.motion.crouchPhase=i/16;
      d.motion.render({inspectTime:null});snapshot('crouch-walk',{phase:i/16,move});
    }
    for(const mode of ['idle','walk','run'])for(const seed of (mode==='idle'?[0]:[0,4,8,12])){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;if(mode!=='idle')d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
      for(let i=0;i<70;i++)d.step(1/60);d.motion.clock.phase=(seed+.37)/16;d.motion.render({inspectTime:null});d.setCrouched(true);
      for(let i=0;i<22;i++){d.step(1/60);if([2,6,11,19].includes(i))snapshot('enter-'+mode,{seed,seconds:(i+1)/60,crouch:d.motion.crouch})}
    }
    for(const mode of ['walk','run'])for(const seed of [0,8]){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
      d.setCrouched(true);for(let i=0;i<70;i++)d.step(1/60);d.motion.crouchPhase=(seed+.37)/16;d.motion.render({inspectTime:null});d.setCrouched(false);
      for(let i=0;i<22;i++){d.step(1/60);if([2,6,11,19].includes(i))snapshot('exit-'+mode,{seed,seconds:(i+1)/60,crouch:d.motion.crouch})}
    }
    return {count,base,groups,sourceVertexIds:selected,poses,states,method:'Actual Three.js skinned+morphed vertices, chosen regions and discrete poses only.'};
  });
  data.htmlSha256=target.startsWith('file:')?createHash('sha256').update(fs.readFileSync(fileURLToPath(target))).digest('hex'):null;
  fs.writeFileSync(output,JSON.stringify(data));console.log(`Exported ${data.count} poses and ${data.sourceVertexIds.length} vertices to ${output} (${fs.statSync(output).size} bytes)`);
}finally{await browser.close()}
