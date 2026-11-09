const clamp=(x)=>Math.max(0,Math.min(1,x));
const smooth=(x)=>{x=clamp(x);return x*x*(3-2*x)};
export function adjustFemaleVertices(v,floor) {
 for(let i=0;i<v.length;i+=3){
   const x=v[i], y=v[i+1]+floor,z=v[i+2];
   const centerMask=1-smooth((Math.abs(x)-1.55)/.75);
   const vertical=smooth((y-.4)/7.5)*(1-smooth((y-9.2)/2.6));
   v[i+1]+=.48*vertical*centerMask;
   const hip=Math.exp(-(((y-8.9)/1.65)**2))*centerMask;
   v[i]*=1-.045*hip;
   const rear=smooth((-z-.35)/.6);
   v[i+2]+=.23*hip*rear;
 }
}
