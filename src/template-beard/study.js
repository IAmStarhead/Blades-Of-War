import * as THREE from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {unzipSync} from 'three/examples/jsm/libs/fflate.module.js';
const zipResponse=await fetch('/Character_Template.zip');if(!zipResponse.ok)throw Error('Архив Template не найден');
const archive=unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
const raw=archive['Character_Template/Exported_Files/Male.fbx'];if(!raw)throw Error('Male.fbx отсутствует');
const fbx=new FBXLoader().parse(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');fbx.updateMatrixWorld(true);let source;fbx.traverse(o=>{if(o.isMesh)source=o});if(!source)throw Error('Нет меша в шаблоне');
// Subdivide the face locally before shaping the nose and eye region. The
// remainder of the source template is untouched. Each triangle has independent
// vertices, preserving the angular planes in the original body.
let original=source.geometry.clone();original.applyMatrix4(source.matrixWorld);if(original.index)original=original.toNonIndexed();
const src=original.attributes.position.array,out=[];
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function facePoint(p){let [x,y,z]=p;if(y>59.1&&y<63.4&&z>2.8){const g=(v,w)=>Math.exp(-((v/w)**2));let nose=.48*g(x,.47)*g(y-60.9,1.05);let tip=.18*g(x,.5)*g(y-60.25,.34);let eye=-.20*g(Math.abs(x)-.84,.42)*g(y-61.84,.28);z+=nose+tip+eye;}return [x,y,z]}
function tri(a,b,c,level){if(level&&Math.max(a[1],b[1],c[1])>59&&Math.min(a[1],b[1],c[1])<63.5&&Math.max(a[2],b[2],c[2])>2.8){let ab=lerp(a,b,.5),bc=lerp(b,c,.5),ca=lerp(c,a,.5);tri(a,ab,ca,level-1);tri(ab,b,bc,level-1);tri(ca,bc,c,level-1);tri(ab,bc,ca,level-1)}else{out.push(...facePoint(a),...facePoint(b),...facePoint(c));}}
for(let i=0;i<src.length;i+=9)tri(Array.from(src.slice(i,i+3)),Array.from(src.slice(i+3,i+6)),Array.from(src.slice(i+6,i+9)),2);
const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(out,3));geometry.computeVertexNormals();
const skin=new THREE.MeshStandardMaterial({color:0xc49a83,roughness:1,flatShading:true,side:THREE.DoubleSide});
const body=new THREE.Mesh(geometry,skin),figure=new THREE.Group();figure.add(body);figure.updateMatrixWorld(true);
const ray=new THREE.Raycaster(),beardMat=new THREE.MeshStandardMaterial({color:0x40312b,roughness:1,flatShading:true,side:THREE.DoubleSide}),dark=new THREE.MeshStandardMaterial({color:0x372b27,roughness:1,side:THREE.DoubleSide});
// Project deliberate polygon strips onto the actual template head. Surface depth
// is sampled rather than placing a primitive nose or a floating beard ball.
function onFace(x,y,offset=.1){ray.set(new THREE.Vector3(x,y,15),new THREE.Vector3(0,0,-1));const h=ray.intersectObject(body,false)[0];return h?new THREE.Vector3(x,y,h.point.z+offset):null;}
function patch(fn, cols,rows,material){const v=[],idx=[],ok=[];for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){let p=fn(i/cols,j/rows);ok.push(!!p);v.push(...(p?p.toArray():[0,0,0]));}for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){let a=j*(cols+1)+i,b=a+1,c=a+cols+1,d=c+1;if(ok[a]&&ok[b]&&ok[c])idx.push(a,b,c);if(ok[b]&&ok[c]&&ok[d])idx.push(b,d,c)}let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();figure.add(new THREE.Mesh(g,material));}
// Deliberately modeled broad planes, rather than dense ray-projected strips.
// Values in the template's coordinate system; a small clearance avoids clipping.
{
 const xs=[-2.2,-1.65,-.85,0,.85,1.65,2.2], upper=[60.1,59.95,59.44,59.20,59.44,59.95,60.1], lower=[58.75,58.05,57.52,57.25,57.52,58.05,58.75], depth=[3.75,4.20,4.92,5.13,4.92,4.20,3.75];
 const v=[],ix=[];
 for(let row=0;row<3;row++)for(let i=0;i<xs.length;i++){let t=row/2;v.push(xs[i],upper[i]*(1-t)+lower[i]*t,depth[i]+(row===1?.20:row===2?-.25:0));}
 for(let row=0;row<2;row++)for(let i=0;i<xs.length-1;i++){let a=row*xs.length+i,b=a+1,c=a+xs.length,d=c+1;ix.push(a,b,c,b,d,c)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(ix);g.computeVertexNormals();figure.add(new THREE.Mesh(g,beardMat));
}
// Moustache follows the face, with a shallow central notch under the nose.
patch((u,v)=>{let x=(u*2-1)*1.15,y=(59.87-.15*Math.abs(x))*(1-v)+(59.51-.10*Math.abs(x))*v;return onFace(x,y,.32)},20,3,beardMat);
// A slim mouth line remains visible between moustache and beard.
patch((u,v)=>onFace((u*2-1)*.66,59.32+(v-.5)*.08,.32),12,1,dark);
// Monochrome, deliberately simple narrow eye marks and subdued brows.
for(const s of [-1,1]){
 patch((u,v)=>onFace(s*(.40+.92*u),61.82+(v-.5)*.12,.22),6,1,dark);
 patch((u,v)=>onFace(s*(.36+1.02*u),62.16+(v-.5)*.10,.22),6,1,beardMat);
}
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color(0x2b3135);scene.add(figure);
scene.add(new THREE.HemisphereLight(0xfff0e0,0x6b6c70,1.55));const light=new THREE.DirectionalLight(0xfff4e9,2);light.position.set(-40,90,60);scene.add(light);
const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,500);camera.position.set(0,60,180);camera.lookAt(0,60,0);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(renderer.domElement);
let focus='face';function render(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);let height=focus==='face'?Math.max(13,14*h/w):Math.max(75,65*h/w);camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.top=height/2;camera.bottom=-height/2;camera.position.y=focus==='face'?60.5:33;camera.lookAt(0,camera.position.y,0);camera.updateProjectionMatrix();renderer.render(scene,camera)}
for(const b of document.querySelectorAll('[data-angle]'))b.onclick=()=>{figure.rotation.y=Number(b.dataset.angle);render()};for(const b of document.querySelectorAll('[data-focus]'))b.onclick=()=>{focus=b.dataset.focus;render()};window.addEventListener('resize',render);render();window.previewReady=true;
