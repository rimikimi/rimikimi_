# App Store 등록 메타데이터 초안 (rimikimi)

> **2026-07-18 현행화** — IAP 크레딧 팩 4종 + 구독 2종 반영, "인앱구입 없음" 문구 전부 제거.
> Apple Developer 가입 + DUNS 발급 완료 후, App Store Connect 에 복붙용.
> 작성일 기준 초안. 승인 전까지 자유롭게 수정.

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
| **가격** | 무료 다운로드 (광고 포함, 무료 사용자만 노출) + 인앱구입 4종 + 자동갱신 구독 2종 |

---

## 2. 인앱 구입 / 구독 상품 (In-App Purchases & Subscriptions)

> 소스: `api/_lib/payments/packages.js`. 상품 ID는 코드/스토어 공통 — **절대 변경 금지**.

### 소모성 크레딧 팩 (Consumable)

| 상품 ID | 크레딧 | 가격(KRW) | 가격(USD 참고) | 배지 |
|---|---|---|---|---|
| `credits_10` | 10 | ₩7,900 | $5.99 | — |
| `credits_30` | 30 | ₩19,800 | $14.99 | 인기 (Popular) |
| `credits_70` | 70 | ₩39,800 | $29.99 | 이득 (Best Value) |
| `credits_120` | 120 | ₩59,800 | $44.99 | 최고 가성비 (Best Deal) |

### 자동갱신 구독 (Auto-Renewable Subscription)

| 상품 ID | 주기 | 지급 크레딧 | 가격(KRW) | 가격(USD 참고) | 혜택 |
|---|---|---|---|---|---|
| `rimikimi_plus_monthly` | 월간 | 20/월 | ₩9,900 | $7.99 | 광고 제거 + Pro 엔진(2K) |
| `rimikimi_plus_annual` | 연간 | 240/년 | ₩99,000 | $74.99 | 광고 제거 + Pro 엔진(2K), 2개월 무료 |

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
  rimikimi+ 구독(월간/연간)으로 매달 크레딧이 자동 충전돼요
· rimikimi+ 구독은 광고 제거 + 더 선명한 2K 고화질 엔진 혜택 포함
· 무료 이용 시 광고가 표시될 수 있어요

🔒 안심하세요
· 업로드한 사진은 서버에 저장되지 않아요
· 생성된 이미지는 1시간만 보관 후 자동 삭제
· 개인정보는 안전하게 보호됩니다

지금 rimikimi로 나만의 인생 프로필을 만들어보세요!
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
  rimikimi+ (monthly/annual) for credits that renew automatically
· rimikimi+ removes ads and unlocks our sharper 2K high-definition engine
· Ads may appear while using the free tier

🔒 Privacy First
· Your uploaded photo is never stored on our servers
· Generated images auto-delete after 1 hour
· Your personal data stays protected

Create your dream profile with rimikimi today!
```

---

## 4. 키워드 (Keywords, 100자, 쉼표로 구분)

### 한국어
```
AI프로필,프로필사진,증명사진,인생네컷,AI사진,셀카,사진편집,아바타,초상화,링크드인,이력서,AI아트,유화,캐리커처
```

### 영어
```
AI profile,headshot,portrait,selfie,photo editor,avatar,AI art,profile picture,LinkedIn,resume,oil painting,caricature
```

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

### 심사 메모 (Notes) — 영어 예시
```
This app generates AI portraits from a user-uploaded photo.

The app is fully browsable WITHOUT an account. Sign-in is requested only when the
user moves past the photo step (generated images are saved to the account), so the
first screen is the app itself — not a login wall.

To test:
1. Launch the app. You are signed out; browse and pick a style freely.
2. Pick a concept from the gallery.
3. Add a face photo (any sample selfie works).
4. Tap Next (다음).
5. A sign-in sheet appears ("Sign in to save your generated image").
   Sign in with the demo account below, or any social login.
6. Your style and photo are preserved — the flow continues where you left off.

Notes:
- Image generation runs on our backend via the Google Gemini API.
- Photos picked before sign-in are kept only on the device (IndexedDB/localStorage)
  and are moved to the account slot after sign-in. They are never uploaded until
  generation, which always requires an authenticated request.
- Account deletion is available in-app under Settings.

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
