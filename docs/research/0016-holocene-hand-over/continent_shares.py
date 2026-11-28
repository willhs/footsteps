import sys, glob, re, numpy as np
from PIL import Image
MAXP=5_000_000; L=1023; STEP=np.log1p(MAXP)/L
def dec(p):
    a=np.asarray(Image.open(p).convert('RGB')).astype(np.int64)
    q=a[...,0]*256+a[...,1]
    return np.where(q>0,np.expm1(q*STEP),0.0)
def region(lat,lon):
    R=np.full(lat.shape,'other',dtype=object)
    am=(lon<-25)|(lon>170)&(lat>50)
    R[am&(lat>=13)]='N America'; R[am&(lat<13)]='C+S America'
    R[(lon>=-25)&(lon<52)&(lat<37)&(lat>-40)]='Africa'
    R[(lon>=-25)&(lon<45)&(lat>=37)]='Europe'
    R[(lon>=25)&(lon<62)&(lat<37)&(lat>=12)&~((lon<35)&(lat<31.5))]='W Asia'  # Levant/Arabia/Iran
    R[(lon>=62)&(lon<92)&(lat<37)&(lat>5)]='S Asia'
    R[(lon>=92)&(lon<150)&(lat>=22)&(lat<55)]='E Asia'
    R[(lon>=92)&(lon<160)&(lat<22)&(lat>=-10)]='SE Asia'
    R[(lon>=110)&(lon<180)&(lat<-10)]='Sahul+Pac'
    R[(lon>=45)&(lon<=180)&(lat>=55)|(lon>=45)&(lon<92)&(lat>=37)&(lat<55)]='N+C Asia'
    return R
cache={}
order=['Africa','W Asia','Europe','S Asia','E Asia','SE Asia','N+C Asia','Sahul+Pac','N America','C+S America','other']
print('year     total_M  '+'  '.join(f'{o[:9]:>9}' for o in order))
files=sorted(glob.glob('/tmp/claude-0/grid/humans_*.webp'),key=lambda p:int(re.search(r'_(-?\d+)',p).group(1)))
for p in files:
    y=int(re.search(r'_(-?\d+)',p).group(1))
    if len(sys.argv)>1 and y%int(sys.argv[1]) and y>-11000: continue
    d=dec(p); h,w=d.shape
    if (h,w) not in cache:
        lat=90-(np.arange(h)+0.5)*180/h; lon=-180+(np.arange(w)+0.5)*360/w
        LA,LO=np.meshgrid(lat,lon,indexing='ij'); cache[(h,w)]=region(LA,LO)
    R=cache[(h,w)]; t=d.sum()
    print(f'{y:>7} {t/1e6:8.2f}  '+'  '.join(f'{100*d[R==o].sum()/t:9.1f}' for o in order))
