# 사진 앱 4종 스토어 메타데이터 분리안 (2026-08-28)

배경: 리미키미 iOS 1.39가 4.3(a) 스팸(유사 앱)으로 반려. 같은 계정의 리미키미·브룩클린·클레어·조세핀이
증명사진·여권·이력서·링크드인·프사·커플·AI사진 키워드를 서로 겹쳐 쓰고 있어 "같은 앱 여러 개"로 보임.
원칙: **앱 하나 = 하는 일 하나**, 아래 단어는 정한 앱만 쓴다.

| 단어 | 주인 |
|---|---|
| 컨셉, 화보, 매일/드롭, 네컷/인생네컷, 필터, 커플, AI아트/유화/수채화, 아바타, 초상화 | 리미키미 |
| 증명사진, 여권/비자/반명함, 이력서/취업/면접, 링크드인, 헤드샷, 운전면허증/주민등록증, 규격, 정장합성 | 브룩클린 |
| 프사/프로필 사진, 소개팅/데이팅/미팅, 캔딧, 무보정, 골든아워, 포토덤프, SNS/인스타 | 클레어 |
| 웨딩, 웨딩화보/웨딩사진, 셀프웨딩, 드레스, 신부/신랑, 결혼준비, 웨딩홀/본식 | 조세핀 |

공통으로 빼는 것: "AI사진", "프로필"(리미키미·조세핀에서), "커플사진"(조세핀에서 — 리미키미 소유), "보정/셀카보정"(브룩클린·클레어 → 리미키미 필터 영역이지만 리미키미도 키워드로는 안 씀).

---

## 1. 리미키미 (com.rimikimi.app) — 적용 스크립트 `scripts/asc-meta-rimikimi.mjs`
역할: **매일 새 컨셉으로 만드는 AI 화보 + 네컷 + 커플 + 무료 필터**

| | 전 | 후 |
|---|---|---|
| 부제 ko | 증명사진부터 AI 프로필까지 | 매일 새 컨셉 · AI 화보 · 네컷 |
| 부제 en | From ID photos to AI profiles | New AI photo concepts daily |
| 키워드 ko | 리미키미,인생네컷,여권사진,AI사진,셀카,사진편집,아바타,초상화,링크드인,이력서,AI아트,유화,프로필,사진관,보정,스튜디오,단체사진 | 리미키미,컨셉,화보,AI화보,매일,드롭,네컷,인생네컷,커플,드레스룸,AI아트,유화,수채화,아바타,초상화,셀카,즉석사진 |
| 키워드 en | AI profile,headshot,passport photo,ID photo,selfie,avatar,portrait,linkedin,resume,ai art | rimikimi,ai photoshoot,concept,daily,photobooth,4 cut,couple,dressing room,ai art,portrait,selfie |
| 프로모 | (없음) | 매일 저녁 8시, 새 컨셉 4종이 도착해요. |
| 설명 | "증명사진 — 정장 색상과 배경 색상을 직접 골라…", 추천 대상 "증명사진·여권사진 / 링크드인·이력서" | 매일 새 컨셉(4종·알림·300+) / 인생네컷 / 커플 화보 / 드레스룸·즉석 사진 / 예술 변환(편집은 한 줄) / 안심 / 구독·EULA 문단은 기존 그대로 |
| 릴리즈 노트 | "무료 필터가 생겼어요 / 27 프리셋 / 날짜 스탬프 / 10장 일괄" (필터 앱처럼 읽힘 — 반려 방아쇠 추정) | 드레스룸 신기능(OOTD 미리보기: 상의·하의·아우터·신발·가방 사진 최대 5장 → 코디 입은 내 모습, "5벌" 아님) / 매일 새 컨셉 4종 / 알림 수정 / 즉석 사진 컨셉 / 클로즈업 각도 / 버그 수정·편집 도구 개선 |

**오너 지시(8/28): 필터는 키워드·프로모·릴리즈 노트에서 전부 제외, 설명엔 "앱 안에서 바로 다듬어 저장" 한 줄만.**

앱 안에서 같이 고쳐야 할 것 (다음 빌드 79):
- 홈의 Brooklyn "AD" 배너 + 증명사진 누르면 뜨는 "증명사진은 Brooklyn에서" 모달 제거 (`src/PortraitStudio.jsx` openBrooklyn/showBrooklyn/bkAd) — 심사관에게 "형제 앱" 을 직접 보여주는 요소.
- 컨셉 409(증명사진) 잔재: 이미 목록에서 제외됨. 그대로 두되 데이터에서도 hidden 처리 검토.
- 스토어 스크린샷 5장이 옛 UI(오늘 사용 0/2 등). 새 UI로 재촬영 시 "웨딩/브라이덜 27" 카테고리는 조세핀과 겹치니 첫 화면에 안 보이게.
- 업로드 화면 문구 "증명사진이나 셀카 한 장이면 충분해요" → "셀카 한 장이면 충분해요".

## 2. 브룩클린 (com.picbox.app) — 새 버전(1.0.30) 만들 때 적용
역할: **증명사진·여권·규격 + 비즈니스 헤드샷**

