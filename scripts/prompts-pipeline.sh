#!/usr/bin/env bash
# prompts-pipeline.sh <start> <end> <meta.tsv>
#
# 두 단계를 한 번에:
#   1) Apple Notes 노트 <start>..<end> → Prompts/<N>.pdf  (notes-export-pdf.sh)
#   2) 그 PDF 들 → 앱 컨셉 추가 + 썸네일 + DONE 이동      (ingest-prompts.sh)
#
# meta.tsv 는 <start>..<end> 각 id 의 title/title_en/category/sensitive 를 담는다.
# (프롬프트 텍스트·이미지는 자동 추출되지만 제목·카테고리는 사람이 정한다)
#
# 예:  scripts/prompts-pipeline.sh 353 360 scripts/batch-353-360.tsv
set -euo pipefail
START="${1:?usage: prompts-pipeline.sh <start> <end> <meta.tsv>}"
END="${2:?usage: prompts-pipeline.sh <start> <end> <meta.tsv>}"
META="${3:?meta.tsv 필요}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "▶ 1/2  Notes ${START}..${END} → PDF"
"$DIR/notes-export-pdf.sh" "$START" "$END"
echo
echo "▶ 2/2  PDF → 앱 인제스트"
"$DIR/ingest-prompts.sh" "$META"
