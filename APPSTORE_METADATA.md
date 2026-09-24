# App Store 등록 메타데이터 초안 (rimikimi)

> **2026-07-18 현행화** — IAP 크레딧 팩 4종 + 구독 2종 반영, "인앱구입 없음" 문구 전부 제거.
> Apple Developer 가입 + DUNS 발급 완료 후, App Store Connect 에 복붙용.
> 작성일 기준 초안. 승인 전까지 자유롭게 수정.
>
> **2026-09-19 재현행화(2.0 컴플라이언스 리뷰로 발견) — 상품 ID·가격이 전부 낡아 있었다.**
> 아래 §2 는 2026-08-14 부터 이미 `credits_10~120`·`rimikimi_plus_*`(2종) 에서 `rimikimi.pack.*`
> (4종)·`rimikimi.sub.plus.*`(위클리 신설로 **3종**) 로 판매 상품이 바뀐 뒤 이 문서만 안 따라왔던
> 것 — 코드는 처음부터 옳았다(`api/_lib/payments/packages.js` `PACKAGES`, `StoreManager.swift`
> 와 1:1). 이 문서로 스토어 리스팅을 채우면 실제 판매 상품과 다른 값을 적게 되어 Guideline 2.3.1
> (설명 정확성) 에 걸린다 — §2 표를 반드시 아래 새 값으로 쓸 것, 옛 표는 참고용으로만 남겨 둔다.

---

## 1. 기본 정보

| 항목 | 값 |
|---|---|
| **앱 이름 (App Name)** | rimikimi - AI 인생 프로필 |
| **부제 (Subtitle, 30자)** | 내 얼굴로 만드는 AI 프로필 사진 |
| **번들 ID (Bundle ID)** | com.rimikimi.app |
| **주 카테고리** | 사진 및 비디오 (Photo & Video) |
| **부 카테고리** | 엔터테인먼트 (Entertainment) — 선택 |
| **연령 등급** | 4+ (또는 콘텐츠 검토 후 12+) |
| **가격** | 무료 다운로드 (광고 포함, 무료 사용자만 노출) + 인앱구입 4종 + 자동갱신 구독 3종 |

---

## 2. 인앱 구입 / 구독 상품 (In-App Purchases & Subscriptions)

> 소스: `api/_lib/payments/packages.js` `PACKAGES`(현재 판매 목록, 2026-08-14~) — iOS
> `ios2/rimikimi/Backend/StoreManager.swift`·Android `rn/` 도 이 ID/가격과 1:1. 상품 ID는
> 코드/스토어 공통 — **절대 변경 금지**. (옛 `credits_10~120`·`rimikimi_plus_*`는 과거 구매자
> 영수증 재검증용으로만 서버에 남아 있고 더는 판매하지 않는다 — 스토어 리스팅에 쓰지 말 것.)

### 소모성 크레딧 팩 (Consumable)

| 상품 ID | 크레딧 | 가격(KRW) | 가격(USD 참고) | 배지 |
|---|---|---|---|---|
| `rimikimi.pack.intro` | 6 | ₩3,900 | $2.99 | 첫 구매 (First purchase) |
| `rimikimi.pack.mini` | 12 | ₩7,900 | $5.99 | — |
| `rimikimi.pack.standard` | 24 | ₩14,900 | $10.99 | 베스트 가치 (Best value) |
| `rimikimi.pack.pro` | 45 | ₩27,000 | $19.99 | 장당 최저 (Lowest per image) |

### 자동갱신 구독 (Auto-Renewable Subscription)

| 상품 ID | 주기 | 지급 크레딧 | 가격(KRW) | 가격(USD 참고) | 혜택 |
|---|---|---|---|---|---|
| `rimikimi.sub.plus.weekly` | 주간 | 8/주 | ₩6,900 | $4.99 | 매주 8장 |
| `rimikimi.sub.plus.monthly` | 월간 | 30/월 | ₩12,900 | $9.99 | 광고 제거 + 매달 30장 |
| `rimikimi.sub.plus.annual` | 연간 | 240/년 | ₩109,000 | $89.99 | 광고 제거, 3개 구독 중 가장 저렴 |

### 무료 제공 (참고 — 상품 아님)
- 무료 1장/일 (한국시간 KST 자정 리셋), 기본 엔진(`gemini-2.5-flash-image`)
- 무료 Pro 체험 1회 (계정당, `gemini-3-pro-image` 2K 고화질 엔진 미리보기)
- 친구 초대 2명당 크레딧 1개 적립

