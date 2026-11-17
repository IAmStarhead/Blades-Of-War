// Offline browser QA: --scope=basic|previous|seam.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const args=process.argv.slice(2),scope=args.find(x=>x.startsWith('--scope='))?.split('=')[1]||'basic';
const output=path.resolve(args.find(x=>!x.startsWith('--'))||path.join(root,'work/male-nape-seam'));
assert.ok(['basic','previous','seam'].includes(scope));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-nape-qa-')),failures=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),
 headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],
 defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
async function open(file=path.join(output,'index.html'),viewport){
 const page=await browser.newPage();if(viewport)await page.setViewport(viewport);
 page.on('pageerror',e=>failures.push('page: '+e.message));
 page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))failures.push('console: '+m.text())});
 await page.setRequestInterception(true);
 page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{failures.push('external request: '+r.url());r.abort()}});
 await page.setOfflineMode(true);
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});return page;
}
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const near=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const nearArray=(a,b)=>a.forEach((x,i)=>near(x,b[i]));
const pose=page=>page.evaluate(()=>({view:demo.state.view,version:demo.state.version,position:demo.camera.position.toArray(),
 target:demo.controls.target.toArray(),distance:demo.camera.position.distanceTo(demo.controls.target),yaw:demo.currentYaw(),
 elevation:Math.asin((demo.camera.position.y-demo.controls.target.y)/demo.camera.position.distanceTo(demo.controls.target)),well:demo.well.visible}));

