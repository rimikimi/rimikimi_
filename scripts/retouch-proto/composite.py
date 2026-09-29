# 커스텀 보정 ④ — AI 결과에서 "고친 부분만" 원본에 붙인다. 나머지 픽셀은 원본 그대로.
#   python3 composite.py <원본> <AI결과> [regions.json] <출력.png>
# 단계: 크기 맞춤 → 정렬(SIFT+RANSAC 호모그래피) → 색 맞춤(바뀌지 않은 곳 기준 채널별 선형) →
#       차이 마스크(Lab 거리, 잡음 수준 기준 임계) ∩ 요청 영역 박스 → 부드러운 경계로 합성
import sys, json
import cv2, numpy as np

#   옵션: --at-edit-res  원본을 AI 결과 해상도(2K)로 키워서 그 크기로 합성
#         --mode region  차이 마스크 대신 요청 영역(타원·부드러운 경계) 전체를 붙임 — 피부 톤처럼 넓고 옅은 보정용
#         --strength 0.6 붙이는 세기(0~1) — 필터 강도 단계
flags = [a for a in sys.argv[1:] if a.startswith("--")]
opt = lambda n, d: (sys.argv[sys.argv.index(n) + 1] if n in sys.argv else d)
pos = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and not sys.argv[i - 1] in ("--mode", "--strength")]
orig_p, edit_p = pos[0], pos[1]
regions_p = pos[2] if len(pos) > 3 else None
out_p = pos[-1]
MODE = opt("--mode", "diff")
STRENGTH = float(opt("--strength", "1"))

O = cv2.imread(orig_p, cv2.IMREAD_COLOR)
E = cv2.imread(edit_p, cv2.IMREAD_COLOR)
if "--at-edit-res" in flags:
    # AI 결과와 같은 비율로 원본을 키운다(가로 기준) — 세로 차이는 정렬 단계가 흡수
    eh, ew = E.shape[:2]
    O = cv2.resize(O, (ew, round(O.shape[0] * ew / O.shape[1])), interpolation=cv2.INTER_LANCZOS4)
    print(f"원본을 {O.shape[1]}x{O.shape[0]} 로 확대해서 합성")
H, W = O.shape[:2]
short = min(H, W)
E0 = cv2.resize(E, (W, H), interpolation=cv2.INTER_AREA)

