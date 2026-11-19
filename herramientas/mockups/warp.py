import numpy as np, io
from psd_tools import PSDImage
from psd_tools.constants import Tag
from PIL import Image
def find(layers,name):
    for l in layers:
        if l.name==name: return l
        if l.is_group():
            r=find(l,name)
            if r: return r
def bern(t):
    t=np.asarray(t); s=1-t
    return np.stack([s**3, 3*s*s*t, 3*s*t*t, t**3],-1)
def homography(src, dst):
    A=[];b=[]
    for (x,y),(X,Y) in zip(src,dst):
        A.append([x,y,1,0,0,0,-X*x,-X*y]); b.append(X)
        A.append([0,0,0,x,y,1,-Y*x,-Y*y]); b.append(Y)
    h=np.linalg.solve(np.array(A),np.array(b)); return np.append(h,1).reshape(3,3)
def applyH(H,pts):
    p=np.c_[pts,np.ones(len(pts))]@H.T; return p[:,:2]/p[:,2:]
def smart_info(l):
    d=l.tagged_blocks.get_data(Tag.SMART_OBJECT_LAYER_DATA1).data
    na=list(d[b'nonAffineTransform'].values) if hasattr(d[b'nonAffineTransform'],'values') else list(d[b'nonAffineTransform'])
    W=float(d[b"Sz  "][b"Wdth"]); Hh=float(d[b"Sz  "][b"Hght"])
    q=d.get(b'quiltWarp'); w=d[b'warp']
    if q is not None and b'customEnvelopeWarp' in q:
        e=q[b'customEnvelopeWarp']
        sx=list(e[b'quiltSliceX'][b'quiltSliceX'].values); sy=list(e[b'quiltSliceY'][b'quiltSliceY'].values)
        mesh=(list(e[b'meshPoints'][b'Hrzn'].values), list(e[b'meshPoints'][b'Vrtc'].values))
        kind="quilt"
    elif b'customEnvelopeWarp' in w:
        e=w[b'customEnvelopeWarp']; sx=[0,W]; sy=[0,Hh]
        mesh=(list(e[b'meshPoints'][b'Hrzn'].values), list(e[b'meshPoints'][b'Vrtc'].values)); kind="env"
    else:
        sx=[0,W]; sy=[0,Hh]; mesh=None; kind="none"
    na=[float(x) for x in na]
    sx=[float(x) for x in sx]; sy=[float(x) for x in sy]
    if mesh: mesh=([float(x) for x in mesh[0]],[float(x) for x in mesh[1]])
    return dict(na=np.array(na).reshape(4,2), W=W, H=Hh, sx=np.array(sx), sy=np.array(sy), mesh=mesh, kind=kind)
def warp_points(info, u, v):
    """u,v en píxeles de la fuente -> puntos 'deformados' (espacio de la malla)"""
    if info['mesh'] is None: return np.c_[u,v]
    sx,sy=info['sx'],info['sy']; nx=len(sx)-1; ny=len(sy)-1
    Hx=np.array(info['mesh'][0]).reshape(3*ny+1,3*nx+1); Vy=np.array(info['mesh'][1]).reshape(3*ny+1,3*nx+1)
    i=np.clip(np.searchsorted(sx,u,side='right')-1,0,nx-1); j=np.clip(np.searchsorted(sy,v,side='right')-1,0,ny-1)
    tu=(u-sx[i])/(sx[i+1]-sx[i]); tv=(v-sy[j])/(sy[j+1]-sy[j])
    bu=bern(tu); bv=bern(tv)
    X=np.zeros(len(u)); Y=np.zeros(len(u))
    for a in range(4):
        for c in range(4):
            w=bv[:,a]*bu[:,c]
            X+=w*Hx[3*j+a,3*i+c]; Y+=w*Vy[3*j+a,3*i+c]
    return np.c_[X,Y]

def full_map(info, mode="bbox"):
    """Devuelve función (u,v px fuente) -> (x,y) documento."""
    W,H=info['W'],info['H']
    g=np.linspace(0.0005,0.9995,120)
    uu,vv=np.meshgrid(g*W,g*H); P=warp_points(info,uu.ravel(),vv.ravel())
    if mode=="bbox":
        x0,y0=P.min(0); x1,y1=P.max(0)
        rect=[(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
    else:
        rect=[(0,0),(W,0),(W,H),(0,H)]
    Hm=homography(rect, [tuple(p) for p in info['na']])
    return lambda u,v: applyH(Hm, warp_points(info,u,v))

def render(fn, src_img, out_size, step=1.0):
    """Renderizado hacia adelante (splat) — sólo para validar."""
    W,H=src_img.size
    a=np.asarray(src_img.convert("RGBA"))
    us=np.arange(0,W,step)+step/2; vs=np.arange(0,H,step)+step/2
    uu,vv=np.meshgrid(us,vs); P=fn(uu.ravel(),vv.ravel())
    out=np.zeros((out_size[1],out_size[0],4),np.uint8)
    xi=np.round(P[:,0]).astype(int); yi=np.round(P[:,1]).astype(int)
    ok=(xi>=0)&(yi>=0)&(xi<out_size[0])&(yi<out_size[1])
    cols=a[np.clip(vv.ravel().astype(int),0,H-1), np.clip(uu.ravel().astype(int),0,W-1)]
    out[yi[ok],xi[ok]]=cols[ok]
    return Image.fromarray(out)
