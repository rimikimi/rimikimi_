import cv2, numpy as np, sys
def subject_glow(img, mask, dark=0.62, glow=0.9, width=0.012):
    h,w=img.shape[:2]; m=cv2.resize(mask,(w,h)).astype(np.float32)/255.0
    m=cv2.GaussianBlur(m,(0,0),max(1,w*0.0015))                     # 경계 부드럽게
    I=img.astype(np.float32)/255.0
    # 배경 어둡게(살짝 채도↓)
    g=I.mean(axis=2,keepdims=True); bg=(g+(I-g)*0.85)*dark
    out=I*m[...,None]+bg*(1-m[...,None])
    # 윤곽 바깥쪽 하얀 글로우: 마스크를 크게 번진 것 - 마스크
    r=w*width
    out_side=(1-m)                                                  # 글로우는 피사체 바깥에만
    halo=np.clip(cv2.GaussianBlur(m,(0,0),r)*1.8,0,1)*out_side
    halo2=np.clip(cv2.GaussianBlur(m,(0,0),r*0.3)*1.6,0,1)*out_side  # 가까운 테두리 선명한 빛
    H=np.clip(halo*0.55+halo2*0.85,0,1)*glow
    warm=np.array([1.0,0.98,0.95])
    out=out+(1-out)*H[...,None]*warm                               # screen
    return (np.clip(out,0,1)*255).astype(np.uint8)
for f in ['beach','cafe','roof']:
    img=cv2.imread(f+'.png'); m=cv2.imread('m_'+f+'.png',0)
    o=subject_glow(img,m); cv2.imwrite(f'out_{f}.jpg',o,[cv2.IMWRITE_JPEG_QUALITY,90])
