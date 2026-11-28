import numpy as np, sys
from PIL import Image
sys.path.insert(0,'/tmp/claude-0/s')
REGIONS=[("west_asia",(35,12,63,42)),("africa",(-20,-36,52,37)),("europe",(-25,35,35,75)),("south_asia",(60,5,92,36)),
("southeast_asia",(92,-12,119,24)),("sahul",(119,-45,160,0)),("east_asia",(92,24,150,60)),("north_asia",(35,42,180,82)),
("north_america",(-170,15,-50,84)),("south_america",(-82,-56,-34,15))]
def regmap(h,w):
    lat=90-(np.arange(h)+0.5)*180/h; lon=-180+(np.arange(w)+0.5)*360/w
    LA,LO=np.meshgrid(lat,lon,indexing='ij'); R=np.full((h,w),-1)
    for i,(n,(W,S,E,N)) in reversed(list(enumerate(REGIONS))):
        R[(LO>=W)&(LO<E)&(LA>=S)&(LA<N)]=i
    return R
def cap(ka):
    a=np.asarray(Image.open(f'/tmp/claude-0/hab/bp_{ka}.webp').convert('RGB')).astype(float)
    b,g,p=a[...,0],a[...,1],a[...,2]
    T=-50+(g-1)*0.5; P=np.expm1((p-1)/254*np.log1p(10000))
    land=(b>0)&(b<28)&(g>0)
    npp=np.minimum(3000/(1+np.exp(1.315-0.119*T)),3000*(1-np.exp(-0.000664*P)))
    d=np.where(npp<=1371.7,-0.13527+0.0028623*npp,-0.13527+0.0028623*1371.7-0.000212*(npp-1371.7))
    dens=np.exp(d)/100  # per km2
    arid=np.clip((npp-100)/200,0,1); cold=np.clip((T+25)/15,0,1)  # crude annual-T stand-in for coldest-month rule
    lat=90-(np.arange(360)+0.5)*0.5; area=(55.6**2)*np.cos(np.radians(lat))[:,None]*np.ones((1,720))
    return np.where(land,dens*arid*cold*area,0)
if __name__=='__main__':
    R=regmap(360,720)
    for ka in [12,10,8,6]:
        c=cap(ka); t=c.sum()
        print(ka,'ka total %.1fM'%(t/1e6),' '.join(f'{n[:6]} {100*c[R==i].sum()/t:.1f}' for i,(n,_) in enumerate(REGIONS)))
