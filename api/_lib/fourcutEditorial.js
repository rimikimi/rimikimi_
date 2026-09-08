// ============================================================
// 인생네컷 "화보" 스타일 (오너 프롬프트, 2026-09-09)
//   흰 배경 + 직광 플래시 + 필름 컨택트시트 레이아웃. 오너가 준 프롬프트를 그대로 쓰되
//   ① 얼굴/머리는 업로드 사진의 사람을 따른다(다른 컨셉과 같은 규칙)
//   ② 분할 수(2/3/4/6)에 맞춰 레이아웃 줄과 패널 포즈만 잘라 쓴다
//   ③ 색 묘사에는 hex 를 붙인다(전 컨셉 공통 규칙)
//   ④ 글자·숫자·로고 금지(필름 가장자리 마킹 포함 — 다른 스타일과 같은 제약)
// generate.js 와 scripts/test-fourcut.mjs 가 같은 코드를 쓴다.
// ============================================================

// 패널별 포즈 — 오너 프롬프트의 panel one~four 원문
export const EDITORIAL_POSES = [
  "three-quarter body turned to the side, torso angled away, head twisted back toward lens, one arm bent with hand raised near chest, other arm crossed low over waist, hair swept dramatically across the shoulder, chin slightly lifted, direct piercing eye contact, lips parted",
  "seated square to camera, both forearms resting folded in front, shoulders relaxed and dropped, head tilted gently to one side, hair falling forward over both shoulders, warm half-smile, soft knowing gaze",
  "both arms raised overhead, elbows flared wide into a symmetric frame, hands meeting above the crown gathering hair up, exposed neck and jawline, chin tucked down, eyebrows raised, mischievous sidelong glance up at the lens",
  "upper body angled, head tipped back, chin raised high, downward-lidded haughty gaze, one shoulder dropped, hair cascading over one side, confident aloof expression",
  // 5·6컷용 추가(같은 톤으로)
  "standing square to camera, arms loose at the sides, weight on one hip, level unsmiling gaze straight into the lens, hair pushed back behind one ear",
  "profile turned almost fully to the side, eyes cut back toward the lens, one hand lifted to the back of the neck, jaw lifted, calm neutral mouth",
];

const ORD = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" };
const POS = {
  2: ["top", "bottom"],
  3: ["top", "middle", "bottom"],
  4: ["upper left", "upper right", "lower left", "lower right"],
  6: ["upper left", "upper right", "middle left", "middle right", "lower left", "lower right"],
};

export function buildEditorialStrip(n, gridLabel) {
  const cols = gridLabel.replace(/ .*/, "");
  const rows = gridLabel.replace(/.* x /, "").replace(/ rows?/, "");
  const layout = `${cols}x${rows} ${ORD[n]}-panel contact sheet grid`;
  const posNames = POS[n] || POS[4];
  const panels = EDITORIAL_POSES.slice(0, n)
    .map((p, i) => `panel ${ORD[i + 1]} ${posNames[i]}: ${p}`)
    .join(",\n");

  return (
    `${layout}, ${ORD[n]} separate studio portraits of the same person in one frame, thin white #FFFFFF gutters between panels, film contact-sheet layout, ` +
    `every panel fully inside the frame, none cropped,\n` +
    `THE PERSON: the SAME person in every panel — face identical to the uploaded reference image, preserved facial identity, exact facial features, natural likeness, ` +
    `their real hair color, length and texture from the reference, styled in loose undone waves with voluminous windblown texture, flyaway strands, tousled body wave, matte hair finish, ` +
    `deep crimson matte red #7A1B2E lipstick with sharp lip line, softly smudged bronze-taupe #8A6E5A eye shadow, subtle winged liner, ` +
    `dewy bare-skin complexion, minimal foundation, visible natural skin texture, sun-kissed neutral tone,\n` +
    `fitted black #0A0A0A sleeveless camisole tank top, thin spaghetti straps, sweetheart neckline, soft cotton-modal jersey, slightly sheer lightweight fabric, subtle stretch, body-skimming fit, ` +
    `no jewelry except a single thin silver #C0C0C0 ring, no accessories, minimalist wardrobe, identical hair, outfit and makeup across all panels,\n` +
    `${panels},\n` +
    `pure white #FFFFFF seamless paper backdrop, blown-out white background, no props, no furniture visible, edge-lit background falloff, faint soft shadow behind shoulder, clean negative space, ` +
    `cropped mid-torso to waist, tight to medium close framing, subject centered in each panel, eye level camera height${n >= 4 ? ", slight low angle on the fourth panel" : ""},\n` +
    `high-key lighting, direct hard on-camera flash, frontal strobe, crisp specular highlight on skin, deep contrast between shadow and highlight, hard-edged shadow under jaw and arms, glossy skin sheen, ` +
    `slightly overexposed highlights, crushed dark blacks #0A0A0A in hair and fabric, raw fashion snapshot aesthetic, direct-flash editorial, 90s and early 2000s fashion magazine test shoot, ` +
    `model polaroid casting session, unretouched candid energy,\n` +
    `shot on 35mm film, Canon EOS-1V, 85mm f/1.4 lens, f/5.6, ISO 400, Kodak Portra 400, fine film grain, natural halation, slightly desaturated palette, warm neutral skin tones, ` +
    `muted crimson red #7A1B2E, deep neutral black #0A0A0A, clean white #FFFFFF, no color cast, sharp focus on eyes, editorial retouch-free finish, high resolution, photorealistic,\n` +
    // 실측(9/9): 컨택트시트 레퍼런스를 넣었더니 구석에 브랜드 로고를 그려 넣었다 → 브랜드명·로고를 명시 금지
    `STRICTLY: no text, no letters, no numbers, no brand names, no film-edge markings, no date stamp, no logo, no watermark anywhere — the panels contain only the person and the white backdrop.`
  );
}
