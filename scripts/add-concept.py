#!/usr/bin/env python3
"""
PDF (1 page 프롬프트, 2 page 썸네일) 에서 새 컨셉을 자동 추가.

사용법:
  python3 scripts/add-concept.py <pdf-path> --id <ID> \
    --title "한글 제목" --category "카테고리" [--sensitive]

예:
  python3 scripts/add-concept.py ~/Downloads/214.pdf \
    --id 214 --title "진주 코로넷 클로즈업" --category "스튜디오 프로필"

자동 작업:
  1. PDF 1page 텍스트 → text 필드 (Core Attributes 안내문 자동 정리)
  2. PDF 2page 이미지 → public/thumbs/<id>.webp (400px 폭, WebP)
  3. public/concepts.json 맨 앞에 새 컨셉 추가
"""
import argparse, json, os, re, sys, io
from pathlib import Path
from pypdf import PdfReader
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("pdf")
p.add_argument("--id", required=True, type=int)
p.add_argument("--title", required=True)
p.add_argument("--category", required=True)
p.add_argument("--sensitive", action="store_true")
p.add_argument("--root", default=".", help="project root")
args = p.parse_args()

root = Path(args.root)
thumbs_dir = root / "public" / "thumbs"
concepts_json = root / "public" / "concepts.json"
thumbs_dir.mkdir(parents=True, exist_ok=True)

# 1. PDF 읽기
r = PdfReader(args.pdf)
if len(r.pages) < 2:
    sys.exit(f"PDF 페이지 부족: {len(r.pages)}. 최소 2페이지 필요 (1=프롬프트, 2=썸네일)")

# 1a. 1page 텍스트 → prompt
raw = r.pages[0].extract_text() or ""
# 첫 줄(ID 번호) 제거, "I. Core Attributes..." 같은 헤더 제거
lines = [l.rstrip() for l in raw.split("\n")]
# 빈 줄과 헤더 제거
header_re = re.compile(r"^(I\.|II\.|III\.|Core Attributes|Implemented with|Ensure to keep|The photos must|^\d+$)", re.I)
cleaned = [l for l in lines if l.strip() and not header_re.match(l.strip())]
prompt_text = " ".join(cleaned).strip()
prompt_text = re.sub(r"\s+", " ", prompt_text)

if not prompt_text:
    sys.exit("프롬프트 텍스트 추출 실패")
print(f"📝 프롬프트 ({len(prompt_text)}자): {prompt_text[:100]}...")

# 2. 2page 이미지 → webp 썸네일
imgs = list(r.pages[1].images)
if not imgs:
    sys.exit("2페이지에 이미지 없음")
src_img = Image.open(io.BytesIO(imgs[0].data)).convert("RGB")
w, h = src_img.size
target_w = 400
src_img.thumbnail((target_w, int(h * target_w / w)), Image.LANCZOS)
out_path = thumbs_dir / f"{args.id}.webp"
src_img.save(out_path, format="WEBP", quality=80, method=6)
print(f"🖼️  썸네일 저장: {out_path} ({os.path.getsize(out_path)} bytes)")

# 3. concepts.json 업데이트 (맨 앞에 추가)
concepts = json.loads(concepts_json.read_text()) if concepts_json.exists() else []
# 같은 ID 가 이미 있으면 교체
concepts = [c for c in concepts if c["id"] != args.id]
new_entry = {
    "id": args.id,
    "title": args.title,
    "category": args.category,
    "text": prompt_text,
    "sensitive": args.sensitive,
}
concepts.insert(0, new_entry)
concepts_json.write_text(json.dumps(concepts, ensure_ascii=False, indent=2))
print(f"📋 concepts.json 업데이트 (총 {len(concepts)}개)")
print(f"\n✅ 완료. ID {args.id} '{args.title}' 추가됨.")
print(f"   다음 단계: git add public/ && git commit -m 'Add concept {args.id}' && git push")
