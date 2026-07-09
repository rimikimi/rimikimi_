#!/usr/bin/env bash
# ingest-prompts.sh <meta.tsv> [src_dir]
#
# <src_dir>/<id>.pdf 들을 읽어 앱에 컨셉으로 추가한다.
#   - PDF 1page 텍스트 → concepts.json 의 text
#   - PDF 2page 이미지 → public/thumbs/<id>.webp
#   - 성공하면 PDF 를 <src_dir>/DONE/ 로 이동
#
# meta.tsv : 탭 구분, 한 줄에 컨셉 하나. '#' 로 시작하는 줄 무시.
#   id <TAB> title(한글) <TAB> title_en <TAB> category <TAB> sensitive(0/1)
set -euo pipefail
META="${1:?usage: ingest-prompts.sh <meta.tsv> [src_dir]}"
SRC="${2:-/Users/home/Documents/rimikimi/Prompts}"
ROOT="/Users/home/Documents/rimikimi_app"
DONE="$SRC/DONE"
mkdir -p "$DONE"

ok=0; fail=0
while IFS=$'\t' read -r id title title_en category sensitive _rest; do
  [ -z "${id// }" ] && continue
  case "$id" in \#*) continue ;; esac
  pdf="$SRC/$id.pdf"
  if [ ! -f "$pdf" ]; then echo "❌ $id: $pdf 없음 — 건너뜀"; fail=$((fail+1)); continue; fi
  args=( "$pdf" --id "$id" --title "$title" --title-en "$title_en" --category "$category" --root "$ROOT" )
  [ "${sensitive:-0}" = "1" ] && args+=( --sensitive )
  echo "── $id  ${title} / ${category}"
  if python3 "$ROOT/scripts/add-concept.py" "${args[@]}"; then
    mv "$pdf" "$DONE/"; ok=$((ok+1))
  else
    echo "⚠️  $id 실패 — DONE 이동 보류(원본 PDF 유지)"; fail=$((fail+1))
  fi
done < "$META"
echo
echo "== 인제스트 완료: 성공 $ok / 실패 $fail =="
