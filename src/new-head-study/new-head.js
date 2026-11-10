import * as THREE from 'three';
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
// Hand-authored cross-sections, chin to crown: height, half-width, front
// depth, rear depth, depth centre. No source-head vertices or targets used.
const rows=[
 [-.040,.030,.026,.025,.005],[-.030,.040,.050,.038,.000],[-.018,.046,.073,.047,-.002],
 [-.005,.053,.084,.052,-.005],[.010,.061,.088,.058,-.007],[.025,.067,.088,.068,-.009],
 [.040,.072,.088,.076,-.009],[.055,.078,.086,.083,-.009],[.070,.084,.084,.091,-.008],
 [.085,.085,.084,.093,-.006],[.100,.085,.083,.095,-.004],[.115,.084,.087,.096,-.002],
 [.130,.083,.088,.095,0],[.150,.080,.085,.091,.002],[.170,.072,.078,.082,.003],
 [.187,.058,.064,.066,.004],[.200,.037,.042,.043,.005],[.208,.005,.006,.006,.005]
];
function sample(y){
 let i=0;while(i<rows.length-2&&y>rows[i+1][0])i++;const a=rows[i],b=rows[i+1],dt=b[0]-a[0],t=THREE.MathUtils.clamp((y-a[0])/dt,0,1);
 return a.map((value,j)=>{if(j===0)return y;const slope=(k)=>{if(k===0)return (rows[1][j]-rows[0][j])/(rows[1][0]-rows[0][0]);if(k===rows.length-1)return (rows[k][j]-rows[k-1][j])/(rows[k][0]-rows[k-1][0]);const p=(rows[k][j]-rows[k-1][j])/(rows[k][0]-rows[k-1][0]),n=(rows[k+1][j]-rows[k][j])/(rows[k+1][0]-rows[k][0]);return p*n<=0?0:2*p*n/(p+n)};return (2*t**3-3*t*t+1)*value+(t**3-2*t*t+t)*dt*slope(i)+(-2*t**3+3*t*t)*b[j]+(t**3-t*t)*dt*slope(i+1)});
}
export function createNewHead(female){
 const vs=[],uv=[],idx=[],nr=68,ns=64, ymin=-.040,ymax=.208;
 for(let j=0;j<=nr;j++){const t=j/nr,y=ymin+(ymax-ymin)*t,r=sample(y),width=r[1]*(female?.96:1.04),h=y*(female?.96:1.04),front=r[2]*(female?.96:1.02),back=r[3]*(female?.98:1.04),center=r[4];
  for(let i=0;i<=ns;i++){let phi=(i/ns-.5)*Math.PI*2,s=Math.sin(phi),c=Math.cos(phi),x=width*s,z=center+(c>=0?front:back)*c;
   if(c>0){let xx=Math.abs(x), face=Math.pow(c,.7);
    const nose=(.019*gauss(y,.071,.037)+.008*gauss(y,.055,.014))*gauss(x,0,.012);
    const socket=-.0040*gauss(xx,.034,.017)*gauss(y,.101,.014);
    const brow=(female?.0015:.0030)*gauss(xx,.034,.020)*gauss(y,.116,.012);
    const cheek=(female?.0025:.0035)*gauss(xx,.052,.024)*gauss(y,.075,.027);
    const lips=.0025*gauss(x,0,.022)*gauss(y,.026,.011);
    z+=(nose+socket+brow+cheek+lips)*face;
   }
   vs.push(x,h,z);uv.push(i/ns,t);
  }
 }
 for(let j=0;j<nr;j++)for(let i=0;i<ns;i++){let a=j*(ns+1)+i,b=a+1,c=a+ns+1,d=c+1;idx.push(a,b,c,b,d,c)}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vs,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}
export function makeFaceMap(rig,female){
 let source=rig.headMesh.material.map.image,tmp=document.createElement('canvas');tmp.width=tmp.height=512;let ct=tmp.getContext('2d');ct.drawImage(source,0,0,512,512);let p=ct.getImageData(160,200,1,1).data;
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.fillStyle=`rgb(${p[0]},${p[1]},${p[2]})`;ctx.fillRect(0,0,512,512);
 const cy=y=>512*(1-(y+.040)/.248),cx=(x)=>256+x*512;
 const ey=cy(.101), brow=cy(.117), mouth=cy(.026);
 for(const s of [-1,1]){const x=cx(s*.069);ctx.save();ctx.translate(x,ey);ctx.scale(s,1);
  ctx.fillStyle='#dfd4c9';ctx.beginPath();ctx.moveTo(-17,0);ctx.quadraticCurveTo(0,-19,17,0);ctx.quadraticCurveTo(0,15,-17,0);ctx.fill();
  ctx.fillStyle='#68777b';ctx.beginPath();ctx.ellipse(0,0,5.3,7,0,0,2*Math.PI);ctx.fill();ctx.fillStyle='#262421';ctx.beginPath();ctx.arc(0,0,2.6,0,2*Math.PI);ctx.fill();ctx.fillStyle='#eee7dd';ctx.beginPath();ctx.arc(-.8,-1,.7,0,2*Math.PI);ctx.fill();ctx.strokeStyle='#493a34';ctx.lineWidth=1.7;ctx.beginPath();ctx.moveTo(-17,0);ctx.quadraticCurveTo(0,-19,17,0);ctx.stroke();ctx.restore();
  ctx.strokeStyle=female?'#64473d':'#47332b';ctx.lineWidth=female?3.4:5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-12,brow+1);ctx.quadraticCurveTo(x,brow-2,x+12,brow+1);ctx.stroke();
 }
 ctx.fillStyle='rgba(90,58,47,.50)';for(const sign of [-1,1]){ctx.beginPath();ctx.ellipse(256+sign*11,cy(.056),2.2,1.1,0,0,Math.PI*2);ctx.fill()}
 if(female){ctx.fillStyle='#b97f77';ctx.beginPath();ctx.moveTo(239,mouth);ctx.quadraticCurveTo(248,mouth-4,256,mouth-2);ctx.quadraticCurveTo(264,mouth-4,273,mouth);ctx.quadraticCurveTo(256,mouth+6,239,mouth);ctx.fill()}
 ctx.strokeStyle=female?'#95645e':'#806052';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(239,mouth);ctx.quadraticCurveTo(256,mouth+1.5,273,mouth);ctx.stroke();
 const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
