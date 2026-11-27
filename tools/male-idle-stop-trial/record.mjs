// Fixed-step side-by-side video: the earlier trial and this separate trial.
// The same input sequence is repeated in each camera. The earlier idle already
// had a slight authored breath, so it is not represented as perfectly static.
// 1/60 s simulation steps, two per video frame; not a real-time device test.
// Usage: node record.mjs [--idle] /absolute/NEW-output.mp4
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),idleOnly=args[0]==='--idle';if(idleOnly)args.shift();
if(args.length!==1)throw Error('Pass [--idle] and a new output MP4');
const output=path.resolve(args[0]),permitted=path.join(repo,`work/male-idle-stop-trial/${idleOnly?'idle-comparison.mp4':'comparison.mp4'}`);
if(fs.existsSync(output)||output===repo||(output.startsWith(repo+path.sep)&&output!==permitted))throw Error('Output must not exist or replace another artifact');
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';if(spawnSync(ffmpeg,['-version'],{stdio:'ignore'}).status!==0)throw Error('FFmpeg with libx264 and drawtext required');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json')),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-idle-stop-video-')),fps=30,perView=idleOnly?210:420,
 views=idleOnly?['Спереди','Три четверти']:['Спереди','Сбоку','Сзади','Три четверти'],total=perView*views.length,errors=[];let browser;
try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
 const pages=[];for(const file of [path.join(repo,'work/male-stealth-posture-trial/index.html'),path.join(repo,'work/male-idle-stop-trial/index.html')]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width:650,height:650,deviceScaleFactor:1});await page.setOfflineMode(true);await page.goto(pathToFileURL(file).href,{waitUntil:'load'});
  await page.waitForFunction('window.ready===true',{timeout:60000});await page.evaluate(()=>{
   demo.setManual(true);demo.renderer.setSize(480,480,false);demo.camera.aspect=1;demo.camera.fov=34;demo.camera.updateProjectionMatrix();
   // Fixed floor markers exist only in this video. The follow camera otherwise
   // conceals root displacement. These are not part of the live scene.
   for(const x of [5.35,6.65])for(let z=-14;z<=9;z+=.4){const mark=demo.marker.clone();mark.visible=true;mark.scale.setScalar(.20);mark.position.set(x,.004,z);demo.scene.add(mark)}
  });pages.push(page);
 }
 const processes=pages.map((_,i)=>{
  const file=path.join(tmp,`part-${i}.mp4`),proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-framerate',String(fps),'-vcodec','mjpeg','-i','-',
   '-an','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p',file],{stdio:['pipe','ignore','pipe']});
  let stderr='';proc.stderr.on('data',b=>stderr+=b.toString());const finished=new Promise((resolve,reject)=>{
   proc.on('error',reject);proc.on('close',code=>code===0?resolve():reject(Error(`FFmpeg ${code}: ${stderr}`)));});return {proc,finished,file};
 });
 try{
  for(let i=0;i<total;i++){
   const images=await Promise.all(pages.map(page=>page.evaluate(({i,perView,idleOnly})=>{
    const d=demo,k=i%perView,view=Math.floor(i/perView);
    if(k===0){d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0}
    // 0–2 s idle; 2–4 walk, 4–5.8 released; 5.8–7.5 run,
    // 7.5–9.3 released; 9.3–10.2 run; 10.2–10.5 brief release;
    // then walk again and release. The same input is given to both scenes.
    if(!idleOnly){
      if(k===60||k===174||k===279||k===315)d.keys.add('KeyW');
      if(k===174||k===279)d.keys.add('ShiftLeft');
      if(k===120||k===225||k===306||k===357){d.keys.delete('KeyW');d.keys.delete('ShiftLeft')}
    }
    d.step(1/60);d.step(1/60);
    const {x,z}=d.player.position;
    if(view===0)d.camera.position.set(x,1.28,z-3.6); // front
    else if(idleOnly)d.camera.position.set(x+2.55,1.28,z-2.55); // three-quarter
    else if(view===1)d.camera.position.set(x+3.6,1.28,z); // side
    else if(view===2)d.camera.position.set(x,1.28,z+3.6); // back
    else d.camera.position.set(x+2.55,1.28,z-2.55); // three-quarter
    d.camera.lookAt(x,.78,z);d.camera.updateMatrixWorld();d.draw();return d.renderer.domElement.toDataURL('image/jpeg',.82);
   },{i,perView,idleOnly})));
   for(let j=0;j<2;j++){assert.ok(images[j].startsWith('data:image/jpeg;base64,'));if(!processes[j].proc.stdin.write(Buffer.from(images[j].split(',')[1],'base64')))await once(processes[j].proc.stdin,'drain')}
   if(i%210===0)console.log(`Captured ${i}/${total}`);
  }
  processes.forEach(p=>p.proc.stdin.end());await Promise.all(processes.map(p=>p.finished));
 }catch(error){processes.forEach(p=>p.proc.kill('SIGKILL'));await Promise.allSettled(processes.map(p=>p.finished));throw error}
 if(errors.length)throw Error(errors.join('\n'));
 const font=process.env.FONT_FILE||'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';if(!fs.existsSync(font))throw Error('A font with Cyrillic support is required; set FONT_FILE');
 const seconds=perView/fps;
 const viewText=views.map((name,i)=>`drawtext=fontfile=${font}:text='${name}':fontcolor=0xdecaa5:fontsize=16:x=(w-text_w)/2:y=34:enable='gte(t,${i*seconds})*lt(t,${(i+1)*seconds})'`).join(',');
 const phases=idleOnly?[['Ожидание · полный цикл',0,seconds]]:[['Ожидание',0,2],['Ходьба',2,4],['Отпущено · остановка',4,5.8],['Бег',5.8,7.5],['Отпущено · остановка',7.5,9.3],['Бег',9.3,10.2],['Отпущено',10.2,10.5],['Возобновление ходьбы',10.5,11.9],['Отпущено · ожидание',11.9,14]];
 const phaseText=views.flatMap((_,view)=>phases.map(([name,a,b])=>`drawtext=fontfile=${font}:text='${name}':fontcolor=white:fontsize=15:x=(w-text_w)/2:y=538:enable='gte(t,${view*seconds+a})*lt(t,${view*seconds+b})'`)).join(',');
 const filter=`[0:v][1:v]hstack=inputs=2,pad=960:560:0:52:color=0x202e26,drawtext=fontfile=${font}:text='ПРЕЖНЯЯ ПРОБА':fontcolor=white:fontsize=17:x=(480-text_w)/2:y=9,drawtext=fontfile=${font}:text='НОВАЯ ПРОБА':fontcolor=white:fontsize=17:x=480+(480-text_w)/2:y=9,${viewText},${phaseText}[out]`;
 const rendered=path.join(tmp,'final.mp4'),encoded=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',processes[0].file,'-i',processes[1].file,'-filter_complex',filter,
  '-map','[out]','-an','-frames:v',String(total),'-c:v','libx264','-crf','22','-preset','veryfast','-pix_fmt','yuv420p','-movflags','+faststart',rendered],{encoding:'utf8'});
 if(encoded.error||encoded.status!==0)throw Error(encoded.error||encoded.stderr);fs.mkdirSync(path.dirname(output),{recursive:true});fs.copyFileSync(rendered,output,fs.constants.COPYFILE_EXCL);
 console.log(`Video ${output}: ${fs.statSync(output).size} bytes; sha256 ${createHash('sha256').update(fs.readFileSync(output)).digest('hex')}`);
}finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true})}
