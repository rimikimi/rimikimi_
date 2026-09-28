#!/usr/bin/env node
// ============================================================
// Play 스토어 등록정보(텍스트 + 이미지) 반영 — Google Play Developer API
//
//   PLAY_SA_JSON=~/Downloads/xxx.json \
//   node scripts/play-listing.mjs [--copy store_assets/play-listing.json] [--dry]
//
// 하는 일: edit 하나 열어서
//   1. copy 파일의 locales 마다 listings/{lang} PUT (제목·짧은 설명·자세한 설명)
//   2. copy 파일의 images 마다 deleteall → 파일 순서대로 업로드
//   3. 결과를 다시 읽어 출력
//   --dry 면 edit 을 지운다(서버 검증까지는 거치므로 에러는 그대로 드러난다).
//   아니면 commit → 구글 검수(수 시간~수 일) 뒤 스토어에 반영.
//
// ⚠️ 트랙(릴리즈)은 절대 건드리지 않는다 — 심사 중인 릴리즈를 다시 제출하게 된다.
// ⚠️ commit 이 "changesNotSentForReview" 를 요구하며 실패하면 그대로 보고한다.
//    그 플래그를 켜면 초안으로만 남고 콘솔에서 사람이 눌러야 나간다.
// ============================================================

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname } from "node:path";

const PKG = "com.rimikimi.app";
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const DRY = argv.includes("--dry");
const COPY = arg("copy", "store_assets/play-listing.json");
const LIMITS = { title: 30, shortDescription: 80, fullDescription: 4000 };

const keyPath = (process.env.PLAY_SA_JSON || "").replace(/^~/, homedir());
if (!keyPath) { console.error("PLAY_SA_JSON 에 서비스 계정 JSON 경로가 필요합니다."); process.exit(1); }
const sa = JSON.parse(readFileSync(keyPath, "utf8"));
const copy = JSON.parse(readFileSync(COPY, "utf8"));

// 길이 검사 — 서버에 보내기 전에 여기서 막는다
for (const [lang, l] of Object.entries(copy.listings || {})) {
  for (const [k, max] of Object.entries(LIMITS)) {
    const n = [...(l[k] || "")].length;
    if (n > max) { console.error(`${lang}.${k} 가 ${n}자 — 최대 ${max}자`); process.exit(1); }
  }
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256"); signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("토큰 실패: " + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}
const TOKEN = await accessToken();
const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
const UPLOAD = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PKG}`;

async function api(method, url, { body, raw, contentType } = {}) {
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": contentType || "application/json" }, body: raw || (body ? JSON.stringify(body) : undefined) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url.replace(/^.*\/applications\/[^/]+/, "")} → ${r.status}\n  ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

const edit = await api("POST", `${BASE}/edits`);
console.log(`edit: ${edit.id}${DRY ? "  [dry]" : ""}`);
try {
  // 1) 텍스트
  for (const [lang, l] of Object.entries(copy.listings || {})) {
    await api("PUT", `${BASE}/edits/${edit.id}/listings/${lang}`, { body: { language: lang, title: l.title, shortDescription: l.shortDescription, fullDescription: l.fullDescription } });
    console.log(`listing ${lang}: 제목 ${[...l.title].length}자 · 짧은 ${[...l.shortDescription].length}자 · 자세한 ${[...l.fullDescription].length}자`);
  }
  // 2) 이미지
  for (const [lang, types] of Object.entries(copy.images || {})) {
    for (const [type, files] of Object.entries(types)) {
      await api("DELETE", `${BASE}/edits/${edit.id}/listings/${lang}/${type}`);
      for (const f of files) {
        const buf = readFileSync(f);
        const r = await api("POST", `${UPLOAD}/edits/${edit.id}/listings/${lang}/${type}?uploadType=media`, { raw: buf, contentType: MIME[extname(f).toLowerCase()] || "image/png" });
        console.log(`  ${lang}/${type} ← ${f.split("/").pop()} (${(buf.length / 1024).toFixed(0)}KB) sha1=${r.image?.sha1?.slice(0, 6)}`);
      }
    }
  }
  // 3) 다시 읽어서 확인
  const ls = await api("GET", `${BASE}/edits/${edit.id}/listings`);
  for (const l of ls.listings) {
    const counts = [];
    for (const type of ["phoneScreenshots", "featureGraphic", "icon"]) {
      const im = await api("GET", `${BASE}/edits/${edit.id}/listings/${l.language}/${type}`);
      counts.push(`${type}=${im?.images?.length || 0}`);
    }
    console.log(`확인 [${l.language}] "${l.title}" · ${counts.join(" ")}`);
  }
  if (DRY) {
    await api("DELETE", `${BASE}/edits/${edit.id}`);
    console.log("[dry] edit 취소 — 아무것도 반영되지 않았습니다.");
  } else {
    const done = await api("POST", `${BASE}/edits/${edit.id}:commit`);
    console.log(`commit 완료 (edit ${done.id}) → 구글 검수 뒤 스토어에 반영됩니다.`);
  }
} catch (e) {
  console.error(String(e.message || e));
  try { await api("DELETE", `${BASE}/edits/${edit.id}`); console.error("edit 취소함"); } catch {}
  process.exit(1);
}
