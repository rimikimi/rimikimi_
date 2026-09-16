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

## 4주차에 된 것

- **채워 맞춤 연결** (`src/lib/api.ts` `outpaintImage()`, `src/ui/FitSheet.tsx`): 서버 계약(고정) `POST /api/generate` + `fit:"outpaint"` → 응답 `{mimeType,base64,credits,quotaUsed,quotaLimit}` 그대로 붙였다. 버튼 누르면 크레딧 게이트(`useCreditGate`) 를 먼저 거쳐(부족하면 기존 크레딧 시트 → 구매 후 자동 재시도) 원본을 1024 로 인코딩해 보내고, 결과를 그 자리에서 표시 이미지로 바꾼다(`onFitted`). 진행 중 스피너·실패 시 Alert. **서버가 이 워크트리에 아직 배포됐는지 실호출로 확인 못 함**(서버는 `api/` — 이번 작업 범위 밖) — 에러 경로(네트워크 실패·402/429·응답 파싱 실패)만 코드로 확인, 실제 성공 응답은 서버 배포 후 재검증 필요.
- **완료 푸시 → 정확한 결과 직행**: 서버 `api/generate.js` 가 이미 push data 에 `galleryId` 를 얹고 있는 걸 확인했다(기존 kind/count 유지, 추가만 — 계약대로). 라우팅 로직을 `push.ts` 에서 `src/lib/pushRouting.tsx` 의 `usePushResultRouting()` 훅으로 분리했다(galleryId 룩업에 `useAuth`/`useGeneration` 이 필요해서). 우선순위: ① 이 기기 메모리(GenerationProvider)에 같은 galleryId 이미지를 가진 job 이 있으면 그 job 전체(여러 장) 로 ② 없으면 `/api/gallery` 를 한 번 조회해 그 항목 하나로 ③ galleryId 자체가 없거나 못 찾으면 기존 로컬 TTL(`lastJob.ts`, 10분) 폴백. `_layout.tsx` 에 `<PushRouting />` 을 GenerationProvider 안에 심었다.
- **다크 모드**: 기기 설정을 그대로 따른다(`app.config.ts` `userInterfaceStyle: "automatic"`). `src/theme/tokens.ts` 가 `color` 객체 하나를 계속 유지하며 `applyScheme()` 이 라이트/다크 값으로 in-place 로 바꾸고, `_layout.tsx` 가 `useColorScheme()` 로 감지해 렌더 시점에 적용한다(메모이제이션이 없어 전체 트리가 새 값으로 다시 그려진다). 색이 바뀌는 걸 반영하려면 스타일이 "매 렌더 다시 계산"돼야 하는데, 화면들이 전부 모듈 스코프 `StyleSheet.create({...color.x...})` 를 쓰고 있어(스킴이 바뀌어도 값이 얼어붙는다) 그 28개 파일 전부를 `themedStyles(() => StyleSheet.create({...}))` 로 감쌌다(테마 버전이 바뀔 때만 다시 계산, 그 사이는 캐시). 같은 이유로 `src/ui/Text.tsx` 의 톤별 색 맵(모듈 스코프 `tones`)도 렌더 시점 함수로 바꿨고, `src/ui/Screen.tsx` 의 `Glass` 폴백 배경·블러 tint 도 스킴을 따르게 했다. `src/ui/LoginSheet.tsx` 의 구글 버튼(고정 흰 배경)은 글자색을 `color.ink` 대신 고정 진한 잉크로 되돌렸다(다크에서 흰 배경 위에 흰 글자가 될 뻔한 걸 잡음). 라이트 값은 3주차와 완전히 동일 — 실측(아래 캡처)으로 확인.
- **웹 `/dev` 프리뷰 부팅 크래시 고침** (`src/lib/supabase.ts`): `expo-secure-store` 가 웹에 없어(`getValueWithKeyAsync is not a function`) 앱 부팅 자체가 막히던 문제 — 웹(`Platform.OS==="web"`) 에서만 Supabase 세션 저장소를 `AsyncStorage` 로 바꾸는 분기를 추가했다. Android 는 여전히 `expo-secure-store` 청크 저장 그대로(분기 안 탐). 이제 `npx expo start --web` 으로 `/dev`, 실제 탭 라우트(`/(tabs)/gallery` 등) 스크린샷이 실제로 나온다 — 라이트/다크 모두 캡처해 확인함(`w4_rn_*.png`, 아래 검증 항목).

