# rimikimi 출시 가이드 (무료 다운로드 + 인앱구입/구독 + 광고)

> **2026-07-18 현행화** — v1 "무료+광고, 인앱구입 없음" 시절 문서를 현행 코드 기준으로 갱신.
> 현재 모델: 무료 1장/일(KST 리셋, 자정 기준) + 크레딧 팩 4종(인앱구입) + rimikimi+ 구독 2종.
> 무료 사용자에게만 AdMob 전면광고 노출(크레딧/구독/관리자 계정은 광고 없음).
> 상세 상품 스펙은 `APPSTORE_METADATA.md` / `PLAYSTORE_METADATA.md` 참고.

마지막 업데이트: 2026-06-16 (콘솔 설정 절차 자체는 그대로). 코드/네이티브 설정은 끝난 상태. 아래는 **회원님이 콘솔에서 해야 하는 일**과 그때 제가 코드에 넣어드릴 부분 정리.

---

## ① 안드로이드 AdMob 만들기 (지금 테스트 ID라 실제로 교체 필요)

> iOS는 이미 실제 ID(`ca-app-pub-9458625554324585~5856129775`)가 들어가 있음. 안드로이드만 남음.

1. https://apps.admob.com 접속 → 왼쪽 **앱** → **앱 추가**
2. 플랫폼 **Android** 선택 → "앱이 스토어에 등록되어 있나요?" → **아니요** (아직 등록 전)
3. 앱 이름 `rimikimi` 입력 → 추가하면 **앱 ID** 발급됨 (`ca-app-pub-…~………` 형태)
4. 그 앱 안에서 **광고 단위 추가** → **전면 광고(Interstitial)** 선택 → 이름 아무거나(`interstitial-1`) → 만들면 **광고 단위 ID** 발급됨 (`ca-app-pub-…/………` 형태)
5. 나온 **2개 ID를 저한테 주세요.** 제가 아래 두 군데에 넣습니다:
   - `android/app/src/main/AndroidManifest.xml` → `APPLICATION_ID` (앱 ID, 현재 테스트값)
   - `src/ads.js` → `ANDROID_INTERSTITIAL` (광고 단위 ID, 현재 빈값)

※ 안 채워도 안드로이드는 **크래시 없이 광고만 안 뜸**. 하지만 광고 수익 받으려면 채워야 함.

---

## ② 스크린샷 — ✅ 완료 (헤드리스 Chrome, 한글 UI로 자동 캡처)

세로 셀피 앱이라 **iPhone 전용**으로 설정 → iPad 스크린샷 불필요.

