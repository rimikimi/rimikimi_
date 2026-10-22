# 눈 스프라이트 — 먼 눈송이(작고 선명, 살짝 육각 결정), 가까운 눈송이(크고 흐린 보케), 녹는 눈(물방울로 변하는 중간), 쌓인 눈 결 텍스처.
import numpy as np
from PIL import Image
def save(a, n): Image.fromarray((np.clip(a,0,1)*255).astype(np.uint8),'RGBA').save(n)
def flake(S, seed, crystal):
    r=np.random.default_rng(seed); yy,xx=np.mgrid[0:S,0:S].astype(float); c=(S-1)/2
    nx,ny=(xx-c)/(S/2),(yy-c)/(S/2); rr=np.sqrt(nx**2+ny**2); th=np.arctan2(ny,nx)
    body=np.exp(-(rr/0.55)**2.4)
    if crystal:
        arms=np.exp(-((np.sin(3*(th+r.uniform(0,1)))*rr)/0.08)**2)*np.clip(1-rr,0,1)
        body=np.clip(body*0.75+arms*0.6,0,1)
    edge=np.clip((1-rr)/0.15,0,1)
    a=np.zeros((S,S,4)); a[...,0]=0.97; a[...,1]=0.98; a[...,2]=1.0
    # 아래쪽 아주 옅은 청회 그늘(입체감)
    shade=np.clip(ny,0,1)*0.12; a[...,0]-=shade; a[...,1]-=shade*0.8
    a[...,3]=body*edge
    return a
for i in range(4): save(flake(40,i,True),f'flake{i}.png')
def bokeh(S):
    yy,xx=np.mgrid[0:S,0:S].astype(float); c=(S-1)/2; rr=np.sqrt(((xx-c)/(S/2))**2+((yy-c)/(S/2))**2)
    a=np.zeros((S,S,4)); a[...,:3]=1; a[...,3]=np.clip((1-rr)/0.25,0,1)*0.55*(0.75+0.25*np.clip(rr/0.85,0,1))
    return a
save(bokeh(64),'flake_bokeh.png')
# 쌓인 눈 결 — 가로로 반복되는 텍스처(작은 알갱이 반짝임 + 아래로 갈수록 푸르스름)
W,H=256,48; r=np.random.default_rng(5); a=np.zeros((H,W,4))
y=np.linspace(0,1,H)[:,None]; a[...,0]=1-0.10*y; a[...,1]=1-0.07*y; a[...,2]=1-0.02*y; a[...,3]=1
grain=r.normal(0,1,(H,W)); grain=(grain-grain.min())/(grain.max()-grain.min())
for ch in range(3): a[...,ch]-=0.06*grain
sp=r.random((H,W))>0.992
for ch in range(3): a[...,ch]=np.where(sp,1,a[...,ch])
save(a,'snow_tex.png'); print('ok')