## 5주차에 된 것

- **증명사진(idphoto) 옵션** (`src/lib/concepts.ts` `ID_SUITS`/`ID_BGS`/`buildIdPhotoPrompt`/`ID_DISCLAIMER`, `src/app/concept/[id].tsx`, `src/lib/generation.tsx`): 웹 `src/PortraitStudio.jsx` 의 `ID_SUITS`(4색)·`ID_BGS`(8색)·`buildIdPhotoPrompt()`·면책 문구를 그대로 옮겼다. 옵션 화면에 정장 색상 칩 4개 + 배경 색상 스와치 8개 카드를 추가했고(`isIdPhoto(concept)` 일 때만), "만들기" 시 `generation.tsx` 의 `start()` 가 `isIdPhoto(concept)` 를 감지해 `buildIdPhotoPrompt(suit, bgHex, bgName)` 으로 프롬프트를 조립하고 `idSuit`/`idBg`/`idBgName` 을 `GenerateMeta` 에 실어 `/api/generate` 로 보낸다(`api.ts` 는 이미 이 필드들을 body 에 넣고 있었다 — 화면·상태 배선만 빠져 있었다). 웹의 직접 hex 커스텀 컬러피커(`<input type=color>`)는 네이티브에 대응물이 마땅치 않아 **프리셋 8색만** 넣었다(웹은 프리셋 + 커스텀). 웹 프리뷰로 옵션 화면(`/concept/409`)을 스크롤해 카드가 뜨는 걸 확인했다(`fin_rn_idphoto_scrolled.png`).
- **결과 사진 재크롭** (`src/lib/fitToSize.ts` 신규, `src/lib/generation.tsx`): 웹 `fitToSize()`(768×1024 중앙 크롭+리사이즈)·`fitToRatio()`(원본 비율 유지 크롭, keepRatio 컨셉용)을 `expo-image-manipulator` 로 그대로 포팅했다(`fitResultToSize`/`fitResultToRatio`, 크롭 사각형 계산은 웹과 동일한 산식). `generation.tsx` 의 `start()` 가 `generateImage()` 응답(및 묶음 `batch[]`) 을 job.images 에 넣기 **전에** 이 크롭을 적용한다 — 결과 화면(`result/[jobId].tsx`)은 이미 크롭된 uri 만 받으므로 표시·저장·공유·"한 장 더" 전부 자동으로 크롭된 이미지를 쓴다. keepRatio(사진 복원, `isRestoreConcept`) 는 원본 등록 사진의 실제 비율(`fileRatio()`)로 중앙 크롭만 하고 리사이즈는 안 한다(웹과 동일). ⚠️ 갤러리 폴링 복구 경로(`lookupPendingResult`, 네트워크 끊김 후 `/api/gallery` 조회)는 서버가 이미 저장한 URL 을 그대로 쓰고 이 재크롭을 적용하지 않는다 — 웹도 이 경로는 재처리하지 않는 것으로 보여 의도적으로 맞췄다(서버 갤러리 URL 은 이미 서버가 만든 최종 이미지).
- **얼굴 검출 판단 근거** — 아래 "§3 자가 점검 / ML Kit 최종 판단" 절 참고. 실제 인물 사진 3장 + 합성 스트레스 테스트 3장(정사각형·가로 4:3·풀바디 9:16)에 대해 OpenCV Haar cascade 로 얼굴을 실제 검출하고, `fit.ts` 의 무검출기 크롭(중앙·상단 가중 30%) 결과와 겹쳐 시각화했다(스크래치패드 `shots/probe_*.png`, `shots/stress_*.png`). 결론: **얼굴이 세로 중심에 가깝고 사진이 3:4 에 가까울 때만 안전** — 얼굴이 가로로 중심이 아니거나(가로 사진·풀바디 사진), 프레임 맨 위에 아주 가까울 때는 잘릴 수 있다(실측 확인, 아래 표).
- **웹뷰 브리지 재확인**: `src/ToolEntry.jsx`(읽기 전용, 이 워크트리 밖에서 이미 구현돼 있었다)가 `?tool=camera|filter` 를 라우팅하고 `nativeClose` 를 "닫기" 버튼·시트 onClose 에 이미 연결해 뒀다 — 3주차 README 의 "src/ 쪽 라우팅 미완" 항목은 **웹 담당 쪽에서 해소됨**을 확인했다(RN 쪽은 수정 없음, 확인만). 남은 자잘한 것 하나: `nativeRefreshCredits`(정의만 있고 아직 어디서도 호출 안 함) — 아래 "④ 웹·서버 담당에게 필요한 것" 참고.
- **앱 아이콘/스플래시**: 기존 `assets/images/{icon,adaptive-icon,splash-icon}.png` 3개가 전부 `store_assets/play-icon-512.png` 와 바이트 단위로 동일한, 배경이 불투명한 정사각 아이콘이었다(어댑티브 전경 이미지로 쓰면 원 마스크에 흰 배경째로 잘려 나온다). 새 전용 에셋을 발주받지 않고, 저장소에 이미 있던 `public/icons/icon-512.png`(하트 4색 로고, PWA 아이콘 소스)에서 흰 배경을 알파 채널로 제거하고, 안전영역(약 62%)에 맞게 축소·중앙 정렬해 `adaptive-icon.png`/`splash-icon.png` 를 새로 만들었다(`icon.png` 은 기존 불투명 정사각 그대로 유지 — 일반 아이콘 필드는 그게 맞다). 원 마스크로 시뮬레이션해 하트 끝이 안 잘리는 것도 확인했다(`shots/adaptive_icon_circle_mask.png`). `assets/` 는 이 저장소 관례상 `.gitignore` 대상이라 커밋에는 안 잡힌다 — 산출물 자체는 이미 `rn/assets/images/` 에 반영돼 있다.
- **명세 모호점 재검토**: 아래 "확인된 명세 모호점" 절 참고 — 4/6번은 이미 코드로 구현·확정된 상태였음을 재확인했고(오너 판단 불필요), 실기기 필요 항목만 남겼다.

