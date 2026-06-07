// ============================================================
// Apple "Sign in with Apple" 클라이언트 시크릿(JWT) 생성기
//
// 왜 필요한가:
//   Supabase Apple 로그인은 Apple이 발급한 .p8 키로 서명한
//   짧은 수명의 JWT(=client secret)를 필요로 한다.
//   Apple 규정상 이 JWT의 최대 수명은 6개월. 만료되면 Apple
//   로그인이 끊기므로 주기적으로 재발급해야 한다.
//
// 사용법:
//   node scripts/gen_apple_secret.mjs
//   → 새 JWT와 만료일(KST)을 출력한다.
//   출력된 JWT를 Supabase 대시보드
//   (Authentication → Providers → Apple → Secret Key) 에 붙여넣으면 끝.
//
// 비밀키(.p8)는 keystore/ 안에 있고 .gitignore 로 깃에 안 올라간다.
// ============================================================

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- 고정 값 (Apple Developer 콘솔에서 가져온 값) ---
const TEAM_ID = "K6U5MWKT85";              // iss
const KEY_ID = "W3Z37VQNAF";               // kid (.p8 파일 이름과 동일)
const SERVICES_ID = "com.rimikimi.signin"; // sub (Services ID = Apple 로그인용)
const P8_PATH = join(__dirname, "..", "keystore", `AuthKey_${KEY_ID}.p8`);

// 수명: 180일 (Apple 최대 6개월 한도 안쪽으로 안전하게)
const LIFETIME_SEC = 180 * 24 * 60 * 60;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const privateKey = readFileSync(P8_PATH, "utf8");

const now = Math.floor(Date.now() / 1000);
const exp = now + LIFETIME_SEC;

const header = { alg: "ES256", kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp,
  aud: "https://appleid.apple.com",
  sub: SERVICES_ID,
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;

// Apple은 raw(r||s, IEEE P1363) 서명을 요구 (DER 아님)
const signer = createSign("SHA256");
signer.update(signingInput);
signer.end();
const signature = signer.sign({ key: privateKey, dsaEncoding: "ieee-p1363" });

const jwt = `${signingInput}.${b64url(signature)}`;

const expDate = new Date(exp * 1000);
const kst = new Date(expDate.getTime() + 9 * 3600 * 1000)
  .toISOString()
  .replace("T", " ")
  .slice(0, 16);

console.log("\n=== Apple client secret (JWT) ===\n");
console.log(jwt);
console.log("\n=== 만료일 ===");
console.log(`UTC: ${expDate.toISOString()}`);
console.log(`KST: ${kst} (한국시간)`);
console.log("\n붙여넣을 곳: Supabase → Authentication → Providers → Apple → Secret Key\n");
