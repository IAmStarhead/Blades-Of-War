// Optional zero-dependency preview for the trial and its unmodified comparison.
// Serves MP4 byte ranges so browser video seeking also works in the preview.
// Usage: PORT=4365 node tools/male-idle-stop-trial/serve.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const root=path.join(repo,'work');
const allowed=['male-idle-stop-trial','male-stealth-posture-trial','male-leg-human-trial'];
const port=Number(process.env.PORT||4365);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const types={'.html':'text/html; charset=utf-8','.md':'text/plain; charset=utf-8',
 '.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8',
 '.jpg':'image/jpeg','.png':'image/png','.mp4':'video/mp4'};
http.createServer((req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
 let file;
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://preview').pathname);
  if(pathname==='/'){res.writeHead(302,{Location:'/male-idle-stop-trial/index.html'});return res.end();}
  if(pathname.includes('\0'))throw Error('invalid path');
  if(!allowed.some(name=>pathname==='/' + name||pathname.startsWith('/' + name + '/'))){res.writeHead(404);return res.end();}
  file=path.resolve(root,'.'+pathname);
  if(!allowed.some(name=>file===path.join(root,name)||file.startsWith(path.join(root,name)+path.sep))){res.writeHead(403);return res.end();}
  if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');
  if(!fs.statSync(file).isFile())throw Error('not a file');
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
 const size=fs.statSync(file).size,headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream',
  'Accept-Ranges':'bytes','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'};
 let start=0,end=size-1,status=200;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}
  if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
  else{const suffix=Number(match[2]);start=Math.max(0,size-suffix);end=size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){
   res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();
  }
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);
 if(req.method==='HEAD'||!size)return res.end();
 const stream=fs.createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);
}).listen(port,'0.0.0.0',()=>console.log(`Idle and stopping preview: http://0.0.0.0:${port}/`));