## 확인 못 한 것 (3주차)

- ~~**`src/` 쪽 라우팅 미완**~~ → **5주차: 웹 담당 쪽에서 해소 확인.** `src/main.jsx` 가 `?tool=camera|filter` 를 읽어 `ToolEntry.jsx` 로 라우팅하고, `ToolEntry.jsx` 가 `nativeClose` 를 "닫기" 버튼과 시트 `onClose` 들에 연결해 뒀다(`isRimikimiWebView()` 로 네이티브 임베드 판정). RN `WebTool.tsx` 의 `native=1` 쿼리 파라미터는 웹 쪽에서 안 읽지만 무해하다(그냥 안 쓰임). `nativeRefreshCredits`(`src/nativeBridge.js`) 는 여전히 정의만 있고 `src/` 어디서도 호출하지 않는다 — 카메라/필터 웹뷰 안에서 크레딧이 바뀌는 흐름(예: 편집기 안 구매)이 생기면 그때 붙이면 된다(현재는 카메라·필터가 크레딧을 안 쓰므로 실사용 공백은 없어 보인다).
- **실기기/에뮬레이터 미검증**: 이 환경엔 Android SDK 는 있는데 Java 런타임이 없어(`java -version` 실패) `gradle`/`expo run:android` 자체가 안 된다 — 브리지 postMessage 왕복, 카메라 실권한 프롬프트, 저장/공유 실동작, 알림 아이콘 실제 표시는 전부 미검증(타입·번들·prebuild 매니페스트 배선만 확인).
- **웹(`/dev`) 스크린샷 실패**: `rn/src/lib/supabase.ts` 의 세션 스토리지(`expo-secure-store`)가 웹에서 `ExpoSecureStore.default.getValueWithKeyAsync is not a function` 로 앱 부팅 자체를 막는다(1주차부터 있던 기존 코드, 이번 주 변경 아님) — `/dev`·`/camera`·`/editor` 어느 라우트를 열어도 이 오류 오버레이가 화면을 덮어 실제 UI 스크린샷을 못 찍었다. 캡처는 시도했으나(에러 화면만) 의미가 없어 버렸다.
- **얼굴 검출(ML Kit) — 조사만, 안 붙임**: `@react-native-ml-kit/face-detection`(npm 최신 2.0.1, 2025-09-01 배포) 을 확인했다. New Architecture/TurboModule 지원 근거가 없고(레거시 브리지 네이티브 모듈, RN `>=0.60 <1.0.x` 만 명시), Expo config plugin 도 없다(수동 링킹 전제). 이 프로젝트는 RN 0.86 — 최근 React Native 는 New Architecture 가 기본/사실상 필수라 구형 레거시 모듈은 빌드 실패나 런타임 크래시 위험이 크다. 게다가 이 환경엔 Java 가 없어 실빌드로 확인할 방법 자체가 없다 → **지시대로 실빌드 검증 없이는 안 붙였다.** `rn/src/lib/fit.ts` 의 `setFaceDetector()` 인터페이스는 그대로 열려 있으니, 실기기 빌드가 되는 환경에서 붙여 검증하면 된다.

