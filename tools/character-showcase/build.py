#!/usr/bin/env python3
"""Rebuild the repaired, self-contained character showcase from its source zip."""
import argparse, base64, copy, hashlib, io, json, math, os, re, struct, tempfile, zipfile
from pathlib import Path
from collections import defaultdict
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.spatial.transform import Rotation

REPO_ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--input', type=Path, default=REPO_ROOT / 'BladesOfWar_Adam_Eve_Showcase (3).zip', help='Original showcase zip')
parser.add_argument('--output', type=Path, default=REPO_ROOT / 'work/character-showcase/prototype', help='Directory for repaired HTML and GLBs')
args = parser.parse_args()

# The transformations below use this specific topology and archive layout.
source_hash = hashlib.sha256(args.input.read_bytes()).hexdigest()
expected_hash = '4c3d421eca3b5c9536a5b25958e4350c4d3ebd9d218ad57c00038907783ac9bc'
if source_hash != expected_hash:
    raise ValueError(f'Unexpected input archive SHA-256: {source_hash}. This build targets {expected_hash}.')
source_temp = tempfile.TemporaryDirectory(prefix='bow-showcase-source-')
SRC = source_temp.name
OUT = str(args.output.resolve())
with zipfile.ZipFile(args.input) as archive:
    for name in ('BladesOfWar_Showcase.html', 'assets/models/female_fixed.glb', 'assets/models/male_fixed.glb'):
        destination = Path(SRC) / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(archive.read(name))
os.makedirs(OUT+'/assets/models',exist_ok=True)

