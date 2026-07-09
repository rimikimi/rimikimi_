#!/usr/bin/env bash
# notes-export-pdf.sh <start> <end> [dest_dir]
#
# Apple Notes 의 "Prompt" 폴더 노트(제목 = 숫자)를
# File > Export as > PDF 로 <dest_dir>/<N>.pdf 저장한다.
# (1page=프롬프트, 2page=샘플 이미지 — add-concept.py 가 먹는 포맷)
#
# 전제: Notes 의 PDF export 기본 저장 위치가 이미 dest_dir 로 맞춰져 있음
#       (macOS 가 마지막 export 폴더를 기억함. 최초 1회만 수동으로 그 폴더에 저장하면 됨)
# 필요 권한: Terminal → 손쉬운 사용(Accessibility) + 자동화(Notes 제어) 허용
set -euo pipefail
START="${1:?usage: notes-export-pdf.sh <start> <end> [dest]}"
END="${2:?usage: notes-export-pdf.sh <start> <end> [dest]}"
DEST="${3:-/Users/home/Documents/rimikimi/Prompts}"
mkdir -p "$DEST"

export_one() {
  local N="$1"
  osascript <<OSA >/dev/null 2>&1
tell application "Notes"
  activate
  show (first note whose name is "$N")
end tell
delay 1.6
tell application "System Events" to tell process "Notes"
  set frontmost to true
  delay 0.4
  click menu item "PDF" of menu 1 of menu item "Export as" of menu "File" of menu bar 1
  set t to 0
  repeat until (count of sheets of window 1) > 0
    delay 0.4
    set t to t + 1
    if t > 20 then return
  end repeat
  delay 0.4
  keystroke "a" using {command down}   -- 파일명 필드 전체선택
  delay 0.3
  keystroke "$N"                        -- 파일명 = 숫자
  delay 0.5
  keystroke return                      -- Save (기본 버튼)
  delay 2.8
end tell
OSA
}

for N in $(seq "$START" "$END"); do
  rm -f "$DEST/$N.pdf"
  export_one "$N"
  [ -f "$DEST/$N.pdf" ] || export_one "$N"   # 첫 타이밍 실패 시 1회 재시도
  if [ -f "$DEST/$N.pdf" ]; then
    echo "✅ $N.pdf ($(stat -f %z "$DEST/$N.pdf") bytes)"
  else
    echo "❌ $N.pdf FAILED (노트가 없거나 export 시트 미출현)"
  fi
done
