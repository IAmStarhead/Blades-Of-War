// Fixed-step recording of the previous and separate trial scenes, four cameras.
// The same input sequence is repeated for each view; no prior assets are changed.
// Usage: node record.mjs /absolute/NEW-output.mp4 [trial-index.html]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length<3||process.argv.length>4)throw Error('Pass a new output MP4 and optional trial HTML');
const output=path.resolve(process.argv[2]),trial=path.resolve(process.argv[3]||path.join(repo,'work/male-stealth-posture-trial/index.html'));
if(fs.existsSync(output)||output===repo||(output.startsWith(repo+path.sep)&&output!==path.join(repo,'work/male-stealth-posture-trial/comparison.mp4')))throw Error('Output must not exist or replace another artifact');
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';if(spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status!==0)throw Error('FFmpeg required');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json')),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-leg-human-record-'));const fps=30,perView=135,total=perView*4,errors=[];let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
 const pages=[];for(const file of [path.join(repo,'work/male-leg-human-trial/index.html'),trial]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width:700,height:700,deviceScaleFactor:1});await page.setOfflineMode(true);await page.goto(pathToFileURL(file).href,{waitUntil:'load'});
  await page.waitForFunction('window.ready===true',{timeout:60000});await page.evaluate(()=>{
   demo.setManual(true);demo.renderer.setSize(480,480,false);demo.camera.aspect=1;demo.camera.fov=34;demo.camera.updateProjectionMatrix();
   // Fixed floor markers exist only in this recording, to make actual ground
   // travel visible while the camera follows the character. They are not
   // part of either interactive scene.
   for(const x of [5.65,6.35])for(let z=6.4;z<=9.2;z+=.35){
    const mark=demo.marker.clone();mark.visible=true;mark.scale.setScalar(.22);mark.position.set(x,.004,z);demo.scene.add(mark);
   }
  });pages.push(page);
 }
 const processes=pages.map((_,i)=>{
  const file=path.join(tmp,`part-${i}.mp4`),proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','-',
   '-an','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p',file],{stdio:['pipe','ignore','pipe']});
  let stderr='';proc.stderr.on('data',b=>stderr+=b.toString());const finished=new Promise((resolve,reject)=>{
   proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(Error(`FFmpeg ${code}: ${stderr}`)));});return {proc,finished,file};
 });
 try{
  for(let i=0;i<total;i++){
   const images=await Promise.all(pages.map(page=>page.evaluate(({i,perView})=>{
    const d=demo,k=i%perView,angle=Math.floor(i/perView);
    if(k===0){d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;}
    if(k===11)d.setCrouched(true);if(k===33)d.keys.add('KeyW');if(k===99)d.keys.delete('KeyW');if(k===114)d.setCrouched(false);
    d.step(1/60);d.step(1/60);
    const {x,z}=d.player.position;
    if(angle===0)d.camera.position.set(x+3.5,1.25,z);else if(angle===1)d.camera.position.set(x+2.48,1.25,z-2.48);
    else if(angle===2)d.camera.position.set(x,1.25,z-3.5);else d.camera.position.set(x,1.25,z+3.5);
    d.camera.lookAt(x,.77,z);d.camera.updateMatrixWorld();d.draw();return d.renderer.domElement.toDataURL('image/jpeg',.82);
   },{i,perView})));
   for(let j=0;j<2;j++){assert.ok(images[j].startsWith('data:image/jpeg;base64,'));if(!processes[j].proc.stdin.write(Buffer.from(images[j].split(',')[1],'base64')))await once(processes[j].proc.stdin,'drain');}
   if(i%90===0)console.log(`Captured ${i}/${total}`);
  }
  processes.forEach(p=>p.proc.stdin.end());await Promise.all(processes.map(p=>p.finished));
 }catch(error){processes.forEach(p=>p.proc.kill('SIGKILL'));await Promise.allSettled(processes.map(p=>p.finished));throw error;}
 if(errors.length)throw Error(errors.join('\n'));
 const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';if(!fs.existsSync(font))throw Error('DejaVu Sans is required for Cyrillic captions');
 const views=['Сбоку','Три четверти','Спереди','Сзади'];
 const viewText=views.map((name,i)=>`drawtext=fontfile=${font}:text='${name}':fontcolor=0xdecaa5:fontsize=17:x=(w-text_w)/2:y=39:enable='gte(t,${i*4.5})*lt(t,${(i+1)*4.5})'`).join(',');
 const filter=`[0:v][1:v]hstack=inputs=2,pad=960:560:0:64:color=0x202e26,drawtext=fontfile=${font}:text='ПРЕЖНЯЯ ПРОБА':fontcolor=white:fontsize=18:x=(480-text_w)/2:y=12,drawtext=fontfile=${font}:text='НОВАЯ ПРОБА':fontcolor=white:fontsize=18:x=480+(480-text_w)/2:y=12,${viewText},drawtext=fontfile=${font}:text='Одинаковые команды; камера следует за персонажем, отметки закреплены на земле':fontcolor=white:fontsize=13:x=(w-text_w)/2:y=545[out]`;
 const rendered=path.join(tmp,'final.mp4'),encoded=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',processes[0].file,'-i',processes[1].file,'-filter_complex',filter,
  '-map','[out]','-an','-frames:v',String(total),'-c:v','libx264','-crf','22','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',rendered],{encoding:'utf8'});
 if(encoded.error||encoded.status!==0)throw Error(encoded.error||encoded.stderr);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(rendered,output,fs.constants.COPYFILE_EXCL);
 console.log(`Video ${output}: ${fs.statSync(output).size} bytes; sha256 ${createHash('sha256').update(fs.readFileSync(output)).digest('hex')}`);
}finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true});}
