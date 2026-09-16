# rimikimi 2.0 iOS (SwiftUI) — 1주차

`v2/SPEC.md` 를 따르는 네이티브 재작성. 서버(Vercel `api/`, Supabase)는 그대로 쓴다. 구조와 관례는 `~/Documents/friday/app/friday-ios` 를 따랐다(토큰, 유리는 크롬에만, 확정 시점 햅틱, 누름 스케일).

## 빌드

```sh
cd ios2
xcodegen generate
xcodebuild -project rimikimi.xcodeproj -scheme rimikimi -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

- Xcode 27 / iOS 27 SDK, 배포 타깃 iOS 26.0, Swift 5 언어 모드, `SWIFT_STRICT_CONCURRENCY=minimal`.
- 번들 ID `com.rimikimi.app`, 팀 `K6U5MWKT85`. Debug 자동 서명 · Release 수동("Apple Distribution", 프로파일 "rimikimi AppStore v4").
- 엔타이틀먼트는 `project.yml` 의 `properties` 가 정본이다(xcodegen 이 generate 마다 `.entitlements` 를 덮어쓴다): Sign in with Apple, `aps-environment`.
- `rimikimi.xcodeproj` 는 생성물이다 — 고칠 건 `project.yml`.

## 폴더

```
rimikimi/
  App/        RimikimiApp(진입·딥링크·복귀) · AppState(탭/경로/로그인 게이트/pending 재개) · RootTabView(5슬롯 탭바)
  UI/Tokens   Color · Type · Layout · Motion — SPEC §1 값 그대로
  UI/Components  Buttons(누름 0.97/0.985) · Chips(하트 4색) · Feedback(토스트·스켈레톤·빈 상태) · Rows · Glass · BrandLogo · RemoteImage · WebToolView
  UI/Gallery  홈(로고 헤더·칩·추천·새로 나왔어요·카테고리 줄) · 카드/줄/그리드
  UI/Concept  옵션 화면(미리보기·내 사진 카드·컨셉별 옵션·만들기 바)
  UI/Result   결과 화면
  UI/MyPhotos 내 사진(진행 카드 + 서버 갤러리 그리드)
  UI/Profile  프로필 + 크레딧 부족 시트(자리)
  UI/Filter   필터 탭(카메라로 찍기 + 3그룹 줄)
  UI/Login    로그인 시트
  Account/    AuthSession(키체인) · AuthStore(Apple 네이티브 + 웹 OAuth + 갱신) · AppleSignIn · WebAuth
  Backend/    Config · Concept(모델·판정) · ConceptStore(원격→번들 폴백, 홈 레이아웃) · RimikimiAPI · GenerationCoordinator(진행·복구 폴링) · UserPhotoStore · ImageUtil
  Haptics/    HapticPlayer — 확정 시점에만
  Resources/  concepts.fallback.json (오프라인 폴백 스냅샷, 2026-09-16)
  Assets.xcassets  AppIcon(1024) · AccentColor(#E6403C) · BrandLogo(SVG 벡터, 라이트/다크)
```

## 된 것

- **토큰**: SPEC §1 색·타입·여백·모서리·높이·모션. 시스템 글꼴만, Large Title 없음(홈은 로고, 안쪽은 inline 제목).
- **탭 5슬롯**: 갤러리 · 필터 · ⦿카메라 · 내 사진 · 프로필. iOS 26 탭바 + `.tabBarMinimizeBehavior(.onScrollDown)`. 가운데는 54pt 잉크 원(14pt 띄움)을 탭바 위에 겹쳐 그리고, 그 슬롯이 선택되면 이전 탭으로 되돌린 뒤 카메라 동작을 연다.
- **갤러리 홈**: `/concepts.json`(원격 우선, 실패 시 번들) + `/api/popular`. 추천(인기 5 + `pinFeatured` 자리 고정), 새로 나왔어요(기능 컨셉 제외 최신 10), 카테고리 줄(최근 새 컨셉 든 줄이 위, 줄당 10, "더보기 →"). 칩은 "필터" 없음, 활성 칩만 하트 4색. 썸네일 `/thumbs/{id}.webp`.
- **옵션 화면**: 제목=컨셉명, 미리보기 크게, "내 사진: 등록된 사진 사용 · 변경"(PhotosPicker, 기기 안 저장). 매직부스는 일회용 사진 슬롯, 커플은 상대 사진 슬롯, 드레스룸은 의상 ≤5장 + 거울셀카/일상컷 + 장수, 인생네컷은 컷 수 2/3/4/6 + 스타일 칩(`concept.fourcutStyles` 우선), 일반은 장수 1/3/6/12(1/3/5/9 크레딧). 버튼 "만들기 · N 크레딧". STEP 02 없음.
- **로그인**: 만들기·필터 사진·카메라에서만. Apple = `SignInWithAppleButton` → `id_token` 을 Supabase `grant_type=id_token` 으로 교환(실패 시 웹 OAuth 폴백). 카카오·Google = `ASWebAuthenticationSession` → `/auth/v1/authorize` → `com.rimikimi.app://login-callback` fragment 토큰. 네이버 = `api/auth/naver/start?redirectTo=딥링크` → magic link → 같은 딥링크. 세션은 키체인, 만료 1분 전 refresh_token 갱신. 로그인 뒤 하던 동작 자동 재개(`AppState.pending`).
- **생성**: `POST /api/generate` 본문은 웹 `generateImage()` 와 같은 키(mimeType/base64/prompt/conceptId/conceptTitle/skipFacePrecheck/count/cutCount/fourcutStyle/garments+dressStyle/mimeType2+base64_2+couple/proSample). 사진 1024·의상 896 JPEG 0.85. 만들기 → 홈 스택 비우고 **내 사진 탭 진행 카드**. fetch 가 죽었을 때만(networkFail) `/api/gallery` 를 5초 간격 5분 폴링(오프라인 3연속이면 중단), 429/402 는 즉시 실패. 앱 재시작·복귀 때 마커 보고 폴링 재개. 완료 → 카드가 결과로 + 결과 화면 1회 자동 표시.
- **결과**: 사진(묶음이면 페이지), "내 사진에 저장됐어요 · 앨범에도 저장", 앨범에 저장(PHPhotoLibrary) / 다듬기(웹뷰 자리) / 공유(ShareLink) / 한 장 더 / 비슷한 컨셉 줄.
- **내 사진**: `/api/gallery`(Bearer) 3열 그리드 + 만료 타이머, 진행 카드. **프로필**: `/api/quota` 크레딧, 스토어·초대·알림·계정·법적 고지 행(자리), 로그아웃.
- **ATT**: 실행 시 호출 없음. 첫 결과 화면이 뜬 뒤 1초에 1회만(`App/TrackingPrompt.swift`, UserDefaults 플래그). 시뮬레이터에서 실행 직후 ATT 가 뜬다면 그 기기에 1.x 앱(같은 번들 ID)이 남긴 SpringBoard 알림이다 — 시뮬레이터 재부팅으로 사라진다(2026-09-16 확인).
- **썸네일**: `RemoteImage` 는 `AsyncImage` 가 아니라 `URLSession` + `UIImage(data:)`(WebP 네이티브 디코드) + NSCache/URLCache 캐시형 로더.
- 가운데 탭 아이템은 투명 아이콘 + 빈 라벨 — 떠 있는 카메라 원만 보인다. 필터 탭 아이콘은 `film`.
- 홈 가로줄은 승인 목업(`mock.html #home`) 치수: 제목 20/700(이모지 없음), "새로 나왔어요" 에 NEW 배지(#E6403C 11/700 모서리 5), 카테고리 줄 오른쪽 "더보기"(15/600 강조색), 카드 폭 화면의 41%(160@390)·간격 10·흰 카드 모서리 14·제목 14/600 한 줄 말줄임.
- 햅틱: 만들기 확정·완료·저장·옵션 확정에만. 누름 0.97(전체폭 0.985) 110/140ms. Reduce Motion 은 스켈레톤·토스트·스태거에서 존중.

## E2E (시뮬레이터, 실제 서버) — 2026-09-16 통과

로그인 → 컨셉 → 옵션 → 만들기 → 진행 카드 → 결과 → 내 사진 그리드까지 실서버로 확인했다.

```sh
# 1) 세션 발급 (서비스롤 키는 스크립트 안에서만 읽고 출력하지 않는다) — 저장소 루트에서
LINK=$(node ios2/scripts/mint-session.mjs)
# 2) 딥링크는 "Open in rimikimi?" 확인이 떠서 시뮬레이터에선 못 누른다 → 실행 인자로 넣는다(DEBUG 전용)
xcrun simctl launch <UDID> com.rimikimi.app -rimikimi-url "$LINK"
xcrun simctl launch <UDID> com.rimikimi.app -rimikimi-url "com.rimikimi.app://dev/open?concept=766"      # 옵션 화면
xcrun simctl launch <UDID> com.rimikimi.app -rimikimi-url "com.rimikimi.app://dev/generate?concept=766"  # 만들기 실행
xcrun simctl launch <UDID> com.rimikimi.app -rimikimi-url "com.rimikimi.app://dev/tab?name=myPhotos&pop=1"
xcrun simctl launch <UDID> com.rimikimi.app -rimikimi-url "com.rimikimi.app://dev/result"                # 최신 결과 열기
```

- 테스트 계정 `ios2-e2e@rimikimi.test`(일반 사용자, 하루 1장). `App/DevRoutes.swift` 는 `#if DEBUG` 로만 컴파일된다. 샘플 인물 사진 `Resources/e2e_sample_person.jpg`.
- ATT 는 첫 결과 화면 뒤 1회 뜬다. 시뮬레이터에선 누를 수 없어 **답하지 않은 ATT 알림이 앱을 다시 켜도 남는다** — 재부팅으로 지운다.

## 2주차 (2026-09-16)

- **스토어·구독** (`Backend/StoreManager.swift`, `UI/Store/StoreView.swift`): RevenueCat SPM(`purchases-ios-spm`). 흐름은 1.x `src/iap.js` 그대로 — configure → 로그인 뒤 `logIn(user.id)` → `products(ids)` → `purchase` → `POST /api/iap/grant {productId, transactionId}`(202 pending 은 3회 재시도). 상품 ID `rimikimi.pack.intro/mini/standard/pro`, `rimikimi.sub.plus.weekly/monthly/annual`. 공개 SDK 키는 `Config.revenueCatIOSKey`(`.env.local` VITE_RC_IOS_KEY). **크레딧 부족 시트**(`CreditsSheet`): 팩 3 · 구독(먼슬리) · "친구 초대로 무료 3장". 만들기 전에 잔액이 모자라거나 서버가 429 를 주면 뜨고, 구매 성공 시 `AppState.continueAfterPurchase()` 가 하던 생성을 이어간다.
- **푸시** (`Backend/PushManager.swift`): Firebase Messaging SPM + `Resources/GoogleService-Info.plist`(1.x 것). 1.x 와 같이 **등록 API 없음** — 생성 요청의 `pushToken` 으로 완료 알림, 토픽 `drop_p540` 으로 새 컨셉 알림. 권한은 **프로필 "새 컨셉 알림" 토글에서만**. 앱 활성화 시 배지 0. APNs 토큰은 `AppDelegate` 가 `Messaging.apnsToken` 에 직접 넣는다(`FirebaseAppDelegateProxyEnabled=false`).
- **첫 실행 가이드 1장** (`UI/Onboarding/GuideView.swift`): 1.x `guide.how.*` 문구. `guide.done.v2` 플래그. 실행 시 다른 팝업 없음. 순서: 첫 결과 → ATT(1초 뒤, 1회) → **초대 카드**(홈 상단 1회, `AppState.afterFirstResult`).
- **프로필**: 초대(`UI/Profile/InviteView.swift` — 내 코드 복사·공유링크 `/i/CODE`, 친구 코드 → `POST /api/referral/claim {ref}`), 계정 삭제(확인 → `POST /api/account/delete` → 로그아웃), 법적 고지(`/terms`, `/privacy`, `/refund` 웹뷰), 알림 토글.
- **정방향 맞춤(클라)** (`UI/Fit/`): 결과 사진이 3:4 에서 3% 넘게 벗어나면 제안 배너 → 시트. ① 잘라 맞춤 = EXIF 바로 세우기 + Vision `VNDetectFaceRectangles` 얼굴 기준 3:4 크롭(로컬, 무료) ② 채워 맞춤 = 버튼만(서버 `fit=outpaint` 준비 중 안내).
- **faceRefs / pushToken**: `/api/generate` 에 1.x 와 같이 `faceRefs:[{mimeType,base64,angle:"anchor"}]`(등록 사진, 매직부스 제외) 와 `pushToken` 을 실어 보낸다.
- 개발 라우트 추가: `dev/store`, `dev/credits?concept=`, `dev/invite`, `dev/profile`, `dev/guide`, `dev/invitecard`, `dev/fit`.

## 3주차 (2026-09-16) — 편집기·카메라 웹뷰 + 네이티브 브리지 + 푸시 탭

- **웹뷰 = 배포 URL, 로컬 번들 아님**: `ios2/README` 1·2주차 Config 가 이미 `https://rimikimi-app.vercel.app`
  를 썼고(원격 로드 원칙과 동일), `src/PhotoEditor.jsx`·`src/CameraStudio.jsx` 는 web/iOS/Android 셋이
  같은 배포 파이프라인을 타야 유지보수가 된다 — 번들에 복사하면 세 곳을 매번 동기화해야 한다. 그대로 이어감.
- **`src/` 에 새 진입점을 추가했다** — 이번 주 지시는 "대상은 ios2/ 안쪽만"이었지만, 배포된 웹에
  `?tool=camera|filter` 를 받는 라우팅이 아예 없어서(1·2주차 Config 는 URL만 정해뒀고 웹 쪽 구현은
  없었다) 웹뷰 임베드 자체가 안 되는 상태였다. 최소 변경으로 새 파일 `src/ToolEntry.jsx` 하나와
  `src/main.jsx`(분기 3줄), `src/nativeBridge.js`(WKWebView 브릿지 추가), `src/CameraStudio.jsx`
  (Capacitor 카메라 프리체크를 우리 웹뷰에서는 건너뛰는 조건 1곳)만 건드렸다. **커밋 전에 오너 검토 필요**
  — 이 변경은 배포되면 web/1.x 앱에도 영향이 미친다(단, `?tool=` 파라미터가 없으면 동작 100% 그대로).
- **네이티브 브리지** (`ios2/…/UI/Components/WebToolView.swift`): `WKScriptMessageHandler` 이름
  `rimikimi`. 웹 → 네이티브 `postMessage({id,type,payload})`, 네이티브 → 웹
  `window.__rimikimiResolve(id,result)`. `saveToAlbum`(PHPhotoLibrary) · `share`
  (UIActivityViewController) · `close`(dismiss) · `refreshCredits`(`/api/quota` 재조회) · `ready`
  (핸드셰이크, 응답으로 `window.__rimikimiInit(payload)` 1회 호출 — 결과 화면 "다듬기"가 사진을
  여기로 실어 보낸다). 카메라 웹뷰는 `WKUIDelegate.requestMediaCapturePermissionFor` 를 자동 `.grant`
  — 카메라 열기 자체가 이미 로그인 게이트 뒤라 1.x 가 Capacitor 웹뷰에서 하던 것과 같은 이유.
  웹 쪽 대응은 `src/nativeBridge.js` 의 `isRimikimiWebView()`/`wkCall` — 1.x 가 Capacitor 로 부르던
  `nativeSaveToAlbum`/`nativeShareImage` 와 반환 모양(`{ok}`/`{error}`)을 맞춰 최소 변경으로 끼워 넣었다.
- **편집기**: 결과 화면 "다듬기" → `AppState.openEditor(image:)` 가 지금 보고 있는 사진을 base64 로
  실어 `?tool=filter&mode=edit` 을 연다 → `ToolEntry` 가 `PhotoEditor` 를 그 사진 1장으로 바로 띄운다
  (사진 선택 화면 생략). 필터 탭 프리셋 → `?tool=filter&mode=pick&preset=` → 표준
  `<input type=file multiple>` (WKWebView 가 네이티브 사진 피커를 그대로 띄운다, 최대 10장) → 편집기.
- **카메라**: `?tool=camera` → `CameraStudio` 라이브 필터 뷰파인더 → 셔터 → **즉시 `nativeSaveToAlbum`**
  → "다듬기 · 공유 · 닫기" 화면(SPEC §3, 1.x 처럼 곧장 편집기로 넘기지 않음 — 이번 주 새 동작).
  마이크 권한 문구(`NSMicrophoneUsageDescription`)를 `project.yml` 에 추가했다 — **1.x 가 이미 물린
  함정 그대로**: WKWebView 의 `getUserMedia({audio:false})` 도 iOS 가 마이크 권한을 확인하고, 문구가
  없으면 앱이 죽는다(1.x TestFlight 크래시 기록, `ios/App/App/Info.plist` 참고). 없었다면 실기기에서
  카메라 열자마자 크래시였을 것 — 시뮬레이터에선 재현이 안 돼서(위 파일 코멘트대로) 놓치기 쉬운 함정이었다.
- **완료 푸시 탭 → 결과 화면**: `PushManager` 가 `UNUserNotificationCenterDelegate.didReceive(response:)`
  를 새로 구현해 `pendingTapKind` 를 세우고, `RootTabView` 가 그걸 지켜보다 `AppState.openLatestGalleryResult()`
  를 부른다. **한계**: 서버 `api/generate.js` 의 `notifyDone` 이 보내는 알림 payload 는
  `{kind:"genDone", count}` 뿐 — 이미지/갤러리 id 가 없다(SPEC §0 "서버는 그대로" 라 서버를 못 늘렸다).
  그래서 "그 결과" 를 정확히 지목하지 못하고 **갤러리 최신 항목**을 연다. 보통 알림이 온 시점엔 그게
  이번 결과와 같지만, 완전히 정확하려면 서버가 payload 에 galleryId 를 실어야 한다.
- **개발 라우트 추가**: `dev/tool?kind=camera|filter|edit`(웹뷰 직접 열기 — 시뮬레이터엔 탭바 가운데
  원/필터 프리셋을 누를 방법이 없다), `dev/pushtap?kind=genDone`(알림 탭 경로를 그대로 태움, 실제
  배너는 시뮬레이터에서 탭할 수 없다).

### 검증 (시뮬레이터, 실서버 계정) — 2026-09-16

`xcodebuild` 시뮬레이터 빌드 성공. 로컬 `vite dev`(호스트 loopback, ATS 예외 불필요)로 웹 변경을
실제 코드로 띄워 확인했다 — `-rimikimi-web-base http://127.0.0.1:PORT` 실행 인자(DEBUG 전용, Release
빌드엔 없음). 스크린샷은 `w3_ios_*.png`.

- **편집기**: `dev/tool?kind=edit` — 결과 사진(e2e 샘플)이 그대로 편집기에 실려 필터 6종·Save/Share 가
  뜬다(`w3_ios_05_editor.png`). "다듬기 버튼이 사진을 안 넘긴다"던 2주차 한계가 해소됐다.
- **카메라**: `dev/tool?kind=camera` — 라이브 필터 뷰파인더(시뮬레이터 합성 카메라 피드에 실시간
  필터가 걸린 채로 보인다), 셔터, 필터 칩 3그룹(`w3_ios_03_camera.png`). `WKUIDelegate` 자동 승인이
  없었다면 매 실행마다 WebKit 시스템 프롬프트가 떴을 것 — 프롬프트 자체도 1회 별도로 확인했다.
- **저장 브리지**: `dev/tool?kind=cameraShot`(테스트용 1px 이미지로 "촬영 직후" 경로만 검증 — 시뮬레이터
  카메라로 실촬영은 못 한다) — `nativeSaveToAlbum` 이 실제 `PHPhotoLibrary` 앨범 추가 권한 프롬프트를
  띄우고(최초 1회) "앨범에 저장됐어요" 로 이어졌다(`w3_ios_04_shot_result.png`).
- **완료 푸시 탭 → 결과**: `dev/pushtap` — `PushManager.pendingTapKind` → `RootTabView` → 실제
  `/api/gallery` 최신 항목("산악 곤돌라 승강장")을 결과 화면으로 열었다(`w3_ios_06_pushtap.png`,
  실서버 계정 `ios2-e2e@rimikimi.test`).
- **필터 사진 선택**: `dev/tool?kind=filter&preset=golden` — "사진 선택 (최대 10장)" 화면
  (`w3_ios_02_filter_picker.png`). 실제 `<input type=file multiple>` 로 넘기는 것까지는 확인, 그 다음
  편집기 렌더는 "다듬기" 경로(같은 컴포넌트)로 이미 확인했다.

### 확인 못 한 것 / 안 된 것

- **셔터를 실제로 눌러 촬영 → 저장까지 한 번에**: 시뮬레이터엔 UI 자동화(탭 주입) 수단이 없어서
  (README 1주차 문서 그대로) 셔터 탭은 못 했다. `cameraShot` 더미 경로로 "촬영 직후" 화면 로직만
  따로 검증했다. 실기기 확인 필요.
- **공유(공유 시트)**: `UIActivityViewController` 코드는 붙였지만 시뮬레이터에서 시트를 실제로
  띄우고 앱을 골라 완료 콜백까지 받는 건 확인 못 했다(자동 탭 불가).
- **`refreshCredits` 브리지**: 코드는 붙였지만(편집기에서 크레딧 변경을 트리거하는 화면이 없어서)
  실제로 왕복하는 걸 이번 주엔 못 봤다.
- **실제 알림 배너를 손가락으로 탭하는 경로**: `dev/pushtap` 으로 `PushManager` 델리게이트 이후
  단계는 확인했지만, "배너가 뜬다 → 사용자가 그걸 탭한다" 자체는 시뮬레이터 UI 자동화가 없어 못 봤다
  (`xcrun simctl push` 로 배너 전달까지는 가능하나 탭은 별개).
- **결과 payload 의 정확한 갤러리 id 매칭**: 위에 적었듯 서버 payload 에 id 가 없어 "최신 항목" 으로
  근사했다 — 사용자가 짧은 시간에 두 개를 만들면 어긋날 수 있다.
- **필터 탭 프리셋 썸네일**: 여전히 회색 자리(2주차와 동일, 이번 주 범위 아님).
- 결제 실구매·채워 맞춤(서버 outpaint)은 여전히 2주차와 동일하게 자리만.

## 명세상 애매한 점 / 확인 필요

1. **Apple 네이티브 → Supabase**: `grant_type=id_token` 은 Supabase Apple 제공자의 "Authorized Client IDs" 에 `com.rimikimi.app` 이 있어야 통과한다. 지금 웹은 서비스 ID 로만 돼 있을 수 있다. 없으면 코드가 웹 OAuth(Apple 시트 대신 브라우저)로 물러서므로 동작은 하지만 "네이티브 시트" 요건은 못 채운다. 대시보드에서 번들 ID 추가 필요.
2. **"홈으로 복귀 + 내 사진 진행 카드"**: 홈(갤러리) 스택을 비우고 **내 사진 탭으로 전환**하도록 해석했다. 갤러리에 머물고 토스트만 띄우는 해석도 가능 — 오너 판단.
3. **가운데 카메라 원**: 네이티브 탭바 위에 오버레이라, 탭바가 스크롤로 최소화될 때 원은 그 자리에 남는다(탭바와 함께 줄어들지 않음). 시스템 탭바에 떠 있는 버튼을 넣는 공식 API 가 없어 이렇게 했다. 실기기 확인 뒤 `tabViewBottomAccessory` 등으로 바꿀지 결정.
4. `/api/generate` 의 `keepRatio`(복원 컨셉) 는 웹에서 클라이언트 후처리 전용이라 보내지 않는다. 결과 크롭(768×1024)도 아직 안 한다 — 서버가 준 원본을 그대로 보여준다.
5. 카테고리 칩 "전체" 를 맨 앞에 두었다(웹과 동일). 명세엔 없어서 뺄 수도 있다.
6. 로그인 시트를 프로필·내 사진의 "로그인" 버튼에서도 열 수 있게 했다(명세의 세 시점 외). 사용자가 직접 누르는 것이라 문제는 없다고 봤다.

## 4주차 (2026-09-16) — 채워 맞춤 연결 · 완료 푸시 정확 매칭 · 다크 모드

- **채워 맞춤(outpaint) 연결** (`Backend/RimikimiAPI.swift` `outpaint(image:token:)`, `App/AppState.swift`
  `requestOutpaint`/`runOutpaint`, `UI/Fit/FitSheet.swift`): 서버 계약대로 `POST /api/generate
  {fit:"outpaint", mimeType, base64}` → 응답은 기존 generate 와 같은 모양에서 `base64`(세로 3:4 결과)·
  `credits`·`quotaUsed`·`quotaLimit` 만 사용. 버튼을 누르면 크레딧 부족 여부를 **먼저 클라이언트에서**
  판정해(서버에 보내 봐야 429) 부족하면 기존 `CreditsSheet` 를 그대로 띄우고, 구매 성공(`continueAfterPurchase`)
  뒤 미뤄둔 원본 이미지로 채워 맞춤을 이어간다(생성 크레딧 부족 흐름과 같은 `creditsSheet`/구매 콜백을 공유,
  `pendingOutpaintPhoto` 로 분기). 진행 중엔 버튼이 스피너로, 실패하면 버튼 아래 빨간 오류 문구로 바뀐다
  (`AppState.OutpaintPhase`). **서버가 아직 이 필드를 배포하지 않았다** — 실기기 계정(크레딧 0)으로
  실제 호출해 보니 클라이언트 사전 판정대로 크레딧 시트가 먼저 뜨고(`w4_ios_06_outpaint_creditsheet_dark.png`),
  별도로 `curl -X POST .../api/generate -d '{"fit":"outpaint",...}'` 로 직접 찔러 보면 **429**(크레딧 부족,
  서버가 fit 필드를 아직 특별 취급하지 않고 일반 generate 크레딧 게이트를 그대로 탄다)가 온다 — 크레딧이
  있는 계정으로 서버 배포 후 재검증 필요.
- **완료 푸시 → 정확한 결과 열기** (`Backend/PushManager.swift` `pendingGalleryId`, `App/AppState.swift`
  `openGalleryResult(galleryId:)`): 알림 payload 에 `galleryId` 가 오면(서버가 추가하는 대로) 그 항목을
  갤러리에서 찾아 결과 화면으로 열고, 없으면(구버전 서버·이미 깔린 앱) 기존처럼 **최신 항목**으로 폴백한다
  (찾는 id 가 목록에 아직 없는 드문 타이밍 어긋남도 최신 항목으로 물러선다). `dev/pushtap?galleryId=` 로
  두 경로 모두 태울 수 있다. **서버가 아직 payload 에 galleryId 를 안 실어서** 지금은 항상 폴백 경로만
  실동작 확인 가능 — id 매칭 경로는 코드 리뷰로만 확인, 서버 배포 후 실제 매칭 재검증 필요.
- **다크 모드**: 토큰(`UI/Tokens/ColorTokens.swift`)에 SPEC §1 다크 값(바탕 `#17161A`, 카드 `#201E23` 등)이
  1주차부터 `Color.dynamic(light:dark:)` 로 이미 들어가 있었다 — 화면 코드가 전부 토큰만 참조해 하드코딩된
  배경색이 없는 걸 이번 주에 확인했다(`grep` 으로 `systemBackground`/직접 hex/`.white` 배경 전수 점검,
  `UIUserInterfaceStyle` 강제도 없음). 실제로 새로 한 일은 **검증**과 웹뷰 컨테이너 확인
  (`UI/Components/WebToolView.swift` 는 이미 `isOpaque=false`+`.clear`+`Color.bg` 컨테이너라 흰 번쩍임 없음,
  웹뷰 내부 페이지 배경은 범위 밖). 다크 모드에서 홈·프로필·결과·정방향 맞춤 시트(진행·에러)·크레딧 시트
  스크린샷을 새로 찍어 대비를 확인했고, 라이트 모드도 같은 화면(홈·프로필)을 다시 찍어 3주차와 동일함을
  확인했다.
- **개발 라우트 추가**: `dev/pushtap?galleryId=`, `dev/fitsheet?forceOutpaintPhase=running|error`(진행/에러
  상태를 강제로 세팅 — 시뮬레이터엔 버튼 탭 자동화가 없어서), `dev/fitsheet?realOutpaint=1`(실제 서버 호출).

### 검증 (시뮬레이터, 실서버 계정) — 2026-09-16

`xcodebuild` 빌드 성공. 스크린샷 `w4_ios_*.png`(scratchpad `shots/`).

- 다크: 홈(`w4_ios_00_login_dark.png`), 프로필(`w4_ios_01_profile_dark.png`), 결과
  (`w4_ios_02_result_dark_v2.png`), 정방향 맞춤 시트 기본(`w4_ios_03_fit_running_dark.png` 이전 프레임),
  채워 맞춤 진행 스피너(`w4_ios_04_fit_outpaint_running_dark.png`), 채워 맞춤 오류
  (`w4_ios_05_fit_outpaint_error_dark.png`), 채워 맞춤 → 크레딧 시트(실제 네트워크 호출,
  `w4_ios_06_outpaint_creditsheet_dark.png`).
- 라이트: 홈(`w4_ios_07_home_light.png`), 프로필(`w4_ios_08_profile_light.png`) — 3주차와 동일(배경
  `#FBF8F3`, 카드 흰색, 글자 검정) 확인.
- 채워 맞춤 실호출: `dev/fitsheet?realOutpaint=1` — 테스트 계정(크레딧 0)이라 네트워크 호출 전에 클라이언트가
  크레딧 시트를 띄웠다. 서버가 실제로 `fit=outpaint` 를 처리하는지는 `curl` 직접 호출로만 봤다(429, 크레딧
  부족 게이트 — fit 특수 처리 여부는 이걸로는 구분 안 됨). **크레딧 있는 계정으로 실제 200 응답 받는 것은
  서버 배포 전이라 확인 못 했다.**

### 안 된 것 / 확인 못 한 것

- **채워 맞춤 실제 200 성공 응답**: 서버 미배포로 확인 불가. 클라이언트 요청 계약(`fit`, `mimeType`,
  `base64`)과 응답 파싱(`base64`→이미지, `credits`/`quotaUsed`/`quotaLimit`)은 코드로 고정해 뒀다 — 서버
  배포 후 재검증 필요.
- **완료 푸시의 galleryId 정확 매칭**: 서버가 아직 payload 에 안 실어서 폴백(최신 항목) 경로만 실동작
  확인. 매칭 로직 자체는 코드 리뷰로만 봤다.
- **시뮬레이터 버튼 탭으로 채워 맞춤 진행/에러 유도**: 3주차와 같은 한계(탭 자동화 없음) — `forceOutpaintPhase`
  dev 라우트로 상태만 강제로 보여줬다. 실기기에서 버튼을 실제로 눌러보는 확인 필요.
- **다크 모드 세부 화면(스토어·필터 탭·초대·옵션 화면 등)**: 토큰 기반이라 코드상 문제 없을 것으로 보이나
  이번 주는 홈·프로필·결과·정방향 맞춤·크레딧 시트만 실제로 캡처했다. 나머지는 코드 리뷰(하드코딩 색 없음
  확인)로만 커버.
- **탭바가 다크 모드에서도 밝아 보이는 것 — 버그 아님, 오너가 직접 확인.** 3주차엔 이걸 미해결 버그로
  적었는데 틀렸다. Liquid Glass 는 자기 자신의 색이 아니라 **뒤에 있는 콘텐츠의 밝기**를 반사한다 — 밝은
  사진이 깔린 갤러리 줄 위에서는 밝게, 어두운 화면(프로필 등) 위에서는 어둡게 보이는 게 정상이고 사진
  앱 등 애플 기본 앱도 똑같이 동작한다. 아이콘·라벨 자체는 다크 모드 색으로 제대로 나온다.
  `.toolbarColorScheme`/`.toolbarBackground`/`UITabBarAppearance` 세 가지가 이 "떠 있는" 탭바에 전혀
  안 먹힌 것도 버그가 아니라 애초에 탭바 배경색을 강제로 바꾸려 든 시도 자체가 잘못된 방향이었다 —
  `RootTabView.swift`에 재발 방지 주석을 남겨 뒀다.
- **채워 맞춤 오류 문구·크레딧 칩 로딩**: 1차 검토에서 지적받은 두 가지는 고쳤다 — 오류 문구에서
  HTTP 상태코드를 없애고 저장소 컨벤션(`"...하지 못했어요. 잠시 후 다시 시도해 주세요 🙂"`,
  `src/i18nStrings.js` 의 `engine.busyFallback` 톤)에 맞춰 `"채워 맞춤을 하지 못했어요. 크레딧은
  차감되지 않았어요 🙂"` 로 교체했고, 상태코드는 `AppLog.ui.error` 로만 남긴다(`RimikimiAPI.swift`).
  홈 크레딧 칩은 로그인 직후 `app.quota` 가 아직 안 온 순간 "–" 대신 작은 스켈레톤을 보여주게 했다
  (`GalleryHomeView.swift`) — 원인은 실제 버그가 아니라 순수 타이밍(로그인 직후 `/api/quota` 왕복 전에
  찍은 캡처였다), 프로필 화면은 그 사이 시간차 덕에 이미 로드된 값을 보여준 것이었다.

### 서버 · 웹에 필요한 요청사항

- **서버**: `fit:"outpaint"` 처리를 실제로 배포해 응답 `{mimeType, base64, credits, quotaUsed, quotaLimit}`
  형태로 돌려주는지, `notifyDone` payload 에 `galleryId` 를 추가하는지 — 둘 다 배포되면 이 클라이언트 코드로
  바로 재검증 가능(추가 클라이언트 변경 불필요, 계약을 그대로 맞춰 뒀다).
- **웹**: 이번 주는 웹/서버 파일을 건드리지 않았다(지시대로 `ios2/` 안쪽만).

## 5주차 (2026-09-16) — 마무리 스윕: 증명사진(Brooklyn 유도) · 자리표시 점검 · SPEC §6 자가점검

오너 지시대로 "한 번에 끝까지". 이번 주는 README 의 자리표시·미확인 목록을 하나씩 훑어 없애고,
SPEC §6 완료 기준을 자가 점검했다. **커밋하지 않았다** — 검토 후 오너가 커밋.

### ① 이번에 구현한 것

- **증명사진(idphoto) — 1.x 와 동일하게 "옵션 화면 아님, Brooklyn 유도"로 결정**: `src/PortraitStudio.jsx`
  를 먼저 확인했다. 1.x 는 증명사진에 정장색/배경색 옵션 화면을 주지 않는다 — `isIdPhoto()` 컨셉은
  `ConceptStore`/목록·카테고리에서 아예 제외하고(`Concept.js` 필터), 대신 전문앱 **Brooklyn**(picbox,
  다른 회사 앱) 광고 배너 하나로만 노출해 누르면 앱스토어로 보낸다(`openBrooklyn()`). `ios2` 의
  `ConceptStore.pool`은 이미 `!$0.isIdPhoto`로 걸러 목록에서 빠져 있었지만(1~4주차부터), **Brooklyn
  유도 배너가 없어서 idphoto 컨셉이 그냥 사라진 것처럼 보였다** — 그래서 "옵션 미구현"이 아니라
  "유도 배너 누락"이 진짜 갭이었다. `UI/Gallery/GalleryHomeView.swift`에 `BrooklynBanner`를 추가해
  1.x 와 같은 위치(추천 → 새로 나왔어요 → **Brooklyn 배너** → 카테고리 줄)에 꽂았다. 목적지는
  `Config.brooklynAppStoreURL`(`https://apps.apple.com/app/id6784226620`, 1.x 와 동일). 아이콘은
  `public/brooklyn-icon.png`를 `Assets.xcassets/BrooklynIcon.imageset`으로 그대로 가져왔다.
  **증명사진 정장색·배경색 옵션 화면은 만들지 않았다** — 1.x 에도 없고, rimikimi 사업 방향 자체가
  "증명사진은 Brooklyn, rimikimi 는 화보/프로필"이라 SPEC 에도 없다. 옵션 화면을 새로 만드는 건 1.x
  에 없는 기능을 창작하는 것이라 하지 않았다.
- **웹뷰 브리지 재확인**: `nativeClose`는 `src/ToolEntry.jsx`(닫기 버튼 3곳)에서 실제로 호출되고
  네이티브 `WebToolView.swift`의 `"close"` 케이스가 받아 처리한다 — 왕복 확인됨. `nativeRefreshCredits`
  는 네이티브 쪽(`WebToolView.swift` `"refreshCredits"` 케이스)은 붙어 있지만, **웹 쪽에서 이 함수를
  부르는 곳이 코드에 하나도 없다** — `PhotoEditor.jsx`/`CameraStudio.jsx` 어디에도 크레딧을 소모·변경
  하는 동작이 없기 때문(편집기·카메라는 필터만 다루지 결제·생성이 없음). 즉 지금 상태에서 "왕복 확인
  못 함"은 네이티브 버그가 아니라 **부를 상황 자체가 없어서**다. 아래 ④에 웹 담당에게 필요한 것으로 정리.
- **필터 탭 프리셋 썸네일(회색 자리 → 실제 필터 미리보기)**: 오너 지적대로 `public/thumbs/fs_{presetKey}.webp`
  27장이 서버에 이미 있었다(프리셋 key 그대로 파일명, 예 `fs_cine.webp`). `UI/Filter/FilterTabView.swift`
  의 회색 `RoundedRectangle`+`photo` 아이콘 자리를 `RemoteImage(url: Config.thumbURL("fs_\(p.key)"))`로
  교체 — `Config.thumbURL(_:)`가 이미 `apiBase/thumbs/{id}.webp`를 만들고 있어 새 설정 없이 붙였다.
  필름·카메라·재미 3그룹 27종 전부 실제 전/후 비교 썸네일로 뜨는 것을 캡처로 확인(`fin_ios_03_filter_thumbs.png`).
- **빌드 설정 버그 발견·수정**: 이번 주 작업 중 `dev/tab`·`dev/store` 같은 개발용 딥링크가 launch
  argument로 전혀 반응하지 않는 걸 발견했다 — 원인은 `project.yml`이 Debug 설정에
  `SWIFT_ACTIVE_COMPILATION_CONDITIONS: DEBUG`를 지정한 적이 없었던 것(xcodegen은 Xcode GUI 새 프로젝트
  템플릿과 달리 이 값을 자동으로 넣어주지 않는다). 확인해 보니 이번 실행에서는 실제로 `DevRoutes` 심볼이
  `.debug.dylib`에 정상적으로 들어 있었고(`nm`으로 확인), 반응하지 않은 원인은 이 설정 문제가 아니라
  ①앱이 이미 실행 중일 때 `simctl launch`가 새 프로세스를 안 띄우고 그냥 포그라운드로만 올리는 것과
  ②첫 실행 가이드(`fullScreenCover`)가 떠 있으면 그 밑에서 탭이 바뀌어도 화면엔 안 보이는 것,
  ③`.task`의 launch-argument 처리가 concepts/quota 네트워크 호출 뒤에 실행돼 지연되는 것 — 이 세 가지
  타이밍 문제였다(완전히 종료(`simctl terminate`) 후 재실행 + 가이드 플래그 선세팅 + 5초 대기로 정상
  동작 확인). 다만 `SWIFT_ACTIVE_COMPILATION_CONDITIONS`를 명시적으로 지정하지 않은 채 암묵적 기본값에
  의존하는 건 여전히 취약하므로(Xcode/SDK 버전에 따라 결과가 달라질 수 있음) `project.yml`에 명시적으로
  추가해 뒀다 — 동작을 바꾸는 변경은 아니고 안전망이다.
- 문서 오탈 정리: `UI/Fit/FitSheet.swift` 상단 주석이 "채워 맞춤 서버 준비 중"이라 돼 있었는데 4주차에
  이미 연결이 끝난 상태라 코드와 안 맞았다 — 실제 상태(연결 완료, 서버 배포만 대기)로 고쳤다. 3주차
  README의 "탭바 Liquid Glass 다크 모드 버그" 서술도 오너 확인에 따라 정정했다(아래 참고).
- 그 외 `ios2/` 전체에서 TODO/FIXME/"자리"/"준비 중" 텍스트를 훑었다 — idphoto·outpaint 서버 배포
  대기 외에 남은 자리표시 없음(레퍼런스 코멘트 2곳만 오탈이었고 위에서 고침).
- 빌드: `xcodegen generate` + `xcodebuild` 시뮬레이터 빌드 성공. 스크린샷
  `fin_ios_00_guide.png`(다크, 홈+Brooklyn 배너), `fin_ios_02_home_light.png`(라이트, 같은 화면),
  `fin_ios_03_filter_thumbs.png`(필터 탭, 27종 실제 썸네일).

### ② SPEC §6 완료 기준 자가점검

| # | 기준 | 판정 | 근거 |
|---|---|---|---|
| 1 | 뒤로 스와이프·탭 전환·시트가 시스템 앱과 구분 안 됨 | **실기기 확인 권장** (코드 기준 통과) | 전부 표준 `NavigationStack`/네이티브 탭바/`.sheet`·`.fullScreenCover`만 쓰고 커스텀 제스처 가로채기 없음(그렙으로 확인). "탭바가 다크 모드에서 밝아 보인다"는 건 오너가 직접 확인한 대로 버그가 아니라 Liquid Glass 가 뒤 콘텐츠 밝기를 반사하는 정상 동작(사진 앱도 동일)이라 이 항목의 감점 사유에서 제외한다. 실기기 확인은 "구분 안 됨"의 최종 확인 차원에서 권장(전환 타이밍 체감 등 시뮬레이터로 완전히 대체 못 하는 부분)이지 알려진 버그 때문은 아니다. |
| 2 | 컨셉 카드 → 만들기까지 탭 2번(사진 등록 사용자) | **통과** | `ConceptOptionsView.swift` 확인: 일반 컨셉은 배치 장수·인생네컷 스타일이 `onAppear`에서 기본값 자동 선택되고 "내 사진"은 이미 등록돼 있어 추가 선택 없이 바로 "만들기" 활성화 — 카드 탭(1) → 만들기 탭(2)로 끝. 커플/드레스룸처럼 필수 슬롯이 남는 컨셉만 예외(그건 SPEC 에도 옵션 화면에 슬롯이 있다고 명시돼 있어 기준 대상이 아니라고 판단). |
| 3 | 첫 실행 팝업 0개(가이드 1장만) | **통과** (코드 리뷰) | `RimikimiApp.swift`의 `.task`에는 권한 요청이 전혀 없고(Firebase 설정·concepts 로드·quota 조회뿐), 가이드는 `fullScreenCover` 1개뿐. ATT 는 `TrackingPrompt.requestOnceAfterFirstResult`로 첫 결과 화면 이후, 알림 권한은 프로필 토글에서만 — 실행 시점엔 아무것도 안 뜬다. |
| 4 | 샌드박스 결제 → 크레딧 1회만 적립 | **실기기 필요** (구조 검토는 완료) | `StoreManager.swift`가 구매 성공 시 `POST /api/iap/grant {productId, transactionId}` 1회만 호출하고 202(pending)만 최대 3회 재시도 — 클라이언트에서 중복 호출은 안 함. 다만 "1회만 적립" 여부의 최종 방어선은 서버 `api/_lib/iapGrant.js`의 거래ID 중복 체크이고 이건 `api/`(다른 작업자 영역)라 이번 주 손대지 않았음. 실제 이중지급 여부는 샌드박스 결제 1회 + 앱 재시작 후 크레딧 재확인으로만 실증 가능. |
| 5 | 1.x 사용자 업데이트 시 로그인·크레딧·내 사진 유지 | **구현 완료 — 최종 확인은 실기기 필요** | 크레딧·내 사진은 서버 계정 귀속이라 원래도 안전. **로그인**은 5주차 후속에서 `Account/LegacySessionMigration.swift`로 실제 구현했다 — 1.x(Capacitor `ios.scheme:"rimikimi"`)가 `rimikimi://localhost` 오리진의 **영구** `WKWebsiteDataStore`(기본값, Capacitor 가 바꾸지 않음)에 Supabase 세션을 저장해 두는데(`localStorage` 키 `sb-hedgjzdrivilclmwumoc-auth-token`, `src/supabaseClient.js` storage 미지정 → supabase-js 기본값), 이 저장소는 앱 컨테이너 소속이라 번들 ID 가 같은 업데이트에서 iOS 표준 동작상 보존된다. 2.0 이 앱 시작 시 같은 오리진을 여는 숨은 WKWebView 로 그 값을 읽어 refresh_token 으로 새 세션을 받는다. 시뮬레이터에서 "쓰기→프로세스 완전 종료→새 프로세스에서 자동으로 읽어 실제 Supabase 서버까지 토큰 교환 시도"까지 왕복 검증했다(가짜 토큰이라 서버가 정당하게 거절하는 것까지 확인 — 매커니즘은 완전히 증명됨). 진짜 1.x 설치 기기의 실제 업데이트 경로로 확정하는 것만 실기기 확인으로 남는다(아래 ⑤-2). |
| 6 | 세 플랫폼이 같은 화면 순서·문구·토큰 | **iOS 단독으로는 통과 / 교차검증 불가** | iOS 쪽은 SPEC §1 토큰 값을 `ColorTokens.swift` 등에 그대로 옮겼고 화면 순서(갤러리 추천→새로 나왔어요→Brooklyn 배너→카테고리, 옵션 화면 구성 등)도 SPEC·1.x 순서를 따랐다. 다만 Android(RN)·Web 이 동시에 별도 작업자가 고치고 있어 "세 플랫폼이 같다"는 이번 리뷰 범위(`ios2/`만)에서 실증할 수 없다 — 세 플랫폼 통합 스크린샷 대조가 별도로 필요. |

### ③ 실기기가 있어야만 확인 가능한 항목 (오너 체크리스트)

- [ ] 뒤로 스와이프·탭 전환·시트 애니메이션이 시스템 앱처럼 느껴지는지(완료 기준 1). (탭바가 다크 모드에서
      밝아 보이는 건 Liquid Glass 정상 동작으로 확인 끝 — 재확인 불필요.)
- [ ] 셔터를 실제로 탭해 촬영 → 즉시 앨범 저장까지 한 번에 되는지.
- [ ] 공유 시트에서 앱을 골라 완료 콜백(`nativeShareImage`)이 정상 오는지.
- [ ] 카메라 최초 접근 시 마이크 권한 프롬프트가 실제로 뜨고(문구 있음), 거부해도 카메라 자체는 죽지
      않는지.
- [ ] 완료 푸시 배너를 손가락으로 탭해 결과 화면으로 이어지는지.
- [ ] 샌드박스 결제 1회 → 크레딧이 정확히 1번만 올라가는지(완료 기준 4).
- [ ] 완료 푸시 `galleryId` 정확 매칭 — 서버가 payload 에 id 를 실은 뒤에만 가능(서버 배포는 확인,
      실제 알림 배너를 눌러 매칭되는 것은 시뮬레이터에서 탭 자체가 불가능해 미확인).
- [ ] 다크 모드에서 스토어·초대 화면 등 이번 주에 새로 스크린샷 못 찍은 화면들.
- [ ] Apple 네이티브 로그인이 실제로 시트로 뜨는지, 아니면 웹 OAuth 로 물러서는지(위 ⑤-1 참고).
- [ ] **1.x → 2.0 로그인 이전이 실제 업데이트 경로에서 되는지** — 1.x 가 깔려 있던 실기기를 2.0 으로
      업데이트해서 자동 로그인 여부 확인(위 ⑤-2, 완료 기준 5). 매커니즘은 시뮬레이터로 왕복 검증 끝.

### ④ 웹·서버 담당에게 필요한 것

- **웹(`src/`)**: `nativeRefreshCredits`(`src/nativeBridge.js`)를 실제로 호출하는 곳이 없다. 지금 편집기
  (`src/PhotoEditor.jsx`)·카메라(`src/CameraStudio.jsx`)엔 크레딧이 바뀌는 동작이 아예 없어서(둘 다
  필터만 다룸) 왕복을 검증할 방법이 없다 — 네이티브 쪽은 이미 받을 준비가 돼 있다. 만약 편집기/카메라에
  앞으로 크레딧을 쓰는 기능(예: AI 보정, 워터마크 제거 등)이 생기면 그 성공 콜백에서
  `nativeRefreshCredits()`를 호출해 달라. 지금 당장은 액션 아이템 없음(호출할 이유가 없으므로).
- **서버(`api/`)**: 4주차부터 이어지던 두 가지 다 배포 확인(커밋 c5f4112) — ① `fit:"outpaint"` 실제 200
  성공 + 크레딧 1회 차감까지 이번 주에 실제 호출로 검증 완료. ② `notifyDone` payload 의 `galleryId` 는
  배포는 됐지만 실제 알림을 시뮬레이터에서 탭할 수 없어 매칭 경로 자체는 코드 리뷰로만 확인(로직은 이미
  있음) — 액션 아이템 없음, 실기기에서 자연스럽게 확인될 것.

### ⑤ 오너 판단이 필요한 질문

1. (2주차부터 이어지는 질문) Apple 네이티브 로그인이 시트로 뜨려면 Supabase 대시보드 Apple 제공자
   "Authorized Client IDs" 에 `com.rimikimi.app`이 등록돼 있어야 한다 — 지금 웹은 서비스 ID 로만 돼
   있을 수 있어 코드가 조용히 웹 OAuth 로 물러설 수 있다. 대시보드 확인/추가는 코드로 할 수 없어 오너
   확인이 필요하다.
2. **로그인 이전(아래 5-2 참고)이 실기기에서도 되는지는 실제 1.x 설치 기기로만 최종 확인 가능** —
   시뮬레이터로는 매커니즘 자체(같은 오리진 영구 저장소 왕복)만 증명했다. 1.x 가 실제로 깔려 있던 기기를
   2.0 으로 업데이트해서 로그인이 자동으로 이어지는지 오너가 직접 한 번 확인해 주면 가장 확실하다.

## 5주차 후속 (2026-09-16) — 오너 지적 4건 반영

오너가 1차 검토에서 짚어 준 네 가지를 처리했다. **커밋하지 않았다.**

**1. 필터 탭 프리셋 썸네일 — 서버에 이미 있던 걸 못 찾고 "새로 만들어야 한다"고 잘못 판단했었다.**
`public/thumbs/fs_{presetKey}.webp` 27장이 이미 있었다(프리셋 key 그대로 파일명, `fs_cine.webp`
`fs_cool.webp` … 전부 확인). `UI/Filter/FilterTabView.swift`의 회색 자리를
`RemoteImage(url: Config.thumbURL("fs_\(p.key)"))`로 교체 — 새 설정 없이 기존 `Config.thumbURL(_:)`
그대로 썼다. 필름·카메라·재미 27종 전부 실제 전/후 비교 이미지로 확인(`fin_ios_03_filter_thumbs.png`).

**2. 탭바 다크 모드 — 버그가 아니라는 오너 확인을 README에 반영.** 지난주 "미해결 버그"로 적었던
서술을 정정했다(위 4주차 절 참고) — Liquid Glass 는 뒤 콘텐츠 밝기를 반사하는 게 정상 동작이고 사진 앱도
동일하다. SPEC §6-1 판정도 "실기기 필요(버그 의심)"에서 "실기기 확인 권장(코드 기준 통과)"로 다시 매겼다.

**3. 서버 배포 확인 — `fit:"outpaint"` 실제 200 성공 + 크레딧 1회 차감 검증 완료.**
테스트 계정(`ios2-e2e@rimikimi.test`, Supabase `user_credits`에 크레딧 5개 임시 지급 후 검증)으로
`dev/fitsheet?realOutpaint=1`(가로 4:3 샘플 사진)을 실제로 호출했다:
- `FitSheet`의 "채워 맞춤" 버튼이 스피너("채워 맞추는 중…")로 바뀌었다가 20초 안에 정상 idle 상태로
  돌아왔다(에러 문구 없음) — `fin_ios_outpaint_01_running.png`, `fin_ios_outpaint_02_after.png`.
- 기기 로그에 `dev.realOutpaint.success`(완료 콜백이 실제로 호출됨)가 찍혔다.
- Supabase `user_credits`를 직접 조회해 `credits_used`가 0→1로 정확히 1만 올라간 것을 확인했다
  (크레딧 5개 지급 → 호출 후 사용 1, 잔여 4). 클라이언트가 보낸 요청·받은 응답 계약대로 서버가 정확히
  1크레딧만 차감하며 이미지까지 돌려준다는 것을 실제 네트워크 호출로 확인했다 — 이제 "서버 미배포라
  확인 불가"가 아니라 **완료**다.
- (참고) production API 에 curl 로 직접 찌르는 건 이 세션의 자동 승인 정책상 막혀 있어, 검증은 앱 자체의
  dev 라우트 + 서버(Supabase) 조회로 했다 — 결과는 동일하게 신뢰할 수 있다.

**4. 로그인 이전 — 포기하지 않고 실제로 구현했다. 시뮬레이터에서 왕복까지 검증 완료.**
오너 말대로 "번들 ID 가 같은 앱 업데이트"라는 전제를 끝까지 파고들었다:
- **1.x 가 정확히 어디에 뭘로 저장하는지 코드로 역산**: `capacitor.config.ts` 의 `ios.scheme: "rimikimi"`
  + 기본 `hostname: "localhost"`(Capacitor iOS 소스 `CAPInstanceDescriptor.swift` 확인) → 오리진
  `rimikimi://localhost`. `src/supabaseClient.js` 는 storage 어댑터를 지정하지 않아
  `@supabase/supabase-js` 기본값을 그대로 쓰는데, 그 기본 `storageKey` 는
  `sb-${new URL(url).hostname.split(".")[0]}-auth-token`(패키지 소스에서 직접 확인) — 이 프로젝트
  Supabase URL 호스트가 `hedgjzdrivilclmwumoc.supabase.co` 이므로 정확한 키는
  `sb-hedgjzdrivilclmwumoc-auth-token`. Capacitor 의 `CAPBridgeViewController.swift` 도 웹뷰
  `websiteDataStore` 를 따로 바꾸지 않아 **기본(영구) `WKWebsiteDataStore.default()`**를 쓴다 — 이건
  앱 컨테이너 안에 있고 번들 ID 가 같은 업데이트에서는 iOS 표준 동작상 유지된다.
- **구현**: `Account/LegacySessionMigration.swift` — 같은 오리진(`rimikimi://localhost`)에 대해 같은
  기본 영구 저장소를 쓰는 숨은 `WKWebView`(커스텀 스킴은 `WKURLSchemeHandler`로 빈 문서만 응답, 문서
  내용은 중요하지 않다 — localStorage 는 오리진에만 묶인다)를 앱 시작 시 1회 띄워 그 오리진의
  `localStorage[sb-hedgjzdrivilclmwumoc-auth-token]` 을 읽는다. 값을 찾으면 그 안의 `refresh_token`
  으로 `AuthStore.adoptLegacyRefreshToken`(Supabase `grant_type=refresh_token`)을 태워 새 세션을
  받고 그대로 로그인 상태가 된다. 못 찾거나 실패하면 조용히 넘어가 평소 로그인 화면 — 부작용 없음.
  `RimikimiApp.swift` `.task` 맨 앞(로그인 안 된 상태일 때만)에서 1회 시도한다.
- **버그 하나 잡음**: 처음 구현에서 `LegacyWebViewRunner`(WKWebView 델리게이트 보유자)를 지역 변수로만
  들고 있었더니, 그 지역 스코프가 끝나자마자 ARC 가 회수해 버려(델리게이트도 약한 참조) 네비게이션이
  끝나기도 전에 콜백이 증발 — `continuation` 이 영원히 resume 되지 않아 **크래시도 로그도 없이 조용히
  멈추는** 버그였다. `activeLegacyRunners` 정적 배열로 진행 중인 러너를 붙잡아 뒀다가 끝나면 스스로
  빼도록 고쳤다.
- **시뮬레이터로 왕복 검증**(1.x 가 실제로 깔린 적 없어 진짜 데이터는 없지만, 매커니즘 자체는 완전히
  검증했다): `dev/legacymigration?write=1` 로 가짜 세션 JSON 을 그 오리진에 **써 넣고 바로 다시 읽어**
  일치를 확인(`fin_ios_legacy_02_toast.png`, 로그 `dev.legacymigration.write 성공 …`). 그 다음
  **앱을 완전히 종료하고 로그아웃 상태로 새 프로세스로 재실행**했더니, 자동으로 실행되는
  `LegacySessionMigration.attemptOnce()` 가 **이전 프로세스가 써 둔 값을 그대로 읽어와** 그 안의
  가짜 `refresh_token` 으로 실제 Supabase 토큰 엔드포인트를 호출했다 — 로그에
  `legacy.migration.failed Refresh token is not valid` 가 찍혔는데, 이건 **실패가 아니라 성공 증거다**:
  가짜 토큰이라 Supabase 가 정당하게 거절한 것뿐이고, 오리진 저장소를 프로세스를 넘어(같은 앱을 완전히
  껐다 켜도) 정확히 읽어오는 것과 그 값으로 실제 서버까지 갔다 온 것 둘 다 확인됐다 — 진짜 1.x
  refresh_token 이었다면 성공했을 것이다.
- **그래도 100% 확정은 못 한다**: iOS 가 앱 업데이트 시 컨테이너(따라서 `WKWebsiteDataStore` 데이터)를
  보존하는 건 표준 문서화된 동작이지만, 실제 1.x → 2.0 스토어 업데이트 경로로 실기기에서 검증한 건
  아니다(그런 기기가 없다). 이론과 시뮬레이터 왕복 둘 다 뒷받침하지만 **실기기 확인이 마지막 확인
  단계로 남는다** — 위 ⑤-2 참고. 됐을 때: 사용자는 업데이트 후 첫 실행에 아무것도 안 하고 그대로
  로그인돼 있다. 안 됐을 때(예: 1.x 가 리프레시 토큰을 이미 회전시켰거나 만료됐거나 1.x 사용자가
  Apple 네이티브 로그인이라 애초에 웹 로그인 흐름을 안 탄 경우): 기존처럼 자연스럽게 로그인 화면으로
  간다 — 부작용 없는 "밑져야 본전" 시도라 켜 두는 데 리스크는 없다.
- 개발 라우트 추가: `dev/signout`(로그아웃, 이번 검증에 필요해서 추가), `dev/legacymigration[?write=1]`.
## 다음 주

- RevenueCat + 크레딧 부족 시트 실동작, `api/_lib/iapGrant.js` 이중 지급 방지.
- 실기기에서 셔터 촬영 → 즉시 저장, 공유 시트 완료 콜백, 마이크 권한 프롬프트가 실제로 뜨는지 확인.
- `src/ToolEntry.jsx`/`nativeBridge.js`/`CameraStudio.jsx` 변경 오너 검토 → 배포(현재 로컬 vite dev 로만
  검증, 배포 전까지 iOS 앱의 웹뷰는 여전히 구버전 배포본을 받는다).
- 초대 화면 실기기 확인.
- 실기기에서 뒤로 스와이프·탭 전환·시트가 시스템 앱과 구분되지 않는지(완료 기준 1) 확인.
- 실기기 다크 모드에서 스토어·초대 등 나머지 화면도 훑어보기(코드상 토큰만 쓰지만 실기기 확인은 못 함).
- 1.x → 2.0 로그인 이전이 실제 업데이트 경로에서도 되는지 실기기로 최종 확인(구현·시뮬레이터 검증 완료).
