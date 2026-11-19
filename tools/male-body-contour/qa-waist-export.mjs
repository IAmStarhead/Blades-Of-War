// Export torso/forearm/hand subsets from the actual offline viewer. Paired
// FCL checks compare before/after at sampled phases; this is not full-body QA.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,input=path.resolve(process.argv[2]||path.join(root,'work/male-body-contour')),output=path.resolve(process.argv[3]||'/tmp/bow-waist-geometry.json');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(input,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 const data=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes._contour_last_position,J=g.attributes.skinIndex,W=g.attributes.skinWeight,ix=g.index,names=m.skeleton.bones.map(b=>b.name),P=[];
  for(let i=0;i<p.count;i++)P.push([p.getX(i),p.getY(i),p.getZ(i)]);
  const groups={torso:[],L:[],R:[]};
  for(let i=0;i<ix.count;i+=3){
   const ids=[0,1,2].map(k=>ix.getX(i+k)),pts=ids.map(j=>P[j]),y=pts.reduce((s,v)=>s+v[1],0)/3,x=pts.reduce((s,v)=>s+v[0],0)/3;
   const inf=predicate=>ids.reduce((s,v)=>s+[0,1,2,3].reduce((t,k)=>t+(predicate(names[J.getComponent(v,k)])?W.getComponent(v,k):0),0)/3,0);
   if(y>.99&&y<1.40&&Math.abs(x)<.245&&inf(n=>/^Rig_(Hips|Spine|Chest)$/.test(n))>.7)groups.torso.push(...ids);
   for(const [side,sign] of [['L',1],['R',-1]])if(y>.70&&y<1.45&&x*sign>.10&&inf(n=>new RegExp(`^Rig_(UpperArm|Forearm|Hand)_${side}$`).test(n))>.55)groups[side].push(...ids);
  }
  const selected=[...new Set(Object.values(groups).flat())].sort((a,b)=>a-b),local=new Map(selected.map((x,i)=>[x,i]));for(const name of Object.keys(groups))groups[name]=groups[name].map(x=>local.get(x));
  const states={},v=d.camera.position.clone();function sample(label){d.scene.updateMatrixWorld(true);m.skeleton.update();const a=new Float32Array(selected.length*3);for(let j=0;j<selected.length;j++){m.getVertexPosition(selected[j],v);a.set(v.toArray(),3*j)}let s='',u=new Uint8Array(a.buffer);for(let k=0;k<u.length;k+=8192)s+=String.fromCharCode(...u.subarray(k,k+8192));states[label]=btoa(s)}
  for(const variant of ['before','after']){
   for(const mode of ['walk','run','crouch']){d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}for(let i=0;i<48;i++){d.setPhase((i+.37)/48);sample(`${variant}/${mode}/steady/${i}`)}}
   for(const mode of ['walk','run'])for(const playing of [false,true])for(const phase of [0,.25,.5,.75])for(const direction of ['enter','exit']){
    d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode);d.setPhase(phase);d.setPlaying(playing);if(direction==='exit'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setCrouched(direction==='enter');
    for(let i=0;i<16;i++){d.step(.05);sample(`${variant}/${mode}/${playing?'playing':'paused'}/${phase}/${direction}/${i}`)}
   }
  }
  return {base:selected.flatMap(i=>P[i]),groups,states};
 });
 if(errors.length)throw Error(errors.join('; '));fs.writeFileSync(output,JSON.stringify(data));console.log('Exported '+Object.keys(data.states).length+' paired torso/arm poses, '+data.base.length/3+' selected vertices to '+output);
}finally{await browser.close()}
