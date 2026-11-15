#!/usr/bin/env node
// 샘플 이미지 버전(imgV) — 배포할 때마다 public/large·thumbs 파일 내용의 지문을 api/_data/img-versions.json 에 굽는다.
// 서버(conceptList)가 컨셉마다 imgV 로 내려보내고, 앱은 이미지 주소 뒤에 ?v=<지문> 을 붙인다(iOS·안드 2026-11-15 이후 빌드).
// 왜: iOS ImageLoader(returnCacheDataElseLoad)는 같은 주소면 서버를 다시 묻지 않아서, 서버에서 샘플을 바꿔도
//     한 번 본 폰은 옛 파일을 계속 보여 줬다(오너 11/15 "서버 업데이트면 바로 반영돼야지"). 파일이 바뀌면 지문이 바뀌어
//     주소가 달라지므로 손으로 버전을 올리지 않아도 자동으로 새로 받는다. package.json prebuild 에서 돈다.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const root = new URL("../", import.meta.url);
const out = {};
for (const dir of ["large", "thumbs"]) {
  const d = new URL(`public/${dir}/`, root);
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    const m = f.match(/^(\d+)\.webp$/);
    if (!m) continue;
    const h = createHash("md5").update(readFileSync(new URL(f, d))).digest("hex");
    out[m[1]] = (out[m[1]] || "") + h.slice(0, dir === "large" ? 6 : 4);
  }
}
writeFileSync(new URL("api/_data/img-versions.json", root), JSON.stringify(out) + "\n");
console.log(`img-versions: ${Object.keys(out).length} concepts`);
