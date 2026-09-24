// 빌드 뒤 dist/index.html → dist/index.en.html (영어 메타·본문·JSON-LD).
// middleware.js 가 /?lang=en 요청에 이 파일을 준다 — JS 를 안 돌리는 크롤러(AI 검색·링크 미리보기)도
// 영어판을 보게 하려고. 문구는 src/i18n.js DOC_META.en 과 맞춘다.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const T = "rimikimi — AI portraits from one selfie";
const D = "Turn one selfie into AI portraits: ID photos, resume headshots, couple shots, photo-booth strips and editorial concepts. Hundreds of concepts, ready in minutes, free to try once a day.";
const OGD = "One selfie. Hundreds of concepts. ✨";
const BODY = `<main style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:-apple-system,system-ui,sans-serif;color:#231F20;background:#FBF8F3">
        <h1>rimikimi — an AI photo studio that works from one selfie</h1>
        <p>Upload one selfie, pick a concept, and get AI portraits in a few minutes. There are 464 concepts — ID and passport-style photos, resume headshots, Korean photo-booth strips (4-cut), couple shots, wedding and travel looks — and new concepts arrive every evening at 8 pm KST.</p>
        <ul>
          <li>Sign up and make 1 photo free every day; make more with credits.</li>
          <li>Your photo is sent only while generating and is never stored on our servers. Generated photos are kept for 24 hours.</li>
          <li>Available on iOS, Android and the web.</li>
        </ul>
        <p>Browse concepts: <a href="/en/c/studio">AI headshots</a> · <a href="/en/c/id-photo">ID photos</a> · <a href="/en/c/fourcut">Photo-booth strips</a> · <a href="/en/c/couple">Couple photos</a> · <a href="/en/c/wedding">Wedding</a> · <a href="/en/c/travel">Travel</a> · <a href="/en/c/art">Art</a> · <a href="/?lang=ko">한국어</a></p>
      </main>`;

export default function enIndex() {
  return {
    name: "rimikimi-en-index",
    apply: "build",
    closeBundle() {
      const dist = resolve(process.cwd(), "dist");
      let s = readFileSync(resolve(dist, "index.html"), "utf8");
      const rep = (re, to) => { if (!re.test(s)) throw new Error("en-index: 못 찾음 " + re); s = s.replace(re, to); };
      rep(/<html lang="ko">/, '<html lang="en">');
      rep(/<title>[^<]*<\/title>/, `<title>${T}</title>`);
      rep(/(<meta name="description" content=")[^"]*"/, `$1${D}"`);
      rep(/(<link rel="canonical" href=")[^"]*"/, '$1https://rimikimi-app.vercel.app/?lang=en"');
      rep(/(<meta property="og:title" content=")[^"]*"/, `$1${T}"`);
      rep(/(<meta property="og:description" content=")[^"]*"/, `$1${OGD}"`);
      rep(/(<meta property="og:url" content=")[^"]*"/, '$1https://rimikimi-app.vercel.app/?lang=en"');
      rep(/(<meta property="og:locale" content=")[^"]*"/, '$1en_US"');
      rep(/(<meta name="twitter:title" content=")[^"]*"/, `$1${T}"`);
      rep(/(<meta name="twitter:description" content=")[^"]*"/, `$1${OGD}"`);
      rep(/"description": "셀카 한 장으로 만드는 AI 사진관[^"]*"/, '"description": "An AI photo studio that works from one selfie: ID photos and headshots, photo-booth strips and couple shots, in 464 concepts."');
      rep(/"description": "무료 · 하루 1장"/, '"description": "Free · 1 photo per day"');
      rep(/"category": "인앱결제", "description": "크레딧 팩 \/ rimikimi\+ 구독"/, '"category": "In-app purchase", "description": "Credit packs / rimikimi+ subscription"');
      rep(/"featureList": \[[\s\S]*?\]/, `"featureList": [
        "AI profile photos from one selfie",
        "AI ID photos (reference images for passports and resumes)",
        "Korean photo-booth strips (2 to 8 frames)",
        "Couple photos (from two photos)",
        "Dressing room: see yourself wearing a photographed outfit",
        "464 concepts, new ones every evening at 8 pm KST"
      ]`);
      rep(/<main style=[\s\S]*?<\/main>/, BODY);
      writeFileSync(resolve(dist, "index.en.html"), s);
    },
  };
}
