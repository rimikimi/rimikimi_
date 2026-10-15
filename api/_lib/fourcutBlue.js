// ============================================================
// 인생네컷 "블루 무드" 스타일 (오너 레퍼런스, 2026-10-15)
//   세로로 긴 컷을 **가로로 나란히** 붙인 셀프 포토부스(4컷 = 1행 4열, 이음새만 얇게),
//   차가운 라벤더·블루 톤 + 파스텔 블루 오버핏 맨투맨, 얼굴 가까이 꽉 찬 셀카 구도,
//   컷마다 귀여운 포즈: 주먹 위에 턱 괴기 → 무표정 클로즈업 → 한쪽 눈가 브이 → 소매로 반쯤 가린 눈웃음.
//   ① 얼굴·머리는 업로드 사진의 사람을 따른다 ② 분할 수(2/3/4/6)에 맞춰 포즈만 잘라 쓴다
//   ③ 색은 hex ④ 글자·숫자·로고 금지(레퍼런스 맨투맨의 글씨는 따라 하지 않는다)
// ============================================================

export const BLUE_POSES = [
  "resting the chin on a loosely closed fist, the oversized sweatshirt sleeve bunched at the wrist, head tilted slightly, small closed-lip smile, soft gaze into the lens",
  "very close to the camera, face filling the panel, calm neutral expression with lips softly pouted, doe eyes looking straight into the lens",
  "a V-sign held sideways right next to one eye, peeking through it, playful little smirk, face tilted",
  "one hand covered by the long sleeve raised near the cheek, shy squinting eye-smile, chin tucked down, leaning toward the camera",
  // 5·6컷용
  "both sleeve-covered hands cupping the cheeks, wide innocent eyes, lips slightly pursed",
  "looking slightly off to the side then back at the lens over the shoulder, relaxed soft smile",
];

const ORD = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };

/** 블루 무드는 가로로 붙인다 — 2·3·4컷은 1행, 6컷은 2행 3열. */
export const BLUE_LAYOUT = { 2: [2, 1], 3: [3, 1], 4: [4, 1], 6: [3, 2] };
export const BLUE_RATIO = { 2: "3:4", 3: "1:1", 4: "1:1", 6: "3:4" };

export function buildBlueStrip(n) {
  const [cols, rows] = BLUE_LAYOUT[n] || BLUE_LAYOUT[4];
  const panels = BLUE_POSES.slice(0, n)
    .map((p, i) => `panel ${ORD[i + 1]} (${rows === 1 ? ["left", "second", "third", "right"][Math.min(i, 3)] : i < cols ? "top row" : "bottom row"}): ${p}`)
    .join(",\n");
  return (
    `A Korean self photo-booth (인생네컷) print as ONE single image: ${ORD[n]} tall vertical photo panels of the same person placed side by side in ${cols} column${cols > 1 ? "s" : ""} x ${rows} row${rows > 1 ? "s" : ""}, ` +
    `panels butted edge to edge with only thin straight seams between them (no thick frame, no white borders, no rounded corners), each panel a slightly different moment from the same session, every panel fully inside the image,\n` +
    `THE PERSON: the SAME person in every panel — face identical to the uploaded reference image, preserved facial identity, exact facial features, natural likeness, ` +
    `their real hair colour and length from the reference, worn loose and softly layered with a natural centre part, identical hair, outfit and makeup across all panels,\n` +
    `makeup: soft natural K-beauty look, clear even skin with visible texture, subtle rosy blush #E9B8BE, soft pink-nude glossy lips #D99A9F, thin soft-brown eyeliner #5A4A44,\n` +
    `wardrobe: an oversized pastel periwinkle-blue #AFC0E6 crewneck sweatshirt with long elasticated cuffs and big white #F4F6FB outline varsity-style graphic shapes on the chest (abstract shapes only — no readable letters or words), sleeves long enough to cover part of the hands,\n` +
    `${panels},\n` +
    `framing: tight self-photo-booth close-up — face and upper chest filling each tall panel, the face large and slightly off-centre in some panels, the camera very close at eye level, a little playful and intimate,\n` +
    `plain cool lavender-grey #8D93B0 booth backdrop, no props,\n` +
    `lighting & colour: soft frontal booth light with a cool blue-lavender colour grade over the whole image (#9AA6CF cast in the shadows), slightly desaturated, gentle low contrast, smooth airy skin, dreamy cool-toned photo-booth aesthetic,\n` +
    `sharp focus on the eyes, photorealistic, high resolution,\n` +
    `STRICTLY: no text, no letters, no numbers, no brand names, no date stamp, no logo, no watermark anywhere.`
  );
}
