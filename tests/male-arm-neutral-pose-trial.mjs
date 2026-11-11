import assert from 'node:assert/strict';
import {createHumanoidSkeleton,BONE_IDX} from '../src/male-body-proportions-trial/body-character.js';
import {setNeutralMaleArms} from '../src/male-arm-neutral-pose-trial/neutral-arms.js';
for(const kingdom of ['north','eden']){
 const {bones}=createHumanoidSkeleton(false,kingdom);bones[BONE_IDX.FOREARM_R].rotation.x=-.16;bones[BONE_IDX.UPPER_ARM_R].rotation.z=-.11;
 setNeutralMaleArms(bones,BONE_IDX);
 const l=bones[BONE_IDX.UPPER_ARM_L].rotation,r=bones[BONE_IDX.UPPER_ARM_R].rotation;
 assert.equal(l.z,-r.z);assert.equal(l.x,r.x);assert.equal(l.y,r.y);assert.equal(bones[BONE_IDX.FOREARM_L].rotation.x,bones[BONE_IDX.FOREARM_R].rotation.x);
 for(let i=0;i<bones.length;i++)if(![BONE_IDX.UPPER_ARM_L,BONE_IDX.UPPER_ARM_R,BONE_IDX.FOREARM_L,BONE_IDX.FOREARM_R].includes(i))assert.deepEqual([bones[i].rotation.x,bones[i].rotation.y,bones[i].rotation.z],[0,0,0]);
}
console.log('Arm pose is mirrored; non-arm bones are untouched.');
