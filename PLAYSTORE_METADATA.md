# Google Play 스토어 등록 메타데이터 초안 (rimikimi)

> **2026-07-18 현행화** — IAP 크레딧 팩 4종 + 구독 2종 반영, "인앱구입 없음/v1.1에서 결제" 문구 전부 제거.
> Google Play Console 가입($25, 평생 1회) 후, 스토어 등록정보에 복붙용.
> App Store 메타데이터(APPSTORE_METADATA.md)와 대부분 공유하되, Play 특유 항목만 별도.

---

## 1. 기본 정보

| 항목 | 값 |
|---|---|
| **앱 이름 (App name, 30자)** | rimikimi - AI 인생 프로필 |
| **패키지명 (Package name)** | com.rimikimi.app |
| **기본 언어** | 한국어 |
| **앱 또는 게임** | 앱 |
| **무료/유료** | 무료 다운로드 (광고 포함 — 무료 사용자만 노출) + 인앱상품 4종 + 구독 2종 |
| **카테고리** | 사진 (Photography) |

---

## 2. 인앱 상품 / 구독 상품 (In-app products & Subscriptions)

> 소스: `api/_lib/payments/packages.js`. 상품 ID는 코드/스토어 공통 — **절대 변경 금지**.
> Play 콘솔 → **수익 창출 → 인앱 상품**(소모성) / **구독**(자동갱신)에 각각 등록.

### 인앱 상품 — 소모성(Managed product, consumable)

| 상품 ID | 크레딧 | 가격(KRW) | 가격(USD 참고) | 배지 |
|---|---|---|---|---|
| `credits_10` | 10 | ₩7,900 | $5.99 | — |
| `credits_30` | 30 | ₩19,800 | $14.99 | 인기 (Popular) |
| `credits_70` | 70 | ₩39,800 | $29.99 | 이득 (Best Value) |
| `credits_120` | 120 | ₩59,800 | $44.99 | 최고 가성비 (Best Deal) |

### 구독 상품

| 상품 ID | 주기 | 지급 크레딧 | 가격(KRW) | 가격(USD 참고) | 혜택 |
|---|---|---|---|---|---|
| `rimikimi_plus_monthly` | 월간 | 20/월 | ₩9,900 | $7.99 | 광고 제거 + Pro 엔진(2K) |
| `rimikimi_plus_annual` | 연간 | 240/년 | ₩99,000 | $74.99 | 광고 제거 + Pro 엔진(2K), 2개월 무료 |

### 무료 제공 (참고 — 상품 아님)
- 무료 1장/일 (한국시간 KST 자정 리셋), 기본 엔진(`gemini-2.5-flash-image`)
- 무료 Pro 체험 1회 (계정당, `gemini-3-pro-image` 2K 고화질 엔진 미리보기)
- 친구 초대 2명당 크레딧 1개 적립

### 엔진 안내
- 무료 생성: `gemini-2.5-flash-image`
- 유료(크레딧 소진/구독/무료 Pro체험): `gemini-3-pro-image`, 해상도 **2K 고화질** (4K 아님 — 스토어 문구에 4K 사용 금지)

---

## 3. Play 콘솔/API로 반영할 최종 문구 (EN/KO 완성본)
> 아래 §3-1(간단한 설명)·§3-2(자세한 설명)는 Play Console 스토어 등록정보 또는
> Google Play Developer API(`edits.listings`)에 그대로 반영 가능한 **최종본**.

### 3-1. 간단한 설명 (Short description, 80자)
> Play 검색결과/목록에 노출되는 짧은 문구.

### 한국어
```
증명사진 한 장으로 만드는 AI 인생 프로필. 유화·수채화·정장까지 수백 가지 컨셉!
```

### 영어
```
Turn one selfie into hundreds of AI profile pictures — oil, watercolor & more.
```

---

### 3-2. 자세한 설명 (Full description, 4000자)

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

### 영어
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

## 5. 그래픽 자료 (Play 필수)

| 자료 | 사양 | 필수? |
|---|---|---|
| **앱 아이콘** | 512 x 512 PNG (32비트, 알파) | ✅ 필수 |
| **그래픽 이미지 (Feature graphic)** | 1024 x 500 PNG/JPG | ✅ 필수 |
| **휴대폰 스크린샷** | 16:9 또는 9:16, 최소 2장 (최대 8장) | ✅ 필수 |
| **7인치 태블릿 스크린샷** | 선택 | 태블릿 지원 시 |
| **10인치 태블릿 스크린샷** | 선택 | 태블릿 지원 시 |

