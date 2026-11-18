// Measure the trial against the delivered skin/bind/clip in the real viewer.
// This samples selected vertices and joint pivots: it cannot establish visual
// quality, anatomical correctness or exact behaviour at every possible time.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-deep-crouch'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);
  const m=d.male.getObjectByName('head_2'),g=m.geometry,p=g.attributes.position,sk=m.skeleton,j=g.attributes._delivered_joints,w=g.attributes._delivered_weights,names=sk.bones.map(b=>b.name),v=d.camera.position.clone(),q=d.camera.quaternion.clone();
  const groups={foot:[],upper:[],outerThigh:[],calf:[]};
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i);let arm=0;
   for(let k=0;k<4;k++)if(/Rig_(Shoulder|UpperArm|Forearm|Hand|Neck|Head)/.test(names[j.getComponent(i,k)]))arm+=w.getComponent(i,k);
   if(y<.14&&Math.abs(x)>.03&&Math.abs(x)<.22)groups.foot.push(i);
   if(y>1.10||arm>.5)groups.upper.push(i); // Includes the arms/hands below the waist.
   if(y>=.68&&y<.90&&Math.abs(x)>.085&&Math.abs(x)<.22)groups.outerThigh.push(i);
   if(y>.18&&y<.40&&Math.abs(x)>.04&&Math.abs(x)<.22)groups.calf.push(i);
  }
  function sample(){
   d.scene.updateMatrixWorld(true);sk.update();const out={};
   for(const [name,ids] of Object.entries(groups)){const a=new Float32Array(ids.length*3);for(let i=0;i<ids.length;i++){m.getVertexPosition(ids[i],v);a.set([v.x,v.y,v.z],3*i)}out[name]=a}
   out.ankle=['L','R'].map(s=>d.male.getObjectByName('Rig_Foot_'+s).getWorldPosition(v).clone().toArray());
   out.knee=['L','R'].map(s=>d.male.getObjectByName('Rig_Shin_'+s).getWorldPosition(v).clone().toArray());
   out.footQ=['L','R'].map(s=>d.male.getObjectByName('Rig_Foot_'+s).getWorldQuaternion(q).clone().toArray());
   out.root=d.male.getObjectByName('Rig_Root').position.y;return out;
  }
  function compare(label,summary){
   d.setVariant('before');const a=sample();d.setVariant('after');const b=sample();
   for(const name of Object.keys(groups)){
    let max=0,sum=0;for(let k=0;k<a[name].length;k+=3){const dist=Math.hypot(a[name][k]-b[name][k],a[name][k+1]-b[name][k+1],a[name][k+2]-b[name][k+2]);max=Math.max(max,dist);sum+=dist}
    if(!summary[name]||max>summary[name].max)summary[name]={max,mean:sum/groups[name].length,at:label};
   }
   for(const name of ['ankle','knee'])for(let j=0;j<2;j++){
    const dist=Math.hypot(...a[name][j].map((x,k)=>x-b[name][j][k]));if(!summary[name]||dist>summary[name].max)summary[name]={max:dist,at:label};
   }
   for(let j=0;j<2;j++){
    const dot=Math.abs(a.footQ[j].reduce((s,x,k)=>s+x*b.footQ[j][k],0)),angle=2*Math.acos(Math.min(1,dot));
    if(!summary.angle||angle>summary.angle.max)summary.angle={max:angle,at:label};
   }
   summary.rootMax=Math.max(summary.rootMax||0,Math.abs(a.root-b.root));
  }
  const report={groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),modes:{},transitions:{}};
  // 120 slightly off-key phases per locomotion cycle, plus time samples in
  // standing and crouched idle. Both variants use identical phase and state.
  for(const mode of ['walk','run','crouchwalk','crouchidle','idle']){
   d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode==='run'?'run':mode==='idle'||mode==='crouchidle'?'control':'walk');
   if(mode.startsWith('crouch')){d.setCrouched(true);for(let k=0;k<15;k++)d.step(.05)}
   const out={};for(let i=0;i<120;i++){if(mode==='idle'||mode==='crouchidle')d.step(.02);else d.setPhase(i/120+.001);compare(`${mode}:${i}`,out)}report.modes[mode]=out;
  }
  // Paused and advancing transitions from four run phases, and idle entry and
  // exit. The vertical floor guard may move the whole root differently.
  for(const mode of ['run','idle'])for(const playing of (mode==='run'?[false,true]:[false]))for(const direction of ['enter','exit']){
   const out={};for(const start of (mode==='run'?[0,.25,.5,.75]:[0])){
    d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode==='run'?'run':'control');
    if(mode==='run'){d.setPhase(start);d.setPlaying(playing)}
    if(direction==='exit'){d.setCrouched(true);for(let k=0;k<15;k++)d.step(.05)}
    d.setCrouched(direction==='enter');for(let i=0;i<32;i++){d.step(.025);compare(`${mode}/${playing}/${direction}/${start}:${i}`,out)}
   }report.transitions[`${mode}/${playing?'playing':'paused'}/${direction}`]=out;
  }
  return report;
 });
 assert.ok(result.groups.foot>3000&&result.groups.upper>6000&&result.groups.outerThigh>200&&result.groups.calf>200);
 for(const [name,x] of Object.entries(result.modes)){
  const deep=name.startsWith('crouch');
  assert.ok(x.foot.max<(deep?.004:.001),`${name}: selected foot deviation ${x.foot.max}`);
  assert.ok(x.ankle.max<.0001,`${name}: ankle deviation ${x.ankle.max}`);
  assert.ok(x.angle.max<.002,`${name}: foot orientation changed`);
  if(deep){assert.ok(x.rootMax>.159&&x.rootMax<.161,`${name}: expected 16 cm lower pelvis`);assert.ok(x.knee.max>.10)}
  else assert.ok(x.rootMax<1e-5&&x.knee.max<1e-4,`${name}: standing leg skeleton unexpectedly changed`);
 }
 assert.ok(result.modes.run.outerThigh.max>.005&&result.modes.run.upper.max>.005,'body/arm trial was not applied');
 for(const [name,x] of Object.entries(result.transitions)){
  assert.ok(x.foot.max<.008,`${name}: selected foot deviation ${x.foot.max}`);
  assert.ok(x.ankle.max<.008,`${name}: ankle deviation ${x.ankle.max}`);
  assert.ok(x.angle.max<.002,`${name}: foot orientation changed`);
  assert.ok(x.rootMax<.161,`${name}: excessive root displacement`);
 }
 assert.deepEqual(errors,[]);
 const mm=x=>(x*1000).toFixed(3);
 for(const [name,x] of Object.entries(result.modes))console.log(`${name}: max selected foot ${mm(x.foot.max)} mm; ankle ${mm(x.ankle.max)} mm; knee ${mm(x.knee.max)} mm; root ${mm(x.rootMax)} mm`);
 for(const [name,x] of Object.entries(result.transitions))console.log(`${name}: max selected foot ${mm(x.foot.max)} mm; ankle ${mm(x.ankle.max)} mm; root ${mm(x.rootMax)} mm`);
 console.log(`PASS: selected vertices ${JSON.stringify(result.groups)}; 120 samples per steady mode and 25 ms paused/playing transitions`);
 console.log('NOTE: transition foot fitting and floor guard act only in this viewer; finite samples do not prove perfect contact or artistic quality.');
}finally{await browser.close()}
