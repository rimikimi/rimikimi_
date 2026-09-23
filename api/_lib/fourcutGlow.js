// ============================================================
// 인생네컷 "글로우" 스타일 (오너 레퍼런스, 2026-09-23)
//   밝은 회백 무지 배경 + 흰 민소매 하이넥 니트 + 촉촉한 글로우 피부·코랄 글로시 입술,
//   검은 두꺼운 테두리의 필름 프레임 2×2. 컷마다 포즈가 확실히 다르다:
//   정면 기울임 → 어깨 너머 돌아보기 → 등 돌려 뽀뽀 입술 → 한 손으로 머리 쓸어올리기.
//   ① 얼굴/머리는 업로드 사진의 사람을 따른다(다른 컨셉과 같은 규칙)
//   ② 분할 수(2/3/4/6)에 맞춰 패널 포즈만 잘라 쓴다
//   ③ 색 묘사에는 hex 를 붙인다(전 컨셉 공통 규칙)
//   ④ 글자·숫자·로고 금지
// generate.js 와 scripts/test-fourcut.mjs 가 같은 코드를 쓴다.
// ============================================================

export const GLOW_POSES = [
  "facing the camera, head tilted slightly to one side, chin gently lowered, calm doe-eyed gaze straight into the lens, lips softly pouted and relaxed",
  "body turned away from the camera, looking back over the bare shoulder toward the lens, one shoulder raised close to the chin, soft sideways gaze",
  "back almost fully to the camera, head turned over the shoulder, playful kissy pout with lips pushed forward, eyes on the lens",
  "one arm raised with the hand running up through the hair at the crown, lifting the hair loosely, head tilted, relaxed dreamy gaze into the lens",
  // 5·6컷용 추가(같은 톤으로)
  "three-quarter angle, one hand lightly touching the jawline, gaze slightly downward then up to the lens, lips gently parted",
  "facing the camera, both hands tucking hair behind the ears, small soft smile, bright clear eyes",
];

const ORD = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };
const POS = {
  2: ["top", "bottom"],
  3: ["top", "middle", "bottom"],
  4: ["upper left", "upper right", "lower left", "lower right"],
  6: ["upper left", "upper right", "middle left", "middle right", "lower left", "lower right"],
};

export function buildGlowStrip(n, gridLabel) {
  const cols = gridLabel.replace(/ .*/, "");
  const rows = gridLabel.replace(/.* x /, "").replace(/ rows?/, "");
  const posNames = POS[n] || POS[4];
  const panels = GLOW_POSES.slice(0, n)
    .map((p, i) => `panel ${ORD[i + 1]} ${posNames[i]}: ${p}`)
    .join(",\n");

  return (
    `A Korean self photo-booth (인생네컷) print as ONE single image: a ${cols}x${rows} grid of ${ORD[n]} photo panels of the same person, ` +
    `each panel framed by a thick solid black #0A0A0A border like a photo-booth film frame, black gutters between panels, ` +
    `panel photos with slightly rounded corners, every panel fully inside the frame, none cropped,\n` +
    `THE PERSON: the SAME person in every panel — face identical to the uploaded reference image, preserved facial identity, exact facial features, natural likeness, ` +
    `their real hair color and length from the reference, styled long, glossy and voluminous with soft face-framing layers and airy loose strands, ` +
    `identical hair, outfit and makeup across all panels,\n` +
    `makeup: luminous dewy glass-skin complexion, bright clear porcelain tone with visible natural skin texture, soft rosy blush #F4C3BE on the cheeks, ` +
    `glossy peach-coral gradient lips #EE8E86 with a juicy lip-gloss shine, soft brown #7A5A48 eyeliner and fluttery lashes, light warm eyeshadow,\n` +
    `wardrobe: a fitted white #FFFFFF ribbed-knit sleeveless mock-neck (high-neck) top, bare shoulders and arms, no jewelry, no accessories,\n` +
    `${panels},\n` +
    `plain light grey-white #E9EAEC seamless studio backdrop, no props, clean negative space, head-and-shoulders to chest framing, subject centered in each panel, eye-level camera,\n` +
    `soft bright beauty lighting, large frontal beauty dish with gentle fill, high-key and airy, soft shadows, subtle dreamy bloom on highlights, ` +
    `smooth creamy tones, fresh idol photo-booth aesthetic, clean neutral color balance with no color cast,\n` +
    `sharp focus on the eyes, photorealistic, high resolution,\n` +
    `STRICTLY: no text, no letters, no numbers, no brand names, no date stamp, no logo, no watermark anywhere — the panels contain only the person and the plain backdrop.`
  );
}
