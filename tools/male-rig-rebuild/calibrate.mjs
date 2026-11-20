// Bake only a vertical root correction into the two copied gait clips.
// Match the previous model's per-phase lowest-foot trajectory, including flight;
// this is not foot IK and does not eliminate horizontal foot sliding.
import fs from 'node:fs';
import {NodeIO, Accessor} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from './pose.mjs';
if (process.argv.length !== 6) throw Error('Usage: node calibrate.mjs previous.glb uncorrected.glb corrected.glb report.json');
const [previous,uncorrected,output,reportPath]=process.argv.slice(2),io=new NodeIO();
const oldRoot=(await io.read(previous)).getRoot(),doc=await io.read(uncorrected),root=doc.getRoot(),buffer=root.listBuffers()[0];
const report={};
for (const [oldName,newName,n] of [['Torso_Walk','Walk_NewBody',1024],['Polish_Run','Run_NewBody',704]]) {
 const old=makeEvaluator(oldRoot,'head_2',oldName),fresh=makeEvaluator(root,'NewBody',newName);
 if(Math.abs(old.duration-fresh.duration)>1e-6)throw Error('Gait durations differ');
 const times=new Float32Array(n+1), translations=new Float32Array((n+1)*3);let deltas=[];
 for(let i=0;i<=n;i++){
  let t=old.duration*i/n, a=Math.min(...old.lows(t)), b=Math.min(...fresh.lows(t)), tr=fresh.rootTranslation(t),delta=a-b;
  times[i]=t; translations.set([tr[0],tr[1]+delta,tr[2]],i*3);deltas.push(delta);
 }
 const animation=root.listAnimations().find(a=>a.getName()===newName);
 const channel=animation.listChannels().find(c=>c.getTargetNode().getName()==='Rig_Root'&&c.getTargetPath()==='translation');
 const sampler=channel.getSampler(),oldIn=sampler.getInput(),oldOut=sampler.getOutput();
 sampler.setInput(doc.createAccessor(newName+'_corrected_time',buffer).setType(Accessor.Type.SCALAR).setArray(times));
 sampler.setOutput(doc.createAccessor(newName+'_corrected_root',buffer).setType(Accessor.Type.VEC3).setArray(translations));
 oldIn.dispose();oldOut.dispose();
 report[newName]={source:oldName,samples:n+1,durationSeconds:old.duration,soleVertices:{previous:old.selected,fresh:fresh.selected},verticalAdjustmentMinMeters:Math.min(...deltas),verticalAdjustmentMaxMeters:Math.max(...deltas),
  method:'Match the minimum of either selected foot to the previous animation at each sampled phase; keep original root X/Z and joint rotations.'};
}
await io.write(output,doc);fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
