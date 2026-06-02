# api/ 폴더 — 서버리스 백엔드

Vercel이 이 폴더의 각 `.js` 파일을 자동으로 서버 함수로 만들어줍니다.
예: `api/generate.js` → `/api/generate` 엔드포인트.

`_` 로 시작하는 폴더/파일은 엔드포인트가 아니라 공용 모듈입니다.

## 엔드포인트
- `generate.js` — 이미지 생성 프록시 (인증 → 한도/크레딧 체크 → 얼굴 사전검사 → Gemini 호출 → 갤러리 저장)
- `quota.js` — 사용자의 오늘 사용량 / 크레딧 / 차단 여부 조회
- `gallery.js` — 내 갤러리 목록 / 삭제 (1시간 만료)
- `auth/naver/start.js`, `auth/naver/callback.js` — 네이버 커스텀 OAuth
- `referral/claim.js` — 친구 초대 관계 기록
- `checkout/packages.js` — 크레딧 패키지/결제수단 목록
- `checkout/create.js` — 결제 시작 (PayPal/토스/이니시스 어댑터)
- `checkout/capture.js` — 결제 검증 + 크레딧 적립 (멱등)

## 공용 모듈 (`_lib/`)
- `auth.js` — Supabase admin 클라이언트, 토큰 검증, 관리자/테스터 화이트리스트, KST 자정
- `gallery.js` — 갤러리 저장/조회/만료 lazy-purge
- `precheck.js` — Flash Lite 얼굴 사전검사
- `credits.js` — 초대+결제 크레딧 잔액 계산
- `payments/` — 결제 어댑터 (registry / paypal / toss / inicis / packages)

## 환경변수
서버 전용 키는 Vercel 환경변수 + 로컬 `.env.local` 에만 둡니다.
`VITE_` 접두사가 붙은 값만 브라우저로 노출됩니다 (anon key 등).
