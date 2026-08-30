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

---

## 📌 스튜디오 작업 (2026-08-31) — 토스페이먼츠 카드사 심사 대응

**배경:** 토스페이먼츠 상점계약팀이 웹페이지 심사 보완 2건 요청 (2026-08-29 메일).

1. **푸터 사업자정보 가림 수정** (`src/PortraitStudio.jsx` — `S.footer`)
   - 원인: `<footer>`가 하단 고정 탭바(`BottomNav`)의 **형제 요소**라 페이지 컨테이너의
     하단 여백(96px)을 못 받고, 자체 padding이 `safe-area + 28px`뿐이라 탭바(높이 80px)에 가려짐.
   - 조치: footer 하단 padding `28px → 96px` (페이지 컨테이너와 동일).
   - 검증(라이브·헤드리스 390×844, TZ=Asia/Seoul): 사업자정보 4줄 전부 `elementFromPoint` 가시,
     탭바까지 여백 16px, 겹침 0px.
   - ⚠️ 전자상거래법 표시의무 항목이라 **하단 고정 UI를 추가/변경할 때 이 여백을 반드시 재확인**할 것.

2. **PG 심사용 테스트 계정 생성** — `pg-review@rimikimi.com` (Supabase Auth, 이메일 확인 완료 처리)
   - 용도: 카드사/토스 심사자가 로그인 후 결제창까지 확인. 비밀번호는 오너가 토스에 직접 전달.
   - 베타 화이트리스트는 이미 해제되어 있어(quota.js "정식 오픈") 별도 등록 불필요.
   - 심사 종료 후 정리 대상.

3. **결제연동 형태** — 토스에 **브랜드페이 MID가 아니라 일반 인증결제(결제창) MID**로 변경 요청 회신 예정.
   근거: `api/_lib/payments/toss.js`가 이미 결제창 → `paymentKey` → `/v1/payments/confirm` 방식으로 구현됨.