### 5주차: 무검출기 크롭 실측 — 안전한 경우 / 위험한 경우

Java 가 없어 ML Kit 자체를 붙여 검증할 수는 없지만, "지금 방식(중앙·상단 가중 30%)이 실전에서 얼마나 위험한가" 는 실측할 수 있다. 방법: OpenCV(Haar cascade)로 실제 얼굴 위치를 찾아 정답으로 삼고, `fit.ts` `cropRect()` 알고리즘(얼굴 없음 가정)이 계산한 3:4 크롭 박스와 겹쳐 봤다. 표본은 저장소에 이미 있던 인물 사진 3장(`ios2/rimikimi/Resources/e2e_sample_person.jpg` 896×1200, `store_assets/promo_couple.png` 1080×1350, `store_assets/filter_thumb_src.jpg` 1019×1365 — 전부 3:4 에 가까운 비율이라 `needsFit()` 자체가 거의 발동 안 함) + 그 중 하나(e2e_sample_person)를 정사각형·가로 4:3·풀바디 9:16 으로 재구성한 합성 스트레스 테스트 3장(FitSheet 가 실제로 제안될 만한, 3:4 와 크게 다른 비율).

| 케이스 | 원본 비율 | 얼굴 위치 | 크롭 결과 | 파일 |
|---|---|---|---|---|
| 실사진 3장(거의 3:4) | 0.75~0.80 | 대체로 중앙 | 크롭이 거의 no-op(원본과 동일) → 문제 없음 | `probe_*.png` |
| A. 정사각형 1:1 (인스타 셀카 흔한 비율) | 1.00 | **가로로 왼쪽 치우침**(원본 사진 자체가 얼굴이 프레임 왼쪽에 있었음) | **잘림** — 가로 중앙 크롭이라 얼굴 중심(x=32~218)이 크롭 시작선(x=112) 왼쪽에 있어 왼쪽 절반이 잘려나감 | `stress_A_square_1x1.png` |
| B. 가로 4:3(그룹/책상 사진 흔한 비율) | 1.33 | 프레임 왼쪽 끝 | **잘림** — 가로 오프셋 보정이 전혀 없어 얼굴이 프레임 가장자리에 있으면 그대로 잘려나감 | `stress_B_landscape_4x3_face_left.png` |
| C. 풀바디 9:16(세로 긴 셀카) | 0.56 | 프레임 맨 위(머리 위 여백 3~4%) | **머리 위쪽 일부 잘림** — 위쪽 30% 여백 공식이 "얼굴이 이미 프레임 최상단에 붙어 있는" 사진엔 과함(크롭 시작선이 얼굴 정수리보다 아래) | `stress_C_fullbody_9x16.png` |

