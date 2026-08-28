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
const EDITABLE = ["REJECTED", "PREPARE_FOR_SUBMISSION", "DEVELOPER_REJECTED", "METADATA_REJECTED", "INVALID_BINARY"];
const vers = await api("GET", `/v1/apps/${APP}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appVersionState`);
const ver = vers.data.find((v) => EDITABLE.includes(v.attributes.appVersionState));
if (!ver) { console.error("편집 가능한 버전이 없습니다:", vers.data.map((v) => `${v.attributes.versionString}:${v.attributes.appVersionState}`).join(", ")); process.exit(1); }
const vlRes = await api("GET", `/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,description`);
const verLoc = vlRes.data.map((x) => ({ id: x.id, ...x.attributes }));
// appInfo 는 라이브(READY_FOR_DISTRIBUTION, 잠김)와 편집본 두 개가 공존 — 편집 가능한 쪽의 로컬라이제이션만 쓴다
const infos = await api("GET", `/v1/apps/${APP}/appInfos?fields[appInfos]=state`);
const editableInfo = infos.data.find((i) => i.attributes.state !== "READY_FOR_DISTRIBUTION") || null;
if (!editableInfo) { console.error("편집 가능한 appInfo 가 없습니다:", infos.data.map((i) => i.attributes.state).join(", ")); process.exit(1); }
console.log(`appInfo: ${editableInfo.id} (${editableInfo.attributes.state})`);
const ilRes = await api("GET", `/v1/appInfos/${editableInfo.id}/appInfoLocalizations?fields[appInfoLocalizations]=locale,subtitle`);
const infoLoc = ilRes.data.map((x) => ({ id: x.id, ...x.attributes }));
const cur = Object.fromEntries(verLoc.map((l) => [l.locale, l]));
console.log(`대상: ${ver.attributes.versionString} (${ver.attributes.appVersionState}) · 로케일 ${verLoc.map((l) => l.locale).join(", ")}`);

// 기존 설명의 구독/EULA 문단은 그대로 보존 (3.1.2 통과 문안)
const tailKo = cur.ko.description.slice(cur.ko.description.indexOf("― 구독 안내 ―"));
const tailEn = cur["en-US"].description.slice(cur["en-US"].description.indexOf("— Subscription Info —"));
if (!tailKo.startsWith("―") || !tailEn.startsWith("—")) { console.error("구독 문단을 못 찾았습니다 — 중단"); process.exit(1); }

const NEW = {
  ko: {
    subtitle: "매일 새 컨셉 · AI 화보 · 네컷",
    keywords: "리미키미,컨셉,화보,AI화보,매일,드롭,네컷,인생네컷,커플,드레스룸,AI아트,유화,수채화,아바타,초상화,셀카,즉석사진",
    promotionalText: "매일 저녁 8시, 새 컨셉 4종이 도착해요.",
    whatsNew: `새 기능 드레스룸 — 이 옷, 나한테 어울릴까? 상의·하의·아우터·신발·가방 사진을 최대 5장 올리면 그 코디를 입은 내 모습을 미리 볼 수 있어요. 쇼핑몰 캡처도 OK, 거울셀카·모델컷 선택.

• 새 컨셉 추가 — 매일 저녁 8시 새 컨셉 4종이 도착해요
• 새 컨셉 알림이 제시간에 오도록 수정
• 매직 부스에 즉석 사진 컨셉 추가
• 클로즈업 컨셉의 얼굴 각도가 더 자연스러워졌어요
• 갤러리 저장 오류 등 버그 수정, 편집 도구 개선`,
    description: `rimikimi - 매일 새로운 컨셉으로 만드는 AI 화보

셀카 한 장만 올리면, AI가 내 얼굴 특징을 살려 그날의 컨셉으로 화보를 만들어드려요. 컨셉은 매일 저녁 8시에 새로 4종씩 도착합니다.

매일 새 컨셉
· 하루 4종, 알림으로 받아보세요
· 시즌·시대·여행·영화 무드 등 300가지가 넘는 컨셉이 쌓여 있어요
· 놓친 컨셉도 언제든 다시 골라 만들 수 있어요

인생네컷
· 컨셉을 고르면 2~8분할 네컷을 한 장으로 완성
· 프레임 스타일 5종

커플 화보
· 두 사람의 사진으로 한 장의 커플 컨셉 화보를

드레스룸 — 이 옷, 나한테 어울릴까?
· 상의·하의·아우터·신발·가방 사진을 최대 5장 올리면 그 코디를 입은 내 모습을 보여드려요
· 쇼핑몰 캡처도, 옷장 사진도 좋아요 · 거울셀카 / 모델컷
· 매직 부스에서 즉석 사진 등 특별 컨셉도

예술적인 변환
· 유화·수채화·색연필·클레이 등
· 만든 사진은 앱 안에서 바로 다듬어 저장할 수 있어요

안심하세요
· 업로드한 사진은 서버에 저장되지 않아요
· 생성된 이미지는 1시간만 보관 후 자동 삭제
· 개인정보는 안전하게 보호됩니다

지금 rimikimi로 오늘의 컨셉을 만들어보세요!

` + tailKo,
  },
  "en-US": {
    subtitle: "New AI photo concepts daily",
    keywords: "rimikimi,ai photoshoot,concept,daily,photobooth,4 cut,couple,dressing room,ai art,portrait,selfie",
    promotionalText: "4 new concepts land every evening.",
    whatsNew: `New: Dressing Room — will this look good on me? Upload photos of a top, bottoms, outerwear, shoes or a bag (up to 5) and preview the whole outfit on you. Store screenshots work too. Mirror selfie or model shot.

• New concepts — 4 arrive every evening
• Concept-drop notifications now arrive on time
• Instant-photo concept added to Magic Booth
• More natural head angles in close-up concepts
• Gallery save fix and other bug fixes, editing tool improvements`,
    description: `rimikimi — an AI photoshoot with a new concept every day

Upload one selfie and rimikimi turns it into a photoshoot in today's concept, keeping your face clearly recognizable. Four new concepts arrive every evening.

New concepts every day
· 4 a day, delivered with a notification
· 300+ concepts and counting — seasons, eras, travel, film moods
· Missed one? Every past concept stays available

Photo booth strips
· Pick a concept and get a 2–8 frame strip as one image
· 5 frame styles

Couple shoots
· Two people, two photos, one couple concept shot

Dressing Room — will this look good on me?
· Upload photos of a top, bottoms, outerwear, shoes or a bag (up to 5) and preview the whole outfit on you
· Store screenshots and closet photos both work · mirror selfie or model shot
· Magic Booth adds special concepts like instant photos

Artistic transformations
· Oil painting, watercolor, color pencil, clay and more
· Touch up and save your results right in the app

Privacy first
· Your uploaded photo is never stored on our servers
· Generated images are automatically deleted after 1 hour
· Your personal data stays protected

Make today's concept with rimikimi!

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
if (DRY) { console.log("DRY — 적용 안 함"); process.exit(0); }

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