async function basic(){
 const page=await open();await frame(page);
 const status=await page.evaluate(()=>({view:demo.state.view,version:demo.state.version,
  visible:[demo.original.visible,demo.before.visible,demo.after.visible,demo.well.visible],
  views:[...document.querySelectorAll('[data-view]')].map(x=>x.getAttribute('aria-pressed')),
  versions:[...document.querySelectorAll('[data-version]')].map(x=>x.getAttribute('aria-pressed')),
  zoom:demo.controls.enableZoom,pan:demo.controls.enablePan,touchTwo:demo.controls.touches.TWO,
  hand:!!document.querySelector('[data-hand]'),triangles:document.querySelector('#triangle-label').textContent.replace(/\s/g,'')}));
 assert.deepEqual(status,{view:'head',version:'after',visible:[false,false,true,false],views:['false','false','false','true'],
  versions:['false','false','true'],zoom:false,pan:false,touchTwo:null,hand:false,triangles:'32354'});
 for(const [label,width,height] of [['desktop',1280,720],['phone',390,844],['small phone',320,568],['tall phone',360,896],
  ['landscape phone',568,320],['short phone',390,400],['desktop HD',1920,1080]]){
  await page.setViewport({width,height,deviceScaleFactor:1});await frame(page);
  const result=await page.evaluate(()=>{
   const d=demo,out=[];
   function bounds(root){d.camera.updateMatrixWorld(true);root.updateMatrixWorld(true);const box=[Infinity,-Infinity,Infinity,-Infinity];
    root.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
     const b=o.geometry.boundingBox;if(!b||b.isEmpty())return;
     for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){
      const v=d.camera.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).project(d.camera);
      box[0]=Math.min(box[0],v.x);box[1]=Math.max(box[1],v.x);box[2]=Math.min(box[2],v.y);box[3]=Math.max(box[3],v.y);
     }});return box;
   }
   for(const view of ['game','normal','inspect','head']){
    d.setView(view);for(let angle=0;angle<360;angle+=45){d.setYaw(angle*Math.PI/180);
     const parts=view==='head'?['head_1','ear-makehuman-left','ear-makehuman-right'].map(name=>[name,bounds(d.after.getObjectByName(name))]):[['male',bounds(d.after)]];
     if(view==='game'||view==='normal')parts.push(['well',bounds(d.well)]);
     out.push({view,angle,parts,distance:d.camera.position.distanceTo(d.controls.target),expected:d.views[view].distance,
      elevation:Math.asin((d.camera.position.y-d.controls.target.y)/d.camera.position.distanceTo(d.controls.target))});
    }
   }
   d.setView('game');d.setYaw(d.views.game.startYaw);d.setView('normal');d.setYaw(d.views.normal.startYaw);
   d.setView('inspect');d.setYaw(d.views.inspect.startYaw);d.setView('head');d.setYaw(d.views.head.startYaw);d.draw();
   return {angles:out,page:[document.documentElement.clientWidth,document.documentElement.clientHeight,document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    canvas:[d.renderer.domElement.clientWidth,d.renderer.domElement.clientHeight],aspect:d.camera.aspect,
    buttons:[...document.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})};
  });
  assert.equal(result.page[0],result.page[2],label+' horizontal overflow');assert.equal(result.page[1],result.page[3],label+' vertical overflow');
  near(result.aspect,result.canvas[0]/result.canvas[1],0.003);
  for(const [left,top,right,bottom] of result.buttons)assert.ok(left>=0&&top>=0&&right<=width&&bottom<=height,label+' control outside screen');
  for(const r of result.angles){near(r.distance,r.expected);near(r.elevation,(r.view==='game'?52:r.view==='head'?0:5)*Math.PI/180);
   for(const [name,[xmin,xmax,ymin,ymax]] of r.parts)assert.ok(xmin>=-1&&xmax<=1&&ymin>=-1&&ymax<=1,`${label}/${r.view}/${r.angle}/${name} cropped: ${[xmin,xmax,ymin,ymax]}`);
   if(r.view==='inspect')assert.ok(r.parts[0][1][3]-r.parts[0][1][2]>1.1,`${label} full-body inspection too small`);
   if(r.view==='head')assert.ok(r.parts[0][1][3]-r.parts[0][1][2]>0.65,`${label} nape view too small`);
  }
  console.log(`PASS ${label}: 4 camera presets, 8 rotations, controls and framing`);
 }
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);
 const lights=await page.evaluate(()=>demo.scene.children.filter(x=>x.isLight).map(x=>({type:x.type,intensity:x.intensity,position:x.position.toArray(),color:x.color.toArray(),ground:x.groundColor?.toArray()})));
 const initial=await pose(page);near(initial.distance,0.95);near(initial.elevation,0);near(initial.yaw,Math.PI);assert.equal(initial.well,false);
 for(const [name,triangle] of [['before','32354'],['original','287782'],['after','32354']]){
  await page.click(`[data-version="${name}"]`);await frame(page);const next=await pose(page);
  nearArray(next.position,initial.position);nearArray(next.target,initial.target);assert.equal(next.version,name);assert.equal(next.well,false);
  assert.equal(await page.$eval('#triangle-label',n=>n.textContent.replace(/\s/g,'')),triangle);
 }
 assert.deepEqual(await page.evaluate(()=>demo.scene.children.filter(x=>x.isLight).map(x=>({type:x.type,intensity:x.intensity,position:x.position.toArray(),color:x.color.toArray(),ground:x.groundColor?.toArray()}))),lights);
 await page.click('[data-view="normal"]');await page.click('[data-reset]');await frame(page);const normal=await pose(page);assert.equal(normal.well,true);near(normal.elevation,5*Math.PI/180);
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await frame(page);const narrow=await pose(page);assert.ok(narrow.distance>normal.distance);near(narrow.yaw,normal.yaw);nearArray(narrow.target,normal.target);
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);const wide=await pose(page);nearArray(wide.position,normal.position);
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);const side=await pose(page);near(side.yaw,Math.PI/2);
 await page.click('[data-view="inspect"]');await frame(page);const inspect=await pose(page);assert.equal(inspect.well,false);near(inspect.distance,3.9);near(inspect.yaw,side.yaw);
 await page.click('[data-view="normal"]');await frame(page);nearArray((await pose(page)).position,side.position);
 await page.click('[data-view="game"]');await frame(page);const game=await pose(page);assert.equal(game.well,true);near(game.distance,10.6);near(game.elevation,52*Math.PI/180);near(game.yaw,25*Math.PI/180);
 await page.click('[data-view="head"]');await page.click('[data-reset]');await frame(page);const back=await pose(page);near(back.yaw,Math.PI);assert.equal(back.well,false);
 const canvas=await (await page.$('canvas')).boundingBox(),x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+80,{steps:5});await page.mouse.up();await frame(page);const turned=await pose(page);
 assert.ok(Math.abs(turned.yaw-back.yaw)>0.05,'drag did not rotate');near(turned.distance,0.95);near(turned.elevation,0);nearArray(turned.target,back.target);
 await page.mouse.wheel({deltaY:-600});await frame(page);const wheel=await pose(page);nearArray(wheel.position,turned.position);nearArray(wheel.target,turned.target);
 await page.mouse.down({button:'right'});await page.mouse.move(x+100,y+50,{steps:4});await page.mouse.up({button:'right'});await frame(page);const right=await pose(page);nearArray(right.position,wheel.position);nearArray(right.target,wheel.target);
 console.log('PASS: model comparison preserves camera/light; modes, reset, resize, drag and disabled wheel/pan');

 const shots=path.join(output,'review');fs.mkdirSync(shots,{recursive:true});
 await page.click('[data-reset]');await page.click('[data-version="before"]');await frame(page);await page.screenshot({path:path.join(shots,'01-before-back.png')});
 await page.click('[data-version="after"]');await frame(page);await page.screenshot({path:path.join(shots,'02-after-back.png')});
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);await page.screenshot({path:path.join(shots,'03-after-side.png')});
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');await frame(page);await page.screenshot({path:path.join(shots,'04-after-front.png')});
 await page.click('[data-view="normal"]');await page.click('[data-reset]');await frame(page);await page.screenshot({path:path.join(shots,'05-normal-well.png')});
 await page.click('[data-view="game"]');await page.click('[data-reset]');await frame(page);await page.screenshot({path:path.join(shots,'06-game-well.png')});
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await page.click('[data-view="head"]');await page.click('[data-reset]');await frame(page);await page.screenshot({path:path.join(shots,'07-mobile-back.png')});
 await page.setViewport({width:320,height:568,deviceScaleFactor:1});await frame(page);await page.screenshot({path:path.join(shots,'08-small-back.png')});await page.close();

 const mobile=await open(undefined,{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await frame(mobile);
 const box=await (await mobile.$('canvas')).boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,client=await mobile.createCDPSession();
 const before=await pose(mobile);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-22,y:cy,id:1},{x:cx+22,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-75,y:cy,id:1},{x:cx+75,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const pinch=await pose(mobile);nearArray(before.position,pinch.position);nearArray(before.target,pinch.target);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+75,y:cy+65,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const swipe=await pose(mobile);
 assert.ok(Math.abs(swipe.yaw-pinch.yaw)>0.05,'touch swipe did not rotate');near(swipe.distance,0.95);near(swipe.elevation,0);nearArray(swipe.target,pinch.target);
 console.log('PASS: mobile pinch cannot zoom; one-finger swipe rotates');await mobile.close();
}

async function previous(){
 const archive=path.join(root,'work/male-camera-dual-view/BladesOfWar_Dva_Rakursa.zip'),oldFile=path.join(temp,'previous.html');
 fs.writeFileSync(oldFile,execFileSync('unzip',['-p',archive,'BladesOfWar_Showcase.html'],{maxBuffer:35_000_000}));
 const [oldPage,newPage]=await Promise.all([open(oldFile),open()]);
 for(const page of [oldPage,newPage]){
  await page.setViewport({width:960,height:720,deviceScaleFactor:1});
  await page.evaluate(()=>{document.querySelector('header').style.display='none';document.querySelector('footer').style.display='none';window.dispatchEvent(new Event('resize'));demo.renderer.setPixelRatio(1)});await frame(page);
 }
 const size=p=>p.evaluate(()=>[demo.renderer.domElement.width,demo.renderer.domElement.height]);assert.deepEqual(await size(oldPage),await size(newPage));
 for(const view of ['game','normal'])for(const [oldVersion,newVersion] of [['original','original'],['optimized','before']])for(const angle of [0,25,45,90,180,270]){
  const render=(p,version)=>p.evaluate(({view,version,angle})=>{demo.setView(view);demo.choose(version);demo.setYaw(angle*Math.PI/180);demo.draw();return demo.renderer.domElement.toDataURL('image/png')},{view,version,angle});
  const [a,b]=await Promise.all([render(oldPage,oldVersion),render(newPage,newVersion)]);
  const changed=await newPage.evaluate(async({a,b})=>{function image(src){return new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=no;im.src=src})}
   const [x,y]=await Promise.all([image(a),image(b)]),c=document.createElement('canvas');c.width=x.width;c.height=x.height;const ctx=c.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(x,0,0);const p=ctx.getImageData(0,0,c.width,c.height).data;ctx.drawImage(y,0,0);const q=ctx.getImageData(0,0,c.width,c.height).data;let n=0;
   for(let i=0;i<p.length;i+=4)if(p[i]!==q[i]||p[i+1]!==q[i+1]||p[i+2]!==q[i+2])n++;return n;
  },{a,b});assert.equal(changed,0,`${view}/${oldVersion}/${angle}: prior scene differs (${changed} pixels)`);
 }
 console.log('PASS: original and before scenes match preceding viewer pixel-for-pixel in both views at six rotations');
 await oldPage.close();await newPage.close();
}

