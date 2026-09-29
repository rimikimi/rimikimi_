# 단계 비교 시트 — 원본 + <접두사>-20/40/60/80/100.jpg 를 얼굴 크롭 2줄×3칸으로
#   python3 sheet.py <원본> <접두사> <regions.json> <출력.jpg> [--levels 20,40,60,80,100]
import sys, json, re
import cv2, numpy as np

orig_p, prefix, regions_p, out_p = sys.argv[1:5]
levels = [int(x) for x in (sys.argv[sys.argv.index("--levels") + 1] if "--levels" in sys.argv else "20,40,60,80,100").split(",")]
O = cv2.imread(orig_p); H, W = O.shape[:2]; short = min(H, W)
R = json.load(open(regions_p))
fb = [g["box_2d"] for g in R["regions"] if not re.search(r"arm|hand|chest|shoulder|body|leg", g["label"], re.I)] or [g["box_2d"] for g in R["regions"]]
pad = int(short * 0.03)
y0 = max(0, int(min(b[0] for b in fb) / 1000 * H) - pad); x0 = max(0, int(min(b[1] for b in fb) / 1000 * W) - pad)
y1 = min(H, int(max(b[2] for b in fb) / 1000 * H) + pad); x1 = min(W, int(max(b[3] for b in fb) / 1000 * W) + pad)
tiles = []
for name, im in [("Original", O)] + [(f"{L}%", cv2.imread(f"{prefix}-{L}.jpg")) for L in levels]:
    c = cv2.resize(im[y0:y1, x0:x1], None, fx=600 / (x1 - x0), fy=600 / (x1 - x0), interpolation=cv2.INTER_AREA)
    cv2.rectangle(c, (0, 0), (190, 56), (0, 0, 0), -1)
    cv2.putText(c, name, (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2, cv2.LINE_AA)
    tiles.append(c)
while len(tiles) % 3: tiles.append(np.full_like(tiles[0], 255))
th = tiles[0].shape[0]; s = np.full((th, 10, 3), 255, np.uint8)
rows = [np.hstack([tiles[i], s, tiles[i + 1], s, tiles[i + 2]]) for i in range(0, len(tiles), 3)]
sheet = np.vstack(sum([[r, np.full((10, rows[0].shape[1], 3), 255, np.uint8)] for r in rows], [])[:-1])
cv2.imwrite(out_p, sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
print(f"시트 → {out_p}")
