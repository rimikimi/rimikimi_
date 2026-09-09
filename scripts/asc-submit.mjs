import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
const KEY_ID="3KXPZAL47V", ISSUER="257d4dcf-3cfc-482b-8df3-b038f7c50485", APP="6782776518";
const VERSION="1.40", BUILD="84";
const DRY = process.argv.includes("--dry");

// 2026-08-28: 4.3(a) 반려 후 오너 지시 — 필터 위주 노트 제거, 컨셉/드레스룸 중심 (asc-meta-rimikimi.mjs 와 동일 문안)
// 2026-09-09: 1.40 (build 84) — 드레스룸 일상컷·인생네컷 화보·iOS 조작감 중심 (필터 언급 없음)
const NOTES = {
  ko: `드레스룸 일상컷이 똑똑해졌어요 — 올린 옷을 분석해서 그 옷에 어울리는 장소에서 전신으로 찍어 드려요. 여러 장 만들면 장마다 배경이 달라요. 의상 사진은 이제 한 번에 5장까지 골라요.

• 인생네컷에 새 스타일 "화보" — 흰 배경에 플래시로 찍은 화보 컨택트시트
• 새 컨셉 추가 — 매일 저녁 8시 새 컨셉 4종이 도착해요
• 화면 상단을 탭하면 맨 위로, 뒤로가기 스와이프가 더 자연스러워졌어요
• 알림을 확인하면 앱 아이콘 배지가 바로 사라져요
• 편집 화면 안정성 개선 및 버그 수정`,
  "en-US": `Dressing Room "Everyday cut" got smarter — we analyze the outfit you upload and shoot you full-length in a place that suits it. Make several and each one gets a different setting. Pick up to 5 garment photos at once.

• New "Editorial" style in Life Cut — a white-backdrop flash contact sheet
• New concepts — 4 arrive every evening
• Tap the status bar to scroll to top; smoother back-swipe
• App icon badge clears as soon as you check a notification
• Editor stability improvements and bug fixes`,
};

const key=readFileSync("/Users/home/.appstoreconnect/private_keys/AuthKey_3KXPZAL47V.p8","utf8");
const b=(x)=>Buffer.from(x).toString("base64").replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
const now=Math.floor(Date.now()/1000);
const h=b(JSON.stringify({alg:"ES256",kid:KEY_ID,typ:"JWT"}));
const c=b(JSON.stringify({iss:ISSUER,iat:now,exp:now+900,aud:"appstoreconnect-v1"}));
const sg=createSign("SHA256"); sg.update(`${h}.${c}`); sg.end();
const JWT=`${h}.${c}.${b(sg.sign({key,dsaEncoding:"ieee-p1363"}))}`;

async function api(method, path, body){
  const r=await fetch("https://api.appstoreconnect.apple.com"+path,{
    method, headers:{Authorization:`Bearer ${JWT}`,"Content-Type":"application/json"},
    body: body?JSON.stringify(body):undefined});
  const t=await r.text();
  let j=null; try{ j=t?JSON.parse(t):null }catch{}
  if(!r.ok){
    const d=j?.errors?.map(e=>`${e.title}: ${e.detail}`).join(" / ")||t.slice(0,300);
    throw new Error(`${method} ${path} → ${r.status}\n  ${d}`);
  }
  return j;
}

// 1) 버전 확보
let vers=await api("GET",`/v1/apps/${APP}/appStoreVersions?limit=20`);
let ver=vers.data.find(v=>v.attributes.versionString===VERSION);
if(ver){
  console.log(`1) 버전 ${VERSION} 이미 있음 [${ver.attributes.appStoreState}]`);
} else if(DRY){
  console.log(`1) [dry] 버전 ${VERSION} 생성 생략`); process.exit(0);
} else {
  ver=(await api("POST","/v1/appStoreVersions",{data:{type:"appStoreVersions",
    attributes:{platform:"IOS",versionString:VERSION},
    relationships:{app:{data:{type:"apps",id:APP}}}}})).data;
  console.log(`1) 버전 ${VERSION} 생성 (${ver.id})`);
}

// 2) 릴리즈노트
const locs=await api("GET",`/v1/appStoreVersions/${ver.id}/appStoreVersionLocalizations`);
for(const l of locs.data){
  const txt=NOTES[l.attributes.locale];
  if(!txt){ console.log(`2) ${l.attributes.locale} — 문구 없음, 건너뜀`); continue; }
  if(DRY){ console.log(`2) [dry] ${l.attributes.locale} whatsNew 갱신 생략`); continue; }
  await api("PATCH",`/v1/appStoreVersionLocalizations/${l.id}`,
    {data:{type:"appStoreVersionLocalizations",id:l.id,attributes:{whatsNew:txt}}});
  console.log(`2) ${l.attributes.locale} 릴리즈노트 등록`);
}

// 3) 빌드 연결
const builds=await api("GET",`/v1/builds?filter%5Bapp%5D=${APP}&limit=20&sort=-uploadedDate`);
const bd=builds.data.find(x=>x.attributes.version===BUILD);
if(!bd) throw new Error(`빌드 ${BUILD} 없음`);
if(bd.attributes.processingState!=="VALID") throw new Error(`빌드 ${BUILD} 상태 ${bd.attributes.processingState} — VALID 아님`);
if(DRY){ console.log(`3) [dry] 빌드 ${BUILD} (${bd.id}) 연결 생략`); }
else {
  await api("PATCH",`/v1/appStoreVersions/${ver.id}/relationships/build`,
    {data:{type:"builds",id:bd.id}});
  console.log(`3) 빌드 ${BUILD} 연결`);
}

if(DRY){ console.log("4~6) [dry] 심사 제출 생략"); process.exit(0); }

// 4~6) 심사 제출
let subs=await api("GET",`/v1/reviewSubmissions?filter%5Bapp%5D=${APP}&filter%5Bplatform%5D=IOS&limit=10`);
let sub=subs.data.find(s=>["READY_FOR_REVIEW","WAITING_FOR_REVIEW","IN_REVIEW","UNRESOLVED_ISSUES"].includes(s.attributes.state));
if(!sub){
  sub=(await api("POST","/v1/reviewSubmissions",{data:{type:"reviewSubmissions",
    attributes:{platform:"IOS"},
    relationships:{app:{data:{type:"apps",id:APP}}}}})).data;
  console.log(`4) 심사 제출 생성 (${sub.id})`);
} else console.log(`4) 기존 심사 제출 재사용 (${sub.id}) [${sub.attributes.state}]`);

const items=await api("GET",`/v1/reviewSubmissions/${sub.id}/items`);
if(!items.data.some(i=>i.relationships?.appStoreVersion?.data?.id===ver.id)){
  await api("POST","/v1/reviewSubmissionItems",{data:{type:"reviewSubmissionItems",
    relationships:{reviewSubmission:{data:{type:"reviewSubmissions",id:sub.id}},
                   appStoreVersion:{data:{type:"appStoreVersions",id:ver.id}}}}});
  console.log("5) 버전을 심사 항목에 추가");
} else console.log("5) 이미 심사 항목에 있음");

const done=await api("PATCH",`/v1/reviewSubmissions/${sub.id}`,
  {data:{type:"reviewSubmissions",id:sub.id,attributes:{submitted:true}}});
console.log(`6) 제출 완료 → 상태 ${done.data.attributes.state}`);
