// Small flat-ground navigation for the single showcase prop. This is not a
// navmesh or a general-purpose game pathfinder.
export const WELL={x:-.8,z:.08,radius:1.40};
export const EXTENT=11;
const EPS=1e-9,TAU=Math.PI*2;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(o,r,a)=>({x:o.x+r*Math.cos(a),z:o.z+r*Math.sin(a)});
function outside(p,o,r,fallback){
 const x=p.x-o.x,z=p.z-o.z,d=Math.hypot(x,z);
 if(d>=r)return {x:p.x,z:p.z};
 const vx=d>EPS?x:(fallback.x-o.x),vz=d>EPS?z:(fallback.z-o.z),m=Math.hypot(vx,vz);
 return {x:o.x+r*(m>EPS?vx/m:1),z:o.z+r*(m>EPS?vz/m:0)};
}
export function segmentDistance(a,b,o=WELL){
 const dx=b.x-a.x,dz=b.z-a.z,q=dx*dx+dz*dz;
 const t=q>EPS?clamp(((o.x-a.x)*dx+(o.z-a.z)*dz)/q,0,1):0;
 return Math.hypot(a.x+t*dx-o.x,a.z+t*dz-o.z);
}
function sweep(a,b,dir){let d=(b-a)%TAU;if(dir>0&&d<0)d+=TAU;if(dir<0&&d>0)d-=TAU;return d}
function around(start,end,o,r,dir){
 const ax=start.x-o.x,az=start.z-o.z,bx=end.x-o.x,bz=end.z-o.z;
 const da=Math.hypot(ax,az),db=Math.hypot(bx,bz);
 const aa=Math.atan2(az,ax)+dir*Math.acos(clamp(r/da,-1,1));
 const bb=Math.atan2(bz,bx)-dir*Math.acos(clamp(r/db,-1,1));
 const arc=sweep(aa,bb,dir),a=point(o,r,aa),b=point(o,r,bb),n=Math.max(1,Math.ceil(Math.abs(arc)/.18));
 const path=[a];for(let i=1;i<=n;i++)path.push(point(o,r,aa+arc*i/n));path.push(end);
 return {path,length:dist(start,a)+r*Math.abs(arc)+dist(b,end)};
}
export function plan(start,requested,o=WELL){
 const r=o.radius+.10;
 const wanted={x:clamp(requested.x,-EXTENT,EXTENT),z:clamp(requested.z,-EXTENT,EXTENT)};
 const end=outside(wanted,o,r+.02,start),near=outside(start,o,r+.02,end),prefix=dist(near,start)>1e-7?[near]:[];
 if(dist(near,end)<.015)return {target:end,waypoints:prefix.length?prefix:[end],detour:false};
 if(segmentDistance(near,end,o)>=r)return {target:end,waypoints:[...prefix,end],detour:false};
 const l=around(near,end,o,r,1),right=around(near,end,o,r,-1),chosen=l.length<=right.length?l:right;
 return {target:end,waypoints:[...prefix,...chosen.path],detour:true};
}
export function slide(start,delta,o=WELL){
 const next={x:clamp(start.x+delta.x,-EXTENT,EXTENT),z:clamp(start.z+delta.z,-EXTENT,EXTENT)};
 const safe=outside(next,o,o.radius+.001,start);
 if(segmentDistance(start,safe,o)>=o.radius)return safe;
 // A large time step must not tunnel from one side of the circle to the other.
 // Solve the first segment/circle intersection and stop just before it.
 const x=start.x-o.x,z=start.z-o.z,dx=safe.x-start.x,dz=safe.z-start.z;
 const a=dx*dx+dz*dz,b=2*(x*dx+z*dz),c=x*x+z*z-(o.radius+.0001)**2;
 const disc=Math.max(0,b*b-4*a*c),t=a>EPS?clamp((-b-Math.sqrt(disc))/(2*a)-1e-5,0,1):0;
 return outside({x:start.x+t*dx,z:start.z+t*dz},o,o.radius+.0001,start);
}