**결론(신뢰도: 중간)**: 지금 크롭은 가로 오프셋 보정이 전혀 없다(항상 가로 중앙) — 즉 **얼굴이 가로로 중앙이 아니면 검출기 없이는 100% 잘린다.** 세로도 "얼굴이 이미 맨 위에 붙어 있는" 극단적 케이스에서 과하게 잘릴 수 있다. 다만 이 크롭은:
1. `needsFit()` 이 3:4 에서 크게 벗어난 사진에만 발동하는 **선택적 제안**이고(제출 사진 대부분은 이미 3:4 에 가까운 세로 인물 사진이라 애초에 안 뜬다),
2. 시트에 "그대로 두기" 와 "채워 맞춤(서버, 크롭 없음)" 대안이 있으며,
3. 크롭 결과가 결과 화면에 바로 보이므로(즉시 시각적 피드백) 잘못 잘렸으면 사용자가 바로 알아채고 재시도할 수 있다(단, 이미 앨범에 저장/공유해버렸으면 늦음 — FitSheet 는 크롭 확인 미리보기 없이 바로 적용한다는 점은 실제 약점).

→ **2.0 출시 판단: 이 방식으로 출시 가능(조건부)** — 다만 FitSheet 에 "크롭 미리보기 후 확정" 스텝을 추가하거나(네이티브 모듈 불필요, 순수 UI 작업이라 이번 주 스코프였다면 했겠지만 시간상 후순위로 미룸), 2.1 에서 ML Kit(또는 Google Play services ML Kit on-device 공식 RN 바인딩이 New Architecture 를 지원하는 버전이 나오면 그걸로)을 실기기 빌드 환경에서 검증 후 `setFaceDetector()` 로 갈아끼우는 걸 강하게 권한다. 오너가 "미리보기 확인 스텝"을 우선순위로 올릴지는 판단이 필요하다(아래 ⑤).
- 완료 푸시 결과 직행이 커버 못 하는 경우: 알림이 10분 넘게 방치됐다 탭되면(TTL) 예전처럼 내 사진 탭으로 간다 — 서버가 payload 에 jobId/URL 을 안 실어 주는 한 구조적 한계(4주차: galleryId 가 이제 있어서 이 경로 자체가 크게 줄었다 — TTL 폴백은 galleryId 조차 없거나 갤러리 조회도 실패했을 때만 남는다).

## 확인 못 한 것 (4주차)

- **채워 맞춤 실호출 미검증**: 서버가 `fit:"outpaint"` 를 실제로 처리하는 배포본인지 이 워크트리에서 확인할 방법이 없다(서버 코드는 `api/` — 범위 밖, 다른 작업자 담당). 코드는 계약대로 짜여 있고 에러 처리(네트워크 실패·크레딧 부족 402/429·응답 파싱 실패)는 확인했지만, **성공 경로(실제 3:4 이미지가 돌아오는지)는 서버 배포 후 재검증 필요**.
- **실기기 미검증 유지**: 3주차와 같은 이유(Java 런타임 없음)로 채워 맞춤 버튼의 실제 탭 → 진행 → 결과 교체, 다크 모드 전환 애니메이션(기기 설정 토글 시 재부팅 없이 즉시 바뀌는지), 푸시 galleryId 라우팅의 실제 도착·탭 동작은 타입·번들·웹 프리뷰로만 확인했다.

