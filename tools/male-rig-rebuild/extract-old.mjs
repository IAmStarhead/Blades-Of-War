import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';import fs from 'node:fs';
if(process.argv.length!==4)throw Error('Usage: node extract-old.mjs previous.glb output.json');
const root=(await new NodeIO().read(process.argv[2])).getRoot(),node=root.listNodes().find(n=>n.getName()==='head_2'),mesh=node.getMesh(),p=mesh.listPrimitives()[0];
const get=(prim,name)=>Array.from(prim.getAttribute(name).getArray());let out={positions:get(p,'POSITION'),normals:get(p,'NORMAL'),positionDelta:get(p.listTargets()[1],'POSITION'),normalDelta:get(p.listTargets()[1],'NORMAL'),indices:Array.from(p.getIndices().getArray()),joints:get(p,'JOINTS_0'),weights:get(p,'WEIGHTS_0')};
console.log(Object.fromEntries(Object.entries(out).map(([k,v])=>[k,v.length])));fs.writeFileSync(process.argv[3],JSON.stringify(out));