`store_assets/screenshots/` 에 생성됨:
- **iOS** (1290×2796, App Store 6.9"): `ios/01-gallery · 02-concepts · 03-concepts2 · 04-upload · 05-profile.png`
- **Android** (1080×2400): `android/` 동일 5컷
- 내용: ① 컨셉 갤러리(히어로) ② 카테고리별 결과물 ③ 추가 카테고리 ④ 사진 업로드 ⑤ 프로필(언어/무료사용)

> 재생성 방법(컨셉 추가 후 등): `npm run build` → `npx vite preview --port 4178` → `node /tmp/shoot.mjs` (스크립트는 ?__shot 로그인 우회 + ko 로케일 사용). 실제 생성 결과물 컷이 필요하면 실기기에서 로그인 후 직접 캡처.

### 이미 준비된 자산 (store_assets/ 폴더)
- ✅ `appstore-icon-1024.png` — App Store 아이콘 1024×1024 (알파 제거됨)
- ✅ `play-icon-512.png` — Play 아이콘 512×512
- ✅ `play-feature-graphic-1024x500.png` — Play 피처 그래픽 (필수)

---

## ③ 네이티브 빌드 (맥 + Xcode/Android Studio)

코드/설정 다 반영하려면 빌드 전에 한 번:

```bash
cd ~/Documents/rimikimi_app
npm install          # admob 등 의존성 (이미 동기화됨)
npm run build        # 웹 빌드 → dist/
npx cap sync         # dist + 네이티브 플러그인을 ios/android에 반영
```

- iOS: `npx cap open ios` → Xcode에서 서명(팀 선택) → 실기기 테스트 → Archive → App Store Connect 업로드
- Android: `npx cap open android` → Android Studio에서 **서명된 AAB** 빌드 → Play Console 업로드

### 실기기 검증 체크리스트
- [ ] 소셜 로그인 4종 (Google / Apple / 카카오? / 네이버) — 시스템 브라우저로 떴다가 앱으로 복귀하는지
- [ ] 사진 선택/촬영 → 생성 동작
- [ ] 무료 1회 후 한도 안내
- [ ] (iOS) 광고 표시 + ATT 추적 동의 팝업
- [ ] (Android) 광고 — AdMob ID 채운 뒤

---

## ④ App Store Connect 제출

1. https://appstoreconnect.apple.com → **앱 추가** (번들 ID `com.rimikimi.app`)
2. **앱 정보**: 이름 rimikimi, 카테고리(사진/비디오), 개인정보처리방침 URL `https://rimikimi-app.vercel.app/privacy` (rimikimi.com은 별도 홈페이지라 미사용)
3. **가격**: 무료 다운로드 (앱 내 인앱구입 4종 + 자동갱신 구독 2종 — `APPSTORE_METADATA.md` §1-2 참고)
4. **앱 내 구입(In-App Purchases)** 등록: 소모성(consumable) 4종 `credits_10/30/70/120` + 자동갱신 구독(auto-renewable) 2종 `rimikimi_plus_monthly/annual` → 상품ID·가격·설명은 `APPSTORE_METADATA.md` §1-2
5. **앱 개인정보(App Privacy)**: 데이터 수집 항목 신고
   - 식별자(광고용 ID), 사용 데이터, 사진(앱 기능용) → `APPSTORE_METADATA.md` 참고
   - 추적(Tracking) "예" (AdMob 맞춤 광고 → ATT) — 무료 사용자에게만 노출, 크레딧/구독 사용자는 광고 없음
6. 스크린샷 + 아이콘 + 설명/키워드(`APPSTORE_METADATA.md`)
7. 빌드 선택(Xcode에서 업로드한 것) → **심사 제출**

## ④ Google Play Console 제출

1. https://play.google.com/console → **앱 만들기** (무료 다운로드, 앱)
2. **스토어 등록정보**: 제목/간단설명/자세한설명(`PLAYSTORE_METADATA.md`), 아이콘 512, 피처 그래픽, 스크린샷
3. **인앱 상품(In-app products)**: 소모성 4종 `credits_10/30/70/120` 등록 → `PLAYSTORE_METADATA.md` §1-2
4. **구독(Subscriptions)**: `rimikimi_plus_monthly` / `rimikimi_plus_annual` 등록(자동갱신) → `PLAYSTORE_METADATA.md` §1-2
5. **앱 콘텐츠**:
   - 개인정보처리방침 URL `https://rimikimi-app.vercel.app/privacy` (rimikimi.com은 별도 홈페이지라 미사용)
   - **데이터 안전성** 양식 (광고 ID 수집 = 예) → `PLAYSTORE_METADATA.md` 참고
   - 콘텐츠 등급 설문
   - 광고 포함 = **예** (무료 사용자에게만 노출)
   - 타깃층/뉴스 앱 여부 등
6. **프로덕션 트랙**에 서명된 AAB 업로드 → 출시 검토 제출

---

## 현재 상태 요약 (코드/설정 — 완료, 2026-07-18 기준)
- ✅ 무료 1장/일(KST 자정 리셋) + 무료 Pro체험 1회 + 친구초대 2명당 1크레딧
- ✅ 크레딧 팩 4종(소모성 IAP): `credits_10`(₩7,900/$5.99) · `credits_30`(₩19,800/$14.99) · `credits_70`(₩39,800/$29.99) · `credits_120`(₩59,800/$44.99)
- ✅ 구독 2종(자동갱신): `rimikimi_plus_monthly`(₩9,900/월, 20크레딧+광고제거) · `rimikimi_plus_annual`(₩99,000/년, 240크레딧+광고제거)
- ✅ 엔진: 무료 생성=`gemini-2.5-flash-image`, 유료(크레딧/구독/체험)=`gemini-3-pro-image` 2K 고화질
- ✅ 광고: AdMob 전면광고 — 무료 사용자에게만 노출, 크레딧 보유/구독/관리자 계정은 광고 없음
- ✅ 네이티브 소셜 로그인(딥링크 `com.rimikimi.app://login-callback`) — iOS Info.plist / Android intent-filter 반영
- ✅ AdMob: iOS 실제 ID 반영 / 안드로이드 테스트 ID(→ ①에서 교체)
- ✅ 웹 AdSense 스크립트 제거 (콘텐츠 없는 화면 경고 해소), ads.txt 유지
- ✅ 법적 푸터: 대표자명 제거, 주소 구 단위, 한국 접속자만 표시
- ✅ iPhone 전용 타깃 (iPad 스크린샷 불필요)
- ✅ 개인정보처리방침/이용약관/환불정책 페이지
- ✅ 스토어 자산: 아이콘 1024/512, 피처 그래픽 생성됨
