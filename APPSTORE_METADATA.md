# App Store 등록 메타데이터 초안 (rimikimi)

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
| **가격** | 무료 (앱 내 구입: 크레딧) |

---

## 2. 프로모션 텍스트 (Promotional Text, 170자)
> 앱 업데이트 없이 수시로 바꿀 수 있는 짧은 홍보 문구.

```
증명사진 한 장이면 충분해요! AI가 만들어주는 다양한 컨셉의 인생 프로필.
유화, 수채화, 패션 화보, 클래식 정장까지 — 내 얼굴 그대로, 분위기는 새롭게.
```

---

## 3. 앱 설명 (Description)

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

## 5. URL

| 항목 | URL |
|---|---|
| **지원 URL (Support)** | https://rimikimi-app.vercel.app |
| **마케팅 URL (선택)** | https://rimikimi-app.vercel.app |
| **개인정보처리방침 (Privacy Policy)** | https://rimikimi-app.vercel.app/privacy |

---

## 6. 심사 정보 (App Review Information)

| 항목 | 값 |
|---|---|
| **데모 계정 이메일** | (이메일 로그인 추가 후 발급 예정) |
| **데모 계정 비밀번호** | (추후) |
| **연락처 이름** | (사장님 이름) |
| **연락처 전화** | (사장님 번호) |
| **연락처 이메일** | (사장님 이메일) |

### 심사 메모 (Notes) — 영어 예시
```
This app generates AI profile pictures from a user-uploaded photo.

To test:
1. Sign in with the demo account (email/password provided above),
   or use any social login.
2. On the gallery screen, pick a concept.
3. Upload a face photo (a sample selfie works fine).
4. Tap "Create" to generate the AI portrait.

Note: Image generation uses the Google Gemini API on our backend.
Uploaded photos are not stored; generated images auto-expire in 1 hour.

The "Art Transformation" category accepts any photo (people,
landscapes, objects), not only faces.
```

---

## 7. 스크린샷 요구사항 (Apple 필수)

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

## 8. 연령 등급 설문 참고
- 폭력/성적 콘텐츠: 없음
- 사용자 생성 콘텐츠: 있음 (사진 업로드) → 신고/차단 정책 명시 권장
- 결과: 보통 4+ 또는 12+

---

## 체크리스트 (등록 시)
- [ ] Apple Developer 가입 완료
- [ ] DUNS 번호 발급 (사업자 가입 시)
- [ ] App Store Connect 에서 앱 생성 (번들 ID: com.rimikimi.app)
- [ ] 이메일 로그인 추가 + 데모 계정 발급
- [ ] 스크린샷 캡처 (6.9" 최소)
- [ ] 위 메타데이터 입력
- [ ] Xcode 에서 Archive → Upload
- [ ] 심사 제출
