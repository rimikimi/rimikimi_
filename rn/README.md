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

## 2주차에 된 것

- **스토어·구독** (`src/lib/iap.ts`, `src/lib/storeFlow.ts`, `src/app/store.tsx`, `src/ui/StoreList.tsx`): react-native-purchases, 1.x `src/iap.js` 흐름 그대로 — configure(appUserID) → logIn(user.id) → getProducts(NON_SUBSCRIPTION + SUBSCRIPTION 각각) → purchaseStoreProduct → `POST /api/iap/grant {productId, transactionId}` (202 면 1.8s×6 재시도, 구독은 웹훅 적립이라 grant 실패 무시). 상품 ID 7종 + 옛 구독 ID. 모든 네이티브 호출 타임아웃. Play `subId:basePlanId` 접미사 대응. 구매 복원. RC 안드로이드 공개 키는 `app.config.ts extra.rcAndroidKey`(1.x `VITE_RC_ANDROID_KEY` 값) — 없으면 스토어 UI 는 뜨고 버튼은 "준비 중".
- **크레딧 부족 시트** (`src/lib/creditGate.tsx`, `src/ui/CreditSheet.tsx`): 만들기 → 잔액 < 비용이면 팩 3 · 구독(먼슬리) · "친구 초대로 무료 3장" 시트. 구매 성공 → 잔액 갱신 → 하던 생성 이어서 시작.
- **푸시** (`src/lib/push.ts`): expo-notifications 권한·FCM 토큰(`getDevicePushTokenAsync`), 토큰은 서버에 등록하지 않고 1.x 처럼 `/api/generate` `pushToken` 에 실어 보냄. 드롭: ① `/api/drops` 일정으로 로컬 예약(현지 20:00) ② `@react-native-firebase/messaging` 로 시간대 토픽 `drop_p540` 구독(서버 dropNotice.js 규칙). 권한 팝업은 프로필 "새 컨셉 알림 켜기" 토글에서만; 앱 시작 시엔 이미 허용된 경우만 조용히 설정. `google-services.json` 은 1.x `android/app/` 사본(미추적).
- **첫 실행 가이드 1장**: 1.x Guide.jsx intro "3단계면 끝나요" 문구. 실행 시 다른 팝업 없음. **첫 생성 완료 후 홈 상단 초대 카드 1회** (`src/ui/InviteCard.tsx`, 플래그 `rimikimi_invite_card_due/done`). ATT 는 iOS 전용이라 없음.
- **프로필**: 초대 코드(내 코드 탭 복사·공유 + 친구 코드 6자 입력 → `POST /api/referral/claim {ref}`, 실패 사유별 문구), 계정 삭제(`POST /api/account/delete` → 로컬 사진·페이스 프로필 정리 → 로그아웃), 법적 고지 링크(약관·개인정보·환불), 알림 토글, 페이스 프로필(등록 사진으로 앵커 생성 → 기기 저장 → 생성 때 `faceRefs`).
- **정방향 맞춤(클라)** (`src/lib/fit.ts`, `src/ui/FitSheet.tsx`): 결과 화면에서 3:4(±2%) 가 아니면 제안 시트. EXIF 바로 세우기(ImageManipulator 재인코딩) + 3:4 크롭. **얼굴 검출은 미장착** — `expo-face-detector` 는 SDK 51 에서 제거됐고 ML Kit 바인딩은 실빌드 검증 없이 넣지 않았다. `FaceDetector` 인터페이스(`setFaceDetector`)만 두고 기본은 **중앙·상단 가중 크롭**(가로 중앙, 위쪽 여백 = 남는 높이의 30%). "채워 맞춤 · 1 크레딧" 은 버튼만("곧 열려요").
- **필터 프리셋 = 웹 사본** (`src/filters.ts`): `src/filters.js` 를 그대로 복사해 타입만 붙인 것(27종 + `applyLook`/`applyLookWithStrength` 전부). 필터 탭은 `groupedPresets()` 로 그린다. 2.1 Skia 포팅의 기준.
- **faceRefs / pushToken** 을 `/api/generate` 요청에 1.x 와 동일하게(아트 변환 제외 시 faceRefs).
- **dev 프리뷰** (`scripts/previews.tsx`, `src/app/dev/`): 앱에서 `/dev` 로 가면 토큰·컴포넌트 / 로그인 시트 / 크레딧 시트 / 스토어 목록 / 시트·정방향 맞춤 / 카드 프리뷰 + 실제 화면 바로가기. `__DEV__` 가 아니면 빈 화면.

## 3주차에 된 것

