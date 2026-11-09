"""Experimental implicit anatomical mannequin, generated from primitive fields.
Dependencies: numpy, scipy, scikit-image, fast-simplification. No imported body mesh.
"""
import json, numpy as np
from skimage.measure import marching_cubes
from scipy.ndimage import gaussian_filter
import fast_simplification

step=.009
x=np.arange(-.62,.621,step,dtype=np.float32)[:,None,None]
y=np.arange(-.06,1.86,step,dtype=np.float32)[None,:,None]
z=np.arange(-.32,.361,step,dtype=np.float32)[None,None,:]

def ell(c,r):
    return (np.sqrt(((x-c[0])/r[0])**2+((y-c[1])/r[1])**2+((z-c[2])/r[2])**2)-1)*min(r)
def union(a,b,k):
    h=np.maximum(k-np.abs(a-b),0)/k
    return np.minimum(a,b)-h*h*k*.25
def make(female):
    f=np.full((len(x),len(y[0]),len(z[0,0])),10,dtype=np.float32)
    def add(c,r,k=.035):
        nonlocal f
        f=union(f,ell(c,r),k)
    # Core: pelvis, waist, rib cage, shoulders. Continuous field, not separate spheres.
    add((0,.91,0),(.205 if female else .195,.17,.128),.06)
    add((0,1.065,0),(.143 if female else .17,.18,.107),.07)
    add((0,1.235,-.004),(.205 if female else .235,.19,.125),.08)
    add((0,1.32,0),(.21 if female else .255,.085,.115),.055)
    if female:
        for s in [-1,1]: add((s*.093,1.235,.086),(.079,.075,.075),.028)
    add((0,1.43,0),(.070,.115,.069),.04)
    # Head: skull, cheeks, chin, with nose and facial planes in same field.
    add((0,1.632,0),(.101,.128,.09),.02)
    add((0,1.568,.012),(.083 if female else .092,.095,.086),.018)
    add((0,1.523,.025),(.063,.04,.065),.02)
    add((0,1.608,.086),(.019,.053,.028),.012)
    add((0,1.585,.104),(.026,.017,.025),.009)
    add((0,1.544,.085),(.035,.011,.014),.004)
    # Recess a narrow mouth line and define the chin.
    f=np.maximum(f,-ell((0,1.542,.101),(.030,.0025,.009)))
    add((0,1.518,.065),(.045,.025,.034),.009)
    # Limbs formed as overlapping ellipsoids blended into torso, close to body.
    for s in [-1,1]:
        hip=.105 if female else .100
        add((s*hip,.82,0),(.112,.17,.114),.07)
        add((s*(hip+.015),.69,.005),(.09,.18,.094),.06)
        add((s*(hip+.025),.52,.005),(.067,.095,.072),.045)
        add((s*(hip+.03),.36,-.002),(.066,.155,.075),.05)
        add((s*(hip+.03),.17,.004),(.045,.15,.052),.04)
        add((s*(hip+.03),.055,.048),(.055,.049,.123),.035)
        shoulder=.23 if female else .265
        add((s*shoulder,1.28,0),(.076,.09,.085),.04)
        add((s*(shoulder+.043),1.16,0),(.057,.16,.061),.04)
        add((s*(shoulder+.053),1.005,0),(.045,.065,.049),.03)
        add((s*(shoulder+.060),.88,.012),(.045,.135,.05),.03)
        add((s*(shoulder+.062),.765,.019),(.035,.06,.041),.025)
        add((s*(shoulder+.061),.708,.025),(.046,.075,.028),.025)
        add((s*(shoulder+.018),.721,.043),(.019,.051,.021),.015)
        # Ears blend into the head rather than floating on top.
        add((s*.099,1.603,-.002),(.023,.041,.018),.008)
        # Shallow recessed sockets; no spherical protruding eyes.
        socket=ell((s*.040,1.636,.085),(.033,.018,.026))
        f=np.maximum(f,-socket)
    f=gaussian_filter(f, sigma=.55)
    verts,faces,_,_=marching_cubes(f,level=0,spacing=(step,step,step))
    verts+=np.array([x[0,0,0],y[0,0,0],z[0,0,0]])
    verts,faces=fast_simplification.simplify(verts.astype('float64'),faces.astype('int32'),target_count=6500)
    return {'positions':verts.flatten().round(5).tolist(),'indices':faces.flatten().tolist()}
json.dump({'female':make(True),'male':make(False)},open('src/from-scratch-study/bodies.json','w'),separators=(',',':'))
