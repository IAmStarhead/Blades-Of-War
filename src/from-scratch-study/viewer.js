import * as THREE from 'three';
import data from './bodies.json';
const host=document.querySelector('#view'),scene=new THREE.Scene();scene.background=new THREE.Color(0x292f32);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
const camera=new THREE.OrthographicCamera(-2,2,1,-1,.1,30);camera.position.set(0,.9,6);camera.lookAt(0,.9,0);
scene.add(new THREE.HemisphereLight(0xffeee3,0x6e747c,1.25));const light=new THREE.DirectionalLight(0xfff3e7,2);light.position.set(-3,4,5);scene.add(light);
const ramp=new THREE.DataTexture(new Uint8Array([125,155,185,215,240,255]),6,1,THREE.RedFormat);ramp.minFilter=THREE.NearestFilter;ramp.magFilter=THREE.NearestFilter;ramp.needsUpdate=true;
const skin=new THREE.MeshToonMaterial({color:0xc49b87,gradientMap:ramp,flatShading:true,side:THREE.DoubleSide});
const eye=new THREE.MeshBasicMaterial({color:0xd3bbb0}),iris=new THREE.MeshBasicMaterial({color:0x3c4945}),brow=new THREE.MeshBasicMaterial({color:0x705548});
const figures=[];
for (const [index,key] of ['female','male'].entries()) {
 const raw=data[key],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(raw.positions,3));g.setIndex(raw.indices);g.computeVertexNormals();
 const group=new THREE.Group();group.position.x=index===0?-.52:.52;group.add(new THREE.Mesh(g,skin));
 // Simple recessed eye marks inside the sculpted sockets, no spheres.
 for(const s of [-1,1]){
  const white=new THREE.Mesh(new THREE.CircleGeometry(.021,8),eye);white.scale.y=.32;white.position.set(s*.04,1.636,.071);group.add(white);
  const pupil=new THREE.Mesh(new THREE.CircleGeometry(.006,8),iris);pupil.position.set(s*.04,1.636,.072);group.add(pupil);
  const eyebrow=new THREE.Mesh(new THREE.CircleGeometry(.023,8),brow);eyebrow.scale.y=.13;eyebrow.position.set(s*.04,1.661,.084);group.add(eyebrow);
 }
 scene.add(group);figures.push(group);
}
let focus='body';function render(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);figures.forEach((f,i)=>{f.position.x=(i===0?-1:1)*(focus==='face'?.25:.52)});const height=focus==='face'?Math.max(.50,.85*h/w):Math.max(2.05,2.4*h/w);camera.left=-height*w/h/2;camera.right=height*w/h/2;camera.top=height/2;camera.bottom=-height/2;camera.position.y=focus==='face'?1.61:.87;camera.lookAt(0,camera.position.y,0);camera.updateProjectionMatrix();renderer.render(scene,camera);}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>{const a={front:0,three:.65,side:Math.PI/2,back:Math.PI}[b.dataset.view];figures.forEach(f=>f.rotation.y=a);render()};
for(const b of document.querySelectorAll('[data-focus]'))b.onclick=()=>{focus=b.dataset.focus;render()};window.addEventListener('resize',render);render();window.previewReady=true;
