// Warp the existing eye/brow artwork upward together. Coordinates are on the
// 512px head texture; geometry, ear, mouth and brow-eye spacing are untouched
// wherever the mask has full weight. Feather outside the drawing to avoid seams.
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
export function raisePixels(data,w,h,amount=6){const src=data.slice(),out=data.slice();
 function sample(x,y,k){y=Math.max(0,Math.min(h-1,y));const y0=Math.floor(y),y1=Math.min(h-1,y0+1),f=y-y0;return src[(y0*w+x)*4+k]*(1-f)+src[(y1*w+x)*4+k]*f}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x*512/w,Y=y*512/h,ad=Math.abs(X-256);const mask=smooth(7,14,ad)*(1-smooth(60,77,ad))*smooth(202,218,Y)*(1-smooth(270,290,Y));const sy=y+amount*mask*h/512,i=(y*w+x)*4;for(let k=0;k<4;k++)out[i+k]=sample(x,sy,k)}return out;
}
export function raiseMaleArtwork(rig){const source=rig.headMesh.material.map,im=source.image,c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const img=ctx.getImageData(0,0,c.width,c.height);img.data.set(raisePixels(img.data,c.width,c.height));ctx.putImageData(img,0,0);const map=source.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material=rig.headMesh.material.clone();rig.headMesh.material.map=map;}