| | 전 | 후 |
|---|---|---|
| 부제 ko | 여권 운전면허증 취업사진까지 | (유지) |
| 부제 en | LinkedIn, resume & passport | ID, passport & pro headshots |
| 키워드 ko | 브루클린,브룩클린,여권사진,비자사진,반명함,이력서사진,취업사진,면접사진,뷰티프로필,배우프로필,오디션,링크드인,보정,프사,셀카보정,정장합성,헤어스타일,운전면허증,주민등록증 | 브루클린,브룩클린,증명사진,여권사진,비자사진,반명함,이력서사진,취업사진,면접사진,링크드인,헤드샷,운전면허증,주민등록증,정장합성,규격 |
| 키워드 en | passport,visa,cv,linkedin,corporate,interview,portrait,selfie,retouch,beauty,pfp,avatar,studio,job | passport,visa,id photo,headshot,cv,linkedin,corporate,interview,job,suit,license |
| 설명 | "3가지 스튜디오: 증명사진 / 전문가 프로필 / 배우 프로필(캐스팅·오디션용 시네마틱 룩북)" | 증명사진·헤드샷 중심으로. **"배우 프로필 — 시네마틱 룩북"은 리미키미 화보와 겹침 → 오너 결정**(스튜디오 유지 시 설명에서 "룩북/시네마틱" 표현만 빼고 "오디션 제출용 규격 프로필"로) |

뺀 단어: 뷰티프로필·배우프로필·오디션·보정·프사·셀카보정·헤어스타일 / portrait·selfie·retouch·beauty·pfp·avatar·studio

## 3. 클레어 (com.rimikimi.claire) — 새 버전(1.2.1) 만들 때 적용
역할: **소개팅·SNS용 무보정 캔딧 프사** (TPO 선택)

| | 전 | 후 |
|---|---|---|
| 부제 ko | 소개팅·이력서·SNS 프사 한 번에 | 소개팅·SNS 프사, 무보정 캔딧 |
| 부제 en | Candid headshots & dating pics | Candid dating & social pics |
| 키워드 ko | 프사,증명사진,취업사진,비즈니스,포트폴리오,셀카보정,AI사진,인물사진,스냅,보정,인생샷,데이팅,미팅,캔딧,무보정,골든아워,포토덤프 | 프사,프로필사진,소개팅,데이팅,미팅,캔딧,무보정,골든아워,포토덤프,SNS,인스타,셀카,자연스러운,인물사진 |
| 키워드 en | selfie,portrait,pfp,avatar,generator,picture,professional,resume,business,photoshoot,snap | dating,candid,pfp,profile picture,selfie,no filter,photo dump,golden hour,social,natural |
| 설명 | "· 이력서·취업 사진 — 깔끔하고 부담 없는 인상. 포트폴리오나 회사 프로필에" | 이 불릿을 "· 단톡방·인스타 프사 — 매일 보는 사람들에게 보여줄 오늘의 나" 로 교체. 나머지(TPO 2,400조합·캔딧·무보정) 유지 |

뺀 단어: 증명사진·취업사진·비즈니스·포트폴리오·셀카보정·보정·인생샷·스냅·AI사진 / resume·business·professional·portrait·avatar·photoshoot

## 4. 조세핀 (com.rimikimi.josephine) — 새 버전(1.0.37) 만들 때 적용
역할: **웨딩 화보 전용**

| | 전 | 후 |
|---|---|---|
| 부제 | 사진 한 장으로 웨딩 화보 / Wedding photobook from 1 photo | (유지) |
| 키워드 ko | 조세핀,웨딩,웨딩화보,웨딩사진,셀프웨딩,드레스,프로필사진,AI사진,신부,결혼준비,커플사진 | 조세핀,웨딩,웨딩화보,웨딩사진,셀프웨딩,드레스,신부,신랑,결혼준비,웨딩홀,본식,스드메 |
| 키워드 en | wedding,wedding shoot,ai wedding,self wedding,bridal,dress,ai photo,bride,groom,couple photo | wedding,wedding shoot,ai wedding,self wedding,bridal,dress,bride,groom,wedding hall,engagement |

뺀 단어: 프로필사진·AI사진·커플사진 / ai photo·couple photo

---

## 절차
1. 리미키미: `node scripts/asc-meta-rimikimi.mjs --dry` → 통과하면 `node scripts/asc-meta-rimikimi.mjs`. (반려된 1.39에 즉시 반영, 아직 라이브 아님 — 재제출 때 같이 나감)
2. 브룩클린·클레어·조세핀: 라이브 버전의 키워드·부제·설명은 잠겨 있어 **새 버전 + 새 빌드** 필요. 각 앱 다음 빌드 때 위 표대로. 프로모션 텍스트만은 즉시 수정 가능.
3. 리미키미 빌드 79: Brooklyn 배너·모달 제거 + 업로드 문구 수정 후 재제출. Resolution Center 답신에 "메타데이터·앱 내 상호 유도를 정리했고, 분석상 이 빌드는 심사 중 실행되지 않았다" 명시.
