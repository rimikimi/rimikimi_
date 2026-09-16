#!/usr/bin/env node
// 시뮬레이터 E2E 용 세션 발급 — OAuth 를 못 하는 시뮬레이터에 딥링크로 세션을 넣는다.
//
//   node ios2/scripts/mint-session.mjs            → 표준출력에 딥링크 URL 한 줄만
//   xcrun simctl openurl <UDID> "$(node ios2/scripts/mint-session.mjs)"
//
// 비밀(.env.local 의 SUPABASE_SERVICE_ROLE_KEY)은 이 프로세스 안에서만 읽고 어디에도 찍지 않는다.
// 실행 위치는 저장소 루트(node_modules/@supabase/supabase-js 를 쓴다).

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const EMAIL = "ios2-e2e@rimikimi.test";
const REDIRECT = "com.rimikimi.app://login-callback";

function loadEnv() {
  const out = {};
  for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function die(msg) {
  process.stderr.write("mint-session: " + msg + "\n");
  process.exit(1);
}

const env = loadEnv();
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !service || !anon) die("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY 가 .env.local 에 없습니다");

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

// 1) 테스트 계정 — 없으면 생성(이메일 확인 완료 상태)
let userId = null;
{
  const { data: page, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) die("listUsers 실패: " + error.message);
  const found = page.users.find((u) => (u.email || "").toLowerCase() === EMAIL);
  if (found) {
    userId = found.id;
  } else {
    const { data, error: cErr } = await admin.auth.admin.createUser({
      email: EMAIL, email_confirm: true, user_metadata: { full_name: "iOS2 E2E" },
    });
    if (cErr) die("createUser 실패: " + cErr.message);
    userId = data.user.id;
  }
}

// 2) tester_emails 에 등록(하루 3장). 현재 서버는 env 만 읽어 vestigial 이지만 지시대로 넣어 둔다.
{
  const { error } = await admin.from("tester_emails").upsert({ email: EMAIL }, { onConflict: "email" });
  if (error) process.stderr.write("mint-session: tester_emails upsert 건너뜀 (" + error.message + ")\n");
}

// 3) magic link 발급 → hashed_token 을 verifyOtp 로 교환
const { data: link, error: lErr } = await admin.auth.admin.generateLink({
  type: "magiclink", email: EMAIL, options: { redirectTo: REDIRECT },
});
if (lErr) die("generateLink 실패: " + lErr.message);
const tokenHash = link?.properties?.hashed_token;
if (!tokenHash) die("hashed_token 없음");

const { data: v, error: vErr } = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
if (vErr) die("verifyOtp 실패: " + vErr.message);
const s = v?.session;
if (!s?.access_token) die("세션 없음");

// 4) 딥링크만 출력 (앱은 fragment 의 access_token/refresh_token 을 읽는다 — AuthStore.handleCallback)
const frag = new URLSearchParams({
  access_token: s.access_token,
  refresh_token: s.refresh_token || "",
  token_type: "bearer",
  expires_in: String(s.expires_in || 3600),
});
process.stdout.write(`${REDIRECT}#${frag.toString()}\n`);
