// 2026-10-11 — 2.1 개편용 스토어 문안(원본 틀: asc-meta-rimikimi.mjs). `--validate` 는 ASC 조회 없이 길이·금지어만 검사.
// 리미키미 스토어 메타데이터를 "매일 새 컨셉 · AI 화보 · 네컷" 포지셔닝으로 교체한다.
// 2026-08-28 4.3(a) 반려 대응 — 증명사진/여권/링크드인/이력서 문구를 전부 빼고
// 브룩클린(증명사진)·클레어(프사)·조세핀(웨딩)과 겹치지 않게 분리.
// 편집 가능한 버전(REJECTED/PREPARE_FOR_SUBMISSION)의 ko/en-US 로컬라이제이션과
// 앱 부제(appInfoLocalization)만 바꾼다. 구독 안내·EULA·개인정보 문단은 기존 것을 그대로 보존.
//
//   node scripts/asc-meta-rimikimi.mjs --dry   # 길이·잔존단어 검증만
//   node scripts/asc-meta-rimikimi.mjs         # 적용 + 재조회
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY_ID = "3KXPZAL47V", ISSUER = "257d4dcf-3cfc-482b-8df3-b038f7c50485", APP = "6782776518";
const DRY = process.argv.includes("--dry");
const VALIDATE = process.argv.includes("--validate"); // ASC 조회 없이 문구 검증만

