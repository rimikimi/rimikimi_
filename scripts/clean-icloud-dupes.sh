#!/usr/bin/env bash
# iCloud 가 만드는 " 2.ext" 형태 중복 파일을 지운다.
#
# 이 저장소는 ~/Documents 아래(iCloud Drive)에 있어서 동기화 충돌 때
# "config 2.xml" 같은 파일이 계속 생긴다. 안드로이드 리소스 병합은 파일명에
# 공백이 있으면 그냥 실패하므로(2026-08-17 하루에 세 번) 빌드 전에 치운다.
#
# 원본과 내용이 같은 것만 지운다 — 다르면 보고만 하고 남긴다.
# ⚠️ BSD find 의 -regex 는 '+' 를 수량자로 안 쓴다. -name 글롭을 쓸 것.
set -u
cd "$(dirname "$0")/.."
found=0
while IFS= read -r f; do
  base=$(echo "$f" | sed -E 's/ [0-9]+(\.[A-Za-z0-9]+)$/\1/')
  [ "$f" = "$base" ] && continue
  [ -e "$base" ] || { echo "⚠️  원본 없음, 보류: $f"; continue; }
  if diff -q "$f" "$base" >/dev/null 2>&1; then
    rm -f "$f"; echo "삭제: $f"; found=$((found+1))
  else
    echo "⚠️  내용 다름, 보류: $f"
  fi
done < <(find . \( -name node_modules -o -name .git -o -name build -o -name dist \) -prune -o \
              -type f -name "* [0-9].*" -print)
[ "$found" -eq 0 ] && echo "중복 없음"
exit 0
