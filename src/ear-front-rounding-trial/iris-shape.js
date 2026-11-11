import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
export function sampleX(X,Y){const cx=X<256?224.5:287.5,dx=X-cx;const weight=(1-smooth(8,12.5,Math.abs(dx)))*smooth(248.3,250.1,Y)*(1-smooth(254.5,257,Y));return X+dx*(1/.90-1)*weight;}
// A static UV warp, applied symmetrically to the drawn irises. No camera- or
// angle-dependent movement; sample the original pupils, colour and glints.
export function narrowIris(rig){const source=rig.headMesh.material.map,im=source.image,w=im.width,h=im.height,c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,w,h),out=img.data,src=out.slice();
 function sample(x,y,k){const a=Math.max(0,Math.min(w-1,x)),x0=Math.floor(a),x1=Math.min(w-1,x0+1),t=a-x0;return src[(y*w+x0)*4+k]*(1-t)+src[(y*w+x1)*4+k]*t}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const X=x*512/w,Y=y*512/h,s=sampleX(X,Y);
  if(s===X)continue;const sx=s*w/512,i=(y*w+x)*4;for(let k=0;k<3;k++)out[i+k]=sample(sx,y,k);
 }
 ctx.putImageData(img,0,0);const map=source.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;
}
