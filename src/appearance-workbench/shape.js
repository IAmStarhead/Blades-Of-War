const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const gauss=(x,w)=>Math.exp(-((x/w)**2));
// Applied to a fresh, already posed neutral-study base on every refresh.
export function shapeBody(original,floor,female,settings) {
 const v=Float32Array.from(original);
 for(let i=0;i<v.length;i+=3){
  const x=v[i],y=v[i+1]+floor,z=v[i+2],ax=Math.abs(x),side=Math.sign(x);
  const center=1-smooth((ax-1.5)/1.0),torso=gauss(y-10.6,3.1)*center,legs=gauss(y-5.9,2.9)*center;
  const mass=(settings.build-100)/100;
  v[i]*=1+mass*(.42*torso+.28*legs);v[i+2]+=z*mass*(.40*torso+.25*legs);
  const arm=gauss(ax-(female?2.25:2.4),.68)*gauss(y-12.9,1.05)*smooth((ax-1.35)/.65);
  const m=(settings.muscle-100)/100;
  v[i]+=side*m*.62*arm;v[i+2]+=z*m*.23*arm;
  if(female){const breast=gauss(ax-.83,.55)*gauss(y-12.55,.7)*smooth((z-.2)/.7);v[i+2]+=(settings.bust-110)/100*.85*breast;v[i+1]+=(settings.bust-110)/100*.12*breast;}
 }
 return v;
}
