#!/usr/bin/env python3
"""
PDF (1 page 프롬프트, 2 page 썸네일) 에서 새 컨셉을 자동 추가.

사용법:
  python3 scripts/add-concept.py <pdf-path> --id <ID> \
    --title "한글 제목" --title-en "English Title" --category "카테고리" [--sensitive]

예:
  python3 scripts/add-concept.py ~/Downloads/214.pdf \
    --id 214 --title "진주 코로넷 클로즈업" --title-en "Pearl Coronet" --category "스튜디오 프로필"

자동 작업:
  1. PDF 1page 텍스트 → text 필드 (헤더/맨앞 ID 자동 정리)
  2. PDF 2page 이미지 → public/thumbs/<id>.webp (400px 폭, WebP)
  3. ⚠️ 중복 이미지 검사 — 새 썸네일이 기존 썸네일과 내용이 같으면 중단
     (실수로 같은 샘플 이미지를 두 컨셉에 쓰는 사고 방지. 정말 의도했다면 --allow-dup)
  4. public/concepts.json 맨 앞에 새 컨셉 추가 (title_en, categories[] 포함)
"""
import argparse, json, os, re, sys, io, hashlib
from pathlib import Path
from pypdf import PdfReader
from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("pdf")
p.add_argument("--id", required=True, type=int)
p.add_argument("--title", required=True)
p.add_argument("--title-en", dest="title_en", default="", help="영어 제목 (영어 모드용)")
p.add_argument("--category", required=True)
p.add_argument("--sensitive", action="store_true")
p.add_argument("--allow-dup", action="store_true", help="기존과 동일한 썸네일이어도 강제 진행")
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
lines = [l.rstrip() for l in raw.split("\n")]
header_re = re.compile(r"^(I\.|II\.|III\.|Core Attributes|Implemented with|Ensure to keep|The photos must|^\d+$)", re.I)
cleaned = [l for l in lines if l.strip() and not header_re.match(l.strip())]
prompt_text = re.sub(r"\s+", " ", " ".join(cleaned)).strip()
prompt_text = re.sub(r"^\d+\s+", "", prompt_text)  # 맨 앞 ID 번호 제거
if not prompt_text:
    sys.exit("프롬프트 텍스트 추출 실패")
print(f"📝 프롬프트 ({len(prompt_text)}자): {prompt_text[:90]}...")

# 2. 2page 이미지 → webp 썸네일 (메모리에서 먼저 생성 → 중복 검사 후 저장)
imgs = list(r.pages[1].images)
if not imgs:
    sys.exit("2페이지에 이미지 없음")
src_img = Image.open(io.BytesIO(imgs[0].data)).convert("RGB")
w, h = src_img.size
src_img.thumbnail((400, int(h * 400 / w)), Image.LANCZOS)
buf = io.BytesIO()
src_img.save(buf, format="WEBP", quality=80, method=6)
webp_bytes = buf.getvalue()

# 3. ⚠️ 중복 이미지 검사 — 같은 내용의 썸네일이 이미 있는지
new_hash = hashlib.md5(webp_bytes).hexdigest()
for existing in thumbs_dir.glob("*.webp"):
    if existing.stem == str(args.id):
        continue
    if hashlib.md5(existing.read_bytes()).hexdigest() == new_hash:
        msg = (f"❌ 중복 이미지! 새 썸네일이 기존 {existing.name} 와 내용이 완전히 같습니다.\n"
               f"   → 보통 PDF에 잘못된(다른 컨셉의) 샘플 이미지가 들어간 경우입니다.\n"
               f"   PDF를 올바른 이미지로 다시 만들어 주세요. (정말 의도한 거면 --allow-dup)")
        if not args.allow_dup:
            sys.exit(msg)
        print("⚠️  " + msg + "\n   (--allow-dup 으로 강제 진행)")

out_path = thumbs_dir / f"{args.id}.webp"
out_path.write_bytes(webp_bytes)
print(f"🖼️  썸네일 저장: {out_path} ({len(webp_bytes)} bytes, md5 {new_hash[:8]})")

# 4. concepts.json 업데이트 (맨 앞에 추가, 같은 ID 면 교체)
concepts = json.loads(concepts_json.read_text()) if concepts_json.exists() else []
concepts = [c for c in concepts if c["id"] != args.id]
new_entry = {
    "id": args.id,
    "title": args.title,
    "title_en": args.title_en or args.title,
    "category": args.category,
    "categories": [args.category],
    "text": prompt_text,
    "sensitive": args.sensitive,
}
concepts.insert(0, new_entry)
concepts_json.write_text(json.dumps(concepts, ensure_ascii=False, indent=2))
print(f"📋 concepts.json 업데이트 (총 {len(concepts)}개)")
print(f"\n✅ 완료. ID {args.id} '{args.title}' / {args.category} 추가됨.")