async function seam(){
 const page=await open();await frame(page);
 const data=await page.evaluate(()=>{
  const d=demo;d.setView('head');d.setYaw(Math.PI);d.renderer.setPixelRatio(1);const lights=d.scene.children.filter(x=>x.isLight),key=lights.find(x=>x.isDirectionalLight),originalKey=key.position.clone();
  const targetPosition=(x,y,z)=>{const v=d.camera.position.clone().set(x,y,z).project(d.camera);return [(v.x+1)*d.renderer.domElement.width/2,(1-v.y)*d.renderer.domElement.height/2]};
  function capture(version){d.choose(version);d.draw();const c=document.createElement('canvas');c.width=d.renderer.domElement.width;c.height=d.renderer.domElement.height;
   const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(d.renderer.domElement,0,0);return ctx.getImageData(0,0,c.width,c.height)}
  function profile(img){let [cx]=targetPosition(1.0042,1.70,.028),[,y1]=targetPosition(1.0042,1.75,.04),[,y2]=targetPosition(1.0042,1.63,.04);cx=Math.round(cx);y1=Math.ceil(y1);y2=Math.floor(y2);
   const row=[];for(let x=cx-9;x<=cx+9;x++){let sum=0;for(let y=y1;y<=y2;y++){const i=(y*img.width+x)*4;sum+=.2126*img.data[i]+.7152*img.data[i+1]+.0722*img.data[i+2]}row.push(sum/(y2-y1+1))}
   const grad=row.slice(1).map((v,i)=>v-row[i]);return {peak:Math.max(...grad.slice(6,12).map(Math.abs)),pixelBand:[cx,y1,y2],gradient:grad};
  }
  const report={};for(const [name,pos] of [['default',null],['left',[-8,3,-1]],['right',[8,3,-1]]]){
   if(pos)key.position.set(...pos);else key.position.copy(originalKey);report[name]={before:profile(capture('before')),after:profile(capture('after'))};
  }
  key.position.copy(originalKey);
  d.setYaw(0);const frontBefore=capture('before'),frontAfter=capture('after');let frontChanged=0,sum=0;
  for(let i=0;i<frontBefore.data.length;i+=4){let diff=0;for(let j=0;j<3;j++){let v=Math.abs(frontBefore.data[i+j]-frontAfter.data[i+j]);sum+=v;diff=Math.max(diff,v)}if(diff)frontChanged++}
  report.front={changedPixels:frontChanged,meanRGB:sum/(frontBefore.width*frontBefore.height*3)};
  return report;
 });
 for(const [name,r] of Object.entries(data).filter(([name])=>name!=='front')){
  assert.ok(r.before.peak>0.8,`${name}: no visible baseline gradient`);assert.ok(r.after.peak<r.before.peak*0.75,`${name}: seam gradient not sufficiently reduced`);
  console.log(`${name}: largest local mean-luminance step ${r.before.peak.toFixed(3)} → ${r.after.peak.toFixed(3)} / 255`);
 }
 assert.ok(data.front.meanRGB<0.001,'front changed unexpectedly: '+JSON.stringify(data.front));
 fs.writeFileSync(path.join(output,'seam-comparison.json'),JSON.stringify({description:'One-pixel luminance steps averaged across the visible nape band, before and after; three tested light setups, not a universal guarantee.',...data},null,2)+'\n');
 console.log(`PASS: seam reduced under 3 test lights; front mean RGB difference ${data.front.meanRGB.toFixed(6)}/255`);await page.close();
}

try{
 if(scope==='basic')await basic();else if(scope==='previous')await previous();else await seam();
 assert.deepEqual(failures,[],'Browser errors, warnings or network requests: '+failures.join('; '));
 console.log('PASS: opened offline without browser errors, Three.js warnings or external requests');
}finally{
 const proc=browser.process();let timer;await Promise.race([browser.close(),new Promise(r=>{timer=setTimeout(r,5000);timer.unref()})]);clearTimeout(timer);if(browser.connected&&proc)proc.kill('SIGKILL');fs.rmSync(temp,{recursive:true,force:true});
}
