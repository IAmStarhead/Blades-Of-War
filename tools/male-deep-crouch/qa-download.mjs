// Exercise the actual GLB download link from an offline file:// viewer.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-deep-crouch'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-model-download-')),errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});
 const link=await page.$eval('a.download',a=>({href:a.href,attribute:a.getAttribute('download')}));
 assert.equal(link.href,pathToFileURL(path.join(output,'male_deep_crouch.glb')).href);assert.notEqual(link.attribute,null);
 const client=await page.target().createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:temp,eventsEnabled:true});
 const completed=new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('GLB download timed out')),20_000);let started=null;
  client.on('Browser.downloadWillBegin',e=>{started=e});
  client.on('Browser.downloadProgress',e=>{
   if(e.state==='canceled'){clearTimeout(timer);reject(new Error('GLB download canceled'))}
   if(e.state==='completed'){clearTimeout(timer);resolve({started,finished:e})}
  });
 });
 await page.click('a.download');const event=await completed;
 assert.equal(event.started.url,link.href);assert.equal(event.started.suggestedFilename,'male_deep_crouch.glb');
 const model=fs.readFileSync(path.join(output,'male_deep_crouch.glb')),downloaded=fs.readFileSync(path.join(temp,'male_deep_crouch.glb'));
 assert.deepEqual(downloaded,model);assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS: offline file:// page downloaded its neighboring GLB byte-for-byte, SHA-256 '+createHash('sha256').update(downloaded).digest('hex'));
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
