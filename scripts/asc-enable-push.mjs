#!/usr/bin/env node
// ============================================================
// App ID 에 Push Notifications 를 켜고 프로비저닝 프로파일을 재발급한다.
// (Apple Developer 웹 콘솔에서 클릭으로 하던 걸 App Store Connect API 로)
//
//   ASC_ISSUER_ID=<UUID> node scripts/asc-enable-push.mjs
//   ASC_ISSUER_ID=<UUID> node scripts/asc-enable-push.mjs --dry
//
// 왜 필요한가: aps-environment 엔타이틀먼트가 든 앱은 프로파일에도 같은
// 권한이 있어야 서명이 통과한다. App ID 에서 Push 를 켜면 기존 프로파일은
// 무효(INVALID)가 되므로 반드시 재발급해야 한다.
//
// 키: ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8  (커밋 금지)
// Issuer ID: App Store Connect → 사용자 및 액세스 → 통합 → App Store Connect API
// ============================================================

import { createSign } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BUNDLE_ID = "com.rimikimi.app";
// ⚠️ 기존 프로파일을 지우고 같은 이름으로 다시 만들지 않는다(애플이 이름 중복을
//    거부해서 반드시 "삭제 → 생성" 순서가 되는데, 그 사이에 생성이 실패하면
//    서명할 프로파일이 아예 없는 구간이 생긴다). 새 이름으로 하나 더 만들고
//    Xcode 설정을 그쪽으로 돌린다 — 실패해도 기존 것이 그대로 남아 안전하다.
const OLD_PROFILE_NAME = "rimikimi AppStore v3";
const PROFILE_NAME = "rimikimi AppStore v4";
const PROFILE_TYPE = "IOS_APP_STORE";
const DRY = process.argv.includes("--dry");

const ISSUER = process.env.ASC_ISSUER_ID;
if (!ISSUER) {
  console.error("ASC_ISSUER_ID 가 필요합니다 (App Store Connect → 사용자 및 액세스 → 통합).");
  process.exit(1);
}

// --- 키 찾기 ---
const KEYDIR = join(homedir(), ".appstoreconnect/private_keys");
const keyFile = readdirSync(KEYDIR).find((f) => /^AuthKey_.+\.p8$/.test(f));
if (!keyFile) {
  console.error(`${KEYDIR} 에 AuthKey_*.p8 이 없습니다.`);
  process.exit(1);
}
const KEY_ID = keyFile.replace(/^AuthKey_|\.p8$/g, "");
const privateKey = readFileSync(join(KEYDIR, keyFile), "utf8");

