#!/usr/bin/env bash
# iCloud 가 만드는 " 2.ext" / " 3" 형태 중복 파일을 지운다.
#
# 이 저장소는 ~/Documents(iCloud Drive) 아래에 있어서 동기화 충돌 때
# "config 2.xml" 같은 파일이 계속 생긴다. 2026-08-17~18 에만:
#   · 안드로이드 리소스 병합이 세 번 깨졌다(파일명에 공백이 있으면 그냥 실패)
#   · .git 안까지 번져서(index 2~9, refs/heads/main 2.lock) git log --all 이 깨졌다
#
# 근본 해결은 "Mac 저장 공간 최적화" 끄기 또는 iCloud 밖으로 이전이지만,
# 그 전까지 빌드가 이걸로 깨지지 않게 npm prebuild 에 물려서 자동 실행한다.
#
# 원본과 내용이 같은 것만 지운다 — 다르면 보고만 하고 남긴다.
# ⚠️ BSD find 의 -regex 는 '+' 를 수량자로 안 쓴다. -name 글롭을 쓸 것.
set -u
cd "$(dirname "$0")/.."

removed=0

# --- 1) 작업 트리 ---
while IFS= read -r f; do
  base=$(echo "$f" | sed -E 's/ [0-9]+(\.[A-Za-z0-9]+)$/\1/')
  [ "$f" = "$base" ] && continue
  [ -e "$base" ] || { echo "⚠️  원본 없음, 보류: $f"; continue; }
  if diff -q "$f" "$base" >/dev/null 2>&1; then
    rm -f "$f"; echo "삭제: $f"; removed=$((removed+1))
  else
    echo "⚠️  내용 다름, 보류: $f"
  fi
done < <(find . \( -name node_modules -o -name .git \) -prune -o \
              -type f -name "* [0-9].*" -print)

# --- 2) .git 내부 ---
# git 은 이름에 공백이 든 파일을 절대 만들지 않는다. 여기서 걸리는 건 전부
# iCloud 사본이므로 내용 비교 없이 지운다 — 오히려 남겨두면 인덱스/ref 가
# 잘못 읽혀 커밋이 날아갈 수 있다.
while IFS= read -r f; do
  rm -f "$f"; echo "삭제(.git): $f"; removed=$((removed+1))
done < <(find .git \( -name "* [0-9]" -o -name "* [0-9].*" \) -type f -print 2>/dev/null)

[ "$removed" -eq 0 ] && echo "중복 없음"
exit 0
