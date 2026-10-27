import cv2, numpy as np
def box(a,r): return cv2.blur(a,(2*r+1,2*r+1))
def guided(I,p,r,eps):
    mI=box(I,r); mp=box(p,r); cIp=box(I*p,r)-mI*mp; vI=box(I*I,r)-mI*mI
    a=cIp/(vI+eps); b=mp-a*mI
    return box(a,r)*I+box(b,r)
def glow(img,mask,dark=0.62):
    h,w=img.shape[:2]; I=img.astype(np.float32)/255
    g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY).astype(np.float32)/255
    m=cv2.resize(mask,(w,h),interpolation=cv2.INTER_LINEAR).astype(np.float32)/255
    r=max(4,int(w*0.012)); m=np.clip(guided(g,m,r,1e-3),0,1)          # 경계를 사진에 맞춤
    m=np.clip((m-0.5)*1.6+0.5,0,1)
    L=I.mean(axis=2,keepdims=True); bg=(L+(I-L)*0.85)*dark
    out=I*m[...,None]+bg*(1-m[...,None])
    o=1-m
    near=np.clip(cv2.GaussianBlur(m,(0,0),w*0.0018)*1.8,0,1)*o
    far=np.clip(cv2.GaussianBlur(m,(0,0),w*0.007)*1.5,0,1)*o
    H=np.clip(near*0.9+far*0.35,0,1)
    out=out+(1-out)*H[...,None]*np.array([0.95,0.98,1.0])
    return (np.clip(out,0,1)*255).astype(np.uint8)
for f in ['roof','beach','cafe']:
    img=cv2.imread(f+'.png'); m=cv2.imread('m_'+f+'.png',0)
    cv2.imwrite(f'g2_{f}.jpg',glow(img,m),[cv2.IMWRITE_JPEG_QUALITY,92])