# ── 1) 정렬: 편집 안 된 대부분의 영역으로 호모그래피를 잡는다(RANSAC 이 편집 부분을 이상치로 버림)
sift = cv2.SIFT_create(nfeatures=6000)
g1, g2 = cv2.cvtColor(O, cv2.COLOR_BGR2GRAY), cv2.cvtColor(E0, cv2.COLOR_BGR2GRAY)
k1, d1 = sift.detectAndCompute(g1, None)
k2, d2 = sift.detectAndCompute(g2, None)
matches = cv2.BFMatcher().knnMatch(d2, d1, k=2)
good = [m for m, n in (p for p in matches if len(p) == 2) if m.distance < 0.75 * n.distance]
src = np.float32([k2[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
dst = np.float32([k1[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
Hm, inl = cv2.findHomography(src, dst, cv2.RANSAC, 3.0)
n_in = int(inl.sum())
if Hm is None or n_in < 40:
    Hm = np.eye(3); print("정렬: 매칭 부족 → 단순 리사이즈만")
res = np.linalg.norm(cv2.perspectiveTransform(src[inl.ravel() == 1], Hm) - dst[inl.ravel() == 1], axis=2).mean() if n_in else -1
print(f"정렬: 매칭 {len(good)} · 인라이어 {n_in} · 잔차 {res:.2f}px")
Ew = cv2.warpPerspective(E0, Hm, (W, H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)

# ── 2) 요청 영역 박스 (0~1000 정규화) → 넉넉하게 키운 허용 마스크
allow = np.ones((H, W), np.uint8)
if regions_p:
    allow[:] = 0
    for g in json.load(open(regions_p))["regions"]:
        y0, x0, y1, x1 = g["box_2d"]
        pad = int(short * 0.03)
        allow[max(0, int(y0 / 1000 * H) - pad):min(H, int(y1 / 1000 * H) + pad),
              max(0, int(x0 / 1000 * W) - pad):min(W, int(x1 / 1000 * W) + pad)] = 1
    print(f"요청 영역: {len(json.load(open(regions_p))['regions'])}개, 화면의 {allow.mean() * 100:.1f}%")

# ── 3) 색 맞춤: 요청 영역 밖(=바뀌면 안 되는 곳)에서 채널별 gain/offset 을 강건하게 추정
Of, Ef = O.astype(np.float32), Ew.astype(np.float32)
fitmask = (allow == 0) if allow.any() and not allow.all() else np.ones((H, W), bool)
Ec = np.empty_like(Ef)
for c in range(3):
    x, y = Ef[..., c][fitmask].ravel(), Of[..., c][fitmask].ravel()
    sel = np.random.default_rng(0).choice(x.size, min(200000, x.size), replace=False)
    x, y = x[sel], y[sel]
    a, b = 1.0, 0.0
    for _ in range(4):  # 이상치 버리며 재적합
        r = y - (a * x + b)
        keep = np.abs(r) < max(6.0, 2.5 * np.median(np.abs(r)) * 1.4826)
        a, b = np.polyfit(x[keep], y[keep], 1)
    Ec[..., c] = np.clip(a * Ef[..., c] + b, 0, 255)
    print(f"색 맞춤 ch{c}: gain {a:.3f} offset {b:+.1f}")

# ── 4) 차이 마스크: Lab 거리 → 블러 → 잡음 수준(요청 영역 밖 분포) 기준 임계
Lo = cv2.cvtColor(O, cv2.COLOR_BGR2LAB).astype(np.float32)
Le = cv2.cvtColor(Ec.astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
D = np.linalg.norm(Lo - Le, axis=2)
Db = cv2.GaussianBlur(D, (0, 0), short * 0.004)
bg = Db[fitmask]
thr = max(6.0, float(np.median(bg) + 6 * np.median(np.abs(bg - np.median(bg))) * 1.4826))
m = ((Db > thr) & (allow > 0)).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(short * 0.02) | 1,) * 2))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
keep = np.zeros_like(m)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= H * W * 0.0005: keep[lab == i] = 1
# 구멍 메우기 + 살짝 키우기 → 경계 페더
cnts, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
filled = np.zeros_like(keep); cv2.drawContours(filled, cnts, -1, 1, -1)
filled = cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(short * 0.012) | 1,) * 2))
alpha = cv2.GaussianBlur(filled.astype(np.float32), (0, 0), short * 0.006)
alpha[filled == 0] = np.minimum(alpha[filled == 0], 1.0)
alpha = np.clip(alpha * (cv2.dilate(filled, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (int(short * 0.03) | 1,) * 2)) > 0), 0, 1)
if MODE == "region" and regions_p:
    # 피부 톤·질감처럼 넓고 옅은 보정은 차이 임계로 자르면 얼룩진다 → 요청 영역 타원 전체를 부드럽게
    reg = np.zeros((H, W), np.float32)
    for g in json.load(open(regions_p))["regions"]:
        y0, x0, y1, x1 = g["box_2d"]
        cv2.ellipse(reg, (int((x0 + x1) / 2000 * W), int((y0 + y1) / 2000 * H)),
                    (int((x1 - x0) / 2000 * W * 1.08), int((y1 - y0) / 2000 * H * 1.08)), 0, 0, 360, 1, -1)
    alpha = cv2.GaussianBlur(reg, (0, 0), short * 0.02)
# 얼굴 보호: 요청이 얼굴을 바꾸는 게 아니면 얼굴은 원본에서 — 경계는 부드럽게 빼서 이음매가 안 보이게
if regions_p:
    prot = np.zeros((H, W), np.float32)
    for g in json.load(open(regions_p)).get("protect", []):
        y0, x0, y1, x1 = g["box_2d"]
        # 사각형이 아니라 얼굴 모양 타원 — 사각 경계가 머리카락을 가로지르면 세로 이음매가 보인다
        cx, cy = (x0 + x1) / 2000 * W, (y0 + y1) / 2000 * H
        ax, ay = (x1 - x0) / 2000 * W, (y1 - y0) / 2000 * H
        cv2.ellipse(prot, (int(cx), int(cy)), (int(ax), int(ay)), 0, 0, 360, 1, -1)
    if prot.any():
        prot = cv2.GaussianBlur(prot, (0, 0), short * 0.012)
        alpha = alpha * (1 - np.clip(prot * 1.6, 0, 1))
        print(f"얼굴 보호: {len(json.load(open(regions_p))['protect'])}개")
alpha = np.clip(alpha * STRENGTH, 0, 1)
print(f"모드 {MODE} · 세기 {STRENGTH:.0%} · 차이 임계 {thr:.1f} · 붙이는 영역 {(alpha > 0.003).mean() * 100:.1f}%")

# ── 5) 합성 — alpha 0 인 곳은 원본 바이트 그대로
out = (Of * (1 - alpha[..., None]) + Ec * alpha[..., None])
out = np.where(alpha[..., None] > 0, np.clip(np.round(out), 0, 255), Of).astype(np.uint8)
cv2.imwrite(out_p, out)
same = (out == O).all(axis=2).mean() * 100
print(f"원본과 픽셀이 완전히 같은 비율: {same:.2f}% → {out_p}")
# 디버그: 마스크 오버레이
dbg = O.copy(); tint = np.zeros_like(O); tint[..., 2] = 255
dbg = (O * (1 - 0.45 * alpha[..., None]) + tint * 0.45 * alpha[..., None]).astype(np.uint8)
if regions_p:
    for g in json.load(open(regions_p))["regions"]:
        y0, x0, y1, x1 = g["box_2d"]
        cv2.rectangle(dbg, (int(x0 / 1000 * W), int(y0 / 1000 * H)), (int(x1 / 1000 * W), int(y1 / 1000 * H)), (0, 255, 255), 3)
cv2.imwrite(out_p.replace(".png", "-mask.jpg"), dbg, [cv2.IMWRITE_JPEG_QUALITY, 85])
