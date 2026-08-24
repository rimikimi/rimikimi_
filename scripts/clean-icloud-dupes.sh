#!/bin/sh
# iCloud Drive 충돌 사본("파일 2.xml") 제거.
#
# 왜 필요한가
#   이 저장소는 iCloud Drive 안에 있다. 두 기기에서 같은 파일이 건드려지면 iCloud 가
#   "config 2.xml" 같은 사본을 만든다. 안드로이드 리소스 이름은 [a-z0-9_] 만 허용해서
#   res/ 안에 이런 파일이 하나만 생겨도 빌드가 통째로 죽는다:
#     ResourceException: ' ' is not a valid file-based resource name character
#   지운 뒤에도 iCloud 가 다시 내려받아 재발한다 → 빌드 직전에 매번 돌린다.
#
# 소스 트리와 빌드 산출물만 청소한다. node_modules / .git 는 건드리지 않는다.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
n=0
for d in "$ROOT/android/app/src" "$ROOT/ios/App/App" "$ROOT/src" "$ROOT/public" "$ROOT/api"; do
  [ -d "$d" ] || continue
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    echo "  삭제: ${f#$ROOT/}"
    rm -f "$f"
    n=$((n + 1))
  done <<EOF
$(find "$d" -name "* [0-9].*" -type f 2>/dev/null)
EOF
done
if [ "$n" -gt 0 ]; then echo "iCloud 중복본 $n 개 제거"; fi
exit 0
