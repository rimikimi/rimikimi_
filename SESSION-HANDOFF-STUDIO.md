# rimikimi — 스튜디오(Director) 세션 작업 기록 (2026-07-18)

> 스튜디오 세션이 이 repo에 가한 변경 핸드오프.

## 스토어 메타데이터 문서 현행화 (커밋 0ed5975)
- `STORE_LAUNCH_GUIDE.md`·`APPSTORE_METADATA.md`·`PLAYSTORE_METADATA.md` — "무료+광고, 인앱구입 없음"(6월 stale) → 현행 구조 반영:
  - IAP 팩 4종(credits_10/30/70/120 = ₩7,900/19,800/39,800/59,800) + 구독 2종(plus 월 ₩9,900 20장·광고제거 / 연 ₩99,000 240장)
  - 무료 1장/일(KST) + Pro체험 1회 + 초대 2명당 1크레딧
  - 엔진: 무료=`gemini-2.5-flash-image` / 유료=`gemini-3-pro-image` 2K (표기는 "2K 고화질", 4K 금지)
- 반영 대기 구분: ASC §5 Promotional Text(심사 없이 즉시) vs §3 설명문(다음 바이너리 제출 시) / Play §3 완성 문구(콘솔·API 게시만 하면 됨).
- ⚠️ 스토어 콘솔 실제 게시는 아직 안 함 — 오너 지시 대기.