### 엔진 안내 (심사자 문의 대비)
- 무료 생성: `gemini-2.5-flash-image`
- 유료(크레딧 소진 / 구독 / 무료 Pro체험): `gemini-3-pro-image`, 해상도 **2K 고화질** (4K 아님 — 스토어 문구에 4K 사용 금지)

---

## 3. 다음 바이너리 제출 시 반영할 설명문 (EN/KO)
> 앱 업데이트(바이너리 재제출) 시에만 반영되는 필드 — App Name/Subtitle/Description/Keywords.
> Promotional Text(§4)와 달리 **심사를 거쳐야 반영**됨.

### 3-1. 앱 설명 (Description)

### 한국어

```
✨ rimikimi — 내 얼굴로 만드는 AI 인생 프로필

증명사진이나 셀카 한 장만 올리면, AI가 내 얼굴 특징을 살려
수백 가지 컨셉의 프로필 사진을 만들어드려요.

📸 이런 분께 추천해요
· 링크드인·이력서용 단정한 프로필이 필요한 분
· SNS 프로필을 특별하게 바꾸고 싶은 분
· 스튜디오 가지 않고 다양한 컨셉 사진을 원하는 분

🎨 다양한 스타일
· 클래식 정장 / 비즈니스 프로필
· 자연스러운 일상 스냅
· 예술적인 아트 변환 (유화·수채화·색연필·클레이 등)
· 그 외 수백 가지 컨셉

🖌️ 아트 변환 기능
인물뿐 아니라 풍경·반려동물·사물 사진도
유화, 수채화, 목탄 드로잉 등 예술 작품으로 바꿔드려요.

💳 이용 방법
· 매일 1장 무료로 생성할 수 있어요 (한국시간 자정 리셋)
· 더 많이 만들고 싶다면 크레딧을 충전하거나(1회 구매)
  rimikimi+ 구독(위클리/먼슬리/애뉴얼)으로 크레딧이 자동 충전돼요
· rimikimi+ 구독은 광고 제거 + 더 선명한 2K 고화질 엔진 혜택 포함
· 무료 이용 시 광고가 표시될 수 있어요

🔒 안심하세요
· 업로드한 사진은 서버에 저장되지 않아요
· 생성된 이미지는 24시간만 보관 후 자동 삭제
· 개인정보는 안전하게 보호됩니다

지금 rimikimi로 나만의 인생 프로필을 만들어보세요!

이용약관: https://rimikimi-app.vercel.app/terms
개인정보처리방침: https://rimikimi-app.vercel.app/privacy
자동갱신 구독 이용약관(EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

### 영어 (English)

```
✨ rimikimi — Your Face, Your Dream Profile, Powered by AI

Just upload an ID photo or a selfie, and our AI creates
profile pictures in hundreds of concepts — while keeping
your facial features clearly recognizable.

📸 Perfect for
· Polished profiles for LinkedIn or resumes
· Standout social media profile pictures
· Studio-quality variety without the studio

🎨 Many Styles
· Classic business & formal portraits
· Natural everyday snapshots
· Artistic transformations (oil, watercolor, color pencil, clay…)
· And hundreds more concepts

🖌️ Art Transformation
Not just people — turn landscapes, pets, and objects into
oil paintings, watercolors, charcoal drawings, and more.

💳 How it works
· Get 1 free generation every day (resets at midnight KST)
· Want more? Buy a one-time credit pack, or subscribe to
  rimikimi+ (weekly/monthly/annual) for credits that renew automatically
· rimikimi+ removes ads and unlocks our sharper 2K high-definition engine
· Ads may appear while using the free tier

🔒 Privacy First
· Your uploaded photo is never stored on our servers
· Generated images auto-delete after 24 hours
· Your personal data stays protected

Create your dream profile with rimikimi today!

Terms of Use: https://rimikimi-app.vercel.app/terms
Privacy Policy: https://rimikimi-app.vercel.app/privacy
Auto-Renewable Subscription Terms (EULA): https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

---

## 3-2. EULA 링크 (2026-09-19 컴플라이언스 리뷰로 발견 — 구독 판매 시 필수)

Apple Guideline 3.1.2 — 구독을 파는 앱은 앱 설명 안에 **표준 EULA 링크**(또는 자체 EULA)를 둬야
한다. rimikimi 는 별도 EULA 를 쓰지 않으므로 Apple 표준 링크를 쓴다.

