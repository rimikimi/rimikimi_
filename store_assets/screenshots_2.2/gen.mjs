// 2.2 스토어 스크린샷 — 5탭 개편(2026-10-27). 메인 4개: 컨셉 600+ · 감성 40 · 매직 부스 30 · 원터치 사진 복원(오너).
//   node gen.mjs → ios/{ko,en}/0N.png (1320x2868, APP_IPHONE_67) + play/{ko,en}/0N.png (1320x2640, Play 2:1 한도)
// 시뮬레이터 실캡처(src/*.png) 위에 문구만 얹는다. 숫자는 실제 개수보다 작거나 같게(10/27 실측: 공개 747 · 필터 45 · 매직 부스 33).
// 문구 규칙: 애플 4.3(a) 금지어(필터·프리셋·증명·웨딩·소개팅…)는 자막에 쓰지 않는다 — "감성 룩". 앱 화면 안 글자는 실제 UI 그대로.
import pw from "/Users/home/Documents/mimo/node_modules/playwright/index.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const here = resolve(new URL(".", import.meta.url).pathname);
const src = (n, lang = "ko") => `file://${here}/${lang === "en" ? "src_en" : "src"}/${n}`;
const PHOTO = "file:///Users/home/Documents/rimikimi_app/store_assets/promo_21/v2/src/c3b_ph16pro.jpg";

const SLIDES = [
  { file: "01-concepts", shot: "home.png", ko: ["컨셉 600가지 넘게", "매일 저녁 새로 4종"], koSub: "셀카 한 장이면 프로필 · 화보 · 여행 사진까지",
    en: ["600+ concepts,", "4 new every evening"], enSub: "One selfie — profile, editorial and travel shots" },
  { file: "02-looks", shot: "filterflip.png", ko: ["감성 룩 40가지", "누르면 바로 보여요"], koSub: "폰카 · 빈티지 · Y2K · 폴더폰, 카드를 뒤집어 확인",
    en: ["40 film & retro looks,", "tap to preview"], enSub: "Retro phone, vintage, Y2K — flip a card to see it" },
  { file: "03-magic", shot: "magic.png", ko: ["매직 부스 30가지", "어떤 사진이든 그림으로"], koSub: "사람 · 반려동물 · 풍경 뭐든 고른 그림체로",
    en: ["30 Magic Booth styles,", "any photo into art"], enSub: "People, pets, places — redrawn in the style you pick" },
  { file: "04-restore", shot: "restore.png", ko: ["원터치 사진 복원", "옛 사진이 오늘처럼"], koSub: "바랜 사진 · 접힌 자국 · 흐린 얼굴을 한 번에",
    en: ["One-tap photo restore,", "old photos like new"], enSub: "Fading, creases and blur fixed in one tap" },
  { file: "05-camera", shot: "camera.png", camera: true, ko: ["보면서 찍는", "폰카 · 필름 감성"], koSub: "찍는 순간 바로 저장",
    en: ["Retro looks,", "live as you shoot"], enSub: "Shoot and save in a tap" },
  { file: "06-dressroom", shot: "dressroom.png", koOnly: true, ko: ["옷 사진만 올리면", "입은 모습이 나와요"], koSub: "최대 5장 · 거울셀카 / 모델컷",
    en: ["Upload the clothes,", "see them on you"], enSub: "Up to 5 items · mirror selfie or model shot" },
];

const html = (s, lang, H) => {
  const [h1, h2] = lang === "ko" ? s.ko : s.en;
  const sub = lang === "ko" ? s.koSub : s.enSub;
  const dh = H - 498 + 81;   // 아래로 살짝 넘쳐 잘리게(기존 세트와 같은 느낌)
  const device = s.camera
    ? `<div class="device" style="height:${dh}px;background:#000;"><img class="photo" src="${PHOTO}"/><img class="chrome" src="${src(s.shot, lang)}"/></div>`
    : `<div class="device" style="height:${dh}px;"><img src="${src(s.shot, lang)}"/></div>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="UTF-8"/><style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
*{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;}
html,body{width:1320px;height:${H}px;}
body{font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,sans-serif;color:#111;background:#fff;position:relative;overflow:hidden;}
.wordmark{position:absolute;top:64px;left:96px;font-size:30px;font-weight:800;letter-spacing:-.02em;}
.headline{position:absolute;top:150px;left:96px;right:60px;font-size:${lang === "ko" ? 100 : 88}px;font-weight:800;line-height:1.1;letter-spacing:-.03em;}
.headline em{font-style:normal;color:#e6403c;}
.sub{position:absolute;top:394px;left:96px;right:96px;font-size:34px;font-weight:600;line-height:44px;color:rgba(17,17,17,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.device{position:absolute;top:498px;left:96px;width:1128px;border-radius:64px;overflow:hidden;background:#fff;
  box-shadow:0 40px 90px -30px rgba(17,17,17,.35),0 10px 30px -10px rgba(17,17,17,.18);}
.device img{width:100%;height:100%;object-fit:cover;object-position:top center;display:block;}
.device .photo{position:absolute;inset:0;height:58%;object-fit:cover;object-position:center;}
.device .chrome{position:absolute;left:0;right:0;bottom:0;height:100%;object-fit:cover;object-position:bottom;
  -webkit-mask-image:linear-gradient(to bottom, transparent 50%, #000 58%);mask-image:linear-gradient(to bottom, transparent 50%, #000 58%);}
</style></head><body>
  <div class="wordmark">rimikimi</div>
  <div class="headline"><em>${h1}</em><br/>${h2}</div>
  <div class="sub">${sub}</div>
  ${device}
</body></html>`;
};

const { chromium } = pw;
const b = await chromium.launch();
for (const [store, H] of [["ios", 2868], ["play", 2640]]) for (const lang of ["ko", "en"]) {
  const dir = `${here}/${store}/${lang}`; mkdirSync(dir, { recursive: true });
  for (const s of SLIDES) {
    if (s.koOnly && lang === "en") continue;   // 영어 UI 캡처가 없는 화면은 영어 세트에서 뺀다
    const p = await b.newPage({ viewport: { width: 1320, height: H }, deviceScaleFactor: 1 });
    const file = `${dir}/${s.file}.html`;
    writeFileSync(file, html(s, lang, H));
    await p.goto("file://" + file, { waitUntil: "networkidle" });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${dir}/${s.file}.png`, fullPage: false });
    await p.close();
  }
  console.log(store, lang, "ok");
}
await b.close();
