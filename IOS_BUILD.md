# iOS 빌드 / App Store 제출 가이드

이 문서는 사장님이 Mac에서 직접 Xcode를 열고 시뮬레이터로 테스트하거나
App Store Connect 에 업로드할 때 따라가시는 절차입니다.

---

## 0. 준비물 한 번만

- Mac (Apple Silicon 또는 Intel 모두 OK)
- **Xcode** (App Store에서 무료 설치, 약 7~10GB)
- 애플 개발자 프로그램 가입 + 인증서 (별도 진행 중)
- CocoaPods — 한 번만 설치:
  ```bash
  sudo gem install cocoapods
  ```

---

## 1. 코드 → iOS 동기화 (코드 바꿀 때마다)

```bash
cd ~/Documents/rimikimi_app
npm run build && npx cap sync ios
```

---

## 2. Xcode 로 열기

```bash
npx cap open ios
```

→ Xcode 가 자동으로 열림. 첫 실행 시 CocoaPods가 의존성 다운로드 (수 분).

---

## 3. 시뮬레이터 테스트

1. Xcode 상단 좌측에서 **시뮬레이터 선택** (예: "iPhone 15 Pro")
2. **▶ (Run)** 버튼 또는 `Cmd + R`
3. 시뮬레이터가 뜨면서 rimikimi 앱이 실행됨
4. 로그인 → 컨셉 선택 → 사진 업로드 → 생성 흐름 다 동작해야 함

### 확인할 것
- [ ] 스플래시 화면에 베이지 배경 + 네잎클로버 하트 아이콘
- [ ] "사진 변경" 누르면 → iOS 네이티브 시트 ("카메라 / 앨범" 선택)
- [ ] 카카오/네이버/구글 로그인
- [ ] 결과 이미지 저장 / 공유

---

## 4. 실제 기기 테스트 (iPhone)

1. iPhone을 Mac에 케이블로 연결
2. iPhone에서 신뢰 묻는 알림 → "신뢰"
3. Xcode → **Signing & Capabilities**:
   - **Team**: 사장님 Apple Developer Team 선택
   - **Bundle Identifier**: `com.rimikimi.app` (이미 설정됨)
4. 시뮬레이터 선택 칸에서 **사장님 iPhone** 선택
5. **▶ Run**
6. iPhone에서 첫 실행 시 "신뢰할 수 없는 개발자" → 설정 → 일반 → VPN 및 기기 관리 → 신뢰

---

## 5. App Store 제출용 빌드 만들기

### 5-1. Bundle Identifier / Version 확인
Xcode → 프로젝트 루트 (좌측 상단 "App" 클릭) → **General** 탭
- **Display Name**: `rimikimi`
- **Bundle Identifier**: `com.rimikimi.app`
- **Version**: `1.0.0` (앱스토어 표시)
- **Build**: `1` (제출할 때마다 올림)

### 5-2. Signing
**Signing & Capabilities** 탭
- **Automatically manage signing**: ✓
- **Team**: 사장님 Team (개발자 가입 후 자동 표시됨)

### 5-3. Archive 만들기
1. 시뮬레이터 선택 칸을 **"Any iOS Device (arm64)"** 로 변경
2. 상단 메뉴 **Product → Archive**
3. 빌드 진행 (수 분)
4. 끝나면 **Organizer 창**이 자동으로 뜸

### 5-4. App Store Connect 업로드
1. Organizer에서 방금 만든 아카이브 선택
2. **Distribute App** → **App Store Connect** → **Upload**
3. 자동 서명/심사 옵션은 기본값으로
4. 업로드 완료 (5~15분)

---

## 6. App Store Connect 에서 메타 입력

https://appstoreconnect.apple.com → My Apps → rimikimi

| 항목 | 값 |
|---|---|
| 이름 (App Name) | `rimikimi - AI 인생 프로필` |
| 부제 (Subtitle) | `내 얼굴로 만드는 포트레이트` |
| 카테고리 | Photo & Video (Primary), Lifestyle (Secondary) |
| 등급 | 17+ (AI 사진 생성, 일부 18+ 컨셉 포함) |
| 개인정보 처리방침 URL | https://rimikimi-app.vercel.app/privacy |
| 지원 URL | https://rimikimi-app.vercel.app |
| 키워드 | AI, 포트레이트, 프로필, 셀카, 화보, 인생사진 |
| 스크린샷 | iPhone 6.7" 최소 3장 (1290×2796 권장) |
| 심사용 테스트 계정 | (사장님 테스터 이메일 중 1개 + 로그인 안내) |

---

## 7. 자주 발생하는 거부 사유 + 대응

| 거부 사유 | 대응 |
|---|---|
| "단순 웹 뷰" | 카메라/사진 네이티브 사용함을 심사 메모에 명시 ✓ 이미 구현됨 |
| 개인정보 처리방침 없음 | `/privacy` 페이지 등록 ✓ 이미 호스팅됨 |
| 권한 설명 부족 | NSCameraUsageDescription 등 한글 설명 ✓ 이미 추가됨 |
| 테스트 계정 미제공 | 심사 메모에 테스터 계정 1개 적기 |

---

## 8. 코드 한 줄 바꿨을 때 새 버전 올리는 흐름

```bash
# 1. 코드 수정
# 2. Build 번호 올리기 (Xcode → General → Build: 1 → 2)
# 3. 빌드 + 동기화
npm run build && npx cap sync ios
# 4. Xcode → Product → Archive → Upload
# 5. App Store Connect 에서 새 빌드 선택 → 심사 제출
```

---

## 9. 막혔을 때

대부분의 문제는 두 가지 명령으로 해결됩니다:

```bash
# CocoaPods 재설치
cd ios/App && pod install --repo-update && cd ../..

# 캐시 다 비우고 동기화
rm -rf ios/App/Pods ios/App/Podfile.lock
npx cap sync ios
```

그래도 안 되면 에러 메시지 캡처해서 알려주세요.