✅ **§3-1 한/영 설명문 본문 맨 끝에 이미 인라인으로 들어가 있음**(재검증에서 "지침만 있고 본문에
안 들어가 있으면 그대로 복붙해 빠뜨리기 쉽다"는 지적을 받아 반영 — 키아라가 이 정확한 사유로
리젝된 전례가 있다). §3-1 을 그대로 복붙하면 자동으로 포함된다 — 여기서 따로 추가할 것 없음.

---

## 3-3. 이번 업데이트 노트 (2.0.1 — "새로운 기능", ASC 적용본. 라이브 1.40 → 네이티브 2.0 첫 출시)

> ⚠️ 8/28 4.3(a) 반려 원인 = 필터 위주 노트. AI 기능을 앞에, 필터·카메라는 넣지 않는다.
> 얼굴 스캔은 "더 정확해진다" 같은 효과 문구 금지 — 편의성만 말한다(face_profile_ab).

### 한국어
```
리미키미 2.0 — 더 빠르고 매끄러운 네이티브 앱으로 새로 만들었어요

· 얼굴 스캔: 정면·좌·우 세 방향을 한 번 찍어 두면, 컨셉마다 사진을 다시 올릴 필요 없이 바로 만들 수 있어요
· 동시 생성: 여러 컨셉을 한꺼번에 맡겨 두고, 완성되는 대로 '내 사진'에서 확인하세요
· 드레스룸: 옷 사진을 최대 5장 올리면 그 코디를 입은 내 모습을 만들어 드려요
· 보관 기간 연장: 만든 사진을 24시간 동안 보관해요 (기존 1시간)
· 폰카 필터 8종: 16 Pro부터 3GS까지, 그 시절 폰카 색감을 입혀 보세요
· 다크 모드 지원, 화면 전환이 더 자연스러워졌어요

의견은 결과 화면의 "신고" 버튼이나 enquiry@rimikimi.com 으로 알려주세요.
```

### English
```
rimikimi 2.0 — rebuilt from the ground up as a faster, smoother native app

· Face scan: capture front, left and right once, then create any concept without re-uploading a photo
· Generate in parallel: queue several concepts at once and find each one in My Photos as it finishes
· Dressing Room: upload up to 5 clothing photos and see yourself wearing the outfit
· Longer storage: generated photos are now kept for 24 hours (was 1 hour)
· 8 phone-camera filters: from 16 Pro back to 3GS, try the look of each era
· Dark mode and smoother transitions

Feedback? Use the report button on the result screen, or email enquiry@rimikimi.com.
```

## 3-4. TestFlight "무엇을 테스트할지" (build 99, 내부 테스터용)

```
이번 빌드(99)에서 확인해 주세요 — 2.0 컴플라이언스 FIX 반영분:

1. 로그인 4종(Apple/카카오/네이버/Google) 버튼이 다 정상 동작하는지
2. 컨셉 선택 → 만들기 → 첫 생성 완료 직후 ATT(추적 허용) 팝업이 실제로 뜨는지
3. 결과 화면 "🚩 부적절한 결과 신고" 버튼 → 메일 작성창이 뜨는지
4. 첫 "만들기" 전 뜨는 동의 시트("사진은 이렇게 쓰여요")의 "개인정보처리방침" 링크가
   사파리로 실제로 열리는지 (동의 시트·크레딧부족 시트 둘 다)
5. 샌드박스 결제 1회 → 크레딧이 정확히 1번만 올라가는지
6. (1.x 가 설치돼 있던 기기라면) 업데이트 후 로그인이 자동으로 유지되는지
```

## 4. 키워드 (Keywords, 100자, 쉼표로 구분)

### 한국어
```
AI프로필,프로필사진,증명사진,인생네컷,AI사진,셀카,사진편집,아바타,초상화,링크드인,이력서,AI아트,유화,캐리커처
```

