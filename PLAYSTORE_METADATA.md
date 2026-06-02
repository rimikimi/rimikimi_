# Google Play 스토어 등록 메타데이터 초안 (rimikimi)

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
| **무료/유료** | 무료 (인앱 구매: 크레딧) |
| **카테고리** | 사진 (Photography) |

---

## 2. 간단한 설명 (Short description, 80자)
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

## 3. 자세한 설명 (Full description, 4000자)

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

🔒 Privacy First
· Your uploaded photo is never stored on our servers
· Generated images auto-delete after 1 hour
· Your personal data stays protected

Create your dream profile with rimikimi today!
```

---

## 4. 그래픽 자료 (Play 필수)

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

## 5. URL / 연락처

| 항목 | 값 |
|---|---|
| **개인정보처리방침** | https://rimikimi-app.vercel.app/privacy |
| **웹사이트** | https://rimikimi-app.vercel.app |
| **이메일** | (사장님 이메일) |
| **전화번호** | (선택) |

---

## 6. Play 콘솔 필수 설문 (App Store 보다 많음)

Play 는 등록 시 아래 설문을 채워야 함:

| 설문 | rimikimi 답변 가이드 |
|---|---|
| **콘텐츠 등급 (IARC)** | 설문 응답 → 보통 "전체이용가" 또는 "3+" |
| **타겟 연령층** | 18세 이상 (앱 특성상) 또는 13+ |
| **광고 포함 여부** | 현재 없음 → "아니요" (나중에 AdMob 넣으면 변경) |
| **데이터 보안 (Data safety)** | 사진 업로드: 수집하나 저장 안 함 명시 / 이메일·계정 정보 수집 |
| **앱 접근 권한** | 심사용 데모 계정 제공 (appreview@rimikimi.com) |
| **정부 앱 여부** | 아니요 |
| **금융 기능** | 인앱 결제(크레딧) 있음 |

### 데이터 보안 섹션 작성 가이드
- 수집 항목: 이메일 주소(계정), 사진(이미지 생성 입력)
- 사진: "처리 후 즉시 삭제, 서버 저장 안 함"
- 암호화: 전송 중 암호화됨 (HTTPS)
- 삭제 요청: 계정 삭제 시 데이터 삭제

---

## 7. 출시 트랙 전략 (권장)

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

## 8. 심사 메모 (테스터용 안내) — 영어
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
- [ ] 그래픽 자료 (아이콘512 / feature graphic / 스크린샷)
- [ ] 데이터 보안 설문 작성
- [ ] 콘텐츠 등급 설문
- [ ] 내부 테스트 → 비공개 → 프로덕션 순 출시