- **편집기·카메라 웹뷰 네이티브 브리지** (`src/ui/WebTool.tsx`, `src/lib/nativeMedia.ts`): 웹(`src/nativeBridge.js`, 이 워크트리 밖 — iOS 쪽 작업으로 이미 들어와 있다)이 이미 `window.webkit.messageHandlers.rimikimi` 를 네이티브 임베드 판정 기준으로 쓰고 있길래(`isRimikimiWebView()`), **웹은 한 글자도 안 고치고** Android WebView 에 그 이름을 그대로 흉내 내는 shim 을 `injectedJavaScriptBeforeContentLoaded` 로 심었다 — `window.webkit.messageHandlers.rimikimi.postMessage(obj)` 를 `window.ReactNativeWebView.postMessage(JSON.stringify(obj))` 로 연결만 해 준다. 메시지 규약은 `{id,type,payload}` → 처리 후 `window.__rimikimiResolve(id, result)`(이건 nativeBridge.js 자신이 이미 정의해 둔 함수라 여기서 또 안 만든다). 액션 4종: `saveToAlbum`(expo-media-library, `{ok:true}|{error}`) · `share`(expo-sharing, `{ok,reason?}`) · `close`(id 없이 옴, `router.back()`) · `refreshCredits`(quota 컨텍스트 갱신). 결과 화면 "다듬기" 버튼은 원격 URL 이면 `?img=` 로 편집기에 넘긴다(웹 쪽이 그 파라미터를 읽는지는 미확인 — `?tool=camera|filter&native=1` 자체를 아직 src/ 가 안 읽는다, 아래 참고).
- **카메라 권한** (`src/app/camera.tsx`, `app.config.ts`): `expo-image-picker` 의 `cameraPermission` 문자열만으론 매니페스트에 `CAMERA` 가 안 붙는 걸 `expo prebuild` 로 실측 확인해 `android.permissions` 에 명시 추가했다. 카메라 탭 진입 시 `requestCameraPermissionsAsync()` 로 먼저 물어보고(거부 시 안내 후 뒤로), 그 다음에 웹뷰를 띄운다. react-native-webview 13.16.1 은 Android `getUserMedia` 권한을 자체 `WebChromeClient.onPermissionRequest` 로 이미 자동 처리한다(OS CAMERA 권한 확인 → 없으면 Activity 에 직접 요청 → 승인) — JS `onPermissionRequest` prop 은 이 버전 타입에 없다(런타임에도 없음, 안 써도 됨).
- **완료 푸시 → 결과 화면 직행** (`src/lib/lastJob.ts`, `src/lib/push.ts`, `src/lib/generation.tsx`): 서버 푸시 payload 는 `{kind:"genDone",count}` 뿐이라 알림 자체엔 어떤 결과인지 정보가 없다(`api/_lib/push.js` 미변경, 이 워크트리 밖). 대신 이 기기가 방금 완료한 생성을 `AsyncStorage`(10분 TTL)에 남겨 뒀다가 알림을 탭하면 그 결과로 연다 — `/result/[jobId]` 로 jobId·conceptId·title·url 을 다 실어 보내므로, 앱이 완전히 죽었다 열려도(GenerationProvider 메모리가 비어도) 최소 그 한 장은 보여준다. 완료된 게 없거나 10분 넘게 지났으면 기존처럼 내 사진 탭.
- **알림 상태바 아이콘** (`assets/images/notification-icon.png`): 96×96, 흰색(255,255,255) + 알파만 있는 하트 실루엣(로고 워드마크의 모노크롬 버전, 파라메트릭 하트 커브로 생성) — `expo-notifications`·FCM 기본 아이콘 둘 다 이걸로 바꿨다. `expo prebuild` 로 `drawable-{m,h,xh,xxh,xxxh}dpi/notification_icon.png` 5종에 실제로 깔리는 것과 `AndroidManifest.xml` 의 `default_notification_icon` meta-data 를 확인했다. ⚠️ `assets/` 전체가 `.gitignore` 대상(기존 앱 아이콘·스플래시도 마찬가지 — 이 저장소 관례)이라 이 PNG 도 git 에는 안 잡힌다, 커밋과 별도로 전달 필요.
- **부수 수정**: `nativeMedia.ts`·`result/[jobId].tsx` 의 `expo-media-library`/`expo-sharing`/`expo-file-system` import 를 최상단에서 함수 안 지연 import 로 바꿨다 — 최상단에 두면 네이티브 모듈이 없는 빌드(웹 `/dev` 프리뷰 등)에서 그 화면이 번들에 물려 있는 것만으로 전체가 크래시났다(실기기 Android 동작엔 영향 없음, 검증 중 발견).

## 확인 못 한 것 (3주차)

