// Trial-only inward placement; whole ear moves rigidly with the head bone.
// No shape, lobe, positions within geometry, or triangle indices are changed.
export function fitFemaleEars(ears, amount=.0018){
 for(const ear of ears){const side=ear.name.endsWith('left')?-1:1;ear.position.x-=side*amount;}
}