const key = readFileSync("/Users/home/.appstoreconnect/private_keys/AuthKey_3KXPZAL47V.p8", "utf8");
const b = (x) => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const h = b(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
const c = b(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 900, aud: "appstoreconnect-v1" }));
const sg = createSign("SHA256"); sg.update(`${h}.${c}`); sg.end();
const JWT = `${h}.${c}.${b(sg.sign({ key, dsaEncoding: "ieee-p1363" }))}`;
const H = { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" };

async function api(m, p, body) {
  const r = await fetch("https://api.appstoreconnect.apple.com" + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch {}
  if (!r.ok) throw new Error(`${m} ${p} → ${r.status} ${JSON.stringify(j?.errors || t.slice(0, 200))}`);
  return j;
}

// ── 편집 가능한 버전 + 로컬라이제이션 ID 조회 ──
let ver, verLoc = [], infoLoc = [], cur;
if (!VALIDATE) {
const EDITABLE = ["REJECTED", "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];
const vers = await api("GET", `/v1/apps/${APP}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appVersionState`);
ver = vers.data.find((v) => EDITABLE.includes(v.attributes.appVersionState));
if (!ver) { console.error("편집 가능한 버전이 없습니다:", vers.data.map((v) => `${v.attributes.versionString}:${v.attributes.appVersionState}`).join(", ")); process.exit(1); }
const vlRes = await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,description`);
verLoc = vlRes.data.map((x) => ({ id: x.id, ...x.attributes }));
// appInfo 는 라이브(READY_FOR_DISTRIBUTION, 잠김)와 편집본 두 개가 공존 — 편집 가능한 쪽의 로컬라이제이션만 쓴다
const infos = await api("GET", `/v1/apps/${APP}/appInfos?fields[appInfos]=state`);
const editableInfo = infos.data.find((i) => i.attributes.state !== "READY_FOR_DISTRIBUTION") || null;
if (!editableInfo) { console.error("편집 가능한 appInfo 가 없습니다:", infos.data.map((i) => i.attributes.state).join(", ")); process.exit(1); }
console.log(`appInfo: ${editableInfo.id} (${editableInfo.attributes.state})`);
const ilRes = await api("GET", `/v1/appInfos/${editableInfo.id}/appInfoLocalizations?fields[appInfoLocalizations]=locale,subtitle`);
infoLoc = ilRes.data.map((x) => ({ id: x.id, ...x.attributes }));
cur = Object.fromEntries(verLoc.map((l) => [l.locale, l]));
console.log(`대상: ${ver.attributes.versionString} (${ver.attributes.appVersionState}) · 로케일 ${verLoc.map((l) => l.locale).join(", ")}`);

// 기존 설명의 구독/EULA 문단은 그대로 보존 (3.1.2 통과 문안)
}
// 2026-10-11: rimikimi+ 구독 판매 중단 → 구독 문단 대신 결제(크레딧) 안내 문단.
const tailKo = `― 결제 안내 ―
AI 사진 만들기는 크레딧으로 이용해요. 크레딧 팩은 App Store 계정으로 결제되는 일회성 구매이며 자동 갱신되지 않아요.
이용약관: https://rimikimi-app.vercel.app/terms
개인정보처리방침: https://rimikimi-app.vercel.app/privacy`;
const tailEn = `— Purchases —
AI photos use credits. Credit packs are one-time purchases billed to your App Store account; nothing renews automatically.
Terms of Use: https://rimikimi-app.vercel.app/terms
Privacy Policy: https://rimikimi-app.vercel.app/privacy`;

const NEW = {
  ko: {
    subtitle: "AI 화보 · 감성 카메라 · 드레스룸",
    keywords: "리미키미,컨셉,화보,AI화보,프로필사진,프사,커플,드레스룸,감성카메라,필름카메라,폰카,사진복원,옛날사진,보정,셀카,네컷",
    promotionalText: "새로워진 홈 — 필요한 사진을 고르면 어울리는 컨셉이 바로 모여요. 감성 카메라도 새로 생겼어요.",
    whatsNew: `리미키미, 다시 태어났어요.

• 셀카 한 장이면 다 돼요. 프로필, 프사, 커플, 드레스룸 — 홈에서 고르는 순간 끝
• 감성 카메라 등장 — 필름 · 폰카 감성 38가지, 보면서 찍고 바로 저장
• 옷 사진 한 장이면 입어본 내 모습이 바로 — 드레스룸
• "뒤에 사람 지워줘" 한 마디면 끝 — 말로 고치기
• 컨셉 580가지. 매일 저녁 4종 더. 담아서 8장 한 번에
• 20년 전 사진이 오늘 찍은 것처럼 — 사진 복원
• 디자인 싹 갈아엎었어요. 더 빠르고, 더 예쁘게`,
    description: `rimikimi - 셀카 한 장으로 만드는 AI 화보

셀카 한 장만 올리면 AI가 내 얼굴 특징을 살려 원하는 컨셉의 사진을 만들어 드려요. 새로워진 홈에서 오늘 필요한 사진을 고르면, 어울리는 컨셉이 바로 모여요.

새로워진 홈
· 프로필 · 프사 · 커플 · 드레스룸 — 필요한 사진부터 고르세요
· 추천 · 새로 나온 컨셉은 옆으로 넘겨 보고, 컨셉 앨범은 아래로 쭉
· 세계여행 · 스튜디오 · 시즌 · 영화 무드 등 500가지가 넘는 컨셉, 매일 저녁 8시 새 컨셉 4종

한 번에 여러 장
· 마음에 드는 컨셉을 담아 두고 최대 8장을 한 번에 만들어요
· 완성되는 대로 내 사진에서 확인하고 바로 저장

프로필 사진, 스튜디오 간 것처럼
· 취업 · 전문가 · 배우 프로필 룩을 셀카 한 장으로

드레스룸 — 이 옷, 나한테 어울릴까?
· 상의 · 하의 · 아우터 · 신발 · 가방 사진을 최대 5장 올리면 그 코디를 입은 내 모습을 보여 드려요
· 쇼핑몰 캡처도, 옷장 사진도 좋아요 · 거울셀카 / 모델컷

감성 카메라
· 필름 · 폰카 · 카메라 감성 38가지 룩을 보면서 바로 찍어요
· 찍은 사진은 바로 다듬어 저장해요

말로 고치기 · 옛날 사진 복원
· “뒤에 지나가는 사람 지워줘” 한 줄이면 그 부분만 고쳐요
· 바래거나 상한 옛날 사진을 선명하게 되살려요

커플 화보 · 인생네컷
· 두 사람의 사진으로 한 장의 커플 컨셉 화보를
· 컨셉을 고르면 2~8분할 네컷을 한 장으로

안심하세요
· 업로드한 사진은 서버에 저장되지 않아요
· 생성된 이미지는 1시간만 보관 후 자동 삭제
· 개인정보는 안전하게 보호됩니다

지금 rimikimi로 오늘 필요한 사진을 만들어 보세요!

` + tailKo,
  },
  "en-US": {
    subtitle: "AI photoshoot · mood camera",
    keywords: "rimikimi,ai photoshoot,concept,profile photo,couple,dressing room,mood camera,film,restore,selfie",
    promotionalText: "A new Home — pick the photo you need and matching concepts gather right away. Plus a brand-new mood camera.",
    whatsNew: `rimikimi, reborn.

• One selfie does it all — profile, social, couple, dressing room, picked right on Home
• The mood camera is here — 38 film and retro-phone looks, live as you shoot, saved in a tap
• One photo of the clothes and you're wearing them — Dressing Room
• "Remove the person behind me." Done. — Fix it in words
• 580 concepts, 4 more every evening — pick 8 and make them all at once
• A 20-year-old photo, back like it was shot today — Restore
• Redesigned from the ground up. Faster. Prettier.`,
    description: `rimikimi — an AI photoshoot from one selfie

Upload one selfie and rimikimi turns it into the photo you need, keeping your face clearly recognizable. On the new Home, pick what you need today and matching concepts gather right away.

A new Home
· Profile, social, couple, dressing room — start from the photo you need
· Swipe through featured and new concepts; concept albums continue below
· 500+ concepts — travel, studio, seasons, film moods — and 4 new ones every evening

Several at once
· Pick the concepts you like and make up to 8 photos in one go
· Find each one in My Photos as it finishes and save it right there

Profile shots that look studio-made
· Business, professional and actor looks from a single selfie

Dressing Room — will this look good on me?
· Upload photos of a top, bottoms, outerwear, shoes or a bag (up to 5) and preview the whole outfit on you
· Store screenshots and closet photos both work · mirror selfie or model shot

Mood camera
· 38 film, retro-phone and camera looks, live as you shoot
· Touch up and save right away

Fix it in words · old-photo restoration
· “Remove the person behind me” — one line and only that part changes
· Bring faded or damaged old photos back, sharp and clean

Couple shoots · photo booth strips
· Two people, two photos, one couple concept shot
· Pick a concept and get a 2–8 frame strip as one image

Privacy first
· Your uploaded photo is never stored on our servers
· Generated images are automatically deleted after 1 hour
· Your personal data stays protected

Make the photo you need today with rimikimi!

` + tailEn,
  },
};

// ── 검증: 길이 제한 + 형제앱 영역 단어 잔존 ──
const LIM = { subtitle: 30, keywords: 100, promotionalText: 170, description: 4000, whatsNew: 4000 };
const BANNED = ["증명", "여권", "링크드인", "이력서", "ID photo", "passport", "LinkedIn", "resume", "headshot", "웨딩", "wedding", "소개팅", "dating", "필터", "filter", "프리셋", "preset"];
let bad = 0;
for (const [loc, v] of Object.entries(NEW)) {
  for (const [k, lim] of Object.entries(LIM)) { const n = [...v[k]].length; if (n > lim) bad++; console.log(`${n <= lim ? "ok  " : "OVER"} ${loc} ${k} ${n}/${lim}`); }
  for (const w of BANNED) if ([v.subtitle, v.keywords, v.promotionalText, v.description, v.whatsNew].some((s) => s.includes(w))) { console.log("잔존 단어:", loc, w); bad++; }
}
if (bad) { console.log("검증 실패 — 중단"); process.exit(1); }
if (DRY || VALIDATE) { console.log(VALIDATE ? "VALIDATE — 문구 검증만" : "DRY — 적용 안 함"); process.exit(0); }

// ── 적용 ──
for (const [loc, v] of Object.entries(NEW)) {
  const vl = verLoc.find((l) => l.locale === loc); const al = infoLoc.find((l) => l.locale === loc);
  if (!vl || !al) { console.error("로케일 없음:", loc); process.exit(1); }
  await api("PATCH", `/v1/appStoreVersionLocalizations/${vl.id}`, { data: { type: "appStoreVersionLocalizations", id: vl.id, attributes: { keywords: v.keywords, description: v.description, promotionalText: v.promotionalText, whatsNew: v.whatsNew } } });
  await api("PATCH", `/v1/appInfoLocalizations/${al.id}`, { data: { type: "appInfoLocalizations", id: al.id, attributes: { subtitle: v.subtitle } } });
  console.log("적용:", loc);
}

// ── 재조회로 확인 ──
const chk = await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,keywords,promotionalText,description,whatsNew`);
for (const l of chk.data) console.log(`[${l.attributes.locale}] 키워드: ${l.attributes.keywords}\n  프로모: ${l.attributes.promotionalText}\n  설명 첫줄: ${l.attributes.description.split("\n")[0]}\n  릴리즈노트:\n${l.attributes.whatsNew}`);
const ai = await api("GET", `/v1/apps/${APP}/appInfos?include=appInfoLocalizations&fields[appInfoLocalizations]=locale,subtitle`);
for (const l of ai.included || []) console.log(`[${l.attributes.locale}] 부제: ${l.attributes.subtitle}`);
