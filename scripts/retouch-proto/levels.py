# 보정 세기 단계 — AI 결과 1장으로 20·40·60·80·100% 를 만든다.
#   python3 levels.py <원본> <AI결과> <regions.json> <출력접두사> [20,40,60,80,100]
# 단순 투명도 섞기는 얼굴선·눈이 두 겹으로 보인다(AI 가 턱선·눈매도 조금 바꾸므로).
# 그래서 광학 흐름(DIS)으로 원본→결과의 픽셀 이동을 구하고, 세기 t 만큼 모양과 색을 같이 옮긴다(모핑).
# 요청 영역 밖은 원본 픽셀 그대로.
import sys, json
import cv2, numpy as np

orig_p, edit_p, regions_p, prefix = sys.argv[1:5]
levels = [int(x) for x in (sys.argv[5] if len(sys.argv) > 5 else "20,40,60,80,100").split(",")]
# 눈금 배율 — 오너 기준(9/29): AI 결과를 그대로 다 입힌 것은 너무 세다. "100%" = AI 결과의 40%.
SCALE = float(sys.argv[6]) if len(sys.argv) > 6 else 0.4

O = cv2.imread(orig_p, cv2.IMREAD_COLOR)
E = cv2.imread(edit_p, cv2.IMREAD_COLOR)
H, W = O.shape[:2]
short = min(H, W)
E0 = cv2.resize(E, (W, H), interpolation=cv2.INTER_AREA)

# 1) 정렬 (편집 안 된 배경으로 호모그래피)
sift = cv2.SIFT_create(nfeatures=6000)
g1, g2 = cv2.cvtColor(O, cv2.COLOR_BGR2GRAY), cv2.cvtColor(E0, cv2.COLOR_BGR2GRAY)
k1, d1 = sift.detectAndCompute(g1, None)
k2, d2 = sift.detectAndCompute(g2, None)
good = [m for m, n in (p for p in cv2.BFMatcher().knnMatch(d2, d1, k=2) if len(p) == 2) if m.distance < 0.75 * n.distance]
src = np.float32([k2[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
dst = np.float32([k1[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
if Hm is None or int(inl.sum()) < 40: Hm = np.eye(3)
print(f"정렬: 매칭 {len(good)} · 인라이어 {int(inl.sum()) if inl is not None else 0}")
Ew = cv2.warpPerspective(E0, Hm, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

# 2) 요청 영역 → 부드러운 타원 마스크
R = json.load(open(regions_p))
reg = np.zeros((H, W), np.float32)
for g in R["regions"]:
    y0, x0, y1, x1 = g["box_2d"]
    cv2.ellipse(reg, (int((x0 + x1) / 2000 * W), int((y0 + y1) / 2000 * H)),
                (int((x1 - x0) / 2000 * W * 1.1), int((y1 - y0) / 2000 * H * 1.1)), 0, 0, 360, 1, -1)
alpha = cv2.GaussianBlur(reg, (0, 0), short * 0.025)
alpha = np.clip(alpha / max(alpha.max(), 1e-6) * 1.15, 0, 1)
print(f"요청 영역 {len(R['regions'])}개: " + ", ".join(g["label"] for g in R["regions"]))

# 3) 색 맞춤 — 영역 밖(바뀌면 안 되는 곳)에서 채널별 선형 보정을 추정해 AI 의 전체 톤 이동만 되돌린다
Of, Ef = O.astype(np.float32), Ew.astype(np.float32)
fit = reg == 0
Ec = np.empty_like(Ef)
rng = np.random.default_rng(0)
for c in range(3):
    x, y = Ef[..., c][fit].ravel(), Of[..., c][fit].ravel()
    sel = rng.choice(x.size, min(200000, x.size), replace=False); x, y = x[sel], y[sel]
    a, b = 1.0, 0.0
    for _ in range(4):
        r = y - (a * x + b)
        keep = np.abs(r) < max(6.0, 2.5 * np.median(np.abs(r)) * 1.4826)
        a, b = np.polyfit(x[keep], y[keep], 1)
    Ec[..., c] = np.clip(a * Ef[..., c] + b, 0, 255)

# 4) 광학 흐름 원본→결과 (밝기가 크게 바뀌어도 모양만 따라가도록 국소 대비 정규화한 영상으로)
def norm(img):
    g = cv2.cvtColor(img.astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32)
    mu = cv2.GaussianBlur(g, (0, 0), 12); sd = np.sqrt(cv2.GaussianBlur((g - mu) ** 2, (0, 0), 12)) + 4
    return np.clip((g - mu) / sd * 40 + 128, 0, 255).astype(np.uint8)
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
F = dis.calc(norm(Of), norm(Ec), None)          # O(x) ≈ Ec(x + F(x))
F = cv2.GaussianBlur(F, (0, 0), short * 0.004)  # 잡음 정리
F *= alpha[..., None]                           # 영역 밖은 움직이지 않는다
mag = np.linalg.norm(F, axis=2)
print(f"흐름: 영역 안 평균 {mag[alpha > 0.5].mean():.1f}px · 최대 {mag.max():.1f}px")

Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
outs = []
for L in levels:
    t = L / 100.0 * SCALE
    Ot = cv2.remap(Of, X - t * F[..., 0], Y - t * F[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    Et = cv2.remap(Ec, X + (1 - t) * F[..., 0], Y + (1 - t) * F[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    It = (1 - t) * Ot + t * Et
    out = Of * (1 - alpha[..., None]) + It * alpha[..., None]
    out = np.where(alpha[..., None] > 0, np.clip(np.round(out), 0, 255), Of).astype(np.uint8)
    p = f"{prefix}-{L}.jpg"
    cv2.imwrite(p, out, [cv2.IMWRITE_JPEG_QUALITY, 95])
    outs.append((L, out))
    print(f"  {L}% → {p}")

# 5) 한눈에 보기 — 얼굴 영역 크롭 2줄×3칸 (원본 + 단계들)
ys, xs = np.where(alpha > 0.5)
cy0, cy1, cx0, cx1 = ys.min(), ys.max(), xs.min(), xs.max()
pad = int(short * 0.03)
cy0, cy1, cx0, cx1 = max(0, cy0 - pad), min(H, cy1 + pad), max(0, cx0 - pad), min(W, cx1 + pad)
tiles = []
for name, im in [("Original", O)] + [(f"{L}%", o) for L, o in outs]:
    c = cv2.resize(im[cy0:cy1, cx0:cx1], None, fx=560 / (cx1 - cx0), fy=560 / (cx1 - cx0), interpolation=cv2.INTER_AREA)
    cv2.rectangle(c, (0, 0), (170, 52), (0, 0, 0), -1)
    cv2.putText(c, name, (10, 38), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2, cv2.LINE_AA)
    tiles.append(c)
th = min(t.shape[0] for t in tiles); tiles = [t[:th] for t in tiles]
while len(tiles) % 3: tiles.append(np.full_like(tiles[0], 255))
rows = [np.hstack(sum([[t, np.full((th, 10, 3), 255, np.uint8)] for t in tiles[i:i + 3]], [])[:-1]) for i in range(0, len(tiles), 3)]
sheet = np.vstack(sum([[r, np.full((10, rows[0].shape[1], 3), 255, np.uint8)] for r in rows], [])[:-1])
cv2.imwrite(f"{prefix}-sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
print(f"시트 → {prefix}-sheet.jpg")
