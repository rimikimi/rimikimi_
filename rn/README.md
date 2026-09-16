# rimikimi 2.0 — Android (React Native / Expo)

`v2/SPEC.md` 를 따르는 안드로이드 클라이언트. iOS 는 `ios2/`(SwiftUI), 웹은 `src/`. 서버(Vercel `api/`, Supabase)는 그대로 쓴다.

## 실행

```bash
cd rn
npm install                      # 이미 설치돼 있으면 생략
npx tsc --noEmit                 # 타입 검사
npx expo-doctor                  # 21/21 통과
npx expo export --platform android   # 번들 검사(Hermes .hbc 생성)

# 실기기/에뮬레이터 (네이티브 모듈이 있어 Expo Go 불가 — dev client 또는 run:android)
npx expo prebuild --platform android
npx expo run:android
```

- 서버 주소·Supabase 공개 키는 `app.config.ts` `extra` 에 있다(`EXPO_PUBLIC_API_BASE` / `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` 로 덮어쓸 수 있다). 비밀 키는 없다.
- 패키지 `com.rimikimi.app`, OAuth 딥링크 `com.rimikimi.app://login-callback` (1.x 와 동일 — Supabase Redirect URL 추가 등록 불필요).
- 글꼴은 시스템 전용(Roboto / Noto Sans KR). 번들 글꼴 없음. 큰 제목 없음.

## 구조

```
app.config.ts             Expo 설정 (패키지·딥링크·권한·플러그인)
assets/data/concepts.fallback.json   오프라인 폴백 컨셉(웹 public/concepts.fallback.json 사본)
src/theme/tokens.ts       SPEC §1 토큰 — 이 밖에서 raw hex/fontSize 금지
src/theme/motion.ts       Justin 셸 모션 표 그대로 (진입 260/종료 160, 누름 0.97, 시트 320/220, 감축모션 정책)
src/ui/                   Screen(scrollModel 필수, 유리는 크롬만) · AppHeader · Button · Segmented · Card · Sheet · Chip · Text · Logo(SVG 워드마크) · icons · ConceptCard/Rail · LoginSheet · ProgressCard · PhotoSlot · WebTool
src/lib/env.ts            부팅 env (비면 안내 화면)
src/lib/supabase.ts       Supabase 클라이언트, expo-secure-store 세션(청크 저장), PKCE
src/lib/auth.tsx          로그인 시트 + requireLogin(reason, action, route) — 로그인 뒤 하던 동작 자동 재개
src/lib/api.ts            /api/generate · /api/quota · /api/gallery · 요청 필드는 웹 generateImage() 와 동일
src/lib/concepts.ts       concepts.json 원격 로드 → 번들 폴백, 판정 함수(isDressroom/isFourcut/isCouple/…), 홈 줄 계산(웹과 동일)
src/lib/photo.ts          시스템 Photo Picker(권한 0개), 등록 사진(기기 안 보관), 1024/896 축소 + base64
src/lib/generation.tsx    작업 큐 + 진행 카드 + 복구(마커 → /api/gallery 5초 폴링, 최대 5분, 오프라인 3스트라이크)
src/lib/quota.tsx         크레딧/오늘 무료 — 헤더 칩·프로필이 같은 값
src/lib/store.tsx         컨셉·홈·등록 사진 컨텍스트
src/lib/copy.ts           한국어 문구(세 플랫폼 공통 문구)
src/app/_layout.tsx       루트 Stack: 최상위 간 fade · 계층 진입 slide_from_right(400) · 시트 modal
src/app/index.tsx         부트 게이트(가이드 1장 1회 → 홈, 로그인 복귀 경로 재개)
src/app/(tabs)/_layout.tsx  글라스 알약 탭바 62 · 하단 14 · 좌우 12 · 가운데 카메라 원 54(잉크, 위로 14) · 활성 0ms · 키보드 시 숨김
src/app/(tabs)/gallery.tsx  홈: 로고 헤더 + 크레딧 칩 + 아바타 → 카테고리 칩(하트 4색) → 추천/새로 나왔어요 → 카테고리 줄
src/app/(tabs)/filter.tsx   필름·카메라·재미 세 줄 + 맨 위 "카메라로 찍기" (프리셋 → 로그인 → 편집기 웹뷰)
src/app/(tabs)/photos.tsx   내 사진: 진행 카드 + /api/gallery 3열 그리드(길게 눌러 삭제)
src/app/(tabs)/profile.tsx  크레딧·오늘 무료·스토어·초대·알림·계정·법적 고지
src/app/concept/[id].tsx    옵션 화면: 제목=컨셉명 · 큰 미리보기 · "내 사진: 등록된 사진 사용 · 변경" · 컨셉별 옵션 · 만들기 · N 크레딧
src/app/result/[jobId].tsx  결과: 사진 · "내 사진에 저장됐어요 · 앨범에도 저장" · 앨범 저장/다듬기/공유 · 한 장 더 · 비슷한 컨셉
src/app/category/[name].tsx 카테고리 더보기 격자
src/app/camera.tsx · editor.tsx   웹뷰 자리표시(https://rimikimi-app.vercel.app/?tool=camera|filter)
```

## 1주차에 된 것

