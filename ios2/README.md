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
- 가운데 탭 아이템은 투명 아이콘 + 빈 라벨 — 떠 있는 카메라 원만 보인다.
- 햅틱: 만들기 확정·완료·저장·옵션 확정에만. 누름 0.97(전체폭 0.985) 110/140ms. Reduce Motion 은 스켈레톤·토스트·스태거에서 존중.

## 자리만 잡은 것(스텁)

- 필터 편집기·카메라: `WKWebView` 로 `https://rimikimi-app.vercel.app/?tool=filter|camera` 를 연다(SPEC §5 1단계). 저장·공유·앨범 브리지 없음. 필터 프리셋 카드는 회색 자리(썸네일 없음).
- 크레딧 부족 시트: 팩 3·구독 1·초대 버튼 문구만. RevenueCat 미연동.
- 프로필의 스토어·초대·알림 설정·계정 삭제: 토스트로 "다음 주" 안내.
- 다듬기 버튼: 편집기 웹뷰를 열 뿐 결과 사진을 넘기지 않는다.
- 푸시 토큰(`pushToken`)은 요청에 실리지 않는다(등록 코드 없음). 페이스 프로필 `faceRefs` 도 보내지 않는다.
- 첫 실행 가이드 1장, ATT, 알림 권한 시점: 없음.

## 명세상 애매한 점 / 확인 필요

1. **Apple 네이티브 → Supabase**: `grant_type=id_token` 은 Supabase Apple 제공자의 "Authorized Client IDs" 에 `com.rimikimi.app` 이 있어야 통과한다. 지금 웹은 서비스 ID 로만 돼 있을 수 있다. 없으면 코드가 웹 OAuth(Apple 시트 대신 브라우저)로 물러서므로 동작은 하지만 "네이티브 시트" 요건은 못 채운다. 대시보드에서 번들 ID 추가 필요.
2. **"홈으로 복귀 + 내 사진 진행 카드"**: 홈(갤러리) 스택을 비우고 **내 사진 탭으로 전환**하도록 해석했다. 갤러리에 머물고 토스트만 띄우는 해석도 가능 — 오너 판단.
3. **가운데 카메라 원**: 네이티브 탭바 위에 오버레이라, 탭바가 스크롤로 최소화될 때 원은 그 자리에 남는다(탭바와 함께 줄어들지 않음). 시스템 탭바에 떠 있는 버튼을 넣는 공식 API 가 없어 이렇게 했다. 실기기 확인 뒤 `tabViewBottomAccessory` 등으로 바꿀지 결정.
4. `/api/generate` 의 `keepRatio`(복원 컨셉) 는 웹에서 클라이언트 후처리 전용이라 보내지 않는다. 결과 크롭(768×1024)도 아직 안 한다 — 서버가 준 원본을 그대로 보여준다.
5. 카테고리 칩 "전체" 를 맨 앞에 두었다(웹과 동일). 명세엔 없어서 뺄 수도 있다.
6. 로그인 시트를 프로필·내 사진의 "로그인" 버튼에서도 열 수 있게 했다(명세의 세 시점 외). 사용자가 직접 누르는 것이라 문제는 없다고 봤다.

## 다음 주

- RevenueCat + 크레딧 부족 시트 실동작, `api/_lib/iapGrant.js` 이중 지급 방지.
- 푸시 등록·완료 알림, 첫 실행 가이드, ATT/알림 권한 시점.
- 편집기·카메라 웹뷰 저장/공유 브리지, 결과 → 다듬기 사진 전달.
- 필터 프리셋 썸네일, 초대 화면, 계정 삭제(`/api/account/delete`).
- 실기기에서 뒤로 스와이프·탭 전환·시트가 시스템 앱과 구분되지 않는지(완료 기준 1) 확인.
