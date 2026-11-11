import * as THREE from 'three';

// A new static proportion blockout, not the game's rigged body. Continuous
// rings along each limb record potential cut locations without making cuts.
export function buildMaleBlockout(metrics) {
 const h=metrics.hScale||1, w=metrics.wScale||1, positions=[],uvs=[],indices=[], seams=[],parts={},cuts={},ringsByPart={},shoulderBoundaries={};
 const segs=32;
 function tube(name,stations, marks={}){
   const rings=[], indexStart=indices.length, vertexStart=positions.length/3;
   for(const row of stations){
     const [y,x,z,rx,rz,tex,shape=0]=row, ring=[];
     const rowNumber=rings.length;
     for(let s=0;s<=segs;s++){
       const a=(s/segs-.5)*Math.PI*2, sn=Math.sin(a), cs=Math.cos(a);
       // Gentle planar chest rather than painted lines or hemispheres.
       const pec=name==='torso' && y>1.20 && y<1.39 && cs>0 ? .012*Math.exp(-(((Math.abs(sn)-.4)/.3)**2))*Math.exp(-(((y-1.30)/.08)**2))*cs:0;
       const shoulderSide=name==='armL'?1:name==='armR'?-1:0;
       const roundedTop=shoulderSide && rowNumber===13 ? .017*Math.pow(Math.max(0,shoulderSide*sn),1.5) : 0;
       ring.push(positions.length/3);positions.push((x+sn*rx)*w, (y+roundedTop)*h, (z+cs*rz+pec+shape*Math.max(0,cs)**2)*w);
       uvs.push(.5,1-200/512);
     }
     rings.push(ring);seams.push([ring[0],ring[segs]]);
   }
   // Stations run from bottom to top; consistent outward winding.
   ringsByPart[name]=rings;
   const maxRow=name.startsWith('arm') ? 13 : rings.length-1;
   for(let r=0;r<maxRow;r++)for(let s=0;s<segs;s++){
     // Smaller apertures in the lateral rib cage; keep chest and back intact.
     if(name==='torso' && r>=8 && r<10 && ((s>=5&&s<11)||(s>=21&&s<27))) continue;
     const a=rings[r][s],b=rings[r][s+1],c=rings[r+1][s+1],d=rings[r+1][s];indices.push(a,b,d,b,c,d);
   }
   if(name!=='torso') {
     const row=stations[0],center=positions.length/3;
     positions.push(row[1]*w,row[0]*h,row[2]*w);uvs.push(.5,1-200/512);
     for(let s=0;s<segs;s++)indices.push(center,rings[0][s+1],rings[0][s]);
   }
   for(const [key,row] of Object.entries(marks))cuts[key]={part:name,ring:rings[row].slice(0,segs),y:stations[row][0]*h};
   parts[name]={indexStart,indexCount:indices.length-indexStart,vertexStart,vertexCount:positions.length/3-vertexStart};
 }
 // Hip/rib cage/shoulder girdle and an entirely new neck in one surface.
 tube('torso',[
  [.88,0,-.01,.132,.094,300],[.925,0,-.005,.158,.109,300],
  [1.00,0,-.004,.149,.101,300],[1.015,0,-.003,.144,.098,200],[1.07,0,0,.137,.097,190],
  [1.13,0,0,.145,.101,170],[1.20,0,0,.161,.108,150],
  [1.27,0,0,.175,.113,125],[1.32,0,0,.177,.111,100],
  [1.36,0,-.003,.174,.102,80],[1.40,0,-.006,.155,.093,55],
  [1.43,0,-.007,.107,.075,40],[1.46,0,-.005,.067,.061,25],
  [1.50,0,-.003,.050,.053,16],[1.54,0,0,.047,.049,10],
  [1.585,0,0,.046,.046,6]
 ],{neck:14});
 for(const sign of [-1,1]){
  const side=sign<0?'R':'L';
  // Surface joints are intentionally separate overlaps at this early blockout.
  const sx=sign*.197;
  tube('arm'+side,[
   [.80,sx+sign*.014,.010,.010,.019,210],[.82,sx+sign*.015,.010,.018,.026,205],
   [.85,sx+sign*.016,.010,.024,.030,200], [.89,sx+sign*.016,.004,.026,.026,180],
   [.95,sx+sign*.014,0,.032,.034,155],[1.00,sx+sign*.011,-.003,.038,.040,140],
   [1.07,sx+sign*.008,-.005,.040,.043,120], [1.115,sx+sign*.006,-.005,.039,.041,105],
   [1.16,sx+sign*.005,-.006,.044,.045,90],[1.21,sx+sign*.004,-.005,.049,.050,75],
   [1.26,sx+sign*.002,-.004,.051,.055,65],[1.30,sx,-.004,.052,.059,55],
   [1.34,sx,-.004,.054,.061,45],[1.37,sx-sign*.004,-.006,.050,.058,38],
   [1.395,sx-sign*.022,-.007,.037,.049,30],[1.41,sx-sign*.040,-.008,.019,.029,24],
   [1.415,sx-sign*.045,-.008,.004,.007,20]
  ],{['wrist'+side]:3,['elbow'+side]:7,['upperArm'+side]:10,['shoulder'+side]:12});
  const hx=sign*.085;
  tube('leg'+side,[
   [.025,hx,.035,.037,.090,220],[.05,hx,.025,.038,.090,215],[.075,hx,0,.030,.062,210],
   [.12,hx,-.006,.027,.030,200],[.19,hx,-.008,.030,.033,190],[.26,hx,-.012,.039,.043,180],
   [.33,hx,-.012,.047,.051,170],[.40,hx,-.006,.045,.049,155],[.46,hx,0,.037,.042,140],
   [.50,hx,.004,.041,.044,125],[.56,hx,.004,.049,.052,110],[.64,hx,.002,.058,.059,95],
   [.73,hx,-.003,.066,.065,80],[.80,hx,-.005,.069,.068,65],
   [.82,hx,-.005,.069,.068,50],
   [.87,hx,-.005,.071,.070,300],[.91,hx,-.005,.071,.070,300],[.94,hx,-.005,.063,.060,300]
  ],{['ankle'+side]:3,['knee'+side]:9,['upperLeg'+side]:13,['hip'+side]:16});
 }
 // Join each arm loop to the rib cage opening with two shaped intermediate
 // loops. Preserve the shared boundary indices; the arm loop has 32 vertices,
 // while the opening has 16. Zipper triangles bridge their different counts.
 for(const side of ['R','L']) {
   const c=side==='R'?5:21,torso=ringsByPart.torso,arm=ringsByPart['arm'+side][13],boundary=[];
   for(let col=c+6;col>=c;col--)boundary.push(torso[8][col]);
   for(let row=9;row<=10;row++)boundary.push(torso[row][c]);
   for(let col=c+1;col<=c+6;col++)boundary.push(torso[10][col]);
   for(let row=9;row>8;row--)boundary.push(torso[row][c+6]);
   shoulderBoundaries[side]=boundary;
   const n=boundary.length,L=32;
   function xyz(i){return positions.slice(i*3,i*3+3)}
   function sample(t){let f=t*n,k=Math.floor(f)%n,a=xyz(boundary[k]),b=xyz(boundary[(k+1)%n]); f-=Math.floor(f);return a.map((v,i)=>v*(1-f)+b[i]*f)}
   let offset=0,min=Infinity;
   for(let o=0;o<L;o++){let sum=0;for(let j=0;j<L;j++){const a=sample(j/L),b=xyz(arm[(j+o)%L]);for(let k=0;k<3;k++)sum+=(a[k]-b[k])**2}if(sum<min){min=sum;offset=o}}
   const bridges=[];
   for(const t of [1/3,2/3]){const ring=[];for(let j=0;j<L;j++){
    const p=sample(j/L),q=xyz(arm[(j+offset)%L]);let v=p.map((x,i)=>x*(1-t)+q[i]*t);
    const upper=Math.max(0,Math.min(1,(p[1]/h-1.34)/.06));
    v[1]+=.012*h*upper*Math.sin(Math.PI*t);
    ring.push(positions.length/3);positions.push(...v);uvs.push(.5,1-200/512);
   }bridges.push(ring)}
   let i=0,j=0;
   while(i<n||j<L){if(i<n&&(j===L||(i+1)/n<=(j+1)/L)){indices.push(boundary[(i+1)%n],boundary[i%n],bridges[0][j%L]);i++}else{indices.push(boundary[i%n],bridges[0][j%L],bridges[0][(j+1)%L]);j++}}
   for(let j=0;j<L;j++){let next=(j+1)%L,a=bridges[0][j],an=bridges[0][next],b=bridges[1][j],bn=bridges[1][next],d=arm[(j+offset)%L],dn=arm[(next+offset)%L];indices.push(an,a,b,an,b,bn,bn,b,d,bn,d,dn)}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
 const normal=g.attributes.normal;for(const [a,b] of seams){let x=normal.getX(a)+normal.getX(b),y=normal.getY(a)+normal.getY(b),z=normal.getZ(a)+normal.getZ(b),l=Math.hypot(x,y,z)||1;normal.setXYZ(a,x/l,y/l,z/l);normal.setXYZ(b,x/l,y/l,z/l)}normal.needsUpdate=true;
 g.userData={parts,cuts,shoulderBoundaries,cutNote:'Planning loops only; no wound caps, detachment, rigging or deformation.'};return g;
}

// Separate solid-colour clothing shell for modesty in this static study.
// It is not painted into skin, not a fitted game outfit, and has no rig.
export function buildBlockoutShorts(metrics) {
 const h=metrics.hScale||1,w=metrics.wScale||1,positions=[],indices=[],segments=32;
 function shell(rows){let rings=[];for(const [y,x,z,rx,rz] of rows){let r=[];for(let s=0;s<=segments;s++){let a=(s/segments-.5)*2*Math.PI;r.push(positions.length/3);positions.push((x+rx*Math.sin(a))*w,y*h,(z+rz*Math.cos(a))*w)}rings.push(r)}for(let k=0;k<rings.length-1;k++)for(let s=0;s<segments;s++){let a=rings[k][s],b=rings[k][s+1],c=rings[k+1][s+1],d=rings[k+1][s];indices.push(a,b,d,b,c,d)}}
 shell([[.88,0,-.01,.134,.096],[.925,0,-.005,.160,.111],[1,0,-.004,.151,.103],[1.015,0,-.003,.146,.100]]);
 for(const sign of [-1,1])shell([[.82,sign*.085,-.005,.071,.070],[.87,sign*.085,-.005,.073,.072],[.91,sign*.085,-.005,.073,.072],[.94,sign*.085,-.005,.065,.062]]);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
