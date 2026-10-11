// 2.1 개편 스토어 스크린샷 — 시뮬레이터 실캡처(src/*.png, 1320x2868) 위에 문구만 얹는다(2.0 세트와 같은 틀).
//   node gen.mjs            → ko/ 와 en/ 에 01~07.png (1320x2868, APP_IPHONE_67)
// 문구 규칙: 스토어 금지어(필터/증명/웨딩/소개팅/이력서…)는 자막에 쓰지 않는다. 앱 화면 안 글자는 실제 UI 그대로.
import pw from "/Users/home/Documents/mimo/node_modules/playwright/index.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const here = resolve(new URL(".", import.meta.url).pathname);
const src = (n) => `file://${here}/src/${n}`;
const PHOTO = "file:///Users/home/Documents/rimikimi_app/store_assets/promo_21/v2/src/c3b_ph16pro.jpg";

const SLIDES = [
  { file: "01-home", shot: "home.png", ko: ["셀카 한 장으로", "오늘 필요한 사진을"], koSub: "프로필 · 프사 · 커플 · 드레스룸, 홈에서 바로",
    en: ["One selfie,", "every photo you need"], enSub: "Profile, social, couple, dressing room — right from Home" },
  { file: "02-concepts", shot: "category.png", ko: ["컨셉 300가지", "매일 저녁 새로 4종"], koSub: "세계여행 · 스튜디오 · 시즌, 앨범으로 둘러봐요",
    en: ["300+ concepts,", "4 new every evening"], enSub: "Travel, studio, seasons — browse by album" },
  { file: "03-profile", shot: "purpose.png", ko: ["프로필 사진,", "스튜디오 간 것처럼"], koSub: "취업 · 전문가 · 배우 룩, 셀카 한 장이면",
    en: ["Profile shots that", "look studio-made"], enSub: "Business, professional and actor looks from one selfie" },
  { file: "04-cart", shot: "cart.png", ko: ["마음에 드는 컨셉", "담아서 한 번에"], koSub: "최대 8장을 한 번에 만들어요",
    en: ["Pick several,", "make them at once"], enSub: "Up to 8 photos in one go" },
  { file: "05-dressroom", shot: "dressroom.png", ko: ["옷 사진만 올리면", "입은 모습이 나와요"], koSub: "최대 5장 · 거울셀카 / 모델컷",
    en: ["Upload the clothes,", "see them on you"], enSub: "Up to 5 items · mirror selfie or model shot" },
  { file: "06-camera", shot: "camera.png", camera: true, ko: ["필름 · 폰카 감성", "보면서 찍어요"], koSub: "38가지 감성 룩, 개편 기념 무료",
    en: ["Film and retro looks,", "live as you shoot"], enSub: "38 looks, free for the relaunch" },
  { file: "07-retouch", shot: "retouch.png", ko: ["말로 고치고", "옛 사진은 되살려요"], koSub: "“뒤에 지나가는 사람 지워줘” 한 줄이면 돼요",
    en: ["Fix it in words,", "revive old photos"], enSub: "“Remove the person behind me” — that’s it" },
];

const html = (s, lang) => {
  const [h1, h2] = lang === "ko" ? s.ko : s.en;
  const sub = lang === "ko" ? s.koSub : s.enSub;
  const device = s.camera
    ? `<div class="device" style="height:2451px;background:#000;">
         <img class="photo" src="${PHOTO}"/>
         <img class="chrome" src="${src(s.shot)}"/>
       </div>`
    : `<div class="device" style="height:2451px;"><img src="${src(s.shot)}"/></div>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
:root{--ink:#111;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
html,body{width:1320px;height:2868px;}
body{font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif;color:var(--ink);background:#fff;position:relative;overflow:hidden;}
.page{position:relative;width:100%;height:100%;}
.wordmark{position:absolute;top:64px;left:96px;font-size:30px;font-weight:800;letter-spacing:-.02em;}
.headline{position:absolute;top:150px;left:96px;right:96px;font-size:${lang === "ko" ? 100 : 92}px;font-weight:800;line-height:1.1;letter-spacing:-.03em;}
.sub{position:absolute;top:394px;left:96px;right:96px;font-size:34px;font-weight:600;line-height:44px;color:rgba(17,17,17,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.device{position:absolute;top:498px;left:96px;width:1128px;border-radius:64px;overflow:hidden;background:#fff;
  box-shadow:0 40px 90px -30px rgba(17,17,17,.35),0 10px 30px -10px rgba(17,17,17,.18);}
.device img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;}
/* 카메라: 시뮬레이터엔 카메라가 없어 미리보기가 검다 — 위 55% 에 사진을 깔고 아래 조작부는 실캡처 그대로. */
.device .photo{position:absolute;inset:0;height:58%;object-fit:cover;object-position:center;}
.device .chrome{position:absolute;left:0;right:0;bottom:0;height:100%;object-fit:cover;object-position:bottom;
  -webkit-mask-image:linear-gradient(to bottom, transparent 50%, #000 58%);mask-image:linear-gradient(to bottom, transparent 50%, #000 58%);}
</style></head><body><div class="page">
  <div class="wordmark">rimikimi</div>
  <div class="headline">${h1}<br/>${h2}</div>
  <div class="sub">${sub}</div>
  ${device}
</div></body></html>`;
};

const { chromium } = pw;
const b = await chromium.launch();
for (const lang of ["ko", "en"]) {
  mkdirSync(`${here}/${lang}`, { recursive: true });
  for (const s of SLIDES) {
    const p = await b.newPage({ viewport: { width: 1320, height: 2868 }, deviceScaleFactor: 1 });
    const file = `${here}/${lang}/${s.file}.html`;
    writeFileSync(file, html(s, lang));
    await p.goto("file://" + file, { waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${here}/${lang}/${s.file}.png`, fullPage: false });
    await p.close();
    console.log(lang, s.file);
  }
}
await b.close();
