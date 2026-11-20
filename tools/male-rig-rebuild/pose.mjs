// Minimal CPU glTF skin evaluation for deterministic gait calibration/QA.
// Inputs here use identity mesh transforms and LINEAR TRS/weight tracks.
import {Matrix4, Object3D, LinearInterpolant, QuaternionLinearInterpolant} from '../male-library-motion/node_modules/three/build/three.module.js';

export function makeEvaluator(root, meshName, animationName) {
  const meshNode = root.listNodes().find(n => n.getName() === meshName);
  const skin = meshNode?.getSkin(), mesh = meshNode?.getMesh();
  if (!skin || !mesh) throw Error(`Missing skinned mesh ${meshName}`);
  const world = meshNode.getWorldMatrix();
  if (world.some((v,i) => Math.abs(v - ([0,5,10,15].includes(i)?1:0)) > 1e-6))
    throw Error('This evaluator requires an identity mesh world transform');
  const prim = mesh.listPrimitives()[0], jointNodes = skin.listJoints(), objs = new Map();
  for (const node of jointNodes) {
    const o = new Object3D(); o.name = node.getName();
    o.position.fromArray(node.getTranslation()); o.quaternion.fromArray(node.getRotation()); o.scale.fromArray(node.getScale());
    objs.set(node, o);
  }
  for (const node of jointNodes) for (const child of node.listChildren())
    if (objs.has(child)) objs.get(node).add(objs.get(child));
  const skelRoot = objs.get(skin.getSkeleton());
  if (!skelRoot || skelRoot.parent) throw Error('Unexpected skeleton root');
  const inv = skin.getInverseBindMatrices().getArray(), matrices = jointNodes.map(() => new Matrix4());
  const a = prim.getAttribute('POSITION').getArray(), joint = prim.getAttribute('JOINTS_0').getArray();
  const weight = prim.getAttribute('WEIGHTS_0').getArray();
  const targets = prim.listTargets().map(t => t.getAttribute('POSITION')?.getArray() || null);
  const defaults = mesh.getWeights();
  const animation = root.listAnimations().find(x => x.getName() === animationName);
  if (!animation) throw Error(`No animation ${animationName}`);
  let duration = 0, morphTrack = null; const tracks = [];
  for (const c of animation.listChannels()) {
    const sampler=c.getSampler(), input=sampler.getInput().getArray(), output=sampler.getOutput().getArray(), path=c.getTargetPath();
    if (sampler.getInterpolation() !== 'LINEAR') throw Error('Only LINEAR tracks supported');
    duration = Math.max(duration, input[input.length-1]);
    const itemSize=output.length/input.length;
    const interp = path === 'rotation' ? new QuaternionLinearInterpolant(input,output,itemSize) : new LinearInterpolant(input,output,itemSize);
    if (path === 'weights' && c.getTargetNode() === meshNode) morphTrack = interp;
    else if (objs.has(c.getTargetNode())) tracks.push({object:objs.get(c.getTargetNode()),path,interp});
  }
  const selected=[[],[]];
  for(let i=0; i<a.length/3; i++) {
    let x=a[3*i], y=a[3*i+1];
    for(let m=0;m<targets.length;m++) if(targets[m] && defaults[m]) {x+=targets[m][3*i]*defaults[m]; y+=targets[m][3*i+1]*defaults[m];}
    if(y<.16 && Math.abs(x)>.035 && Math.abs(x)<.25) selected[x>0?0:1].push(i);
  }
  if (!selected[0].length || !selected[1].length) throw Error(`No sole region in ${meshName}`);
  const perVertexTargets = targets.map(t => t && selected.some(group => group.some(i => Math.abs(t[3*i])+Math.abs(t[3*i+1])+Math.abs(t[3*i+2]) > 1e-12)) ? t : null);
  function pose(t) {
    for (const {object,path,interp} of tracks) {
      const value=interp.evaluate(t);
      if(path==='rotation')object.quaternion.fromArray(value);
      else if(path==='translation')object.position.fromArray(value);
      else if(path==='scale')object.scale.fromArray(value);
      else throw Error(`Unexpected joint path ${path}`);
    }
    skelRoot.updateMatrixWorld(true);
    jointNodes.forEach((n,i) => matrices[i].copy(objs.get(n).matrixWorld).multiply(new Matrix4().fromArray(inv,i*16)));
    return morphTrack ? morphTrack.evaluate(t) : defaults;
  }
  function lows(t) {
    const morph=pose(t), low=[Infinity,Infinity];
    for(let side=0;side<2;side++) for(const i of selected[side]) {
      let x=a[3*i],y=a[3*i+1],z=a[3*i+2];
      for(let m=0;m<perVertexTargets.length;m++) if(perVertexTargets[m] && morph[m]) {
        const d=perVertexTargets[m], w=morph[m]; x+=d[3*i]*w; y+=d[3*i+1]*w; z+=d[3*i+2]*w;
      }
      let fy=0;for(let k=0;k<4;k++) {
        let w=weight[4*i+k]; if(!w)continue;
        const e=matrices[joint[4*i+k]].elements;fy+=w*(e[1]*x+e[5]*y+e[9]*z+e[13]);
      }
      low[side]=Math.min(low[side],fy);
    }
    return low;
  }
  function rootTranslation(t) {
    const track=tracks.find(x=>x.object === skelRoot && x.path==='translation');
    if(!track)throw Error('Missing root translation');
    return Array.from(track.interp.evaluate(t));
  }
  return {duration,lows,rootTranslation,selected: selected.map(x=>x.length)};
}
