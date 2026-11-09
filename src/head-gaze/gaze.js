import * as THREE from 'three';
// Find the visible part of each embedded eyeball through the face mesh and
// align the iris with that opening, not merely with the centre of the sphere.
export function centerGaze(group) {
  group.updateMatrixWorld(true);
  const face=group.children[0];
  const ray=new THREE.Raycaster();
  const dir=new THREE.Vector3(0,0,-1);
  const measurements=[];
  for(const start of [1,4]) {
    const globe=group.children[start],iris=group.children[start+1],pupil=group.children[start+2];
    const radius=globe.geometry.parameters.radius;
    let sx=0,sy=0,n=0;
    for(let ix=-16;ix<=16;ix++) for(let iy=-16;iy<=16;iy++) {
      const x=globe.position.x+radius*ix/16,y=globe.position.y+radius*iy/16;
      ray.set(new THREE.Vector3(x,y,4),dir);
      const eyeHit=ray.intersectObject(globe,false)[0],skinHit=ray.intersectObject(face,false)[0];
      if(eyeHit && (!skinHit || eyeHit.distance<skinHit.distance)) {sx+=x;sy+=y;n++;}
    }
    if(n<3) {measurements.push({samples:n}); continue;}
    const x=sx/n,y=sy/n;
    for(const part of [iris,pupil]) {part.position.x=x;part.position.y=y;}
    measurements.push({samples:n,x,y});
  }
  return measurements;
}
