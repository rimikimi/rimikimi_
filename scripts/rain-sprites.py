# 빗줄기·물방울·물보라 스프라이트 — 사진처럼 보이게 음영을 넣어 고해상도로 미리 렌더(앱은 이미지를 뿌리기만 한다).
import numpy as np
from PIL import Image
rng = np.random.default_rng(7)

def save(a, name):
    a = np.clip(a, 0, 1)
    Image.fromarray((a * 255).astype(np.uint8), 'RGBA').save(name)

# ── 빗줄기: 폭 W, 길이 H(px @3x). 가로 단면 = 밝은 심(굴절로 모인 빛) + 양옆 어두운 테(굴절로 빠진 빛),
#    세로 = 모션 블러(앞쪽 진하고 꼬리로 사라짐) + 미세한 밝기 흔들림(물기둥이 떨며 반짝임).
def streak(W, H, seed, core=1.0):
    r = np.random.default_rng(seed)
    x = (np.arange(W) - (W - 1) / 2) / (W / 2)            # -1..1
    y = np.linspace(0, 1, H)                               # 0 = 꼬리(위), 1 = 머리(아래)
    prof_core = np.exp(-(x / 0.22) ** 2)                   # 밝은 심
    prof_rim = np.exp(-((np.abs(x) - 0.55) / 0.18) ** 2)   # 어두운 테
    along = np.clip(y ** 1.6, 0, 1) * np.clip((1 - y) / 0.06, 0, 1)   # 꼬리→머리 진해짐, 머리 끝 살짝 둥글게
    flick = 1 + 0.18 * np.convolve(r.normal(0, 1, H), np.ones(9) / 9, mode='same')
    a = np.zeros((H, W, 4))
    lum = np.outer(along * flick, prof_core) * core
    dark = np.outer(along, prof_rim) * 0.35
    # 밝은 심: 흰색에 아주 옅은 하늘빛, 테: 어두운 청회색
    a[..., 0] = (0.93 * lum + 0.20 * dark) / np.maximum(lum + dark, 1e-4)
    a[..., 1] = (0.96 * lum + 0.24 * dark) / np.maximum(lum + dark, 1e-4)
    a[..., 2] = (1.00 * lum + 0.32 * dark) / np.maximum(lum + dark, 1e-4)
    a[..., 3] = np.clip(lum * 0.9 + dark, 0, 1)
    return a

for i, (W, H, c) in enumerate([(9, 240, 1.0), (7, 200, 0.9), (11, 300, 1.0), (6, 160, 0.8), (14, 360, 0.85)]):
    save(streak(W, H, 10 + i, c), f'streak{i}.png')

# ── 물방울(정면, 반구 렌즈): 어두운 테 · 아래쪽 안쪽에 모인 빛(캐스틱) · 위 왼쪽 반사광 · 몸통은 거의 투명
def drop(S, elong=1.0):
    yy, xx = np.mgrid[0:int(S * elong), 0:S].astype(float)
    cx, cy = (S - 1) / 2, (S * elong - 1) / 2
    nx, ny = (xx - cx) / (S / 2), (yy - cy) / (S * elong / 2)
    # 아래가 무거운 물방울 모양
    ny2 = np.where(ny > 0, ny * 0.95, ny * 1.08)
    rr = nx ** 2 + ny2 ** 2
    inside = rr < 1
    edge = np.clip((1 - rr) / 0.08, 0, 1)                  # 안티앨리어싱
    rim = np.clip((rr - 0.55) / 0.45, 0, 1) ** 1.5
    caustic = np.exp(-(((ny - 0.55) / 0.22) ** 2 + (nx / 0.45) ** 2))
    spec = np.exp(-(((nx + 0.32) / 0.13) ** 2 + ((ny + 0.40) / 0.11) ** 2))
    spec2 = np.exp(-(((nx - 0.25) / 0.10) ** 2 + ((ny - 0.30) / 0.07) ** 2)) * 0.35
    a = np.zeros(nx.shape + (4,))
    body = 0.10 + 0.55 * rim
    lum = np.clip(0.35 * caustic + spec + spec2, 0, 1)
    a[..., 0] = np.where(lum > rim * 0.6, 1.0, 0.18)
    a[..., 1] = np.where(lum > rim * 0.6, 1.0, 0.22)
    a[..., 2] = np.where(lum > rim * 0.6, 1.0, 0.30)
    a[..., 3] = np.clip(np.maximum(body * (1 - lum), lum), 0, 1) * edge * inside
    return a

save(drop(48), 'drop.png')
save(drop(40, 1.6), 'drop_fall.png')

# ── 물보라 왕관(6프레임): 가운데서 바깥으로 퍼지는 작은 방울들 + 아래 납작한 물결 고리
def crown(frame, N=6, S=96):
    t = (frame + 1) / N
    img = np.zeros((S, S, 4))
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    cx, cy = S / 2, S * 0.78
    # 물결 고리
    rad = 6 + 34 * t
    ring = np.exp(-((np.sqrt(((xx - cx) / rad) ** 2 + ((yy - cy) / (rad * 0.28)) ** 2) - 1) / 0.06) ** 2) * (1 - t)
    img[..., :3] += ring[..., None] * np.array([1, 1, 1])
    img[..., 3] += ring * 0.7
    r = np.random.default_rng(3)
    for k in range(9):
        ang = np.pi * (0.12 + 0.76 * (k + r.uniform(0, 0.8)) / 9)
        sp = r.uniform(0.7, 1.0)
        px = cx + np.cos(ang) * 40 * sp * t
        py = cy - np.sin(ang) * 46 * sp * t + 40 * t * t * sp
        rd = 2.6 * (1 - 0.5 * t) + 0.6
        d = np.exp(-(((xx - px) / rd) ** 2 + ((yy - py) / (rd * 1.3)) ** 2))
        hl = np.exp(-(((xx - px + rd * 0.35) / (rd * 0.35)) ** 2 + ((yy - py + rd * 0.45) / (rd * 0.35)) ** 2))
        img[..., :3] += (d * 0.75 + hl)[..., None]
        img[..., 3] += d * (1 - 0.6 * t)
    img[..., :3] = np.clip(img[..., :3], 0, 1)
    return img

for f in range(6):
    save(crown(f), f'crown{f}.png')
print('ok')
