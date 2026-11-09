// Local, bounded Laplacian smoothing on the existing anatomical surface.
// Preserve neck boundary, silhouette, and eye sockets to avoid bulging eyes.
export function blendHeadGeometry(geometry, iterations) {
  const position = geometry.attributes.position, index = geometry.index;
  const count = position.count, links = Array.from({length:count}, () => new Set());
  for(let i=0;i<index.count;i+=3) {
    const a=index.getX(i), b=index.getX(i+1), c=index.getX(i+2);
    links[a].add(b);links[a].add(c);links[b].add(a);links[b].add(c);links[c].add(a);links[c].add(b);
  }
  const original=Float32Array.from(position.array);
  let current=Float32Array.from(original);
  const gauss=(x,w)=>Math.exp(-((x/w)**2));
  for(let pass=0;pass<iterations;pass++) {
    const next=Float32Array.from(current);
    for(let i=0;i<count;i++) {
      if(links[i].size<3) continue;
      const x=original[i*3],y=original[i*3+1],z=original[i*3+2];
      // Limit smoothing to the face, fade at the jaw and side silhouette.
      const front=Math.max(0,Math.min(1,(z-.02)/.40));
      const side=Math.max(0,Math.min(1,(.77-Math.abs(x))/.17));
      const height=Math.max(0,Math.min(1,(y+.91)/.20));
      // Eyes need their existing anatomical eyelid contours and placement.
      const eye=gauss(Math.abs(x)-.293,.17)*gauss(y-.065,.16);
      // Lips and nose are anatomical landmarks; excessive smoothing collapses them.
      const mouth=gauss(x,.23)*gauss(y+.59,.13);
      const nose=gauss(x,.16)*gauss(y+.26,.21);
      const weight=.25*front*side*height*(1-.92*eye)*(1-.90*mouth)*(1-.75*nose);
      if(weight===0) continue;
      let ax=0,ay=0,az=0;
      for(const j of links[i]) { ax+=current[j*3];ay+=current[j*3+1];az+=current[j*3+2]; }
      const n=links[i].size;
      next[i*3]+=(ax/n-current[i*3])*weight;
      next[i*3+1]+=(ay/n-current[i*3+1])*weight;
      next[i*3+2]+=(az/n-current[i*3+2])*weight;
    }
    current=next;
  }
  position.array.set(current);position.needsUpdate=true;geometry.computeVertexNormals();
}
