// Unmodified procedural well from the previously approved nape viewer.
// Aliases map the original minified Three.js r187 names onto the same r187 API.
// The functions below are checked byte-for-byte by build.py.
import { Group as En, MeshLambertMaterial as Uo, MeshBasicMaterial as Wr,
 Mesh as X, CylinderGeometry as ca, CircleGeometry as sa, BoxGeometry as oa,
 TorusGeometry as Ao, LatheGeometry as Do, Vector2 as W, Shape as za,
 ExtrudeGeometry as wo, SphereGeometry as ko, CanvasTexture as na,
 BufferGeometry as Or, BufferAttribute as pr, RepeatWrapping as r,
 ClampToEdgeWrapping as i, LinearFilter as l, SRGBColorSpace as ze } from 'three';

function tp(e,t,n){if(typeof n==`function`)return n(e,t);let r=document.createElement(`canvas`);return r.width=e,r.height=t,r}function np(e,t,n,r,i,a){let o=e.createRadialGradient(t,n,r*.08,t,n,r);o.addColorStop(0,i),o.addColorStop(1,a),e.fillStyle=o,e.fillRect(t-r,n-r,r*2,r*2)}function rp(e,t,n,r,i,a,o,s){let c=e.createLinearGradient(0,n,0,n+i);c.addColorStop(0,a),c.addColorStop(.5,o),c.addColorStop(1,s),e.fillStyle=c,e.fillRect(t,n,r,i)}function ip(e=null){
  let t=tp(512,512,e), n=t.getContext(`2d`);
  n.fillStyle=`#2b3138`, n.fillRect(0,0,256,256);
  let ch=256/5, cw=256/3;
  // Clean 3x5 ashlar stone grid (mortar strictly on grid cell edges so sb() never hits vertical center seams!)
  for(let r=0;r<5;r++){
    let ty=r*ch;
    for(let c=0;c<3;c++){
      let sx=c*cw+3, ex=(c+1)*cw-3;
      let l=108+((r*7+c*13)%5*9-14);
      n.fillStyle=`rgb(${l}, ${l+8}, ${l+16})`, n.fillRect(sx,ty+3,ex-sx,ch-6);
      n.fillStyle=`rgba(230, 240, 250, 0.28)`, n.fillRect(sx+2,ty+3,Math.max(0,ex-sx-4),4);
      n.fillStyle=`rgba(20, 26, 32, 0.30)`, n.fillRect(sx+2,ty+ch-7,Math.max(0,ex-sx-4),4);
    }
  }
  rp(n,256,0,256,256,`#7b5c3e`,`#694d33`,`#563e28`);
  for(let e=0;e<4;e++){
    let t=256+e*64;
    n.fillStyle=e%2==0?`rgba(245, 210, 168, 0.07)`:`rgba(28, 16, 7, 0.11)`, n.fillRect(t+2,0,61,256);
    n.fillStyle=`rgba(32, 18, 8, 0.55)`, n.fillRect(t,0,2,256);
    n.fillStyle=`rgba(255, 225, 190, 0.10)`, n.fillRect(t+2,0,3,256);
    let r=48+e*67%160;
    np(n,t+33.28,r,12,`rgba(42, 24, 10, 0.32)`,`rgba(42, 24, 10, 0)`);
    n.fillStyle=`rgba(36, 20, 8, 0.45)`, n.beginPath(), n.ellipse(t+33.28,r,3.5,6.5,0,0,Math.PI*2), n.fill();
  }
  rp(n,256,0,256,36,`rgba(24, 14, 6, 0.28)`,`rgba(24, 14, 6, 0.08)`,`rgba(24, 14, 6, 0)`);
  rp(n,256,220,256,36,`rgba(24, 14, 6, 0)`,`rgba(24, 14, 6, 0.10)`,`rgba(24, 14, 6, 0.32)`);
  rp(n,0,256,256,256,`#9eaab8`,`#6b7682`,`#3e464f`);
  n.fillStyle=`#d8e2ec`;
  for(let e=24;e<240;e+=48) n.beginPath(), n.arc(e,320,5,0,Math.PI*2), n.arc(e,440,5,0,Math.PI*2), n.fill();
  return rp(n,256,256,256,256,`#f2f7fc`,`#d8e6f3`,`#adc2d7`), t;
}
function ap(e,t=!1){let n=new na(e);return n.colorSpace=ze,n.wrapS=r,n.wrapT=i,t||(n.generateMipmaps=!1,n.minFilter=l,n.magFilter=l),n.needsUpdate=!0,n}
function op(e,t,n=1,r=1){let i={stone:[.01,.49,.51,.99],wood:[.51,.99,.51,.99],beam:[.52,.73,.52,.98],iron:[.01,.49,.01,.49],snow:[.51,.99,.01,.49]},[a,o,s,c]=i[t]||i.stone,l=e.getAttribute(`uv`);if(!l)return e;for(let e=0;e<l.count;e++){let t=l.getX(e)*n,i=l.getY(e)*r,u=t>0&&t%1==0?1:(t%1+1)%1,d=i>0&&i%1==0?1:(i%1+1)%1;l.setXY(e,a+u*(o-a),s+d*(c-s))}return l.needsUpdate=!0,e}
function sb(geom, col, row){
  const uv = geom.getAttribute('uv');
  if(!uv) return geom;
  const u0 = 0.01 + ((col % 3) + 0.10) * (0.48 / 3.0);
  const u1 = 0.01 + ((col % 3) + 0.90) * (0.48 / 3.0);
  const v0 = 0.51 + ((row % 5) + 0.12) * (0.48 / 5.0);
  const v1 = 0.51 + ((row % 5) + 0.88) * (0.48 / 5.0);
  for(let k = 0; k < uv.count; k++){
    const u = Math.max(0, Math.min(1, uv.getX(k)));
    const v = Math.max(0, Math.min(1, uv.getY(k)));
    uv.setXY(k, u0 + u * (u1 - u0), v0 + v * (v1 - v0));
  }
  uv.needsUpdate = !0;
  return geom;
}
function curvedStone(rIn, rOut, h, theta0, theta1, segs=3){
  const hh = h * 0.5, pos = [], nrm = [], uv = [], idx = [];
  function quad(p0, p1, p2, p3, u0=0, u1=1, v0=0, v1=1){
    const b = pos.length / 3;
    const ax=p1[0]-p0[0], ay=p1[1]-p0[1], az=p1[2]-p0[2];
    const bx=p2[0]-p0[0], by=p2[1]-p0[1], bz=p2[2]-p0[2];
    let nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx;
    const ln = Math.hypot(nx, ny, nz) || 1;
    nx /= ln; ny /= ln; nz /= ln;
    const pts=[p0,p1,p2,p3], tcs=[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
    for(let q=0;q<4;q++){
      pos.push(pts[q][0],pts[q][1],pts[q][2]);
      nrm.push(nx,ny,nz);
      uv.push(tcs[q][0],tcs[q][1]);
    }
    idx.push(b,b+1,b+2,b,b+2,b+3);
  }
  for(let s=0;s<segs;s++){
    const a0=theta0+(s/segs)*(theta1-theta0), a1=theta0+((s+1)/segs)*(theta1-theta0);
    const u0=s/segs, u1=(s+1)/segs;
    const s0=Math.sin(a0), c0=Math.cos(a0), s1=Math.sin(a1), c1=Math.cos(a1);
    quad([s0*rOut,-hh,c0*rOut],[s1*rOut,-hh,c1*rOut],[s1*rOut,hh,c1*rOut],[s0*rOut,hh,c0*rOut], u0, u1, 0, 1);
    quad([s1*rIn,-hh,c1*rIn],[s0*rIn,-hh,c0*rIn],[s0*rIn,hh,c0*rIn],[s1*rIn,hh,c1*rIn], u0, u1, 0, 1);
    quad([s0*rOut,hh,c0*rOut],[s1*rOut,hh,c1*rOut],[s1*rIn,hh,c1*rIn],[s0*rIn,hh,c0*rIn], u0, u1, 0, 1);
    quad([s0*rIn,-hh,c0*rIn],[s1*rIn,-hh,c1*rIn],[s1*rOut,-hh,c1*rOut],[s0*rOut,-hh,c0*rOut], u0, u1, 0, 1);
  }
  const s0=Math.sin(theta0), c0=Math.cos(theta0), s1=Math.sin(theta1), c1=Math.cos(theta1);
  quad([s0*rIn,-hh,c0*rIn],[s0*rOut,-hh,c0*rOut],[s0*rOut,hh,c0*rOut],[s0*rIn,hh,c0*rIn]);
  quad([s1*rOut,-hh,c1*rOut],[s1*rIn,-hh,c1*rIn],[s1*rIn,hh,c1*rIn],[s1*rOut,hh,c1*rOut]);
  const g = new Or();
  g.setAttribute('position', new pr(new Float32Array(pos), 3));
  g.setAttribute('normal',   new pr(new Float32Array(nrm), 3));
  g.setAttribute('uv',       new pr(new Float32Array(uv),  2));
  g.setIndex(idx);
  return g;
}

function sp(e={}){
  let t = new En;
  t.name = 'BowStoneWellProp';
  let n = ip(e.canvasFactory), r_tex = ap(n);
  r_tex.wrapS = i, r_tex.wrapT = i;
  let a = new Uo({map: r_tex}),
      o = new Uo({map: r_tex, flatShading: !0}),
      s = new Uo({map: r_tex, side: 1, color: 6055022}),
      c = new Uo({color: 2891025, side: 2}),
      l = new Wr({color: 1055784});

  // 1. Ground snow drift & curved interlocking stepping stone plinth ring
  let snowBase = new X(op(new ca(.76, .95, .085, 24), 'snow', 1, 1), a);
  snowBase.position.y = .042, snowBase.receiveShadow = !0, t.add(snowBase);
  for(let k = 0; k < 14; k++){
    let a0 = (k / 14) * Math.PI * 2,
        a1 = ((k + .94) / 14) * Math.PI * 2,
        ro = .665 + ((k * 3) % 3) * .010,
        st = new X(sb(curvedStone(.52, ro, .072, a0, a1, 2), k, k + 1), o);
    st.position.y = .052, st.castShadow = !0, st.receiveShadow = !0, t.add(st);
  }

  // 2. Tight inner mortar drum, dark inner shaft, water surface
  let wallOuter = new X(op(new ca(.525, .545, .68, 24, 1, !0), 'stone', 3, 1), new Uo({map: r_tex, color: 0x7b828a}));
  wallOuter.position.y = .37, wallOuter.castShadow = !0, wallOuter.receiveShadow = !0, t.add(wallOuter);
  let wallInner = new X(op(new ca(.425, .425, .72, 20, 1, !0), 'stone', 2, 1), s);
  wallInner.position.y = .36, t.add(wallInner);
  let waterDisc = new X(new sa(.425, 18).rotateX(-Math.PI * .5), l);
  waterDisc.position.y = .25, t.add(waterDisc);

  // 3. Four staggered courses of curved interlocking voussoir stone blocks (zero protruding fins!)
  for(const [tier, [yt, rIn, rBase, nblk, ht]] of [
    [0, [.155, .48, .568, 12, .148]],
    [1, [.310, .48, .560, 12, .148]],
    [2, [.465, .48, .555, 12, .148]],
    [3, [.615, .47, .550, 12, .135]],
  ]){
    for(let k = 0; k < nblk; k++){
      let a0 = ((k + .5 * (tier % 2) + .03) / nblk) * Math.PI * 2,
          a1 = ((k + .5 * (tier % 2) + .96) / nblk) * Math.PI * 2,
          ro = rBase + ((k * 7 + tier * 3) % 3 - 1) * .009,
          blk = new X(sb(curvedStone(rIn, ro, ht, a0, a1, 2), k + tier, tier + (k % 3)), o);
      blk.position.y = yt, blk.castShadow = !0, blk.receiveShadow = !0, t.add(blk);
    }
  }

  // 4. Seamless circular stone coping cap ring (12 curved interlocking curb stones)
  for(let k = 0; k < 12; k++){
    let a0 = ((k + .025) / 12) * Math.PI * 2,
        a1 = ((k + .975) / 12) * Math.PI * 2,
        dy = ((k * 5) % 3 - 1) * .003,
        cap = new X(sb(curvedStone(.415, .578, .078, a0, a1, 3), k, 2 + (k % 2)), o);
    cap.position.y = .722 + dy, cap.castShadow = !0, cap.receiveShadow = !0, t.add(cap);
  }

  // 5. Timber posts, iron socket collars, corbels, gable rafters, king post & ridge beam
  [-.51, .51].forEach(px => {
    let shoe = new X(op(new oa(.145, .085, .145), 'iron', 1, 1), a);
    shoe.position.set(px, .775, 0), t.add(shoe);
    let band = new X(op(new oa(.135, .048, .135), 'iron', 1, 1), a);
    band.position.set(px, 1.90, 0), t.add(band);
    let post = new X(op(new oa(.115, 1.28, .115), 'beam', 1, 1), o);
    post.position.set(px, 1.38, 0), post.castShadow = !0, post.receiveShadow = !0, t.add(post);
    let br = new X(op(new oa(.075, .39, .085), 'beam', 1, 1), o);
    br.position.set(px * .77, 1.84, 0), br.rotation.z = px < 0 ? -.58 : .58, br.castShadow = !0, t.add(br);
    [-.56, .56].forEach(zs => {
      let raf = new X(op(new oa(.055, .065, .74), 'beam', 1, 1), o);
      raf.position.set(px, 2.13, zs * .5), raf.rotation.x = zs > 0 ? .58 : -.58, raf.castShadow = !0, t.add(raf);
    });
  });

  let tieBeam = new X(op(new oa(1.24, .095, .105), 'beam', 1, 1), o);
  tieBeam.position.set(0, 1.98, 0), tieBeam.castShadow = !0, t.add(tieBeam);
  let kingPost = new X(op(new oa(.085, .36, .085), 'beam', 1, 1), o);
  kingPost.position.set(0, 2.16, 0), kingPost.castShadow = !0, t.add(kingPost);
  let ridgeBeam = new X(op(new oa(1.38, .08, .09), 'beam', 1, 1), o);
  ridgeBeam.position.set(0, 2.34, 0), ridgeBeam.castShadow = !0, t.add(ridgeBeam);
  [-.64, .64].forEach(sx => [-1, 1].forEach(e => {
    let bg = new X(op(new oa(.045, .085, .78), 'beam', 1, 1), o);
    bg.position.set(sx, 2.12, e * .28), bg.rotation.x = e * .58, bg.castShadow = !0, t.add(bg);
  }));

  // 6. Stepped timber shingles, snow roof cap, rounded ridge & soft snow eave cornice (NO spiky icicle cones!)
  [-1, 1].forEach(e => {
    for(let sh = 0; sh < 4; sh++){
      let da = .08 + sh * .19,
          ysh = 2.31 - da * Math.sin(.58),
          zsh = e * (da * Math.cos(.58)),
          shg = new X(op(new oa(1.34, .042, .225), 'wood', 2, 1), o);
      shg.position.set(0, ysh, zsh), shg.rotation.x = e * .58, shg.castShadow = !0, t.add(shg);
    }
    let snowSl = new X(op(new oa(1.39, .085, .82), 'snow', 1, 1), a);
    snowSl.position.set(0, 2.175, e * .295), snowSl.rotation.x = e * .58, snowSl.castShadow = !0, t.add(snowSl);
    let eaveLip = new X(op(new ca(.042, .042, 1.39, 10), 'snow', 1, 1).rotateZ(Math.PI * .5), a);
    eaveLip.position.set(0, 1.94, e * .645), t.add(eaveLip);
  });
  let snowRidge = new X(op(new ca(.055, .055, 1.38, 10), 'snow', 1, 1).rotateZ(Math.PI * .5), a);
  snowRidge.position.set(0, 2.375, 0), t.add(snowRidge);

  // 7. Windlass axle, wooden flanges, post journal bearings, rope coils & WELDED zero-gap crank assembly!
  let axle = new X(op(new ca(.056, .056, 1.14, 12), 'beam', 1, 1).rotateZ(Math.PI * .5), o);
  axle.position.set(.02, 1.64, 0), axle.castShadow = !0, t.add(axle);
  [-.42, .42].forEach(fx => {
    let fl = new X(op(new ca(.102, .102, .036, 12), 'beam', 1, 1).rotateZ(Math.PI * .5), o);
    fl.position.set(fx, 1.64, 0), t.add(fl);
  });
  [-.51, .51].forEach(bx => {
    let ir = new X(op(new ca(.072, .072, .130, 12), 'iron', 1, 1).rotateZ(Math.PI * .5), a);
    ir.position.set(bx, 1.64, 0), t.add(ir);
  });
  for(let rc = -4; rc <= 4; rc++){
    let coil = new X(op(new Ao(.064, .012, 6, 14), 'wood', 1, 1).rotateY(Math.PI * .5), o);
    coil.position.set(rc * .024, 1.64, 0), t.add(coil);
  }
  let spindle = new X(op(new ca(.034, .034, .08, 10), 'iron', 1, 1).rotateZ(Math.PI * .5), a);
  spindle.position.set(.59, 1.64, 0), t.add(spindle);
  let crankGrp = new En;
  crankGrp.position.set(.615, 1.64, 0);
  crankGrp.rotation.x = .35;
  t.add(crankGrp);
  let crankHub = new X(op(new ca(.048, .048, .054, 10), 'iron', 1, 1).rotateZ(Math.PI * .5), a);
  crankGrp.add(crankHub);
  let crankArm = new X(op(new oa(.034, .24, .036), 'iron', 1, 1), a);
  crankArm.position.set(.012, -.105, 0), crankGrp.add(crankArm);
  let crankPin = new X(op(new ca(.012, .012, .17, 8), 'iron', 1, 1).rotateZ(Math.PI * .5), a);
  crankPin.position.set(.080, -.205, 0), crankGrp.add(crankPin);
  let crankHandle = new X(op(new ca(.021, .021, .14, 10), 'beam', 1, 1).rotateZ(Math.PI * .5), o);
  crankHandle.position.set(.095, -.205, 0), crankGrp.add(crankHandle);

  // 8. Pendulum rope & staved wooden bucket with iron hoops + bail handle
  let C = new En;
  C.position.set(0, 1.64, .04), t.add(C);
  let rope = new X(op(new ca(.013, .013, .56, 6), 'wood', 1, 1), o);
  rope.position.set(0, -.28, 0), C.add(rope);
  let bkOut = new X(op(new ca(.13, .105, .24, 12, 1, !0), 'wood', 2, 1), o);
  bkOut.position.set(0, -.62, 0), bkOut.castShadow = !0, C.add(bkOut);
  let bkIn = new X(new ca(.122, .10, .23, 12, 1, !0), c);
  bkIn.position.set(0, -.62, 0), C.add(bkIn);
  let bkWater = new X(new sa(.118, 12).rotateX(-Math.PI * .5), l);
  bkWater.position.set(0, -.54, 0), C.add(bkWater);
  let bail = new X(op(new Ao(.126, .010, 6, 14, Math.PI), 'iron', 1, 1), a);
  bail.position.set(0, -.50, 0), C.add(bail);
  let hTop = new X(op(new Ao(.123, .013, 6, 14), 'iron', 1, 1).rotateX(Math.PI * .5), a);
  hTop.position.set(0, -.55, 0), C.add(hTop);
  let hBot = new X(op(new Ao(.112, .012, 6, 14), 'iron', 1, 1).rotateX(Math.PI * .5), a);
  hBot.position.set(0, -.69, 0), C.add(hBot);

  // 9. Flagstone slab + Upgraded oak barrel with lid cross-batten & 3 iron hoops (kept intact!)
  let paver = new X(sb(new oa(.62, .045, .58), 1, 0), o);
  paver.position.set(-.68, .022, .38), paver.rotation.y = .15, paver.receiveShadow = !0, t.add(paver);
  let barrel = new X(op(new Do([new W(.195, 0), new W(.248, .28), new W(.195, .56), new W(.18, .56), new W(.18, .52)], 14), 'wood', 2, 1), o);
  barrel.position.set(-.76, .045, .28), barrel.castShadow = !0, barrel.receiveShadow = !0, t.add(barrel);
  let barrelLid = new X(op(new sa(.184, 14), 'wood', 1, 1).rotateX(-Math.PI * .5), o);
  barrelLid.position.set(-.76, .57, .28), barrelLid.receiveShadow = !0, t.add(barrelLid);
  let batten = new X(op(new oa(.32, .025, .045), 'beam', 1, 1), o);
  batten.position.set(-.76, .58, .28), batten.rotation.y = .4, t.add(batten);
  [[.12, .218], [.29, .246], [.45, .218]].forEach(([hy, hr]) => {
    let hoop = new X(op(new Ao(hr, .014, 6, 16), 'iron', 1, 1).rotateX(Math.PI * .5), a);
    hoop.position.set(-.76, .045 + hy, .28), t.add(hoop);
  });

  // 10. Curved Knight's Heater Shield with iron cross-straps & domed boss (kept intact!)
  let shGrp = new En, shShape = new za;
  shShape.moveTo(-.21, .24), shShape.quadraticCurveTo(0, .28, .21, .24),
  shShape.quadraticCurveTo(.22, -.04, 0, -.30), shShape.quadraticCurveTo(-.22, -.04, -.21, .24);
  let shGeom = new wo(shShape, {depth: .036, bevelEnabled: !0, bevelThickness: .008, bevelSize: .008, bevelSegments: 1});
  let shUv = shGeom.attributes.uv, shPos = shGeom.attributes.position;
  for(let k = 0; k < shUv.count; k++){
    shUv.setXY(k, Math.max(0, Math.min(1, (shPos.getX(k) + .24) / .48)), Math.max(0, Math.min(1, (shPos.getY(k) + .31) / .60)));
  }
  op(shGeom, 'wood', 1, 1);
  let shMesh = new X(shGeom, o);
  shMesh.castShadow = !0, shGrp.add(shMesh);
  let shCrossH = new X(op(new oa(.41, .034, .016), 'iron', 1, 1), a);
  shCrossH.position.set(0, .03, .042), shGrp.add(shCrossH);
  let shCrossV = new X(op(new oa(.034, .47, .016), 'iron', 1, 1), a);
  shCrossV.position.set(0, -.01, .042), shGrp.add(shCrossV);
  let shBoss = new X(op(new ko(.068, 10, 8), 'iron', 1, 1).scale(1, 1, .52), a);
  shBoss.position.set(0, .03, .052), shGrp.add(shBoss);
  shGrp.position.set(-.38, .31, .67), shGrp.rotation.set(-.26, .48, .06), t.add(shGrp);

  let gndShadow = new X(new sa(1.12, 28).rotateX(-Math.PI * .5), new Wr({color: 592654, transparent: !0, opacity: .36, depthWrite: !1}));
  gndShadow.position.set(-.10, .002, .08), t.add(gndShadow);

  return {
    group: t, pendulum: C, atlasCv: n, atlasTex: r_tex,
    dispose(){
      t.traverse(e => {
        e.geometry && e.geometry.dispose(),
        e.material && (Array.isArray(e.material) ? e.material : [e.material]).forEach(m => m.dispose());
      });
      r_tex.dispose();
    }
  };
}

export {sp as createApprovedWell};