// --- JWT (ES256) ---
function b64url(buf) {
  return Buffer.from(buf).toString("base64")
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function token() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: KEY_ID, typ: "JWT" }));
  // ⚠️ scope 는 넣지 않는다. 넣는 순간 그 목록에 "정확히" 일치하는 요청만
  //    허용돼서(쿼리스트링까지 비교) 나머지가 전부 403 난다.
  const claims = b64url(JSON.stringify({
    iss: ISSUER, iat: now, exp: now + 900,
    aud: "appstoreconnect-v1",
  }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  // Apple 은 raw(r||s) 서명 요구 — DER 이면 401 이 난다
  const sig = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(sig)}`;
}

const JWT = token();
async function api(method, path, body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${JWT}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { /* 204 등 */ }
  if (!r.ok) {
    const detail = json?.errors?.map((e) => `${e.title}: ${e.detail}`).join(" / ") || text.slice(0, 300);
    throw new Error(`${method} ${path} → ${r.status}\n  ${detail}`);
  }
  return json;
}

// ── 1) App ID 찾기 ─────────────────────────────────────────
const bundles = await api("GET", `/v1/bundleIds?filter[identifier]=${BUNDLE_ID}&limit=200`);
const bundle = bundles.data.find((b) => b.attributes.identifier === BUNDLE_ID);
if (!bundle) throw new Error(`App ID ${BUNDLE_ID} 를 못 찾았습니다.`);
console.log(`App ID: ${BUNDLE_ID} (${bundle.id})`);

// ── 2) Push 켜져 있나 확인 ────────────────────────────────
// ⚠️ 이 관계 엔드포인트는 limit 파라미터를 거부한다(400).
const caps = await api("GET", `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`);
const hasPush = caps.data.some((c) => c.attributes?.capabilityType === "PUSH_NOTIFICATIONS");
console.log(`Push Notifications: ${hasPush ? "이미 켜져 있음" : "꺼져 있음 → 켠다"}`);

if (!hasPush) {
  if (DRY) {
    console.log("  [dry] POST /v1/bundleIdCapabilities 생략");
  } else {
    await api("POST", "/v1/bundleIdCapabilities", {
      data: {
        type: "bundleIdCapabilities",
        attributes: { capabilityType: "PUSH_NOTIFICATIONS" },
        relationships: { bundleId: { data: { type: "bundleIds", id: bundle.id } } },
      },
    });
    console.log("  → 켰습니다.");
  }
}

// ── 3) 프로파일 새로 발급 ─────────────────────────────────
// App ID 의 권한이 바뀌면 기존 프로파일은 INVALID 가 된다. 새 권한이 들어간
// 프로파일을 새 이름으로 하나 만든다.
const profiles = await api("GET", `/v1/profiles?limit=200&include=certificates`);
const old = profiles.data.filter((p) => p.attributes.name === OLD_PROFILE_NAME);
for (const p of old) {
  console.log(`기존 프로파일: ${p.attributes.name} [${p.attributes.profileState}] — 그대로 둔다`);
}
if (profiles.data.some((p) => p.attributes.name === PROFILE_NAME)) {
  console.error(`이미 "${PROFILE_NAME}" 이 있습니다. 이름을 올리거나 콘솔에서 지우세요.`);
  process.exit(1);
}

// 배포 인증서: 기존 프로파일이 쓰던 것을 그대로 이어 쓴다(새로 만들지 않는다 —
// 배포 인증서는 계정당 개수 제한이 있고, 새로 만들면 기존 빌드 파이프라인이 깨진다).
let certIds = [];
if (old.length) {
  const detail = await api("GET", `/v1/profiles/${old[0].id}/certificates`);
  certIds = detail.data.map((c) => c.id);
  console.log(`재사용할 배포 인증서: ${certIds.join(", ") || "(없음)"}`);
}
if (!certIds.length) {
  const certs = await api("GET", "/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=200");
  certIds = certs.data.map((c) => c.id);
  console.log(`배포 인증서 후보: ${certs.data.map((c) => `${c.attributes.name}(${c.id})`).join(", ")}`);
}
if (!certIds.length) throw new Error("배포 인증서를 못 찾았습니다.");

if (DRY) {
  console.log("[dry] 프로파일 삭제·생성 생략");
  process.exit(0);
}

const created = await api("POST", "/v1/profiles", {
  data: {
    type: "profiles",
    attributes: { name: PROFILE_NAME, profileType: PROFILE_TYPE },
    relationships: {
      bundleId: { data: { type: "bundleIds", id: bundle.id } },
      certificates: { data: certIds.map((id) => ({ type: "certificates", id })) },
    },
  },
});

const attrs = created.data.attributes;
console.log(`새 프로파일: ${attrs.name} [${attrs.profileState}] uuid=${attrs.uuid}`);

// 로컬에 설치 — Xcode/xcodebuild 가 UUID 로 찾는 위치
const dest = join(homedir(), "Library/MobileDevice/Provisioning Profiles", `${attrs.uuid}.mobileprovision`);
writeFileSync(dest, Buffer.from(attrs.profileContent, "base64"));
console.log(`설치: ${dest}`);
console.log(`\n남은 일: Xcode 프로젝트의 PROVISIONING_PROFILE_SPECIFIER 를`);
console.log(`  "${OLD_PROFILE_NAME}" → "${PROFILE_NAME}" 로 바꾸면 서명이 통과합니다.`);
