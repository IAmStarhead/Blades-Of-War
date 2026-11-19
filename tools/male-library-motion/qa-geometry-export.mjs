// Export sampled skinned vertices from the ACTUAL offline viewer. The paired
// qa-geometry.py checks selected triangle regions only; it is not a proof of
// all-frame, all-body collision freedom or attractive deformation.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-library-motion')),destination=path.resolve(process.argv[3]||'/tmp/bow-library-geometry.json');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const data=await page.evaluate(()=>{
  const d=demo;d.setManual(true);d.reset();d.setVariant('after');const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes.position,J=g.attributes.skinIndex,W=g.attributes.skinWeight,index=g.index,names=m.skeleton.bones.map(b=>b.name),P=[];
  for(let i=0;i<p.count;i++)P.push([p.getX(i),p.getY(i),p.getZ(i)]);
  const groups={hip:[],lowerL:[],lowerR:[],body:[],left:[],right:[]};
  for(let i=0;i<index.count;i+=3){
   const ids=[0,1,2].map(k=>index.getX(i+k)),pts=ids.map(k=>P[k]),mean=k=>pts.reduce((a,x)=>a+x[k],0)/3,x=mean(0),y=mean(1);
   if(Math.max(...pts.map(a=>a[1]))>.55&&Math.min(...pts.map(a=>a[1]))<1.05&&Math.min(...pts.map(a=>Math.abs(a[0])))<.23)groups.hip.push(...ids);
   if(Math.abs(x)<.205&&y>.55&&y<1.05)groups.body.push(...ids);
   if(x>.20&&y>.75&&y<.995)groups.left.push(...ids);if(x<-.20&&y>.75&&y<.995)groups.right.push(...ids);
   if(y>.14&&y<.75)for(const side of ['L','R']){let influence=0;for(const vertex of ids)for(let k=0;k<4;k++)if(names[J.getComponent(vertex,k)]?.match(new RegExp(`^Rig_(Thigh|Shin|Foot)_${side}$`)))influence+=W.getComponent(vertex,k)/3;if(influence>.6)groups['lower'+side].push(...ids)}
  }
  const unified=new Map();for(const n of ['hip','lowerL','lowerR'])for(let i=0;i<groups[n].length;i+=3){const f=groups[n].slice(i,i+3);unified.set(f.join(','),f)}groups.unified=[...unified.values()].flat();
  const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),local=new Map(selected.map((x,i)=>[x,i]));for(const k of Object.keys(groups))groups[k]=groups[k].map(x=>local.get(x));
  const states={},point=new m.position.constructor();function sample(name){d.scene.updateMatrixWorld(true);m.skeleton.update();const arr=new Float32Array(selected.length*3);for(let j=0;j<selected.length;j++){m.getVertexPosition(selected[j],point);arr.set([point.x,point.y,point.z],3*j)}const bytes=new Uint8Array(arr.buffer);let str='';for(let k=0;k<bytes.length;k+=8192)str+=String.fromCharCode(...bytes.subarray(k,k+8192));states[name]=btoa(str)}
  for(const mode of ['walk','run','crouch']){d.reset();d.setVariant('after');d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}for(let i=0;i<96;i++){d.setPhase((i+.37)/96);sample(`${mode}-steady-${i}`)}}
  for(const mode of ['walk','run'])for(const playing of [false,true])for(const start of [0,.25,.5,.75])for(const direction of ['enter','exit']){
   d.reset();d.setVariant('after');d.setMode(mode);d.setPhase(start);d.setPlaying(playing);
   if(direction==='exit'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}
   d.setCrouched(direction==='enter');for(let i=0;i<16;i++){d.step(.05);sample(`${mode}-${playing?'playing':'paused'}-${start}-${direction}-${i}`)}
  }
  for(const direction of ['enter','exit']){d.reset();d.setVariant('after');d.setMode('control');if(direction==='exit'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}d.setCrouched(direction==='enter');for(let i=0;i<16;i++){d.step(.05);sample(`idle-${direction}-${i}`)}}
  return {base:selected.flatMap(i=>P[i]),groups,states};
 });
 if(errors.length)throw Error('Browser errors: '+errors.join('; '));fs.writeFileSync(destination,JSON.stringify(data));console.log('Exported '+Object.keys(data.states).length+' poses, '+data.base.length/3+' selected vertices to '+destination);
}finally{await browser.close()}