### 영어
> ⚠️ 2026-09-24 실측: **라이브 en-US 키워드는 이 목록이 아니었다** —
> `rimikimi,ai photoshoot,concept,daily,photobooth,4 cut,couple,dressing room,ai art,portrait,selfie`.
> 이름(rimikimi - personal photobooth)·부제목(New AI photo concepts daily)에 있는 단어
> (rimikimi, photobooth, ai, photo, concept, daily)는 이미 색인되니 키워드에서 빼고 검색량 있는 말로 채운다.
> **다음 버전 제출 때 en-US 키워드를 아래로 교체**(라이브 버전은 키워드 수정 불가):
```
selfie,portrait,4cut,couple,dressing room,restore,old photo,avatar,ai art,oil painting,watercolor
```
> ⛔ 2026-09-25: 처음엔 headshot·id photo·passport·wedding·linkedin 을 넣었다가 제출 전 점검에서 걸렸다 —
> 8/28 4.3(a) 스팸 반려 후 **형제앱(브루클린·클레어) 영역 단어를 rimikimi 메타에서 빼기로 한 결정**
> (scripts/asc-meta-rimikimi.mjs BANNED)을 되돌리는 것이었다. 영어 메타에도 BANNED 단어 금지. 2.0.2 에 위 목록으로 반영.
> 한국어도 라이브 값 확인 필요(2026-09-24 라이브: 리미키미,컨셉,화보,AI화보,매일,드롭,네컷,인생네컷,커플,드레스룸,AI아트,유화,수채화,아바타,초상화,셀카,즉석사진).

---

## 5. 라이브에서 즉시 수정 가능한 필드 (Promotional Text)
> App Store Connect에서 **심사 없이** 바로 반영되는 유일한 텍스트 필드(170자).
> 위 §3 설명문과 별개 — 이벤트/시즌 문구, 가격 프로모션 안내 등을 여기서 수시로 교체.

```
증명사진 한 장이면 충분해요! AI가 만들어주는 다양한 컨셉의 인생 프로필.
매일 1장은 무료, rimikimi+ 구독하면 광고 없이 2K 고화질로 더 많이!
```

```
One selfie is all it takes! AI-crafted profile pictures in endless concepts.
1 free daily generation — go ad-free with 2K quality via rimikimi+.
```

---

## 6. URL

| 항목 | URL |
|---|---|
| **지원 URL (Support)** | https://rimikimi-app.vercel.app |
| **마케팅 URL (선택)** | https://rimikimi-app.vercel.app |
| **개인정보처리방침 (Privacy Policy)** | https://rimikimi-app.vercel.app/privacy |

---

## 7. 심사 정보 (App Review Information)

| 항목 | 값 |
|---|---|
| **데모 계정 이메일** | appreview@rimikimi.com|
| **데모 계정 비밀번호** | Rev-GdJbCeLKTkLa!|
| **연락처 이름** | (사장님 이름) |
| **연락처 전화** | (사장님 번호) |
| **연락처 이메일** | (사장님 이메일) |

> 데모 계정은 Supabase 에 email_confirm 완료 상태로 생성됨 (확인 메일 불필요).
> 베타 테스터 화이트리스트(TESTER_EMAILS)에도 등록되어 실제 이미지 생성 가능(하루 3장, 일반 무료 1장보다 넉넉).
> ⚠️ 2026-08-13부터 앱 진입 시 로그인 화면이 없다(게스트 모드). 로그인 시트는
> **사진 입력 다음 단계로 넘어갈 때** 뜬다 — 심사 메모에 그 경로가 적혀 있어야 한다.
> (무료 1장/일 개방 — 아무 계정으로도 생성 테스트 가능. 크레딧/구독 흐름은 데모 계정으로 Sandbox 결제 테스트)

### 심사 메모 (Notes) — 영어 (2.0.1, 네이티브 SwiftUI 앱 기준)
```
rimikimi creates AI portraits from the user's own face photo. This is a native
SwiftUI app; image generation runs on our backend via the Google Gemini API.

The app is browsable WITHOUT an account. Sign-in is requested only when you tap
Create (generated images are saved to the account).

Demo account: appreview@rimikimi.com (password below). It has credits pre-loaded,
so multi-image generation and Dress room can be tested without purchasing.

To test:
1. Launch the app and pick any concept from the Home tab.
2. Add a face photo (any sample selfie) or use Profile > Face scan (3 angles).
3. Tap Create. Sign in with the demo account when the sheet appears.
   Before the very first generation a one-time consent sheet explains that the
   photo is sent to Google Gemini; tap "동의하고 계속" (Agree and continue).
4. The result appears in about 30-60 seconds. Several generations can run at the
   same time; progress is shown in the My Photos tab.
5. Dress room: open the "드레스룸" (Dress room) concept in the "매직 부스" (Magic booth)
   category and add up to 5 clothing photos.

App Tracking Transparency: the ATT prompt appears about 1 second after your FIRST
generated result is shown. This timing is intentional (it is not shown at launch).

In-App Purchase (sandbox): credit packs grant credits in the sandbox environment.
Subscriptions (rimikimi+) remove ads in sandbox; their monthly credit top-up is
granted only for production purchases. Please use a credit pack to verify credits.
"구매 복원" (Restore Purchases) is on the Store screen.

FACE SCAN (optional, Profile > "얼굴 스캔하기") — convenience only, so the user does
not have to pick a photo for every concept:
- The camera captures 3 photos (front, left, right). Apple's Vision framework is
  used on-device only to check head angle and image quality while capturing.
- The user reviews the 3 photos and taps "이 얼굴로 시작하기" to save them. They are
  stored ONLY on the device (app sandbox), never on our servers.
- They are sent to our backend as reference images only when the user generates,
  and are discarded right after. No face embeddings/templates are created or
  stored, and they are not used for authentication or identification.
- Delete any time: Profile > 내 사진 > 삭제. Also removed on sign-out.

- Uploaded photos are sent to Google Gemini for generation and are not retained.
- Generated images are deleted from our server after 24 hours.
- Account deletion: Profile > 계정 삭제 (Delete account).
- Report an inappropriate result: the report button on the result screen.

App bundle ID: com.rimikimi.app
```