## ML Kit 붙이는 절차 (실기기 빌드 가능한 환경에서, `setFaceDetector()` 기준)

1. `npx expo install @react-native-ml-kit/face-detection` 은 쓰지 않는다(레거시 브리지, New Arch 지원 근거 없음 — 위 판단 참고). 대신 **Google Play services ML Kit 를 New Architecture(TurboModule/Fabric) 로 지원한다고 명시된 패키지**가 나왔는지 먼저 확인한다(현재 후보 없음, 2.1 착수 시 재조사).
2. 후보가 config plugin 을 제공하면 `app.config.ts` `plugins` 에 추가 후 `npx expo prebuild --clean --platform android`. 없으면 수동 링킹이 필요하므로(Expo managed 워크플로 이탈 위험) 후보에서 제외하는 걸 권한다 — 이 프로젝트는 `expo prebuild` 로 매니페스트를 관리하는 게 원칙(README 전체 관례).
3. 검출기 함수를 만들어 붙인다: `import { setFaceDetector } from "@/lib/fit"; setFaceDetector(async (uri) => { /* 패키지 API 호출 → FaceBox[] 반환 */ });`(앱 부팅 시 1회, 예: `_layout.tsx`). `FaceBox = {x,y,width,height}` — 픽셀 좌표, `cropRect()` 가 알아서 최대 얼굴을 골라 크롭 중심을 맞춘다(코드 변경 불필요, 인터페이스가 이미 이렇게 설계돼 있다).
4. 검증 순서(실기기 필요): ① `npx expo run:android` 로 네이티브 크래시 없이 뜨는지 ② 이번 주 만든 스트레스 케이스(정사각형·가로 4:3·풀바디 9:16, 위 표)와 같은 비율의 실제 사진으로 FitSheet → "잘라 맞춤" 을 눌러 크롭이 얼굴을 포함하는지 육안 확인 ③ Hermes 번들 크기·시작 시간 회귀가 없는지 ④ `expo-doctor`/`tsc`/`expo export` 가 여전히 통과하는지.
5. 실패(크래시·New Arch 비호환) 시 `setFaceDetector(null)` 로 즉시 롤백 가능 — 지금 상태(무검출기)로 자동 복귀한다.

## 자리표시(stub) / 남은 것

- ⚠️ **SPEC §6-5 "1.x 업데이트 시 로그인 유지" 는 통과가 아니다 — 안드로이드도 못 한다.**
  1.x 는 Capacitor 웹뷰(`capacitor.config.ts` 에 `server.url`·스킴 재정의가 없으므로 안드로이드
  기본값 `https://localhost` 오리진)의 `localStorage` 에 Supabase 세션을 저장하고, 2.0 RN 은
  `expo-secure-store` 에 저장한다. 그 오리진에서 페이지를 띄울 서버가 없으니 새 앱이
  옛 세션을 읽어올 방법이 없다. **크레딧·내 사진은 서버 계정에 붙어 있어 재로그인하면 전부
  돌아오지만, 로그인 자체는 한 번 다시 해야 한다.** iOS 도 같은 구조적 제약(ios2/README 참고).
  출시 안내 문구로 처리할지는 오너 결정 사항.
