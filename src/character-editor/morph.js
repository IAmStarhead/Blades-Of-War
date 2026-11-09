const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
// Apply the controls to a fresh copy of the original anatomical base every time.
// The current mesh is a static unrigged preview, not a game-ready morph rig.
export function morphBody(original,floor,female,settings) {
 const v=Float32Array.from(original);
 const shorten=(100-settings.armLength)/100;
 const shoulder=female?1.45:1.65;
 for(let i=0;i<v.length;i+=3) {
  const x=v[i],y=v[i+1]+floor,z=v[i+2],abs=Math.abs(x),side=Math.sign(x);
  // Translate the distal arm rather than shrink the hand or individual fingers.
  const arm=smooth((abs-shoulder)/2.8)*smooth((y-8.6)/1.4);
  const delta=shorten*(female?5.1:5.5)*arm;
  v[i]-=side*delta;v[i+1]+=delta*.8;v[i+2]-=delta*.25;
  const center=1-smooth((abs-1.55)/.75);
  const hip=gauss(y-8.9,1.65)*center;
  const leg=smooth((y-.4)/7.5)*(1-smooth((y-9.2)/2.6))*center;
  v[i+1]+=(settings.legLength-100)/100*3.2*leg;
  v[i]*=1+(settings.hipWidth-100)/100*.65*hip;
  if(female) {
   const breast=gauss(abs-.83,.55)*gauss(y-12.55,.7)*smooth((z-.2)/.7);
   v[i+2]+=(settings.bust-100)/100*.85*breast;
   v[i+1]+=(settings.bust-100)/100*.12*breast;
  }
 }
 return v;
}
