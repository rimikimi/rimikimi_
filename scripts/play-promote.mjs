#!/usr/bin/env node
// ============================================================
// 이미 업로드된 versionCode 를 다른 트랙으로 승격 (재업로드 없음)
//
//   PLAY_SA_JSON=~/Downloads/xxx.json \
//   node scripts/play-promote.mjs --from internal --to production --code 50 [--dry]
//
// play-upload.mjs 는 AAB 를 새로 올린다. versionCode 는 재사용이 불가능해서,
// 내부테스트에 이미 올린 빌드를 production 으로 보내려면 업로드 없이
// 트랙 배치만 바꿔야 한다 — 그게 이 스크립트다.
//
// ⚠️ --to production 은 그대로 심사 제출이다. 통과하면 전체 사용자에게 나간다.
// ============================================================

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";

const PKG = "com.rimikimi.app";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes("--dry");
const TO = arg("to", "production");
const CODE = arg("code");
const NOTES = arg("notes", "");
const FRACTION = arg("fraction"); // 지정하면 단계적 출시(0.0~1.0)

if (!CODE) { console.error("--code <versionCode> 가 필요합니다."); process.exit(1); }

const keyPath = (process.env.PLAY_SA_JSON || "").replace(/^~/, homedir());
if (!keyPath) { console.error("PLAY_SA_JSON 필요"); process.exit(1); }
const sa = JSON.parse(readFileSync(keyPath, "utf8"));
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const now = Math.floor(Date.now() / 1000);
const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claims = b64url(JSON.stringify({
  iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher",
  aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
}));
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${claims}`);
const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
const tr = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
});
const tj = await tr.json();
if (!tj.access_token) { console.error("토큰 실패:", JSON.stringify(tj).slice(0, 200)); process.exit(1); }

const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
async function api(method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${tj.access_token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}\n  ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

const edit = await api("POST", `${BASE}/edits`);
console.log(`edit: ${edit.id}`);

const release = {
  versionCodes: [String(CODE)],
  status: FRACTION ? "inProgress" : "completed",
  ...(FRACTION ? { userFraction: Number(FRACTION) } : {}),
  ...(NOTES ? { releaseNotes: [{ language: "ko-KR", text: NOTES }] } : {}),
};
await api("PUT", `${BASE}/edits/${edit.id}/tracks/${TO}`, { track: TO, releases: [release] });
console.log(`트랙 ${TO} 에 versionCode ${CODE} 배치${FRACTION ? ` (${FRACTION * 100}% 단계 출시)` : ""}`);

if (DRY) {
  await api("DELETE", `${BASE}/edits/${edit.id}`);
  console.log("[dry] edit 취소 — 아무것도 반영되지 않았습니다.");
  process.exit(0);
}
await api("POST", `${BASE}/edits/${edit.id}:commit`);
console.log(`commit 완료`);
console.log(TO === "production" ? "→ 심사 제출됨." : "→ 배치 완료.");