- 얼굴 검출(정방향 맞춤): ML Kit 미장착 유지(위 판단 참고, 조건부 출시 가능). FitSheet 의 "크롭 미리보기 후 확정" 스텝은 미구현(후순위, 오너 판단 필요 — 아래 ⑤).
- ~~증명사진(idphoto) 옵션(정장/배경색) 미구현~~ → 5주차 구현 완료(정장 4색 + 배경 8색 프리셋, 커스텀 hex 색상피커는 생략 — 웹만 있음).
- ~~결과 사진 768×1024 재크롭(웹 `fitToSize`) 생략~~ → 5주차 구현 완료(`src/lib/fitToSize.ts`).
- ~~다크 모드: 토큰에 주석만. 라이트 전용 출시.~~ → 4주차에 구현(기기 설정을 따른다).
- ~~앱 아이콘/스플래시: `store_assets/play-icon-512.png` 그대로~~ → 5주차: `public/icons/icon-512.png`(하트 로고) 배경 제거 + 안전영역 축소로 어댑티브 아이콘·스플래시 이미지 새로 생성. 스플래시는 여전히 라이트 값 고정(이 `expo-splash-screen` 버전엔 Android 다크 스플래시 옵션이 없다 — 부팅 순간뿐이라 범위 밖으로 뒀다, 유지).
- 실기기 미검증 항목(그대로 남음): Play 결제(거래ID 가 서버 `purchaseTxId` 와 맞는지 — 1.x 와 같이 `transactionIdentifier` 우선, `purchaseToken` 폴백), FCM 토큰 형식, 네이버 magic link 해시 복귀, 채워 맞춤 서버 실호출, 얼굴 검출 미장착 상태에서의 실제 크롭 품질(위 실측은 시뮬레이션 — 실기기 카메라 사진 표본은 아니다).

## 확인된 명세 모호점

1. 탭바 "높이 62 · 하단 14 · 좌우 12": 알약 자체 높이를 62 로, 안전영역 위 14 를 바 아래 여백으로 해석했다. **확정 유지.**
2. 카메라 원 "위로 14 띄움": 원의 중심이 아니라 원의 아랫변이 바 윗변보다 14 위에 오도록 했다(`cameraLift`). **확정 유지.**
3. 인생네컷 크레딧: SPEC 은 "N컷=N장 차감"(메모리) 이지만 웹 코드(2026-08-13 이후)는 스트립 1장 = 1 크레딧이다. 웹을 따랐다. **확정 유지** — 5주차에 웹 코드(`src/PortraitStudio.jsx` genMeta.count 로직) 재확인, 여전히 스트립 1장 = 1 크레딧.
4. "크레딧 칩" 표시값: **5주차 재확인 — 이미 구현·확정 상태였다.** `src/ui/CreditChip.tsx` 가 무제한이면 "∞", 아니면 `credits + (limit-used)` 합산 숫자 하나만 보여준다(웹의 "베타 2/2 · 크레딧 5" 두 값 표기는 안 따름 — 헤더 칩은 숫자 하나가 SPEC §1 "헤더 크레딧 칩" 취지에 더 맞다고 판단). 오너 판단 불필요, 그대로 둔다.
5. 결과 화면의 "내 사진에 저장됐어요 · 앨범에도 저장" 문구 + 갤러리 보관 1시간 안내 위치: 내 사진 탭 상단 캡션(`copy.photos.notice`)으로 유지. **확정 유지** — 결과 화면에 또 넣으면 같은 정보가 두 군데 반복돼 오히려 SPEC §0 "안 씀" 원칙(불필요한 반복 문구)에 어긋난다고 판단.
6. 매직부스 일회용 사진과 등록 사진 구분: `copy.options.artHint`("이 컨셉은 얼굴이 아니라 올린 사진 자체를 바꿔요. 한 번만 쓰고 지워요.") 문구로 이미 구분돼 있다. **확정 유지**, 별도 디자인(아이콘·배지) 추가는 안 함 — 문구만으로 충분하다고 판단(웹도 동일 수준).
7. 네이버 로그인 magic link 해시 복귀: **실기기 필요, 미해결로 남김.** `flowType: "pkce"` 클라이언트가 `#access_token` 해시 응답을 실제로 받는지는 Supabase 프로젝트 설정(허용 응답 타입)에 달려 있어 코드 리뷰만으로는 확정 불가.
8. `Glass` Android 12 미만 불투명 폴백 / `experimentalBlurMethod` 성능: **확정 유지**, 실기기(특히 저사양 Android 12+ 기기)에서 프레임 드랍이 있으면 `experimentalBlurMethod` 를 끄는 것으로 대응(코드에 이미 폴백 분기 있음, 실기기 미검증).
