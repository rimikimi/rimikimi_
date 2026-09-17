#!/usr/bin/env node
// ============================================================
// Play 스토어에 AAB 업로드 (Google Play Developer API)
//
//   PLAY_SA_JSON=~/Downloads/rimikimi-....json \
//   node scripts/play-upload.mjs --track production --notes "..." [--dry]
//
// track: production | internal | alpha | beta  (기본 internal — 실수로 전체
//        공개되는 걸 막으려고 안전한 쪽을 기본값으로 둔다)
//
// ⚠️ production 으로 commit 하면 그대로 심사 제출된다. 통과하면 전체 사용자에게
//    나간다. internal 은 등록된 테스터만 받고 심사가 없다(10~15분 뒤 설치 가능).
// ⚠️ versionCode 는 한 번 쓰면 재사용 불가 — 올려야 한다.
// ============================================================

import { createSign } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

const PKG = "com.rimikimi.app";
const AAB = "android/app/build/outputs/bundle/release/app-release.aab";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const DRY = argv.includes("--dry");
const TRACK = arg("track", "internal");
const NOTES = arg("notes", "");

const keyPath = (process.env.PLAY_SA_JSON || "").replace(/^~/, homedir());
if (!keyPath) {
  console.error("PLAY_SA_JSON 에 서비스 계정 JSON 경로가 필요합니다.");
  process.exit(1);
}
const sa = JSON.parse(readFileSync(keyPath, "utf8"));

const b64url = (b) => Buffer.from(b).toString("base64")
  .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt,
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("토큰 실패: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

const TOKEN = await accessToken();
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;

async function api(method, url, { body, raw, contentType } = {}) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": contentType || "application/json",
    },
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}\n  ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const aabSize = statSync(AAB).size;   // 본문은 curl 이 직접 읽는다(77MB 를 메모리에 올리지 않는다)
console.log(`AAB: ${AAB} (${(aabSize / 1048576).toFixed(1)}MB)`);
console.log(`트랙: ${TRACK}${DRY ? "  [dry]" : ""}`);

const edit = await api("POST", `${BASE}/edits`);
console.log(`edit: ${edit.id}`);

// ⚠️ AAB 업로드만 curl 로 한다 (2026-09-18).
//    fetch(node 내장 undici)는 응답 헤더를 5분 안에 못 받으면 UND_ERR_HEADERS_TIMEOUT 으로
//    끊는다. 2.0 AAB 는 77MB 라 업로드에 그보다 오래 걸려 매번 여기서 죽었다.
//    undici 의 Agent 는 node 에서 import 할 수 없으므로 curl 로 우회한다(타임아웃 없음).
function uploadBundle(editId) {
  const url = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/bundles?uploadType=media`;
  const r = spawnSync("curl", [
    "-sS", "--fail-with-body", "--max-time", "3600", "--progress-bar",
    "-X", "POST", url,
    "-H", `Authorization: Bearer ${TOKEN}`,
    "-H", "Content-Type: application/octet-stream",
    "--data-binary", `@${AAB}`,
  ], { encoding: "utf8", maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "inherit"] });
  if (r.status !== 0) throw new Error(`AAB 업로드 실패 (curl ${r.status})\n  ${(r.stdout || "").slice(0, 400)}`);
  return JSON.parse(r.stdout);
}

const uploaded = uploadBundle(edit.id);
console.log(`업로드됨: versionCode ${uploaded.versionCode}`);

await api("PUT", `${BASE}/edits/${edit.id}/tracks/${TRACK}`, {
  body: {
    track: TRACK,
    releases: [{
      versionCodes: [String(uploaded.versionCode)],
      status: "completed",
      ...(NOTES ? { releaseNotes: [{ language: "ko-KR", text: NOTES }] } : {}),
    }],
  },
});
console.log(`트랙 ${TRACK} 에 배치 완료`);

if (DRY) {
  await api("DELETE", `${BASE}/edits/${edit.id}`);
  console.log("[dry] edit 취소 — 아무것도 반영되지 않았습니다.");
  process.exit(0);
}

const done = await api("POST", `${BASE}/edits/${edit.id}:commit`);
console.log(`commit 완료 (edit ${done.id})`);
console.log(TRACK === "production"
  ? "→ 심사 제출됨. 통과하면 전체 사용자에게 나갑니다."
  : "→ 10~15분 뒤 테스터가 설치할 수 있습니다.");