class Glb:
    def __init__(self,path):
        b=open(path,'rb').read(); n,typ=struct.unpack_from('<II',b,12); assert typ==0x4e4f534a
        self.j=json.loads(b[20:20+n]);p=20+n;n2,typ=struct.unpack_from('<II',b,p);assert typ==0x004e4942
        binary=b[p+8:p+8+n2];self.views=[bytearray(binary[x.get('byteOffset',0):x.get('byteOffset',0)+x['byteLength']]) for x in self.j['bufferViews']]
    def get(self,i):
        a=self.j['accessors'][i];v=self.j['bufferViews'][a['bufferView']];assert v.get('byteStride') is None
        dt=np.dtype({5120:'i1',5121:'u1',5122:'<i2',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']]);k={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        x=np.frombuffer(self.views[a['bufferView']],dtype=dt,count=a['count']*k,offset=a.get('byteOffset',0)).reshape(a['count'],k).copy()
        return x
    def put(self,i,x):
        a=self.j['accessors'][i];assert not a.get('byteOffset',0);v=self.views[a['bufferView']];b=np.ascontiguousarray(x).tobytes();assert len(b)==len(v);self.views[a['bufferView']]=bytearray(b)
    def append_f32_accessor(self, data, typ, target=34962):
        data=np.ascontiguousarray(data,dtype='<f4')
        view=len(self.views);self.views.append(bytearray(data.tobytes()))
        self.j['bufferViews'].append({'buffer':0,'byteLength':data.nbytes,'target':target})
        index=len(self.j['accessors']);self.j['accessors'].append({'bufferView':view,'componentType':5126,'count':len(data),'type':typ})
        return index
    def append_accessor(self, data, typ, component, target=None, bounds=False):
        dtypes={5121:'u1',5123:'<u2',5126:'<f4'}
        data=np.ascontiguousarray(data,dtype=dtypes[component])
        view=len(self.views);self.views.append(bytearray(data.tobytes()))
        v={'buffer':0,'byteLength':data.nbytes}
        if target is not None:v['target']=target
        self.j['bufferViews'].append(v)
        a={'bufferView':view,'componentType':component,'count':len(data),'type':typ}
        if bounds:a.update(min=[float(x) for x in data.min(0)],max=[float(x) for x in data.max(0)])
        index=len(self.j['accessors']);self.j['accessors'].append(a);return index
    def update_bounds(self):
        for i,a in enumerate(self.j['accessors']):
            if 'min' in a or 'max' in a:
                v=self.get(i)
                if 'min' in a:a['min']=[float(x) for x in v.min(0)]
                if 'max' in a:a['max']=[float(x) for x in v.max(0)]
    def save(self,path):
        binary=bytearray()
        for data,v in zip(self.views,self.j['bufferViews']):
            while len(binary)%4:binary.append(0)
            v['buffer']=0;v['byteOffset']=len(binary);v['byteLength']=len(data);binary.extend(data)
        self.j['buffers']=[{'byteLength':len(binary)}]
        js=json.dumps(self.j,ensure_ascii=False,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary+=b'\x00'*((-len(binary))%4)
        data=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary
        open(path,'wb').write(data)

def smooth(a,b,x):
    x=np.clip((x-a)/(b-a),0,1);return x*x*(3-2*x)
def normalize(x):return x/np.maximum(np.linalg.norm(x,axis=-1,keepdims=True),1e-15)

def change_shape(p,uv,left,right,rooty,arms):
    p=p.astype(float).copy();x,y=p[:,0].copy(),p[:,1].copy()
    # Separate the inner thigh surfaces smoothly, while keeping pelvis and outer silhouette.
    # Move each leg as a whole instead of squeezing its inner edge. The smooth
    # skin-weight blend preserves calf/knee contours and transitions into the pelvis.
    side_blend=np.clip((left-right)*2.0,-1,1)
    upper=1-smooth(rooty-.055,rooty+.12,y)
    p[:,0] += side_blend*.025*upper
    # Give Eve's relaxed hands a little space at the wider thighs, gradually
    # blending the adjustment up the forearm rather than shifting the wrist alone.
    p[:,0] += (arms[0]-arms[1])*.020
    # Soften the wide cheek silhouette with a broad, gentle field; leave eye
    # corners nearly stationary and taper smoothly over the neighbouring face.
    face_y=y-(1.555 if rooty < .94 else 1.67)
    cheek=np.exp(-((face_y+.020)/.040)**2)*smooth(.036,.070,np.abs(x))*smooth(.035,.085,p[:,2])
    p[:,0]*=1-.12*cheek
    # Re-parameterize the folded central nose through the symmetrical face UVs.
    u,v=uv[:,0],uv[:,1];dv=v-.5168333
    m=smooth(.809,.820,u)*(1-smooth(.895,.905,u))*(1-smooth(.015,.022,np.abs(dv)))
    target=-dv*.68
    p[:,0] += (target-p[:,0])*m
    # Soften the sharp ridge after straightening the central nose seam. The
    # adjustment is sub-centimetre and falls off before nostrils/forehead.
    rel_y=y-(1.555 if rooty < .94 else 1.67)
    tip=np.exp(-(p[:,0]/.0065)**2-(rel_y/.035)**2)
    p[:,2]-=.0020*tip*m
    return p

def relax_nose(points, groups, edges, counts, mode):
    # Two restrained Laplacian passes soften the faceted bridge after unfolding
    # the mirrored seam. Groups weld UV duplicates, keeping that seam closed.
    q=np.zeros((len(counts),3));np.add.at(q,groups,points);q/=counts[:,None]
    offy=0 if mode=='eve' else .115;offz=0 if mode=='eve' else .02
    for _ in range(2):
        y,x,z=q[:,1],q[:,0],q[:,2]
        mask=smooth(1.522+offy,1.538+offy,y)*(1-smooth(1.572+offy,1.588+offy,y))*smooth(.125+offz,.135+offz,z)*np.exp(-(x/.019)**2)
        total=np.zeros_like(q);np.add.at(total,edges[:,0],q[edges[:,1]]);degree=np.bincount(edges[:,0],minlength=len(q));
        q+=.32*mask[:,None]*(total/np.maximum(degree[:,None],1)-q)
    return q[groups]

def smooth_normals(p,faces,groups):
    tri=p[faces];fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]);acc=np.zeros_like(p,dtype=np.float64)
    for k in range(3):np.add.at(acc,faces[:,k],fn)
    gsum=np.zeros((int(groups.max())+1,3),dtype=float);np.add.at(gsum,groups,acc)
    return normalize(gsum[groups])

def rebuild_normals(old,new,original,faces):
    # Weld only coincident vertices that had the same pre-existing normal, preserving deliberate hard seams.
    keys=np.column_stack([np.round(old*1e6).astype(np.int64),np.round(original*100).astype(np.int64)])
    _,groups=np.unique(keys,axis=0,return_inverse=True)
    no=smooth_normals(old,faces,groups);nn=smooth_normals(new,faces,groups)
    return normalize(original+(nn-no)).astype('<f4')

def skin_texture(raw, female, northern):
    im=Image.open(io.BytesIO(raw)).convert('RGB'); a=np.array(im).copy()
    # Remove previously painted lashes from the brow area, retaining its surrounding skin gradient.
    x0,x1=815,854;y0,y1=447,590
    if female:
        yy=np.arange(y0,y1);left=a[yy,x0-4].astype(float);right=a[yy,x1+4].astype(float)
        for x in range(x0,x1):
            t=(x-(x0-4))/(x1+4-(x0-4));a[y0:y1,x]=np.round(left*(1-t)+right*t).astype(np.uint8)
    im=Image.fromarray(a,'RGB').convert('RGBA');s=4; overlay=Image.new('RGBA',(im.width*s,im.height*s)); d=ImageDraw.Draw(overlay)
    # Coordinates are the model's own face UV island (U vertical on face, V horizontal).
    # Fine tapered brow strokes, not the previous thick, detached cartoon lash strokes.
    rng=np.random.default_rng(1987 if female else 2931)
    brow=(84,54,43,150 if female else 160) if not northern else (70,49,43,155 if female else 170)
    for flip in [False,True]:
        vc=.5168333
        for k in range(85 if female else 105):
            t=(k+rng.uniform(-.3,.3))/(85 if female else 105);t=max(0,min(1,t));
            v=.494-(.033*t); v=2*vc-v if flip else v
            u=.825-.0045*math.sin(math.pi*t)+rng.normal(0,.00105 if female else .00125)
            length=rng.uniform(.0011,.0030);du=-length;dv=(.0010 if flip else -.0010)*rng.uniform(.3,1)
            rgba=(*brow[:3],int(brow[3]*rng.uniform(.45,.9)))
            d.line([(int(u*1024*s),int(v*1024*s)),(int((u+du)*1024*s),int((v+dv)*1024*s))],fill=rgba,width=1*s//2)
        # Upper lid edge: restrained short strokes fitted to the actual eyelid UV region.
        for k in range(23 if female else 17):
            t=(k+.3)/(23 if female else 17);v=.489-.023*t;v=2*vc-v if flip else v
            u=.8380-.0012*math.sin(math.pi*t)
            length=(.0031 if female else .0018)*(.6+.4*math.sin(math.pi*t));dv=(.0005 if flip else -.0005)*t
            d.line([(int(u*1024*s),int(v*1024*s)),(int((u-length)*1024*s),int((v+dv)*1024*s))],fill=(55,36,32,115 if female else 85),width=2)
    overlay=overlay.resize(im.size,Image.Resampling.LANCZOS);im=Image.alpha_composite(im,overlay).convert('RGB');bio=io.BytesIO();im.save(bio,format='PNG',optimize=True);return bio.getvalue()

def world_matrices(j):
    nodes=j['nodes'];parents={c:i for i,n in enumerate(nodes) for c in n.get('children',[])};cache={}
    def calc(i):
        if i not in cache:
            n=nodes[i];m=np.eye(4);m[:3,:3]=Rotation.from_quat(n.get('rotation',[0,0,0,1])).as_matrix()@np.diag(n.get('scale',[1,1,1]));m[:3,3]=n.get('translation',[0,0,0]);cache[i]=calc(parents[i])@m if i in parents else m
        return cache[i]
    for i in range(len(nodes)):calc(i)
    return cache,parents

def correct_rig(g,vertices,left,right,mode):
    j=g.j;nodes=j['nodes'];skin=j['skins'][0];names=[nodes[i]['name'] for i in skin['joints']];ids={n['name']:i for i,n in enumerate(nodes) if 'name' in n};world,parents=world_matrices(j); target={i:m[:3,3].copy() for i,m in world.items()};foot_delta={}
    for side,sgn,leg in [('L',1,left),('R',-1,right)]:
        for bone in ['upperleg01','upperleg02','lowerleg01','lowerleg02','foot']:
            idx=ids[bone+'_'+side]; p=world[idx][:3,3];mask=(leg>.25)&(abs(vertices[:,1]-p[1])<.012)&(vertices[:,0]*sgn>0);xs=vertices[mask,0]*sgn
            if len(xs)>=8:
                lo,hi=np.quantile(xs,[.02,.98]);desired=(lo+hi)/2;target[idx][0]=sgn*desired
                if bone=='foot':foot_delta[side]=target[idx][0]-p[0]
        for name,idx in ids.items():
            if name.startswith('toe') and name.endswith('_'+side):target[idx][0]+=foot_delta[side]
        # Arm and finger joints are displaced laterally relative to the shrunken hands in the source.
        amounts={'lowerarm01':.010 if mode=='eve' else .013,'lowerarm02':.020 if mode=='eve' else .026,'wrist':.039 if mode=='eve' else .052}
        for name,idx in ids.items():
            if not name.endswith('_'+side):continue
            root=name.rsplit('_',1)[0]
            if root in amounts: target[idx][0]-=sgn*amounts[root]
            elif root.startswith('metacarpal'): target[idx][0]-=sgn*(.051 if mode=='eve' else .069)
            elif root.startswith('finger'): target[idx][0]-=sgn*(.059 if mode=='eve' else .080)
            if mode=='eve':
                if root=='lowerarm01':target[idx][0]+=sgn*.006
                elif root=='lowerarm02':target[idx][0]+=sgn*.014
                elif root=='wrist' or root.startswith(('metacarpal','finger')):target[idx][0]+=sgn*.020
    # Keep every joint's global rotation unchanged while adjusting local translations.
    for i,n in enumerate(nodes):
        if i in parents:
            parent=parents[i];n['translation']=(world[parent][:3,:3].T@(target[i]-target[parent])).tolist()
        elif 'translation' in n:n['translation']=target[i].tolist()
    world,_=world_matrices(j)
    inv=np.array([np.linalg.inv(world[i]) for i in skin['joints']],dtype=np.float32).transpose(0,2,1).reshape(-1,16).astype('<f4');g.put(skin['inverseBindMatrices'],inv)
    ex=j['asset']['extras'];fq={};northq={};gq=copy.deepcopy(ex['guardLocalQuats'])
    for side,sgn in [('L',1),('R',-1)]:
        # Fitted as a slightly loose fist: avoid pressing the finger tips
        # through the palm with this source skeleton's limited deformation.
        finger_angles = [51.866, 95.140, 27.940] if mode=='eve' else [53.568, 98.757, 29.684]
        for finger in range(2,6):
            for k,ang in enumerate(finger_angles,1):
                name=f'finger{finger}_{k}_{side}';idx=ids[name];q=Rotation.from_quat(nodes[idx]['rotation']);axis=world[idx][:3,:3].T@np.array([0.,0.,-sgn]);fq[name]=(q*Rotation.from_rotvec(axis*math.radians(ang))).as_quat().tolist()
        # Thumb opposition, with angles fitted to each hand and checked for
        # thumb/finger intersections in the posed mesh. X is not mirrored;
        # rotations around Y and Z reverse across the two hands.
        if mode=='eve':
            yy,xx,zz=[-10.443,67.112,0],[38.902,41.169,8],[-19.177,7.089,0]
        else:
            yy,xx,zz=[6.391,62.438,0],[36.234,43.979,8],[-13.315,3.419,0]
        for k in range(1,4):
            name=f'finger1_{k}_{side}';idx=ids[name];q=Rotation.from_quat(nodes[idx]['rotation']);basis=world[idx][:3,:3].T
            for axis,angle in [(1,sgn*yy[k-1]),(2,sgn*zz[k-1]),(0,xx[k-1])]:
                q=q*Rotation.from_rotvec(basis[:,axis]*math.radians(angle))
            fq[name]=q.as_quat().tolist()
        if mode=='eve':
            name='upperarm01_'+side;idx=ids[name];q=Rotation.from_quat(nodes[idx]['rotation']);axis=world[idx][:3,:3].T@np.array([0.,0.,sgn])
            fq[name]=(q*Rotation.from_rotvec(axis*math.radians(2.3))).as_quat().tolist()
            northq[name]=Rotation.from_rotvec(axis*math.radians(1.5)).as_quat().tolist()
        # Guard: a balanced small outward stance with both feet parallel to the floor.
        for bn,ang in [('upperleg01',sgn*5.0),('foot',-sgn*5.0)]:
            name=bn+'_'+side;idx=ids[name];q=Rotation.from_quat(nodes[idx]['rotation']);axis=world[idx][:3,:3].T@np.array([0.,0.,1.]);gq[name]=(q*Rotation.from_rotvec(axis*math.radians(ang))).as_quat().tolist()
        for bn in ['lowerleg01']:
            name=bn+'_'+side;gq[name]=nodes[ids[name]]['rotation']
    ex['fistLocalQuats']=fq;ex['guardLocalQuats']=gq;ex['northArmOffsetQuats']=northq

def surface_intersector(vertices, faces):
    tri=vertices[faces];a,b,c=tri[:,0,:2],tri[:,1,:2],tri[:,2,:2]
    den=(b[:,1]-c[:,1])*(a[:,0]-c[:,0])+(c[:,0]-b[:,0])*(a[:,1]-c[:,1]);safe=np.where(np.abs(den)>1e-12,den,1)
    def hit(x,y):
        wa=((b[:,1]-c[:,1])*(x-c[:,0])+(c[:,0]-b[:,0])*(y-c[:,1]))/safe
        wb=((c[:,1]-a[:,1])*(x-c[:,0])+(a[:,0]-c[:,0])*(y-c[:,1]))/safe;wc=1-wa-wb
        ok=(den>1e-12)&(wa>=-1e-7)&(wb>=-1e-7)&(wc>=-1e-7)
        if not np.any(ok):return None
        z=wa*tri[:,0,2]+wb*tri[:,1,2]+wc*tri[:,2,2];idx=int(np.argmax(np.where(ok,z,-np.inf)))
        return (float(z[idx]),idx,np.array([wa[idx],wb[idx],wc[idx]]))
    return hit

def add_lashes(g,mode):
    j=g.j;v=g.get(0);uv=g.get(2);faces=g.get(5).reshape(-1,3);eye=g.get(13);ef=g.get(18).reshape(-1,3)
    joints=g.get(3);weights=g.get(4);morph=[g.get(i) for i in range(6,13)]
    # Restrict ray tests to the face, while preserving original face indices.
    center=float(np.mean(eye[:,1]));face_sel=(v[faces][:,:,1].mean(1)>center-.04)&(v[faces][:,:,1].mean(1)<center+.04)&(np.abs(v[faces][:,:,0]).max(1)<.09)
    face_ids=np.flatnonzero(face_sel);face_subset=faces[face_sel];body_hit=surface_intersector(v,face_subset);eye_hit=surface_intersector(eye,ef)
    vertices=[];normals=[];sj=[];sw=[];targets=[[] for _ in range(7)];inds=[];anchors=[]
    for side in [-1,1]:
        pos=eye[eye[:,0]*side>0];xlo=float(np.min(np.abs(pos[:,0])));xhi=float(np.max(np.abs(pos[:,0])))
        for xx in np.linspace(xlo+.002,xhi-.002,14 if mode=='eve' else 11):
            x=side*xx;visible=[]
            for y in np.linspace(center-.004,center+.023,100):
                h=body_hit(x,y);e=eye_hit(x,y)
                if e is not None and (h is None or e[0]>h[0]+.00001):visible.append(y)
            if not visible:continue
            edge=max(visible);chosen=None
            for dy in [.00015,.0003,.0005,.0008,.0012,.0018,.0026,.0035]:
                y=edge+dy;h=body_hit(x,y)
                if h is None:continue
                face=face_subset[h[1]];uv_here=h[2]@uv[face]
                if uv_here[0]>.70:
                    chosen=(y,h,face);break
            if chosen is None:continue
            y,h,face=chosen;bary=h[2];anchor=np.array([x,y-.0002,h[0]+.00055]);anchors.append((side,x,y,h[0]))
            influence={}
            for vertex,part in zip(face,bary):
                for ji,wei in zip(joints[vertex],weights[vertex]):influence[int(ji)]=influence.get(int(ji),0)+float(part*wei)
            active=sorted(influence.items(),key=lambda t:t[1],reverse=True)[:4];total=sum(max(0,w) for _,w in active) or 1
            ids=[i for i,_ in active];ww=[max(0,w)/total for _,w in active]
            while len(ids)<4:ids.append(0);ww.append(0.)
            t=(xx-xlo)/(xhi-xlo);length=(.0022+.0015*t)*(1 if mode=='eve' else .70)
            direction=np.array([side*.00035,length,.0010]);half=.00013 if mode=='eve' else .00010
            points=[anchor+[-half,0,0],anchor+[half,0,0],anchor+direction]
            offset=len(vertices);vertices.extend(points);normals.extend([[0,0,1]]*3);sj.extend([ids]*3);sw.extend([ww]*3);inds.extend([offset,offset+1,offset+2])
            for k,delta in enumerate(morph):
                mv=bary@delta[face];targets[k].extend([mv.tolist()]*3)
    if not vertices:raise RuntimeError('No eyelash anchors found')
    attrs={'POSITION':g.append_accessor(vertices,'VEC3',5126,34962,True),
           'NORMAL':g.append_accessor(normals,'VEC3',5126,34962),
           'JOINTS_0':g.append_accessor(sj,'VEC4',5121,34962),
           'WEIGHTS_0':g.append_accessor(sw,'VEC4',5126,34962)}
    index=g.append_accessor(np.array(inds).reshape(-1,1),'SCALAR',5123,34963)
    ts=[{'POSITION':g.append_accessor(target,'VEC3',5126,34962,True)} for target in targets]
    material=len(j['materials']);j['materials'].append({'name':mode+'_lashes','doubleSided':True,'pbrMetallicRoughness':{'baseColorFactor':[.105,.067,.045,1.0],'metallicFactor':0,'roughnessFactor':.88}})
    mesh=len(j['meshes']);j['meshes'].append({'name':mode+'_lashes','weights':[0.0]*7,'primitives':[{'attributes':attrs,'indices':index,'material':material,'targets':ts}]})
    node=len(j['nodes']);j['nodes'].append({'name':mode+'_lashes','mesh':mesh,'skin':0})
    # Put the skinned mesh and skeleton at the glTF scene root as required by spec.
    # The original group had identity transform and is no longer needed in the scene.
    roots=j['nodes'][0].pop('children');j['scenes'][0]['nodes']=[*roots,node]
    print(mode,'lash anchors',len(anchors))

def north_shape(new,out,uv,weights,joints,names,mode):
    result=out.copy();base=new; y=base[:,1];x=base[:,0];z=base[:,2];h=1.675 if mode=='eve' else 1.79
    if mode=='eve':
        # Keep the original chest silhouette, temper the exaggerated round north morph.
        g=np.exp(-((np.abs(x)-.085)/.065)**2-((y-1.27)/.10)**2-((z-.11)/.07)**2)
        result*=1-(.32*g[:,None])
    # A solid working build: a little more waist/hip width, rather than merely a larger chest.
    waist=smooth(h*.45,h*.50,y)*(1-smooth(h*.65,h*.70,y))
    body=[i for i,n in enumerate(names) if n.startswith(('root','spine','pelvis','upperleg'))]
    bw=np.clip((weights*np.isin(joints,body)).sum(1),0,1)
    result[:,0]+=x*waist*bw*(.055 if mode=='eve' else .045)
    # Muscle volume around the existing upper-arm axis avoids moving the joints.
    for side,sgn in [('L',1),('R',-1)]:
        arm=[i for i,n in enumerate(names) if n.endswith('_'+side) and n.startswith(('shoulder','upperarm'))]
        aw=np.clip((weights*np.isin(joints,arm)).sum(1),0,1)
        center=sgn*(.17 if mode=='eve' else .21)
        strength=.12 if mode=='eve' else .25
        result[:,0]+=(x-center)*aw*strength
        result[:,2]+=(z-.01)*aw*strength*.65
    # Slightly wider nose and lower jaw of northern characters, without changing the base face.
    u,v=uv[:,0],uv[:,1];dv=np.abs(v-.5168333)
    nose=smooth(.825,.84,u)*(1-smooth(.89,.905,u))*(1-smooth(.018,.034,dv))
    result[:,0]+=x*nose*(.08 if mode=='eve' else .12)
    jaw=smooth(.885,.90,u)*(1-smooth(.955,.975,u))*smooth(.012,.03,dv)
    result[:,0]+=x*jaw*(.035 if mode=='eve' else .06)
    # The original northern morph pushes the cheekbones out by 15–18 mm on
    # each side. Temper only its lateral head displacement, not eye alignment
    # or vertical/depth components, for a robust but human facial structure.
    chinlo,chinhi=(1.44,1.49) if mode=='eve' else (1.55,1.60)
    head=smooth(chinlo,chinhi,y)
    result[:,0]*=1-.62*head
    # The original north morph translates/reshapes hands in model space while
    # leaving the finger joints at their old bind positions. Once posed, the
    # resulting mismatch creates loops and intersections. Fade it smoothly out
    # from elbow to wrist; overall north scale still applies to the hands.
    armids=[i for i,n in enumerate(names) if n.startswith(('upperarm','lowerarm','wrist','metacarpal','finger'))]
    armw=np.clip((weights*np.isin(joints,armids)).sum(1),0,1)
    low,high=(.86,1.10) if mode=='eve' else (.92,1.18)
    hand_fade=(1-smooth(low,high,y))*armw
    result*=1-hand_fade[:,None]
    return result

for mode,filename in [('eve','female_fixed.glb'),('adam','male_fixed.glb')]:
    g=Glb(SRC+'/assets/models/'+filename); j=g.j;p=g.get(0);n=g.get(1);uv=g.get(2);joints=g.get(3);weights=g.get(4);faces=g.get(5).reshape(-1,3);names=[j['nodes'][i]['name'] for i in j['skins'][0]['joints']]
    l=[i for i,x in enumerate(names) if x.endswith('_L') and x.startswith(('pelvis','upperleg','lowerleg','foot','toe'))];r=[i for i,x in enumerate(names) if x.endswith('_R') and x.startswith(('pelvis','upperleg','lowerleg','foot','toe'))]
    wl=(weights*np.isin(joints,l)).sum(1);wr=(weights*np.isin(joints,r)).sum(1);rooty=j['nodes'][3]['translation'][1]
    # Coincident UV-seam vertices must receive the same physical edit.
    _,same=np.unique(np.round(p*1e6).astype(np.int64),axis=0,return_inverse=True)
    counts=np.bincount(same);wl=np.bincount(same,weights=wl)[same]/counts[same];wr=np.bincount(same,weights=wr)[same]/counts[same]
    arms=[]
    for side in ['L','R']:
        factors=np.array([(.30 if name.startswith('lowerarm01_') else .70 if name.startswith('lowerarm02_') else 1.0 if name.startswith(('wrist_','metacarpal','finger')) else 0.0) if name.endswith('_'+side) and mode=='eve' else 0.0 for name in names])
        aw=(weights*factors[joints]).sum(1);aw=np.bincount(same,weights=aw)[same]/counts[same];arms.append(aw)
    gf=same[faces];edges=np.unique(np.concatenate([gf[:,[0,1]],gf[:,[1,2]],gf[:,[2,0]],gf[:,[1,0]],gf[:,[2,1]],gf[:,[0,2]]]),axis=0)
    new=relax_nose(change_shape(p,uv,wl,wr,rooty,arms),same,edges,counts,mode);norm=rebuild_normals(p,new,n,faces)
    # Near the central nose, replace the inherited folded-surface normals instead
    # of preserving the old pinched shading.
    _,groups=np.unique(np.round(p*1e6).astype(np.int64),axis=0,return_inverse=True)
    ns=smooth_normals(new,faces,groups);u,v=uv[:,0],uv[:,1]
    blend=smooth(.810,.824,u)*(1-smooth(.895,.910,u))*(1-smooth(.018,.030,np.abs(v-.5168333)))
    norm=normalize(norm*(1-blend[:,None])+ns*blend[:,None]).astype('<f4')
    g.put(0,new.astype('<f4'));g.put(1,norm)
    # Deform each morph consistently and provide morph normals for smooth skin.
    base_smooth=smooth_normals(new,faces,groups)
    for i in range(6,13):
        d=g.get(i);out=relax_nose(change_shape(p+d,uv,wl,wr,rooty,arms),same,edges,counts,mode)-new
        if i==10:out=north_shape(new,out,uv,weights,joints,names,mode)
        # Duplicate positions along the original UV seams must deform identically.
        # Otherwise a race or expression morph can open visible cracks.
        avg=np.zeros((len(counts),3));np.add.at(avg,same,out);out=avg[same]/counts[same,None]
        g.put(i,out.astype('<f4'))
        delta=(smooth_normals(new+out,faces,groups)-base_smooth).astype('<f4')
        j['meshes'][0]['primitives'][0]['targets'][i-6]['NORMAL']=g.append_f32_accessor(delta,'VEC3')
    correct_rig(g,new,wl,wr,mode)
    add_lashes(g,mode)
    view=j['images'][0]['bufferView'];g.views[view]=bytearray(skin_texture(bytes(g.views[view]),mode=='eve',False))
    ex=j['asset']['extras'];ex['khladSkinPngB64']=base64.b64encode(skin_texture(base64.b64decode(ex['khladSkinPngB64']),mode=='eve',True)).decode()
    j['asset']['generator']+='; Blades Of War anatomical and rig repair prototype'
    g.update_bounds();g.save(OUT+'/assets/models/'+filename);print('built',mode)

s=open(SRC+'/BladesOfWar_Showcase.html',encoding='utf-8').read()
# Keep the mobile viewport at the intended height even after a desktop resize;
# otherwise the old canvas height becomes the flex item's new minimum height.
old_mobile_viewport='    .viewport { height: 62vh; min-height: 360px; }'
new_mobile_viewport='    .viewport { flex: 0 0 62vh; height: 62vh; min-height: 360px; }'
assert old_mobile_viewport in s;s=s.replace(old_mobile_viewport,new_mobile_viewport)
# The original badge counted the body and eyes only; keep that fact explicit.
s=s.replace('26 928 треуг. · Гладкий меш', '26 928 треуг. основы · Гладкий меш', 1)
s=s.replace('Ева (Жен., 26 928 треуг.)', 'Ева (Жен., 26 954 треуг.)', 1)
s=s.replace('Адам (Муж., 26 928 треуг.)', 'Адам (Муж., 26 950 треуг.)', 1)
old_race='''      const isKhlad = race === "khlad";
      skinMat.map = isKhlad ? khladSkinTex : zlatoSkinTex;'''
new_race='''      const isKhlad = race === "khlad";
      this.isKhlad = isKhlad;
      skinMat.map = isKhlad ? khladSkinTex : zlatoSkinTex;'''
assert old_race in s;s=s.replace(old_race,new_race)
old_pose='''      this.setMorph("fist_l", useL ? 1.0 : 0.0);'''
new_pose='''      if (this.isKhlad && mode !== "guard") {
        for (const bn in (extras.northArmOffsetQuats || {})) {
          const bone = boneMap[bn];
          if (!bone) continue;
          const d = extras.northArmOffsetQuats[bn];
          const delta = bone.quaternion.clone().set(d[0], d[1], d[2], d[3]);
          bone.quaternion.multiply(delta);
        }
      }
      this.setMorph("fist_l", useL ? 1.0 : 0.0);'''
assert old_pose in s;s=s.replace(old_pose,new_pose)
old_camera='''  const hChar = m === "adam" ? 0.90 : 0.85;
  const hFace = m === "adam" ? 1.65 : 1.54;'''
new_camera='''  const raceHeightScale = state.race === "khlad" ? (m === "adam" ? 1.04 : 1.025) : 1.0;
  const hChar = (m === "adam" ? 0.90 : 0.85) * raceHeightScale;
  const hFace = (m === "adam" ? 1.65 : 1.54) * raceHeightScale;'''
assert old_camera in s;s=s.replace(old_camera,new_camera)
old_hands='''      const hy = isGuard ? (m === "adam" ? 1.36 : 1.26) : (m === "adam" ? 0.86 : 0.81);'''
new_hands='''      const hy = (isGuard ? (m === "adam" ? 1.36 : 1.26) : (m === "adam" ? 0.86 : 0.81)) * raceHeightScale;'''
assert old_hands in s;s=s.replace(old_hands,new_hands)
# The original profile preset cropped the taller northern character at the
# head and toes. Keep a safe field-of-view margin for the scaled model.
old_profile='      camera.position.set(3.2, hChar + 0.06, 0.15);'
new_profile='      camera.position.set(3.8 * raceHeightScale, hChar + 0.06, 0.15);'
assert old_profile in s;s=s.replace(old_profile,new_profile)
old_pair='''      controls.target.set(0, 1.59, 0.72);
      camera.position.set(0, 1.61, 2.95);'''
new_pair='''      const pairFaceY = state.race === "khlad" ? 1.64 : 1.59;
      controls.target.set(0, pairFaceY, 0.72);
      camera.position.set(0, pairFaceY + 0.02, 2.95);'''
assert old_pair in s;s=s.replace(old_pair,new_pair)
# An exactly side-on view hides one character behind the other in the shared
# scene. Use a three-quarter angle there; solo profile remains truly side-on.
old_pair_profile='''      controls.target.set(0, 0.95, 0.25);
      camera.position.set(4.5, 1.25, 0.65);'''
new_pair_profile='''      controls.target.set(0, 1.15, -0.15);
      camera.position.set(4.6, 1.55, 4.45);'''
assert old_pair_profile in s;s=s.replace(old_pair_profile,new_pair_profile)
old_race_button='''  btn.onclick = () => { state.race = btn.dataset.race; applyAllState(); };'''
new_race_button='''  btn.onclick = () => {
    state.race = btn.dataset.race;
    if (cameraPresetActive) setCameraView(state.view); else applyAllState();
  };'''
assert old_race_button in s;s=s.replace(old_race_button,new_race_button)
# Pose first so camera presets can frame the actual deformed geometry.  A user
# orbit/zoom/pan is retained on resize; only untouched presets are reframed.
old_camera_start="""function setCameraView(v){
  state.view = v;"""
new_camera_start="""let cameraPresetActive = true, cameraPresetInitialized = false;
let viewportWidth = 0, viewportHeight = 0;
controls.addEventListener("start", () => { cameraPresetActive = false; });

function syncViewportSize(){
  const w = vpEl.clientWidth || 1, h = vpEl.clientHeight || 1;
  if (w === viewportWidth && h === viewportHeight) return false;
  viewportWidth = w; viewportHeight = h;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  return true;
}

// Fit whole posed bodies, faces, or the complete well, using world-space
// bounding boxes. This is only done when a preset or its state changes.
function fitCameraToContent(part, includeWell){
  const bounds = {minX: Infinity, minY: Infinity, minZ: Infinity,
                  maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity};
  function include(p){
    bounds.minX=Math.min(bounds.minX,p.x); bounds.maxX=Math.max(bounds.maxX,p.x);
    bounds.minY=Math.min(bounds.minY,p.y); bounds.maxY=Math.max(bounds.maxY,p.y);
    bounds.minZ=Math.min(bounds.minZ,p.z); bounds.maxZ=Math.max(bounds.maxZ,p.z);
  }
  if (part !== "well") {
    const characters = state.mode === "pair" ? [femaleChar, maleChar] : [state.mode === "adam" ? maleChar : femaleChar];
    for (const ch of characters) {
      const mesh=ch.bodyMesh, geom=mesh.geometry, pos=geom.attributes.position;
      const joints=geom.attributes.skinIndex, weights=geom.attributes.skinWeight;
      const head = part === "head" ? mesh.skeleton.bones.map(b => b.name === "head" || /^(special|eye)/.test(b.name)) : null;
      const p=camera.position.clone();
      ch.root.updateMatrixWorld(true); mesh.skeleton.update();
      for (let i=0; i<pos.count; ++i) {
        if (head) {
          let weight=0;
          for (let k=0; k<4; ++k) if (head[joints.getComponent(i,k)]) weight += weights.getComponent(i,k);
          if (weight < 0.35) continue;
        }
        mesh.getVertexPosition(i,p); mesh.localToWorld(p); include(p);
      }
    }
  }
  if (includeWell) {
    wellProp.group.updateMatrixWorld(true);
    wellProp.group.traverse(obj => {
      if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
      const geom=obj.geometry;
      if (!geom.boundingBox) geom.computeBoundingBox();
      const box=geom.boundingBox, p=camera.position.clone();
      for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
        p.set(x,y,z); obj.localToWorld(p); include(p);
      }
    });
  }
  if (!Number.isFinite(bounds.minX)) return;
  const direction=camera.position.clone().sub(controls.target).normalize();
  const originalDistance=camera.position.distanceTo(controls.target);
  const right=camera.position.clone().set(0,1,0).cross(direction).normalize();
  const up=direction.clone().cross(right).normalize();
  controls.target.set((bounds.minX+bounds.maxX)/2,(bounds.minY+bounds.maxY)/2,(bounds.minZ+bounds.maxZ)/2);
  const tanHalfFov=Math.tan(camera.fov*Math.PI/360), p=camera.position.clone();
  let needed=0;
  for (const x of [bounds.minX,bounds.maxX]) for (const y of [bounds.minY,bounds.maxY]) for (const z of [bounds.minZ,bounds.maxZ]) {
    p.set(x,y,z).sub(controls.target);
    const across=Math.abs(p.dot(right))/(tanHalfFov*Math.max(0.05,camera.aspect));
    const high=Math.abs(p.dot(up))/tanHalfFov;
    needed=Math.max(needed,p.dot(direction)+1.10*Math.max(across,high));
  }
  camera.position.copy(controls.target).addScaledVector(direction,Math.max(originalDistance,needed));
}

function setCameraView(v){
  state.view = v;
  cameraPresetActive = true;
  applyAllState();
  syncViewportSize();"""
assert old_camera_start in s;s=s.replace(old_camera_start,new_camera_start)
old_camera_end="""  controls.update();
  applyAllState();
}

// Bind compact UI events"""
new_camera_end="""  if (m === "well" || v === "well") fitCameraToContent("well", true);
  else if (v === "head") fitCameraToContent("head", false);
  else if (v === "full" || v === "profile") fitCameraToContent("body", m === "pair");
  controls.update();
  cameraPresetInitialized = true;
}

// Bind compact UI events"""
assert old_camera_end in s;s=s.replace(old_camera_end,new_camera_end)
old_hands_view="""  } else if(v === \"hands\"){
    const isGuard = state.hand === \"guard\";
    if(m === \"pair\"){
      const py = isGuard ? 1.32 : 0.92;
      controls.target.set(0, py, 0.72);
      camera.position.set(0, py + 0.06, 2.85);
    } else {
      const hx = state.hand === \"fist_r\" ? -0.18 : (state.hand === \"fist_l\" ? 0.18 : 0.0);
      const hy = (isGuard ? (m === \"adam\" ? 1.36 : 1.26) : (m === \"adam\" ? 0.86 : 0.81)) * raceHeightScale;
      controls.target.set(hx, hy, isGuard ? 0.18 : 0.05);
      camera.position.set(hx * 1.35 + (isGuard ? 0.22 : 0.14), hy + 0.06, isGuard ? 0.96 : 0.92);
    }
  } else { // full"""
new_hands_view="""  } else if(v === \"hands\"){
    // Fit the selected hand(s) after applying the pose, rather than using a
    // fixed torso-relative offset which clipped fists and missed the guard.
    const sides = state.hand === \"fist_l\" ? [\"L\"] : state.hand === \"fist_r\" ? [\"R\"] : [\"L\", \"R\"];
    const characters = m === \"pair\" ? [femaleChar, maleChar] : [m === \"adam\" ? maleChar : femaleChar];
    let x0=Infinity, y0=Infinity, z0=Infinity, x1=-Infinity, y1=-Infinity, z1=-Infinity;
    for (const ch of characters) {
      const mesh = ch.bodyMesh, geom = mesh.geometry;
      const positions = geom.attributes.position, joints = geom.attributes.skinIndex, weights = geom.attributes.skinWeight;
      const isHand = mesh.skeleton.bones.map(b => sides.some(side => b.name.endsWith(\"_\" + side)) && /^(wrist|metacarpal|finger)/.test(b.name));
      const p = mesh.position.clone();
      ch.root.updateMatrixWorld(true);
      mesh.skeleton.update();
      for (let i=0; i<positions.count; ++i) {
        let weight = 0;
        for (let k=0; k<4; ++k) if (isHand[joints.getComponent(i,k)]) weight += weights.getComponent(i,k);
        if (weight < 0.35) continue;
        mesh.getVertexPosition(i,p);
        mesh.localToWorld(p);
        x0=Math.min(x0,p.x); y0=Math.min(y0,p.y); z0=Math.min(z0,p.z);
        x1=Math.max(x1,p.x); y1=Math.max(y1,p.y); z1=Math.max(z1,p.z);
      }
    }
    if (Number.isFinite(x0)) {
      const x=(x0+x1)*0.5, y=(y0+y1)*0.5, z=(z0+z1)*0.5;
      const tanHalfFov=Math.tan(camera.fov*Math.PI/360);
      const halfWidth=(x1-x0)*0.5+0.035, halfHeight=(y1-y0)*0.5+0.035;
      const distance=Math.max(halfHeight/tanHalfFov,halfWidth/(tanHalfFov*Math.max(0.05,camera.aspect)),0.32)*1.10+(z1-z);
      controls.target.set(x,y,z);
      camera.position.set(x,y,z+distance);
    }
  } else { // full"""
assert old_hands_view in s;s=s.replace(old_hands_view,new_hands_view)
old_hand_button='''    if(state.view === "hands") setCameraView("hands");
    else applyAllState();'''
new_hand_button='''    if (cameraPresetActive && ["hands", "full", "profile"].includes(state.view)) setCameraView(state.view);
    else applyAllState();'''
assert old_hand_button in s;s=s.replace(old_hand_button,new_hand_button)
# When the well is hidden in solo mode, its close-up must first reveal it.
old_view_button='''  btn.onclick = () => setCameraView(btn.dataset.view);'''
new_view_button='''  btn.onclick = () => {
    if (btn.dataset.view === "well" && state.mode !== "pair") state.mode = "well";
    setCameraView(btn.dataset.view);
  };'''
assert old_view_button in s;s=s.replace(old_view_button,new_view_button)
old_resize='''function onResize(){
  const w = vpEl.clientWidth || 1, h = vpEl.clientHeight || 1;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);'''
new_resize='''function onResize(){
  const changed = syncViewportSize();
  if (changed && cameraPresetInitialized && cameraPresetActive) setCameraView(state.view);
}
window.addEventListener("resize", onResize);
// The header can wrap after a state change without a window resize.
if (typeof ResizeObserver !== "undefined") new ResizeObserver(onResize).observe(vpEl);'''
assert old_resize in s;s=s.replace(old_resize,new_resize)
old_morph='''      if(bodyMesh.morphTargetInfluences) bodyMesh.morphTargetInfluences[idx] = val;
      if(eyeMesh.morphTargetInfluences) eyeMesh.morphTargetInfluences[idx] = val;'''
new_morph='''      for (const mesh of skinnedMeshes) {
        if (mesh.morphTargetInfluences) mesh.morphTargetInfluences[idx] = val;
      }'''
assert old_morph in s;s=s.replace(old_morph,new_morph)
for key,filename in [('FEMALE_URI','female_fixed.glb'),('MALE_URI','male_fixed.glb')]:
    b64=base64.b64encode(open(OUT+'/assets/models/'+filename,'rb').read()).decode();s,n=re.subn(r'(const '+key+r'\s*=\s*"data:model/gltf-binary;base64,)[^"]+(";)',lambda m:m.group(1)+b64+m.group(2),s);assert n==1
old='''      this.setMorph("race_khlad", isKhlad ? 1.0 : 0.0);'''
new='''      this.setMorph("race_khlad", isKhlad ? 1.0 : 0.0);
      const northScale = extras.gender === "female" ? 1.025 : 1.04;
      root.scale.setScalar(isKhlad ? northScale : 1.0);'''
assert old in s;s=s.replace(old,new)
old='''  const raceLbl = state.race === "khlad" ? "Хладные Ветра (Север)" : "Златодворье (Центр)";'''
new='''  // Ground the posed characters against the plane; evaluate the skinned foot vertices.
  for (const ch of [femaleChar, maleChar]) {
    ch.root.updateMatrixWorld(true);
    const mesh = ch.bodyMesh;
    mesh.skeleton.update();
    const p = mesh.position.clone();
    const positions = mesh.geometry.attributes.position;
    let minY = Infinity;
    for (let i = 0; i < positions.count; ++i) {
      if (positions.getY(i) > 0.25) continue;
      mesh.getVertexPosition(i, p);
      mesh.localToWorld(p);
      minY = Math.min(minY, p.y);
    }
    const groundY = studioFloor.visible ? studioFloor.position.y : 0;
    if (Number.isFinite(minY)) ch.root.position.y += groundY - minY;
    ch.root.updateMatrixWorld(true);
  }

  const raceLbl = state.race === "khlad" ? "Хладные Ветра (Север)" : "Златодворье (Центр)";'''
assert old in s;s=s.replace(old,new)
open(OUT+'/BladesOfWar_Showcase.html','w',encoding='utf-8').write(s)
Path(OUT, 'README.txt').write_bytes(Path(__file__).with_name('archive_README.txt').read_bytes())
