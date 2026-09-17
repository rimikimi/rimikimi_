// ============================================================
// 꾸미기 스티커 — 실제 스티커 아트(PNG, 배경 투명)
//
// ⚠️ 처음엔 SVG 를 손으로 그렸다가 오너에게 두 번 반려당했다("개밤티", "디자인이 구리다").
//    맞는 지적이었다 — 손으로 코딩한 도형은 클립아트로 보인다. 지금은 이미지 생성으로
//    **실제 스티커 아트**를 만들어 쓴다(광택 있는 젤리 질감, 파스텔 그라데이션,
//    흰 다이컷 테두리 — 스노우·소다 계열의 결).
//
// 만드는 법 (다음에 추가할 때)
//   1) 스티커 시트 1장을 생성한다: 흰 배경, 균등한 격자, "no text", 다이컷 흰 테두리 요구.
//   2) 칸마다 잘라내고 **모서리에서 flood fill** 로 바깥 흰색만 투명화한다
//      (단순 흰색 제거를 하면 스티커 자신의 흰 테두리까지 날아간다).
//      옆 칸 조각이 묻지 않게 칸을 안쪽으로 5% 정도 좁혀 자른다.
//   3) 420px 이하로 줄여 `public/stickers/<id>.png` 로 저장.
// ============================================================

/** `ratio` = 가로/세로. 저장 시 캔버스 합성에서 높이를 계산하는 데 쓴다. */
export const STICKER_SETS = [
  { key: "heart", ko: "하트 · 반짝", items: [
      { id: "heart", src: "/stickers/heart.png", ratio: 0.9413, ko: "하트" },
      { id: "wingheart", src: "/stickers/wingheart.png", ratio: 1.1361, ko: "날개 하트" },
      { id: "sparkle", src: "/stickers/sparkle.png", ratio: 1.1898, ko: "반짝이" },
      { id: "shootingstar", src: "/stickers/shootingstar.png", ratio: 1.0489, ko: "별똥별" },
      { id: "cherry", src: "/stickers/cherry.png", ratio: 0.9853, ko: "체리" },
      { id: "clover", src: "/stickers/clover.png", ratio: 0.9595, ko: "네잎클로버" },
  ] },
  { key: "deco", ko: "장식", items: [
      { id: "ribbon", src: "/stickers/ribbon.png", ratio: 1.1585, ko: "리본" },
      { id: "crown", src: "/stickers/crown.png", ratio: 1.0452, ko: "왕관" },
      { id: "bubble", src: "/stickers/bubble.png", ratio: 1.2613, ko: "말풍선" },
  ] },
  { key: "film", ko: "필름 · 밤하늘", items: [
      { id: "camera", src: "/stickers/camera.png", ratio: 0.8425, ko: "카메라" },
      { id: "film", src: "/stickers/film.png", ratio: 0.9286, ko: "필름" },
      { id: "moon", src: "/stickers/moon.png", ratio: 0.8721, ko: "달" },
  ] },
];

const BY_ID = new Map();
for (const g of STICKER_SETS) for (const it of g.items) BY_ID.set(it.id, it);
export const stickerById = (id) => BY_ID.get(id) || null;