- Expo 57 / RN 0.86 / expo-router / reanimated 4 / expo-image / SecureStore / WebView — `tsc`, `expo-doctor`, `expo export --platform android`, `expo prebuild --platform android` 통과.
- 탭 5슬롯(갤러리·필터·⦿카메라·내 사진·프로필), SPEC §1 토큰·모션 그대로.
- 갤러리 홈(원격 concepts.json + /api/popular, 썸네일 expo-image 디스크 캐시, 오프라인 번들 폴백).
- 옵션 화면: 드레스룸(의상 ≤5 + 거울셀카/일상컷 + 장수), 인생네컷(2/3/4/6컷 + 서버 `fourcutStyles` 칩), 커플(상대 사진 슬롯), 매직부스(일회용 사진 슬롯), 일반(1/3/6/12장). STEP 02 화면 없음.
- 로그인: Apple·카카오·Google = Supabase OAuth(PKCE, `?code`) / 네이버 = 서버 `/api/auth/naver/start` → magic link(`#access_token`). 시점은 만들기·필터·카메라 뿐. 로그인 뒤 하던 동작 재개(메모리 action + AsyncStorage 복귀 경로).
- 생성: 웹 `generateImage()` 와 같은 JSON. 만들기 → 내 사진 탭 진행 카드 → 완료 시 결과 보기. `networkFail` 이면 갤러리 폴링 복구(웹 로직 그대로). 앱 복귀 시 마커 복구.
- 결과: 앨범 저장(expo-media-library, writeOnly), 공유(expo-sharing), 한 장 더, 비슷한 컨셉.
- 햅틱은 확정 시점(만들기 시작·완료·앨범 저장)에만.

## 자리표시(stub) / 2주차

- 카메라·편집기(다듬기): 웹뷰 자리표시. 세션 토큰을 URL 해시로 넘기지만 웹이 `?tool=&native=1` 을 읽어 바로 도구를 여는지는 웹 쪽 확인 필요. 저장·공유·앨범 네이티브 브리지 미구현.
- 필터 프리셋 목록: 키 27종 중 23개를 하드코딩. 정본은 웹 `src/filters.js` — 공유 JSON 으로 빼야 세 플랫폼이 같아진다. 썸네일 `thumbs/fs_{key}.webp` 존재 여부 미확인.
- 프로필: 스토어(RevenueCat) · 초대(`/api/referral/claim`) · 알림 설정(expo-notifications, 푸시 토큰을 `/api/generate` `pushToken` 으로 전달) · 계정 삭제(`/api/account/delete`) 는 "곧 열려요" / 웹 링크.
- 크레딧 부족 시트(팩 3·구독 1·초대) 미구현 — 지금은 서버 402/429 메시지가 진행 카드에 실패로 뜬다.
- 첫 생성 완료 후 ATT → 초대 카드, 완료 푸시(`notifyDone`) 수신 처리, 만료 리마인드.
- 증명사진(idphoto) 옵션(정장/배경색) 미구현 — 기본 프롬프트로 나간다.
- 페이스 프로필(`faceRefs`) 미전송.
- 결과 사진 768×1024 재크롭(웹 `fitToSize`) 생략 — 서버 결과 그대로. 정방향 맞춤(§3 신규) 미구현.
- 다크 모드: 토큰에 주석만. 라이트 전용 출시.
- 앱 아이콘/스플래시: `store_assets/play-icon-512.png` 그대로 씀. 어댑티브 전경 이미지는 여백 있는 전용 에셋으로 교체 필요.

## 확인된 명세 모호점

1. 탭바 "높이 62 · 하단 14 · 좌우 12": 알약 자체 높이를 62 로, 안전영역 위 14 를 바 아래 여백으로 해석했다.
2. 카메라 원 "위로 14 띄움": 원의 중심이 아니라 원의 아랫변이 바 윗변보다 14 위에 오도록 했다(`cameraLift`).
3. 인생네컷 크레딧: SPEC 은 "N컷=N장 차감"(메모리) 이지만 웹 코드(2026-08-13 이후)는 스트립 1장 = 1 크레딧이다. 웹을 따랐다.
4. "크레딧 칩" 표시값: 무제한이면 ∞, 아니면 크레딧 + 오늘 남은 무료 장수의 합. 웹은 "베타 2/2 · 크레딧 5" 두 값을 보여준다 — 문구 확정 필요.
5. 결과 화면의 "내 사진에 저장됐어요 · 앨범에도 저장" 문구는 서버가 이미 갤러리에 저장하므로 사실이지만, 갤러리 보관 1시간 안내를 어디에 둘지 미정(지금은 내 사진 탭 상단 캡션).
6. 매직부스 일회용 사진과 등록 사진이 다르다는 점을 옵션 화면 카드 문구로만 구분한다 — 디자인 확인 필요.
7. 네이버 로그인의 magic link 는 `flowType: "pkce"` 클라이언트에서 `#access_token` 해시로 돌아와야 한다(Supabase 프로젝트가 implicit 응답을 허용하는지 실기기 확인 필요).
8. `Glass` 는 Android 12 미만에서 불투명 폴백. `experimentalBlurMethod` 는 expo-blur 문서상 성능 주의.
