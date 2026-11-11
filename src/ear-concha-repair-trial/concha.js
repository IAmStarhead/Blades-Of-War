// Trial-only ear-root filler. An overlapping insert, not a topological weld.
// Kept separate so it can be compared with the unmodified accepted ear.
export function repairEarBowl(ears,female){
 for(const ear of ears){
  const root=ear.userData.root;root.visible=true;root.material=root.material.clone();
  root.material.color.multiplyScalar(.88);
  root.scale.set(.003,.012,.008);
  root.position.x-=Math.sign(root.position.x)*.0035;
  root.position.z+=female?-.002:-.004;
  root.position.y-=.002;
 }
}
