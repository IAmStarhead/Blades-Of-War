import assert from 'node:assert/strict';
import {createHumanoidSkeleton, buildBaseBodyGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
for (const female of [false,true]) for (const kingdom of ['north','eden']) {
  const {metrics:m}=createHumanoidSkeleton(female,kingdom);
  const geo=buildBaseBodyGeometry(female,m), pos=geo.attributes.position, weights=geo.attributes.skinWeight;
  const r=geo.userData.limbRanges;
  for(const k of ['legL','legR','armL','armR']) {
    const [start,end]=r[k];
    assert.ok(end>start);
    for(let i=start;i<end;i++) {
      assert.ok(Number.isFinite(pos.getX(i)+pos.getY(i)+pos.getZ(i)), `${k} finite position`);
      let sum=0; for(let j=0;j<4;j++) sum+=weights.getComponent(i,j);
      assert.ok(Math.abs(sum-1)<1e-5, `${k} normalized weights`);
    }
  }
  // Newly added rings around the knee and elbow must be present on both limbs.
  const legY=(m.hipY-0.03*m.hScale)-m.thighLen-m.shinLen*0.09;
  const armY=m.shoulderY-m.upperArmLen*0.78;
  for(const [k,y] of [['legL',legY],['legR',legY],['armL',armY],['armR',armY]]) {
    const [start,end]=r[k]; let matches=0;
    for(let i=start;i<end;i++) if(Math.abs(pos.getY(i)-y)<1e-5) matches++;
    assert.ok(matches>=12, `${k}: joint transition ring`);
  }
  geo.dispose();
}
console.log('Anatomy joints: both sexes/kingdoms, intermediate rings and skin weights OK');
