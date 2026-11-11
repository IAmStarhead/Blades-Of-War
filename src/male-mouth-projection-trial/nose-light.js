import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Test-only normal adjustment, NOT a geometry correction: reduce the sharp
// downward lighting response between nostrils and upper lip, fade on all edges.
export function softenUnderNoseNormals(g){const uv=g.attributes.uv,n=g.attributes.normal;for(let i=0;i<n.count;i++){const X=uv.getX(i)*512,Y=(1-uv.getY(i))*512,dx=Math.abs(X-256);const w=.8*(1-smooth(10,23,dx))*smooth(307,316,Y)*(1-smooth(329,341,Y));if(!w)continue;let v=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));if(v.y<0){v.y*=1-w;v.normalize();n.setXYZ(i,v.x,v.y,v.z)}}n.needsUpdate=true;}