- **`src/` 쪽 라우팅 미완**: `WebTool.tsx` 가 `?tool=camera|filter&native=1` 로 웹을 띄우는데, `src/CameraStudio.jsx`/`PhotoEditor.jsx`/`main.jsx` 어디에도 이 쿼리를 읽는 코드가 없다(1·2주차부터 있던 자리표시 가정, 이번 주도 그대로) — 웹 쪽이 이 파라미터로 실제 카메라/편집기 화면을 곧장 띄우도록 라우팅해야 브리지가 눈에 보이는 동작으로 이어진다. `nativeClose`/`nativeRefreshCredits`(`src/nativeBridge.js`)도 정의만 있고 `CameraStudio.jsx`/`PhotoEditor.jsx` 어느 버튼에서도 아직 안 부른다.
- **실기기/에뮬레이터 미검증**: 이 환경엔 Android SDK 는 있는데 Java 런타임이 없어(`java -version` 실패) `gradle`/`expo run:android` 자체가 안 된다 — 브리지 postMessage 왕복, 카메라 실권한 프롬프트, 저장/공유 실동작, 알림 아이콘 실제 표시는 전부 미검증(타입·번들·prebuild 매니페스트 배선만 확인).
- **웹(`/dev`) 스크린샷 실패**: `rn/src/lib/supabase.ts` 의 세션 스토리지(`expo-secure-store`)가 웹에서 `ExpoSecureStore.default.getValueWithKeyAsync is not a function` 로 앱 부팅 자체를 막는다(1주차부터 있던 기존 코드, 이번 주 변경 아님) — `/dev`·`/camera`·`/editor` 어느 라우트를 열어도 이 오류 오버레이가 화면을 덮어 실제 UI 스크린샷을 못 찍었다. 캡처는 시도했으나(에러 화면만) 의미가 없어 버렸다.
- **얼굴 검출(ML Kit) — 조사만, 안 붙임**: `@react-native-ml-kit/face-detection`(npm 최신 2.0.1, 2025-09-01 배포) 을 확인했다. New Architecture/TurboModule 지원 근거가 없고(레거시 브리지 네이티브 모듈, RN `>=0.60 <1.0.x` 만 명시), Expo config plugin 도 없다(수동 링킹 전제). 이 프로젝트는 RN 0.86 — 최근 React Native 는 New Architecture 가 기본/사실상 필수라 구형 레거시 모듈은 빌드 실패나 런타임 크래시 위험이 크다. 게다가 이 환경엔 Java 가 없어 실빌드로 확인할 방법 자체가 없다 → **지시대로 실빌드 검증 없이는 안 붙였다.** `rn/src/lib/fit.ts` 의 `setFaceDetector()` 인터페이스는 그대로 열려 있으니, 실기기 빌드가 되는 환경에서 붙여 검증하면 된다.
- 완료 푸시 결과 직행이 커버 못 하는 경우: 알림이 10분 넘게 방치됐다 탭되면(TTL) 예전처럼 내 사진 탭으로 간다 — 서버가 payload 에 jobId/URL 을 안 실어 주는 한 구조적 한계.

## 자리표시(stub) / 남은 것

- 얼굴 검출(정방향 맞춤): 위 "확인 못 한 것" 참고 — ML Kit 조사 완료, 미장착.
- 증명사진(idphoto) 옵션(정장/배경색) 미구현 — 기본 프롬프트로 나간다.
- 결과 사진 768×1024 재크롭(웹 `fitToSize`) 생략 — 서버 결과 그대로.
- 다크 모드: 토큰에 주석만. 라이트 전용 출시.
- 앱 아이콘/스플래시: `store_assets/play-icon-512.png` 그대로. 어댑티브 전경 이미지 전용 에셋 필요.
- 실기기 미검증 항목: Play 결제(거래ID 가 서버 `purchaseTxId` 와 맞는지 — 1.x 와 같이 `transactionIdentifier` 우선, `purchaseToken` 폴백), FCM 토큰 형식, 네이버 magic link 해시 복귀.

## 확인된 명세 모호점

1. 탭바 "높이 62 · 하단 14 · 좌우 12": 알약 자체 높이를 62 로, 안전영역 위 14 를 바 아래 여백으로 해석했다.
2. 카메라 원 "위로 14 띄움": 원의 중심이 아니라 원의 아랫변이 바 윗변보다 14 위에 오도록 했다(`cameraLift`).
3. 인생네컷 크레딧: SPEC 은 "N컷=N장 차감"(메모리) 이지만 웹 코드(2026-08-13 이후)는 스트립 1장 = 1 크레딧이다. 웹을 따랐다.
4. "크레딧 칩" 표시값: 무제한이면 ∞, 아니면 크레딧 + 오늘 남은 무료 장수의 합. 웹은 "베타 2/2 · 크레딧 5" 두 값을 보여준다 — 문구 확정 필요.
5. 결과 화면의 "내 사진에 저장됐어요 · 앨범에도 저장" 문구는 서버가 이미 갤러리에 저장하므로 사실이지만, 갤러리 보관 1시간 안내를 어디에 둘지 미정(지금은 내 사진 탭 상단 캡션).
6. 매직부스 일회용 사진과 등록 사진이 다르다는 점을 옵션 화면 카드 문구로만 구분한다 — 디자인 확인 필요.
7. 네이버 로그인의 magic link 는 `flowType: "pkce"` 클라이언트에서 `#access_token` 해시로 돌아와야 한다(Supabase 프로젝트가 implicit 응답을 허용하는지 실기기 확인 필요).
8. `Glass` 는 Android 12 미만에서 불투명 폴백. `experimentalBlurMethod` 는 expo-blur 문서상 성능 주의.
