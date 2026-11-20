// Export finite posed surface samples for qa-deform.py. Requires Puppeteer and
// an offline browser. This does not include the separate head/ear surfaces.
import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-rig-rebuild')),samples=path.resolve(process.argv[3]||'/tmp/bow-rig-deform.json'),count=Number(process.argv[4]||96),errors=[];
if(!Number.isInteger(count)||count<4||count>512)throw Error('Invalid sample count');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{timeout:60000});await page.waitForFunction('window.rigTrial?.state.ready===true',{timeout:60000});
 const data=await page.evaluate(n=>{
  const d=rigTrial;d.setMotion('stand');const m=d.models.new.gltf.scene.getObjectByName('NewBody'),g=m.geometry,p=g.attributes.position,ix=g.index,P=[];
  for(let i=0;i<p.count;i++)P.push([p.getX(i),p.getY(i),p.getZ(i)]);
  const predicates={
   kneeL:([x,y])=>x>.03&&x<.25&&y>.39&&y<.69,kneeR:([x,y])=>x<-.03&&x>-.25&&y>.39&&y<.69,
   elbowL:([x,y])=>x>.17&&x<.37&&y>1.07&&y<1.30,elbowR:([x,y])=>x<-.17&&x>-.37&&y>1.07&&y<1.30,
   shoulderL:([x,y])=>x>.08&&x<.38&&y>1.25&&y<1.51,shoulderR:([x,y])=>x<-.08&&x>-.38&&y>1.25&&y<1.51,
   hip:([x,y])=>Math.abs(x)<.29&&y>.72&&y<1.11,
   handL:([x,y])=>x>.24&&y<1.04&&y>.74,handR:([x,y])=>x<-.24&&y<1.04&&y>.74,
   torso:([x,y])=>Math.abs(x)<.23&&y>.80&&y<1.48,
   footL:([x,y])=>x>.035&&x<.25&&y<.20,footR:([x,y])=>x<-.035&&x>-.25&&y<.20,
   neck:([x,y])=>Math.abs(x)<.12&&y>1.495&&y<1.560,
  },groups=Object.fromEntries(Object.keys(predicates).map(k=>[k,[]]));
  for(let i=0;i<ix.count;i+=3){const ids=[ix.getX(i),ix.getX(i+1),ix.getX(i+2)];for(const [k,test] of Object.entries(predicates))if(ids.some(id=>test(P[id])))groups[k].push(...ids)}
  const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),remap=new Map(selected.map((id,i)=>[id,i]));
  for(const key of Object.keys(groups))groups[key]=groups[key].map(id=>remap.get(id));
  const states={},v=m.position.clone();function sample(name){
   d.scene.updateMatrixWorld(true);m.skeleton.update();const a=new Float32Array(selected.length*3);
   selected.forEach((id,i)=>{m.getVertexPosition(id,v);a.set([v.x,v.y,v.z],i*3)});
   let raw='',u=new Uint8Array(a.buffer);for(let k=0;k<u.length;k+=8192)raw+=String.fromCharCode(...u.subarray(k,k+8192));states[name]=btoa(raw);
  }
  sample('stand');for(const mode of ['walk','run']){d.setMotion(mode);for(let i=0;i<n;i++){d.setPhase((i+.37)/n);sample(`${mode}-${i}`)}}
  return {base:selected.flatMap(i=>P[i]),groups,states};
 },count);
 if(errors.length)throw Error(errors.join('; '));fs.writeFileSync(samples,JSON.stringify(data));console.log('Exported',Object.keys(data.states).length,'poses,',data.base.length/3,'vertices; faces per group',Object.fromEntries(Object.entries(data.groups).map(([k,v])=>[k,v.length/3])));
}finally{await browser.close()}
