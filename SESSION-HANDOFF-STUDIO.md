# rimikimi — 스튜디오(Director) 세션 작업 기록 (2026-07-18)

> 스튜디오 세션이 이 repo에 가한 변경 핸드오프.

## 스토어 메타데이터 문서 현행화 (커밋 0ed5975)
- `STORE_LAUNCH_GUIDE.md`·`APPSTORE_METADATA.md`·`PLAYSTORE_METADATA.md` — "무료+광고, 인앱구입 없음"(6월 stale) → 현행 구조 반영:
  - IAP 팩 4종(credits_10/30/70/120 = ₩7,900/19,800/39,800/59,800) + 구독 2종(plus 월 ₩9,900 20장·광고제거 / 연 ₩99,000 240장)
  - 무료 1장/일(KST) + Pro체험 1회 + 초대 2명당 1크레딧
  - 엔진: 무료=`gemini-2.5-flash-image` / 유료=`gemini-3-pro-image` 2K (표기는 "2K 고화질", 4K 금지)
- 반영 대기 구분: ASC §5 Promotional Text(심사 없이 즉시) vs §3 설명문(다음 바이너리 제출 시) / Play §3 완성 문구(콘솔·API 게시만 하면 됨).
- ⚠️ 스토어 콘솔 실제 게시는 아직 안 함 — 오너 지시 대기.

---

## 📌 스튜디오 → 리미키미 세션 지시 (2026-08-24, 오너 GO)

**페이스 프로필 v1.1 구현** — 셀카 3~5장(정면·좌 45°·우 45°, 카메라 촬영 기본 + 슬롯별 앨범 대체)
→ 품질 게이트(얼굴 검출·각도·블러, 미달 시 그 자리 재촬영) → "이 얼굴을 사용할까요?" 확인 →
**기기(클라이언트)에만 저장** → 이후 모든 생성이 자동 참조(임시 업로드 → 즉시 폐기).

- 정본 스펙: `~/Documents/rimikimi studios/rimikimi studios/_design/face-profile-v1.md` (전체 읽을 것)
- 법적 요건·동의 문구 초안: 같은 폴더 `face-profile-legal.md` — **FIX-FIRST 이행 없이 스토어 제출 금지**
  (방침에 "기기 보관·생성 시 임시 전송" 반영)
- 멀티 레퍼런스 프롬프트 문법: `~/Documents/justin/app/api/_lib/engine/gemini.ts` buildGenEditPrompt 참조 (스튜디오 실증본)
- 완료 기준: 스펙 §6 A/B 실측(셀카 1장 vs 3장 × 각 5회, 눈 비교) 포함 — 실측 없이 "정확도 향상" 주장 금지