> 앱 아이콘 512는 public/icons/icon-512.png 재활용 가능.
> Feature graphic(1024x500)은 새로 제작 필요 — 로고+슬로건 배너.

---

## 6. URL / 연락처

| 항목 | 값 |
|---|---|
| **개인정보처리방침** | https://rimikimi-app.vercel.app/privacy |
| **웹사이트** | https://rimikimi-app.vercel.app |
| **이메일** | (사장님 이메일) |
| **전화번호** | (선택) |

---

## 7. Play 콘솔 필수 설문 (App Store 보다 많음)

Play 는 등록 시 아래 설문을 채워야 함:

| 설문 | rimikimi 답변 가이드 |
|---|---|
| **콘텐츠 등급 (IARC)** | 설문 응답 → 보통 "전체이용가" 또는 "3+" |
| **타겟 연령층** | 13세 이상 권장 (광고 포함이라 13세 미만 타겟 지양) |
| **광고 포함 여부** | **예 — AdMob 광고 포함** (무료 사용자에게만 노출, 스토어에 "광고 포함" 라벨 표시됨) |
| **데이터 보안 (Data safety)** | 사진 업로드: 수집하나 저장 안 함 명시 / 이메일·계정·구매내역 정보 수집 |
| **앱 접근 권한** | 심사용 데모 계정 제공 (appreview@rimikimi.com) |
| **정부 앱 여부** | 아니요 |
| **금융 기능** | 인앱 결제(소모성 크레딧 팩 4종) + 자동갱신 구독(2종) 있음 — 신용/대출/투자 등 금융서비스 아님 |

### 데이터 보안 섹션 작성 가이드
- 수집 항목: 이메일 주소(계정), 사진(이미지 생성 입력), 구매 내역(크레딧/구독 — 결제수단 정보는 Google Play Billing이 처리, 앱은 미수집)
- 사진: "처리 후 즉시 삭제, 서버 저장 안 함"
- 암호화: 전송 중 암호화됨 (HTTPS)
- 삭제 요청: 계정 삭제 시 데이터 삭제
- **광고 식별자(IDFA/ADID)**: 수집 + 제3자(Google AdMob) 공유 — 광고 목적, 무료 사용자에게만 적용 (Data safety 에 반드시 표시)

---

## 8. 출시 트랙 전략 (권장)

```
1. 내부 테스트 (Internal testing)  ← 본인+지인, 즉시, 심사 없음
2. 비공개 테스트 (Closed testing)  ← 베타테스터 20명+ (요즘 개인 계정 필수 단계)
3. 공개 테스트 (Open testing)      ← 누구나
4. 프로덕션 (Production)           ← 정식 출시
```

> ⚠️ 2024년 이후 **개인(individual) 개발자 계정**은 프로덕션 출시 전
> "비공개 테스트 20명 × 14일" 요건이 생겼어요.
> 사업자(조직) 계정은 이 요건 면제. → 사업자 등록했으면 조직 계정 권장.

---

## 9. 심사 메모 (테스터용 안내) — 영어
```
This app generates AI profile pictures from a user-uploaded photo.

Test account (email login):
  email: appreview@rimikimi.com
  password: Rimikimi-Review-2026!

To test:
1. On the login screen, tap "Sign in / up with email" and log in.
2. Pick a concept on the gallery screen.
3. Upload a face photo (any selfie works).
4. Tap "Create" to generate.

Free tier: 1 generation per day (resets at midnight KST), using the
gemini-2.5-flash-image engine. To test paid tiers, purchase a credit
pack or subscribe to rimikimi+ via a test payment method — paid
generations use the gemini-3-pro-image engine at 2K resolution and
remove ads.

The "Art Transformation" category accepts any photo (people,
landscapes, objects). Uploaded photos are not stored; generated
images auto-expire in 1 hour.
```

---

## 체크리스트 (등록 시)
- [ ] Google Play Console 가입 ($25 결제)
- [ ] 개인 vs 조직(사업자) 계정 선택
- [ ] Android Studio 설치 (빌드용)
- [ ] 서명 키(keystore) 생성 + 안전 보관
- [ ] .aab(App Bundle) 빌드
- [ ] 인앱 상품 4종 + 구독 2종 등록 (§2 상품ID·가격표대로, 절대 ID 변경 금지)
- [ ] 그래픽 자료 (아이콘512 / feature graphic / 스크린샷)
- [ ] 데이터 보안 설문 작성 (구매내역 항목 포함)
- [ ] 콘텐츠 등급 설문
- [ ] 내부 테스트 → 비공개 → 프로덕션 순 출시
