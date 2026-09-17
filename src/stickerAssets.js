// ============================================================
// 꾸미기 스티커 — 직접 그린 것 (시스템 이모지와 별개)
//
// 왜 SVG 인가
//   이모지는 기기 글꼴에 따라 모양이 달라지고(안드로이드/아이폰이 다름) 브랜드 색과도
//   안 맞는다. 스티커는 우리가 그려서 **어느 기기에서나 똑같이** 나와야 한다.
//   SVG 를 data URI 로 들고 있으면 파일 요청이 없고 어떤 크기로 키워도 안 깨진다.
//
// 색은 브랜드 팔레트(v2/SPEC.md §1)를 쓴다:
//   빨강 #E6403C · 노랑 #F9C83C · 하늘 #60C9DE · 보라 #8A5DA7 · 잉크 #231F20 · 크림 #FBF8F3
// ============================================================

const svg = (inner, vb = "0 0 100 100") =>
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`
  );

// 손그림 느낌을 내려고 가장자리를 둥글게 하고 살짝 기울인다.
const heart = (fill, tilt = 0) =>
  svg(
    `<g transform="rotate(${tilt} 50 50)">
       <path d="M50 84C26 66 14 54 14 40a20 20 0 0135-13 20 20 0 0135 13c0 14-12 26-36 44z"
             fill="${fill}" stroke="#231F20" stroke-width="4" stroke-linejoin="round"/>
       <ellipse cx="36" cy="38" rx="6" ry="8" fill="#fff" opacity=".55" transform="rotate(-20 36 38)"/>
     </g>`
  );

const spark = (fill) =>
  svg(
    `<path d="M50 8c4 24 14 34 38 38-24 4-34 14-38 38-4-24-14-34-38-38 24-4 34-14 38-38z"
           fill="${fill}" stroke="#231F20" stroke-width="4" stroke-linejoin="round"/>`
  );

const star = (fill) =>
  svg(
    `<path d="M50 10l11 25 27 3-20 18 5 27-23-13-23 13 5-27L12 38l27-3z"
           fill="${fill}" stroke="#231F20" stroke-width="4" stroke-linejoin="round"/>`
  );

// 말풍선 — 안에 글자를 넣는다. 한국어가 주다.
const bubble = (text, bg, fg = "#231F20") => {
  const w = Math.max(64, 22 + text.length * 19);
  return svg(
    `<g>
       <rect x="4" y="6" width="${w - 8}" height="46" rx="23"
             fill="${bg}" stroke="#231F20" stroke-width="4"/>
       <path d="M24 50l-4 16 20-14z" fill="${bg}" stroke="#231F20" stroke-width="4" stroke-linejoin="round"/>
       <text x="${w / 2}" y="36" text-anchor="middle"
             font-family="'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
             font-size="22" font-weight="800" fill="${fg}">${text}</text>
     </g>`,
    `0 0 ${w} 70`
  );
};

// 필름 한 컷 — 사진 위에 얹으면 "필름 프레임" 느낌
const filmStrip = svg(
  `<g>
     <rect x="6" y="20" width="88" height="60" rx="5" fill="#231F20"/>
     <rect x="16" y="30" width="68" height="40" rx="2" fill="#FBF8F3"/>
     ${[0, 1, 2, 3, 4]
       .map((i) => `<rect x="${10 + i * 17}" y="23" width="8" height="5" rx="1.5" fill="#FBF8F3"/>`)
       .join("")}
     ${[0, 1, 2, 3, 4]
       .map((i) => `<rect x="${10 + i * 17}" y="72" width="8" height="5" rx="1.5" fill="#FBF8F3"/>`)
       .join("")}
   </g>`
);

const shutter = svg(
  `<g>
     <circle cx="50" cy="50" r="34" fill="#FBF8F3" stroke="#231F20" stroke-width="5"/>
     <circle cx="50" cy="50" r="15" fill="#E6403C" stroke="#231F20" stroke-width="4"/>
     <circle cx="62" cy="36" r="4" fill="#231F20"/>
   </g>`
);

// 리본 — 인물 사진에 잘 어울리는 장식
const ribbon = (fill) =>
  svg(
    `<g stroke="#231F20" stroke-width="4" stroke-linejoin="round">
       <path d="M50 52L22 34c-6-4-12 1-11 8l3 18c1 6 8 9 13 5z" fill="${fill}"/>
       <path d="M50 52l28-18c6-4 12 1 11 8l-3 18c-1 6-8 9-13 5z" fill="${fill}"/>
       <circle cx="50" cy="54" r="9" fill="${fill}"/>
     </g>`
  );

// 보름달 — 추석 시즌
const moon = svg(
  `<g>
     <circle cx="50" cy="50" r="34" fill="#F9C83C" stroke="#231F20" stroke-width="4"/>
     <circle cx="38" cy="42" r="6" fill="#231F20" opacity=".12"/>
     <circle cx="58" cy="58" r="9" fill="#231F20" opacity=".1"/>
     <circle cx="62" cy="36" r="4" fill="#231F20" opacity=".12"/>
   </g>`
);

const songpyeon = svg(
  `<g stroke="#231F20" stroke-width="4" stroke-linejoin="round">
     <path d="M20 62c0-18 13-30 30-30s30 12 30 30c0 6-13 10-30 10s-30-4-30-10z" fill="#BFE3C6"/>
     <path d="M32 58c6-4 12-4 18 0s12 4 18 0" fill="none"/>
   </g>`
);

/** 그룹별 스티커. `src` 는 data URI, `ratio` 는 가로/세로 비(합성 시 씀). */
export const STICKER_SETS = [
  {
    key: "heart",
    ko: "하트 · 반짝",
    items: [
      { id: "h-red", src: heart("#E6403C", -8), ratio: 1 },
      { id: "h-yel", src: heart("#F9C83C", 6), ratio: 1 },
      { id: "h-sky", src: heart("#60C9DE", -4), ratio: 1 },
      { id: "h-pur", src: heart("#8A5DA7", 10), ratio: 1 },
      { id: "s-yel", src: spark("#F9C83C"), ratio: 1 },
      { id: "s-sky", src: spark("#60C9DE"), ratio: 1 },
      { id: "st-red", src: star("#E6403C"), ratio: 1 },
      { id: "st-yel", src: star("#F9C83C"), ratio: 1 },
      { id: "rb-red", src: ribbon("#E6403C"), ratio: 1 },
      { id: "rb-sky", src: ribbon("#60C9DE"), ratio: 1 },
    ],
  },
  {
    key: "film",
    ko: "필름 · 카메라",
    items: [
      { id: "film", src: filmStrip, ratio: 1 },
      { id: "shutter", src: shutter, ratio: 1 },
    ],
  },
  {
    key: "word",
    ko: "말풍선",
    items: [
      { id: "w1", src: bubble("최고", "#F9C83C"), ratio: 64 / 70 },
      { id: "w2", src: bubble("찰칵", "#60C9DE"), ratio: 64 / 70 },
      { id: "w3", src: bubble("오늘의 나", "#FBF8F3"), ratio: 213 / 70 },
      { id: "w4", src: bubble("사랑해", "#E6403C", "#FFFFFF"), ratio: 79 / 70 },
      { id: "w5", src: bubble("고마워", "#8A5DA7", "#FFFFFF"), ratio: 79 / 70 },
    ],
  },
  {
    key: "chuseok",
    ko: "추석",
    items: [
      { id: "moon", src: moon, ratio: 1 },
      { id: "songpyeon", src: songpyeon, ratio: 1 },
      { id: "ch1", src: bubble("한가위", "#F9C83C"), ratio: 79 / 70 },
    ],
  },
];

/** id → 항목 */
const BY_ID = new Map();
for (const g of STICKER_SETS) for (const it of g.items) BY_ID.set(it.id, it);
export const stickerById = (id) => BY_ID.get(id) || null;
