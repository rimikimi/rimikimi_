import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createSign } from "node:crypto";
export const PKG = "com.rimikimi.app";
const sa = JSON.parse(readFileSync((process.env.PLAY_SA_JSON || "~/Downloads/rimikimi-e04b6cd78c43.json").replace(/^~/, homedir()), "utf8"));
const b64url = (b) => Buffer.from(b).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const c = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
const s = createSign("RSA-SHA256"); s.update(`${h}.${c}`);
const TOKEN = (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${h}.${c}.${b64url(s.sign(sa.private_key))}` }) })).json()).access_token;
export const BASE = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PKG}`;
export async function g(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 1500)}`);
  return j;
}
export const money = (currency, amount) => { const [u, n = "0"] = String(amount).split("."); return { currencyCode: currency, units: u, nanos: Number((n + "000000000").slice(0, 9)) }; };