---

## 8. 스크린샷 요구사항 (Apple 필수)

App Store 는 아래 크기 스크린샷이 필요해요. 시뮬레이터로 캡처 가능.

| 기기 | 해상도 | 필수? |
|---|---|---|
| 6.9" (iPhone 16 Pro Max) | 1320 x 2868 | ✅ 필수 |
| 6.5" (iPhone 11 Pro Max 등) | 1242 x 2688 | ✅ 권장 |
| 6.1" | 1179 x 2556 | 선택 |
| iPad 12.9" (iPad 지원 시) | 2048 x 2732 | iPad 빌드 시 |

> 최소 6.9" 한 세트(3~10장)면 등록 가능. 다른 크기는 Apple 이 자동 축소.

### 추천 스크린샷 구성 (3~5장)
1. 홈/갤러리 화면 — "수백 가지 컨셉"
2. 생성 결과 예시 — Before/After
3. 아트 변환 카테고리
4. 다양한 스타일 모음
5. 프로필/크레딧 화면

---

## 9. 연령 등급 설문 참고
- 폭력/성적 콘텐츠: 없음
- 사용자 생성 콘텐츠: 있음 (사진 업로드) → 신고/차단 정책 명시 권장
- 결과: 보통 4+ 또는 12+

---

## 10. 앱 개인정보(App Privacy) 라벨 — Apple

수집 항목과 용도를 방침(/privacy)과 **일치**시켜 입력:

| 데이터 | 수집? | 용도 | 사용자 연결 |
|---|---|---|---|
| 이메일 주소 | 예 | 앱 기능(계정/로그인) | 예 |
| 사진(업로드) | 예 | 앱 기능(이미지 생성) — **서버 저장 안 함, 처리 후 즉시 폐기** | 예 |
| 사용 기록(생성 시각/횟수) | 예 | 앱 기능, 분석 | 예 |
| 구매 내역(크레딧/구독) | 예 | 앱 기능(결제 처리는 Apple IAP — 카드정보 미수집) | 예 |
| 식별자 — **광고 식별자(IDFA)** | 예 | **서드파티 광고(AdMob)** — 무료 사용자에게만 적용 | 예 |
| 대략적 위치(광고용 IP 기반) | 예 | 서드파티 광고 | 아니요 |

> 광고 식별자를 수집하므로 **App Tracking Transparency(ATT)** 프롬프트 필요(Info.plist NSUserTrackingUsageDescription).
> 결제(IAP/구독)는 Apple의 In-App Purchase API로 처리 — 카드번호 등 결제수단 정보는 앱/서버가 직접 수집하지 않음.

---

## 체크리스트 (등록 시)
- [ ] Apple Developer 가입 완료
- [ ] DUNS 번호 발급 (사업자 가입 시)
- [ ] App Store Connect 에서 앱 생성 (번들 ID: com.rimikimi.app)
- [ ] 이메일 로그인 추가 + 데모 계정 발급
- [ ] 인앱 구입 4종 + 자동갱신 구독 2종 등록 (§2 상품ID·가격표대로, 절대 ID 변경 금지)
- [ ] 스크린샷 캡처 (6.9" 최소)
- [ ] 위 메타데이터 입력 (§3 설명문 + §5 즉시수정 프로모션 텍스트)
- [ ] Xcode 에서 Archive → Upload
- [ ] 심사 제출
