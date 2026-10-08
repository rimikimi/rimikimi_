// ============================================================
// 브루클린(목적 사진) 생성 지시문 — picbox(Brooklyn) api/generate.js 78–1071행을 그대로 옮겼다(2026-10-09).
// 리미키미 홈 "이력서·프로필" 칸이 브루클린 룩 + 세부 조정 + 옷 사진으로 만든다(오너 지시: 브루클린 기능 그대로).
// ⚠️ 원본과 문구를 다르게 고치지 말 것 — 브루클린에서 실측으로 다듬은 문구다. 고칠 땐 양쪽을 같이.
// 생성 자체(크레딧·검사·갤러리)는 리미키미 generate.js 파이프라인을 탄다 → 얼굴·해부학·물리·배경 검사 공통.
// ============================================================
export const IDENTITY_PRESERVE =
  "Keep their exact face, identity, facial features, skin tone and natural likeness — " +
  "do not beautify, slim, smooth, reshape, or change who they are. " +
  "Keep the person's real proportions, shoulder width, neck and posture. ";

// 🔴 장면 전면교체 + 유령/중복 얼굴 금지 (2026-08-13). 실제 사고: 결과물에 원본 셀카의
//   주방 배경이 그대로 남고, 좌측 상단에 원본 얼굴이 반투명 유령처럼 한 번 더 합성됐다.
//   원인: 지시문이 배경을 "묘사"만 하고(“Background: …”) 원본 장면을 지우라고 명령하지
//   않았고, IDENTITY_PRESERVE 가 강해서 모델이 원본 픽셀을 그대로 붙여넣는 편집(inpaint)
//   모드로 동작했다. → "이건 편집이 아니라 새 사진"임을 맨 앞에서 못 박는다.
//   모든 스튜디오 카테고리(증명사진 포함)에 적용.
export const SCENE_REPLACE =
  "THIS IS A BRAND-NEW STUDIO PHOTOGRAPH, NOT AN EDIT of the input image. Use the input photo ONLY as a " +
  "reference for the person's facial identity. Do NOT keep, copy, reuse or blend ANY part of the input " +
  "photo's background, room, furniture, objects, text, lighting or framing — the original environment must be " +
  "completely gone and fully replaced by the studio backdrop described below. " +
  "The output must contain EXACTLY ONE person, rendered exactly ONCE: absolutely no duplicated, mirrored, " +
  "ghosted, semi-transparent or blurred second copy of the face or body anywhere in the frame, no collage, " +
  "no picture-in-picture, no overlaid cut-out, no visible seams or composite edges. " +
  "Rebuild the whole frame from scratch as one clean, continuous photograph. " +
  // 하단이 하얗게 녹아 사라지는 결함(주로 base 엔진)도 같이 막는다.
  "The person must be rendered FULLY and opaquely from head to the bottom crop line: no fading, dissolving, " +
  "bleaching or vanishing into the background, no soft white gradient eating the body or the frame edges, " +
  "no vignette blur. Every part of the frame is in focus as a normal photograph. ";

// 단색 스튜디오 배경 강제 — 증명사진·전문가·시그니처·입고싶은옷 전용.
//   실제 사고: 단색 배경을 지시했는데 창문·기둥·그림이 있는 로프트 공간이 만들어졌다.
//   🔴 배우 프로필은 제외 — "환경(environmental)" 룩이 일부러 야외/보케 배경을 쓴다.
export const SOLID_BACKDROP_ONLY =
  "BACKDROP — strictly enforced: the background is a plain, uniform, seamless studio backdrop in the single " +
  "solid color given above. It must contain NOTHING else: no windows, doors, walls with corners, pillars, " +
  "beams, furniture, plants, artwork, posters, patterns, signage, text, props, city views or any room or " +
  "environment of any kind. A subtle smooth tonal gradient is the only variation allowed. ";

// 의상 색상 문구: 프리셋 descriptor("dark navy") 또는 #hex 모두 지원.
export function outfitColorPhrase(c) {
  const v = String(c || "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
    const hex = v.startsWith("#") ? v : "#" + v;
    return "in the exact solid color " + hex.toUpperCase();
  }
  return v ? "in a " + v + " color" : "in a dark navy color";
}

// 이너(셔츠/블라우스) 색상 문구. 값이 없으면 기존 기본(화이트 계열)을 그대로 쓴다.
//   프리셋 descriptor("soft light blue") 또는 #hex 모두 지원.
export function innerPhrase(inner) {
  const v = String(inner || "").trim();
  if (!v) return "a clean white collared shirt";
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
    const hex = v.startsWith("#") ? v : "#" + v;
    return "a collared shirt/blouse in the exact solid color " + hex.toUpperCase();
  }
  return "a " + v + " collared shirt/blouse";
}

// 사진 같은 결과를 위한 공통 문구 — "AI 티" 억제.
//   원인: 매끈한 피부/완벽한 대칭/과한 샤프닝이 전형적인 생성형 룩을 만든다.
//   → 피부 질감(모공·잔주름·점·주근깨)과 자연스러운 비대칭을 "보존"하라고 명시하고,
//     실제 카메라 특성(85mm, 얕은 심도, 미세 그레인)을 요구한다.
// 🔴 2026-08-20: 이 블록이 "모공·솜털 필수 / 매끈·인형 얼굴 금지" 를 고정으로 박고 있어서
//   보정 100 밴드와 정면충돌했다. 문장 수도 저쪽이 훨씬 많아 모델이 이쪽 손을 들어줬고,
//   그래서 슬라이더를 끝까지 올려도 결과가 중간에서 멈췄다(오너 지적: "이 정도는 나와야 함").
//   해결: 피부 질감 조항만 보정 강도에 따라 말을 바꾼다. "진짜 사진처럼" 이라는 본래 목적과
//   점을 만들어내지 말라는 금지는 어느 강도에서도 그대로 유지한다.
const PR_HEAD =
  "CRITICAL — the output must look like a REAL PHOTOGRAPH taken by a professional photographer, " +
  "not an AI image, not a 3D render, not an illustration. ";
// 보정 79 이하 — 기존 그대로(질감 보존)
const PR_TEXTURE_KEEP =
  "BUT keep real skin STRUCTURE visible under that finish: natural pores, fine peach-fuzz and subtle surface " +
  "texture must remain — the face must never become a flat, poreless, airbrushed or plastic surface. ";
// 보정 80 이상 — 한국 뷰티 스튜디오의 의도된 마감. 질감 요구를 걷어낸다.
const PR_TEXTURE_GLASS =
  "The skin finish here is a DELIBERATE Korean beauty-studio retouch: a poreless, glass-smooth complexion is the " +
  "intended result, not a defect — do not add pores, peach-fuzz or surface texture back in. " +
  "It must still read as a photographed human being lit by real studio lights, not as CGI: keep true skin " +
  "translucency and subsurface warmth, keep soft real shadow falloff at the jaw and nose, and keep fine sensor grain. ";
// 회피 목록도 강도에 따라 달라진다 — 높은 보정에서는 '매끈·인형 같은'을 금지하면 안 된다.
const PR_AVOID_KEEP =
  "STRICTLY AVOID the typical AI/CGI look: waxy or plastic skin, over-smoothed or blurred faces, " +
  "doll-like or beautified features, exaggerated symmetry, glassy or over-bright eyes, over-sharpened edges, " +
  "halo outlines, unnatural bloom, oversaturated colors, and a rubbery CGI-perfect face. ";
const PR_AVOID_GLASS =
  "STRICTLY AVOID only the genuinely fake tells: waxy or rubbery plastic surfaces, melted or smeared features, " +
  "over-sharpened edges, halo outlines, unnatural bloom, oversaturated colors, and a CGI-rendered face. " +
  "A smooth, luminous, beautifully made-up face is CORRECT here and must not be dialled back. ";
// 🔴 2026-08-20, 세 번째 교훈: 피부 특징은 "지키라"는 맥락에서 이름만 불러도 그려진다.
//   오전에 "(a signature mole, dimples)" 예시를 지우면서 금지문을 넣었지만,
//   바로 앞 문장의 괄호 "(moles, dimples, scars)" 를 남겨둬서 절반만 고쳤다.
//   게다가 이 문장이 보정 밴드("잡티 전무")보다 뒤에 와서 그 지시를 되살리고 있었다.
//   해결: 어떤 강도에서도 점·흉터를 이름으로 부르지 않는다. 신원 유지는 골격으로 말한다.
// 🔴 오너 지시(2026-08-20): "뒤에서 되살리지 마."
//   순서만 바꾸는 건 미봉책이었다 — '원본의 피부 특징을 그대로 지켜라'라는 문장이
//   존재하는 한, 어디에 놓든 피부 판정을 되살릴 여지를 남긴다. 문장 자체를 없앤다.
//   신원은 피부 표면이 아니라 골격에서 온다. 피부에 무엇을 남길지는 오직
//   retouchFragment(보정 밴드) 하나만 결정한다 — 지시자를 하나로 만든다.
const PR_TAIL =
  "Identity lives in the STRUCTURE of the face, not in the skin surface: keep the bone structure, eye shape and " +
  "spacing, brow shape, nose, lips, jawline and hairline exactly as they are, and do not reshape the face. " +
  "Keep natural facial asymmetry (a real face is never perfectly symmetrical). " +
  "🔴 Nothing may be drawn onto the skin. What the skin shows is decided ONLY by the skin instruction below. ";
// 머리카락 처리도 강도를 따라간다 — 고보정에서 잔머리가 잔뜩 뜨면 스튜디오 결과물로 안 보인다.
const PR_HAIR_KEEP =
  "Keep real hair detail: individual strands, natural flyaways, a hairline that is not painted-on. ";
const PR_HAIR_GROOMED =
  "Hair is groomed to studio standard: individual strands and a real hairline stay visible, but stray flyaways and " +
  "frizz are smoothed away exactly as a retoucher would — no halo of loose backlit hairs around the head. ";
const PR_CAMERA =
  "Camera: full-frame DSLR with an 85mm lens at around f/2.8 — natural, believable depth of field, " +
  "true-to-life color, natural micro-contrast and a faint, fine sensor grain like a real photograph. ";

// 보정 강도를 모르는 호출부(증명사진 등)는 기존 동작 그대로 — 질감 보존이 기본값이다.
export function photorealism(retouch) {
  const n = Number.isFinite(Number(retouch)) ? Number(retouch) : 50;
  const glass = n >= 80;
  return PR_HEAD + (glass ? PR_TEXTURE_GLASS : PR_TEXTURE_KEEP) + PR_TAIL +
         (glass ? PR_HAIR_GROOMED : PR_HAIR_KEEP) +
         (glass ? PR_AVOID_GLASS : PR_AVOID_KEEP) + PR_CAMERA;
}
export const PHOTOREALISM = photorealism(50);
// 사실적 의상 렌더링 공통 문구 (플라스틱/붙인 듯한 느낌 방지).
// 스튜디오 촬영 전 "그루밍" — 실제 사진관에서 촬영 전에 해주는 수준의 손질.
//   피부 보정(PHOTOREALISM)과 별개로, 화장기 없이 밋밋해 보이는 문제를 잡는다.
//   과한 메이크업/필터 룩은 금지 — 어디까지나 본인 얼굴로 보여야 한다.
export const GROOMING =
  "GROOMING: present the person as if a professional studio groomed them just before the shoot. " +
  "For women (or anyone whose look suits it): soft, natural 'no-makeup makeup' that is clearly THERE but never heavy — " +
  "a light luminous even base that calms redness and brightens the complexion, softly groomed and defined brows, " +
  "subtly defined lashes, a neutral my-lips-but-better tone with a little life in it, and a healthy soft glow on the cheeks. " +
  "For men: clean grooming — tidy brows, evened-out and brightened but matte shine-free skin, " +
  "neatly trimmed facial hair or a clean shave, no visible makeup. " +
  "Hair is neatly styled and smoothed, no stray frizz, no bed-head. " +
  "The makeup must stay SOFT and natural — never heavy, theatrical, glittery, or beauty-filter-like, " +
  "and it must not change the face shape, features, or age of the person. ";

// 보정 0~100 · 메이크업 0~100 (오너 지시 2026-08-19). 두 축은 독립이다 —
//   "민낯인데 피부만 깨끗" 도, "피부는 그대로인데 화장은 진하게" 도 가능해야 한다.
//   🔴 예전엔 이 문구들이 PHOTOREALISM 안에 고정으로 박혀 조절이 불가능했다.
//   PHOTOREALISM 은 이제 "사진처럼 보이게"만 담당한다.
const RETOUCH_BANDS = [
  // 🔴 2026-08-20 오너 보고: 보정 0 에서 원본에 없던 잡티가 생겼다.
  //   예전 문구는 "모든 잡티·홍조·모공·유분·다크서클을 유지하라"고 나열했는데,
  //   모델이 그 목록을 "그려 넣어야 할 것"으로 읽었다(점 생성 사고와 같은 원인).
  //   해결: 유지할 대상을 열거하지 말고 "손대지 말라"는 금지형으로만 쓴다.
  // 🔴 2026-08-20 오너 결정: 예전 0 은 "원본 그대로"라 잡티를 열거해 유지시켰는데,
  //   모델이 그 목록을 "그려 넣을 것"으로 읽어 없던 잡티를 만들었다(점 생성 사고와 동일 원인).
  //   결점을 만들 위험을 감수하느니 최하단에서도 잡티는 지운다 — 오너 지시 "다 없애는 걸로 해".
  //   0 이 조절하는 것은 이제 "광·매끈함·밝기"이지 "결점 유무"가 아니다.
  // 🔴 문구를 세 번 고쳐도 계속 없던 잡티가 생겼다. 원인은 열거가 아니라 프레이밍이었다 —
  //   "보정 안 함 / 매트 / 질감 그대로" 같은 말이 모델에게 "결점을 보여줘"로 읽힌다.
  //   그래서 이 밴드에서는 질감·매트·무보정을 아예 언급하지 않는다. 깨끗함만 말하고,
  //   차이는 오직 '광(glow)'에서만 낸다. 모공 질감 보장은 PHOTOREALISM 쪽이 이미 담당한다.
  // 🔴 이름을 부르면 그려진다 — 금지문이어도 마찬가지다(오늘 다섯 번 확인).
  //   그래서 이 밴드에서는 결점을 '하나도 열거하지 않는다'. 긍정문으로만 쓴다.
  [0,   9,  "SKIN: a clear, even, healthy complexion — uniform in tone from forehead to jaw to neck, " +
            "smooth and unmarked throughout. " +
            "The finish is natural rather than glamorous: keep the skin's own colour and brightness, " +
            "add no glow, no dewy sheen, no highlighter, no whitening and no contouring. " +
            "This is what good skin looks like in plain daylight. "],
  [10, 29,  "SKIN: minimal clean-up only — calm redness and remove obvious temporary blemishes. Tone and texture otherwise untouched, pores and fine lines clearly visible. "],
  [30, 54,  "SKIN: professional portrait retouching — even out tone, clear temporary blemishes and shine, soften under-eye shadows, lift brightness one step. Pores and fine peach-fuzz stay visible. "],
  [55, 79,  "SKIN: bright polished beauty finish — clear even luminous skin lifted about two steps, dewy sheen on cheekbones, nose bridge and brow bone, under-eyes clearly brightened. Fine texture still readable up close. "],
  // 🔴 오너 레퍼런스(2026-08-20): 한국 뷰티 스튜디오 프로필의 '물광/유리알 피부' 수준.
  //   이전 문구는 "미세 질감은 살아남아야 한다"는 단서 때문에 중간에서 멈췄다.
  [80, 100, "SKIN — MAXIMUM RETOUCH (this overrides every other instruction about preserving blemishes, pores, " +
            "texture or looking natural): the full Korean beauty-studio '물광' glass-skin finish. " +
            "Completely even porcelain complexion with NO visible pores, NO blemishes, NO redness, NO shine-through " +
            "texture. Under-eye shadows fully erased, the whole face lifted several steps to a bright milky luminance. " +
            "Wet-looking dewy highlights sit on the cheekbones, the bridge and tip of the nose, the brow bones, the " +
            "cupid's bow and the chin, as if lit by a large frontal beauty softbox. Neck, ears and hands are retouched " +
            "to exactly the same finish so nothing gives it away. " +
            "This is the deliberate look of a premium Korean profile-photo studio — do NOT hold back for the sake of realism. "],
];
const MAKEUP_BANDS = [
  [0,   9,  "MAKEUP — NONE (overrides any 'groomed' or 'polished' wording elsewhere): a completely bare face. " +
            "No foundation, no concealer, no lip colour, no eye makeup, no brow filling, no blush, no highlighter. " +
            "Lips are their natural colour. The face is simply the person's own bare face — " +
            "🔴 do NOT add tiredness, dullness, blemishes or sallow tone to signal that makeup is absent. "],
  [10, 29,  "MAKEUP: barely-there grooming — tidy brows and a balm-level lip. No visible base or eye makeup. "],
  [30, 54,  "MAKEUP: soft natural 'no-makeup makeup' — light luminous base, groomed brows, subtly defined lashes, my-lips-but-better tone, healthy glow on the cheeks. "],
  [55, 79,  "MAKEUP: visible but tasteful — smooth glowing base, defined brows, softly shaded lids, curled lashes, flushed cheeks and a fresh tinted lip. "],
  // 🔴 오너 레퍼런스(2026-08-20): 아이돌 프로필 메이크업. 이전 "soft glam" 은 너무 밋밋했다.
  [80, 100, "MAKEUP — MAXIMUM (overrides any 'no-makeup', 'subtle' or 'natural' wording elsewhere): " +
            "full Korean idol-profile makeup, clearly and unmistakably made up. " +
            "Dewy glass base with a wet luminous sheen. Soft pink-peach blush laid high and wide across the cheeks " +
            "and carried lightly under the eyes, with a bright highlight on the aegyo-sal (under-eye ridge). " +
            "Lids washed in a soft pink-brown shimmer, upper lashes long and curled, lower lash line softly defined, " +
            "a subtle inner-corner highlight. Brows softly arched in a warm brown, brushed and filled but not hard-edged. " +
            "Glossy gradient lip — deeper at the centre, fading outward — with a visible wet specular highlight. " +
            "For men at this level, keep it grooming-only: evened base, defined brows, matte finish, no colour makeup. " +
            "Polished and camera-ready like a studio profile shot — never stage, costume, festival or editorial-avant-garde makeup. "],
];
const pick = (bands, v) => {
  const n = Math.max(0, Math.min(100, Number.isFinite(Number(v)) ? Number(v) : 50));
  return (bands.find(([lo, hi]) => n >= lo && n <= hi) || bands[2])[2];
};
// 어느 강도에서든 사람이 바뀌면 안 된다.
export const RETOUCH_GUARD =
  "In every case: never reshape the face, never slim or enlarge features, never change eye size, jaw or nose, " +
  "never alter the person's age or ethnicity. The result must remain unmistakably the same person. " +
  // 어느 강도에서도 "없던 결점을 만들어내는 것"은 금지 — 0 에서도 마찬가지다.
  //   🔴 특히 주근깨: "질감을 살려라"를 모델이 주근깨를 그릴 명분으로 삼았다(2026-08-20 오너 보고).
  //   질감 = 모공·솜털이지 반점이 아니라는 것을 못 박는다.
  // 🔴 여기도 결점을 열거하고 있었다 — 금지 목록이 곧 생성 목록이 된다. 열거를 없앤다.
  "At EVERY setting, including the lowest: the skin is rendered exactly as the skin instruction describes it, " +
  "and nothing whatsoever is added on top. If the source skin is clear, every version of this photo is clear. " +
  "'Skin texture' means pores and fine peach-fuzz only — it is never a reason to draw marks onto the face. ";
export function retouchFragment(retouch, makeup) {
  return pick(RETOUCH_BANDS, retouch) + pick(MAKEUP_BANDS, makeup) + RETOUCH_GUARD;
}

export const REALISTIC_GARMENT =
  "The clothing must look like REAL, photographed garments with a bespoke, made-to-measure " +
  "tailored fit precisely following the person's own frame — natural fabric texture and weave, " +
  "subtle natural creases and soft fabric shadows, collars and lapels that lie flat and sit " +
  "naturally and symmetrically. STRICTLY AVOID any artificial look: no plastic/glossy/rubbery " +
  "fabric, no painted or illustrated appearance, no stiff cardboard collar, no floating or " +
  "pasted-on garment, no costume-like styling, no AI artifacts. ";

// 🔴 인체 비율/프레이밍 가드 (2026-08-13). 실제 사고: 전신에 가까운 컷에서 머리가 작아지고
//   상체·어깨가 거대해진 "가분수 역전" 결과가 나왔다(특히 base 엔진). 포즈 문구의
//   "upper-body / mid-thigh framing" 만으로는 모델이 전신으로 빼면서 비율을 무너뜨린다.
//   → 반신 크롭 + 머리 크기 + 어깨/몸통 확대 금지를 명시적으로 못 박는다.
//   증명사진(buildIdPhoto)은 자체 프레이밍 규칙이 있어 여기에 넣지 않는다.
export const HUMAN_PROPORTION =
  "BODY PROPORTIONS — this is critical: render an anatomically correct adult body that matches the person's " +
  "OWN build from the photo. The head must be a natural size relative to the body (about one seventh of full " +
  "standing height). NEVER shrink the head, and NEVER enlarge, widen, lengthen or inflate the torso, shoulders, " +
  "chest or arms; do not stretch or elongate the body vertically. Shoulder width, neck thickness, arm length " +
  "and hand size must stay consistent with the face and read as a real photograph of one person. " +
  "The whole head stays inside the frame with a small clear margin above the hair. ";

// 반신 프레이밍 가드 — 전신 포즈(뷰티 프로필의 sp_full_standing 등)에는 붙이지 않는다.
//   붙이면 "전신으로 찍어라"와 "전신 금지"가 충돌해 구도가 무너진다.
export const HALF_BODY_FRAMING =
  "FRAMING: deliver a HALF-BODY portrait — frame from just above the head down to somewhere between the waist " +
  "and mid-thigh. Do NOT deliver a full-length / head-to-toe shot, and do not shrink the person inside a large " +
  "empty background. The face must be large enough to read clearly as the subject of the photograph. ";

// 표정 단편 — 클라이언트 EXPRESSIONS id 와 동일한 키. 포즈 뒤에 강하게 덮어씀.
export const EXPRESSION_FRAGMENTS = {
  neutral:
    "FACIAL EXPRESSION: a calm, relaxed neutral expression with the mouth gently closed and a natural, composed look.",
  slight_smile:
    "FACIAL EXPRESSION: a subtle, gentle closed-mouth smile — warm and natural, eyes softly engaged, not exaggerated.",
  bright_smile:
    "FACIAL EXPRESSION: a bright, genuine, friendly smile showing a little teeth, cheeks lifted naturally, warm and approachable.",
  serious:
    "FACIAL EXPRESSION: a serious, composed, confident expression with no smile, mouth closed, a calm and focused gaze.",
};

// 촬영 앵글 단편 — 전문가 프로필 전용. 클라이언트 ANGLES id 와 동일한 키.
//   🔴 포즈 단편 일부가 "standing front-facing" 처럼 정면을 이미 명시하므로,
//      앵글은 포즈 뒤에 오면서 "앞의 서술을 덮어쓴다"고 못 박아야 실제로 반영된다.
export const ANGLE_FRAGMENTS = {
  front:
    "CAMERA ANGLE: shoot straight-on from the front (0°) — shoulders squared to the camera, face looking directly into the lens. This overrides any conflicting angle described above.",
  a15:
    "CAMERA ANGLE: a subtle 15° turn — the body and head rotate only slightly (about 15 degrees) off-axis while the eyes look straight into the lens. Almost frontal, just enough to soften the symmetry. This overrides any conflicting angle described above.",
  a30:
    "CAMERA ANGLE: a 30° turn — the body rotates about 30 degrees away from the camera, the face turns back toward the lens, both eyes clearly visible. A natural, flattering business-portrait angle. This overrides any conflicting angle described above.",
  a45:
    "CAMERA ANGLE: a classic three-quarter 45° view — the body rotates about 45 degrees away while the face turns back to the lens, giving depth and a slimmer jawline. The far eye remains fully visible. This overrides any conflicting angle described above.",
  a60:
    "CAMERA ANGLE: a strong 60° turn approaching profile — the body is clearly angled away, the face turns back toward the camera; the far cheek and far eye are still visible but foreshortened, creating a dramatic, editorial line. This overrides any conflicting angle described above.",
};
export const ANGLE_KEYS = ["front", "a15", "a30", "a45", "a60"];

// 의상 참고 이미지 — 마지막 입력 이미지의 "옷만" 가져온다.
//   프롬프트 맨 끝에 붙여 앞의 의상 색/종류 서술을 덮어쓴다.
//   ⚠️ 참고 이미지의 얼굴·몸·배경은 절대 쓰지 않는다(인물은 1번 사진 고정).
export const OUTFIT_REF_INSTRUCTION =
  "OUTFIT REFERENCE — the LAST provided image is a CLOTHING reference, not a person reference. " +
  "Dress the person in the garment shown in that reference image: match its garment type, cut, collar/neckline, " +
  "sleeve and lapel shape, color and fabric texture as closely as possible, naturally re-fitted to THIS person's " +
  "body, posture and the lighting of this portrait. " +
  "This OVERRIDES any clothing color or garment description stated earlier in this prompt. " +
  "Completely IGNORE the face, body, hair, pose and background of anyone appearing in the reference image — " +
  "the identity always comes from the FIRST photo only. " +
  "Do not reproduce brand logos, printed graphics or text from the reference garment; render it as a plain, " +
  "realistic version of the same garment. " +
  // 🔴 팔/소매 해부 가드 (2026-08-29). 실제 사고: 쇼핑몰 평면 제품컷(소매가 양옆으로 펼쳐진
  //   사진)을 참고로 주면, 모델이 **참고컷의 소매 배치를 그대로 몸에 옮겨 그려서** 흰 소매가
  //   몸통을 사선으로 가로지르고 손목·손이 사라졌다. 앞의 "naturally re-fitted to THIS person's
  //   body" 만으로는 안 잡힌다 — 참고컷이 평면일 수 있다는 사실 자체를 알려줘야 한다.
  //
  //   ⚠️ 효과는 **증명되지 않았다.** 실측 A/B(gemini-3-pro-image, 2K, 동일 참고컷·포즈):
  //     현행 프롬프트 12장 중 1장 실패 / 가드 추가 12장 중 0장 실패.
  //     0/12 vs 1/12 는 통계적으로 무의미하다(우연으로 충분히 나오는 차이).
  //   기저 실패율이 12장에 1장 수준이라 이 표본으로는 개선을 판정할 수 없었다.
  //   그럼에도 넣은 이유: 비용은 요청당 토큰 수백, 이미 원하는 방향의 제약이라 부작용
  //   위험이 사실상 없고, 12장 육안 검수에서 의상 재현·화질 저하가 관찰되지 않았다.
  //   → "검증된 개선"이 아니라 "싸고 안전한 베팅"으로 들어간 문구다. 지우지 말 것.
  //   재현/재측정: `node _outfittest.mjs` (조건별 N=env N), `node _contactsheet.mjs <조건>`.
  "The reference image may be a flat-lay, hanger, mannequin or folded product shot. Read only the garment's " +
  "three-dimensional shape from it and DRESS the person in it — never copy the reference's flat layout, drape, " +
  "or sleeve position into the portrait. " +
  "ARMS AND SLEEVES — this is critical: both arms stay anatomically correct and attached at the shoulders, with " +
  "natural human length and clearly inside their sleeves; each sleeve follows the arm it covers and ends at the " +
  "wrist. A sleeve must NEVER hang loose across the torso, drape diagonally over the body, extend below the hem " +
  "of the outer garment, or appear as empty fabric without an arm inside it. If a hand is within the frame it must " +
  "be fully and correctly rendered. ";

// 배우 프로필 의상 종류 단편 — concepts.json outfits[].id 와 동일한 키.
export const ACTOR_OUTFIT_FRAGMENTS = {
  actor_outfit_formal:
    "a classic tailored formal suit — sharp blazer with matching trousers and a dress shirt (tie optional for men, elegant blazer with tailored trousers or pencil skirt for women) — polished, timeless, and authoritative.",
  actor_outfit_smart:
    "a smart-casual outfit — a well-fitted blazer or structured jacket over a neat open-collar shirt or blouse, paired with tailored trousers or neat jeans — sophisticated yet relaxed and approachable.",
  actor_outfit_casual:
    "a relaxed, natural casual outfit — clean well-fitted jeans or casual trousers with a simple well-fitted t-shirt, casual shirt, or relaxed top — effortlessly approachable and natural.",
  actor_outfit_street:
    "a fashionable urban street-style outfit — layered contemporary pieces with a trendy silhouette (e.g. oversized jacket, graphic tee, wide trousers or cargo pants, or a stylish co-ord set) — energetic, current, and expressive.",
  actor_outfit_black:
    "a dramatic all-black ensemble — sleek and intentional total-black look (black turtleneck or shirt, black trousers or skirt, black blazer or jacket as appropriate) — intense, sophisticated, and cinematic.",
  // 2.0 오디션 스튜디오 씬(st_) 의상 — 리미키미 스튜디오 화보의 옷을 성별 무관하게 옮겼다. 색이 룩의 일부라 색 오버라이드는 받지 않는다.
  st_white_tee:
    "a plain white crewneck cotton t-shirt with simple dark trousers — honest and minimal so nothing competes with the face.",
  st_sculptural_white:
    "a sculptural avant-garde all-white outfit with an exaggerated architectural shoulder — for women a structured asymmetric mini dress with sleek silver heels, for men a structured oversized white suit with a sharp exaggerated shoulder line and sleek white shoes.",
  st_db_charcoal:
    "a sharply tailored charcoal double-breasted suit over a fine black knit polo, no tie, polished black leather shoes and a minimal steel watch.",
  st_collarless_black:
    "an avant-garde black tailored suit — a sharply structured collarless jacket fully fastened, wide-leg pleated trousers and polished black shoes.",
  st_shirt_tie:
    "an oversized white pinstripe dress shirt open at the collar with the sleeves pushed up, a black satin necktie hanging untied over the shoulders, high-waisted black wide-leg trousers and pointed black shoes — androgynous tailoring.",
  st_ivory_power:
    "a precisely tailored ivory fine-stripe power suit with wide structured lapels, wide-leg trousers with a clean press crease and gold pointed-toe shoes.",
  st_black_satin:
    "an oversized black double-breasted blazer with satin peak lapels over black tailored trousers and sleek silver pointed shoes.",
  st_white_longsleeve:
    "a fitted white long-sleeved V-neck top (a bodysuit for women) with simple fitted dark trousers, barefoot.",
  st_liquid_silver:
    "a sculptural molten-silver liquid-metal outfit — for women a halter gown with an architectural asymmetric hem, for men a liquid-silver satin suit worn with an open collar — with one long silver earring.",
  st_black_turtleneck:
    "a black fine-knit ribbed turtleneck sweater with long sleeves and a subtle sheen.",
  st_ivory_silk:
    "an off-white silk blouse or shirt with a soft open neckline.",
};

// 포즈/구도 단편 — concepts.json poses[].id 와 동일한 키.
// 배우 프로필 "룩(무드)" — 캐스팅 업계 기준(커머셜/띠어트리컬 구분, 주얼톤 배경,
//   질감 의상, 환경 보케, 로우키, 흑백)을 반영. 배경·조명·의상 방향을 한 세트로 묶는다.
//   포즈/의상종류 선택과 함께 쓰이며, 이 문구가 배경·조명을 최종 결정한다.
export const ACTOR_LOOK_FRAGMENTS = {
  commercial:
    "LOOK — COMMERCIAL casting headshot: the bright, friendly 'easy to work with' look used for ads and campaigns. " +
    "Wardrobe: layered smart-casual with visible natural texture (soft knit or crisp button-down) in a warm mid-tone. " +
    "Background: clean bright light-grey studio seamless with gentle falloff. " +
    "LIGHTING: soft, bright, even lighting with clear catchlights — open and airy. FRAMING: chest-up with the eyes in the upper third.",
  theatrical:
    "LOOK — THEATRICAL casting headshot: grounded, dramatic film/TV look. " +
    "Wardrobe: muted, character-appropriate textured layer (heather knit, washed denim shirt or soft leather jacket) — no logos or patterns. " +
    "Background: deep charcoal grey studio with a subtle gradient and clean subject separation. " +
    "LIGHTING: soft directional key with controlled shadow and strong catchlights — quiet intensity. FRAMING: tight chest-up, the eyes dominate.",
  jewel:
    "LOOK — EDITORIAL jewel-tone portrait: a rich saturated jewel backdrop (deep emerald, teal, burgundy or plum) with wardrobe in a complementary muted tone " +
    "(charcoal knit or black turtleneck) so nothing competes with the eyes. " +
    "LIGHTING: soft key plus a gentle rim separating the hair from the deep background — cinematic yet natural. FRAMING: chest-up.",
  environmental:
    "LOOK — ENVIRONMENTAL portrait: the person stands in a softly blurred outdoor setting (warm brick, greenery or city bokeh) in open shade. " +
    "Wardrobe: textured casual — denim shirt or knit sweater. " +
    "LIGHTING: soft natural daylight, warm ambience, creamy background bokeh, shallow depth of field. FRAMING: chest-up.",
  lowkey:
    "LOOK — LOW-KEY cinematic portrait: a dark moody frame with a single soft side key sculpting the face, deep controlled shadows and strong eye catchlights. " +
    "Wardrobe: plain black knit or dark textured jacket. Background: near-black studio with a subtle glow behind the shoulder. FRAMING: tight and cinematic.",
  mono:
    "LOOK — CLASSIC BLACK AND WHITE headshot: timeless monochrome with a rich tonal range, clean mid-grey studio background and a simple textured top. " +
    "LIGHTING: soft directional studio light with beautiful gradation and crisp catchlights. FRAMING: chest-up. The final image must be genuinely black and white.",
  // ── 2.0 오디션 스튜디오 씬(st_) — 리미키미 스튜디오 화보(오너 선택 2026-09-30)의 세트·조명·색만 옮겼다.
  //    의상은 st_ 의상, 자세는 st_ 자세가 정한다. {BG} = 배경색(세부 조정 '배경'으로 바뀐다).
  //    "LIGHTING OVERRIDE" 가 들어 있으면 buildActorProfile 이 공통 소프트 조명 문장을 붙이지 않는다.
  st_moody_film:
    "LOOK — MOODY FILM STUDIO portrait: a minimalist studio with a solid, softly textured {BG} backdrop. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): moody low-key light — one soft directional side light, dramatic cinematic shadows with a gentle chiaroscuro falloff, the eyes stay bright and readable. " +
    "COLOR & TEXTURE: muted vintage tones with subtle 35mm film grain and shallow depth of field — intimate and evocative, still a clean studio photograph.",
  st_cobalt_mirror:
    "LOOK — AVANT-GARDE COBALT campaign shot in a studio: a saturated {BG} seamless backdrop and a glossy mirrored floor that reflects the person cleanly below. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): a single hard strobe from high camera-left creating crisp geometric shadows on the backdrop — high contrast, bold and graphic. " +
    "COLOR: a deep saturated blue field against clean whites, fashion-house campaign polish.",
  st_spotlight:
    "LOOK — SPOTLIGHT campaign editorial in a studio: a deep {BG} seamless backdrop and a low brushed-metal stool as the only prop. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): a single hard spotlight from high camera-left carving strong dramatic shadows and a pool of light on the floor, deep falloff into darkness, crisp fabric texture — the face stays clearly lit.",
  st_rimlight_strips:
    "LOOK — RIM-LIGHT campaign in a studio: a deep {BG} seamless backdrop with two tall strip softboxes visible at the left and right edges of the frame behind the person. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): dramatic rim light from the two strip boxes outlining the silhouette plus a soft frontal fill keeping the face readable, rich deep blacks — refined high-fashion polish.",
  st_bw_cyclorama:
    "LOOK — BLACK-AND-WHITE fashion editorial: a bare seamless studio cyclorama with a smooth graduated {BG} backdrop, a pale floor sweeping up into the wall with no visible horizon, and a slim chrome-framed folding chair as the only prop. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): one large diffused key placed high and frontal with soft gradient falloff, subtle rim separation along the shoulders and jaw, a soft pool of light around the chair. " +
    "The final image is a true black-and-white photograph with a rich tonal range.",
  st_crimson_sphere:
    "LOOK — CRIMSON POWER editorial: a minimalist seamless matte {BG} studio — floor and backdrop the same color — with a single oversized reflective metallic gold sphere as the only prop. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): soft even studio light from overhead and bilateral diffusers, gentle fill with no harsh shadows, ultra-clean and hyper-sharp — a sculptural, modern power-dressing mood.",
  st_red_cube:
    "LOOK — RED SPACE low-key editorial: an abstract deep {BG} studio space with a single matte black geometric cube as a pedestal. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): dramatic low-key studio light with a rim light catching the hair and shoulder, high contrast, rich blacks and cinematic color grading — the face stays clearly lit.",
  st_bw_floor:
    "LOOK — HIGH-CONTRAST BLACK-AND-WHITE studio: a seamless grey floor sweeping into a dark {BG} studio backdrop, nothing else in the set. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): professional studio light with sculpted highlights and soft deep shadows, high contrast. " +
    "The final image is a true black-and-white photograph.",
  st_lowkey_velvet:
    "LOOK — LOW-KEY CLOSE-UP editorial: the person rests on a dark velvet-draped studio platform against a minimal {BG} background. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): chiaroscuro side light with a soft rim on the hair, cool blue undertones in the shadows and warm natural skin tones, very shallow depth of field — cinematic and intense, tasteful and never sensual.",
  st_silver_pool:
    "LOOK — SILVER SPOTLIGHT avant-garde campaign: a flooded minimalist studio set — the person stands in a shallow black reflecting pool against a dark {BG} void, the full figure mirrored in the still water. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): a single hard beam of cold white light from a high side angle cutting through the darkness, deep shadow falloff and metallic highlights — the face stays clearly lit. " +
    "STYLING: hair slicked back with a wet-look finish unless another hairstyle is specified.",
  st_purple_hat:
    "LOOK — PURPLE BEAUTY-EDITORIAL in a studio: a warm {BG} seamless backdrop. ACCESSORY: a bold wide-brimmed off-white hat with a deep purple ribbon band (pearl drop earrings for women). " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): a soft key with a gentle glow across the face, controlled elegant shadows and soft background falloff — refined, luxurious and glamorous.",
  st_hat_shadow:
    "LOOK — HAT-SHADOW fashion editorial: a seamless solid {BG} studio backdrop with a subtle gradient, lighter behind the person. " +
    "ACCESSORY: a structured wide-brimmed flat-top boater hat in off-white felt with a thick black ribbon band. " +
    "LIGHTING OVERRIDE (use this instead of any generic lighting direction): directional light from above so the brim casts a crisp dramatic shadow across the forehead and brow line — the eyes must stay visible and readable — with sharp definition on the jaw and lips; minimalist, geometric and mysterious.",
};

// 뷰티 프로필 의상 — 오너가 준 레퍼런스 86장에서 반복적으로 나온 옷만 추렸다.
//   공통: 목선이 깨끗하고 장식이 적어 얼굴로 시선이 가는 상의. 정장·재킷 없음.
// 렌즈·심도 — 뷰티 프로필의 핵심 차이(오너 지적 2026-08-19).
//   레퍼런스 공통: 조리개를 활짝 연 얕은 심도로 얼굴만 칼같이 서고 배경이 뭉개진다.
//   공통 PHOTOREALISM 은 85mm f/2.8 이라 이보다 깊다 → 이 문구가 뒤에 붙어 덮어쓴다.
export const BEAUTY_DOF =
  "LENS & DEPTH OF FIELD (this overrides any other lens or aperture description): shot on a fast portrait prime " +
  "(85mm or 105mm) wide open at about f/1.4–f/2. VERY shallow depth of field: the eyes and eyelashes are " +
  "tack-sharp as the single focal plane, the ears and hair edges already fall off softly, and the background " +
  "melts into smooth creamy bokeh with no visible texture. Strong subject separation — the face pops off the " +
  "background. Focus is locked on the near eye. ";

// 보정 강도에 따라 "얼굴 외 요소를 흐리게 날리는" 정도를 같이 올린다(오너 지시 2026-08-19).
//   목표는 ethereal — 얼굴만 또렷하고 나머지는 부드럽게 녹아드는 몽환적인 느낌.
//   BEAUTY_DOF(렌즈 심도)와 별개로, 후보정에서의 소프트포커스·헤일레이션을 다룬다.
// 헤일레이션 — 오너가 보낸 레퍼런스의 핵심: 배경을 과노출로 날리고 그 빛이 번져
//   머리카락 윤곽을 감싸는 몽환적 발광. 백라이트가 프레임에 새어 들어온 느낌.
const HALATION =
  "BACKLIGHT & HALATION: place a soft backlight behind the subject so the background blows out to near-pure white " +
  "with a luminous glow, and let that light bloom around the hair outline and shoulders — a hazy halation that " +
  "wraps the silhouette and softly veils the edges of the frame. Keep the face itself clean and correctly exposed; " +
  "the glow surrounds the subject, it does not wash out the eyes. ";

export function etherealFragment(retouch) {
  const n = Math.max(0, Math.min(100, Number(retouch) || 0));
  if (n < 10) return "Everything in the frame is rendered with normal, even sharpness — no artificial softening. ";
  if (n < 30) return "A very slight softness away from the face; the frame stays essentially crisp. ";
  if (n < 55) {
    return "ETHEREAL FALLOFF (gentle): keep the eyes, lips and nose crisp while letting the hair edges, shoulders, " +
      "clothing and background go slightly soft. A whisper of diffusion overall. ";
  }
  if (n < 80) {
    return "ETHEREAL FALLOFF (clear): the face is the only crisp area — hair ends, shoulders, fabric and background " +
      "are noticeably soft and out of focus. " + HALATION;
  }
  return "ETHEREAL FALLOFF (strong): only the eyes, lashes, lips and nose stay sharp; everything else — hair, " +
    "shoulders, clothing, background — melts into soft focus, like a soft-focus filter over a dream. " + HALATION +
    "The image glows gently, yet the eyes remain clear and detailed so the face never looks blurred. ";
}

export const BEAUTY_OUTFITS = {
  lace_puff:
    "a soft romantic blouse in delicate lace or embroidered chiffon with gently puffed short sleeves and a fine " +
    "scalloped neckline — airy, feminine and light, fabric that catches the light softly",
  satin_slip:
    "a fine satin camisole / slip top with thin straps and a smooth draping neckline — quiet sheen, elegant and simple",
  off_shoulder:
    "an off-shoulder top with a soft gathered or shirred neckline that leaves the collarbones and shoulder line bare — " +
    "delicate and graceful",
  fine_knit:
    "a fine-gauge sleeveless knit top with a clean round or square neckline — smooth, minimal, quietly premium",
  sheer_blouse:
    "a sheer chiffon blouse with long flowing sleeves worn over a simple camisole — translucent, floaty fabric with " +
    "soft movement",
  crisp_shirt:
    "a crisp cotton shirt worn relaxed with the collar open — clean, fresh and effortless",
};

// 뷰티 프로필 "룩" — 레퍼런스에서 반복되는 배경·조명 조합. 배경/조명을 한 세트로 결정한다.
export const BEAUTY_LOOKS = {
  white_highkey:
    "LOOK — WHITE HIGH-KEY: a bright, clean white seamless studio background with soft even falloff. " +
    "LIGHTING: large soft frontal key with generous fill — bright and almost shadowless. This describes the LIGHT only; it must not add any skin retouching or glow beyond the skin setting given below. " +
    "bright catchlights in the eyes, airy and fresh. The signature Korean profile-studio look.",
  warm_ivory:
    "LOOK — WARM IVORY: a soft ivory / warm cream seamless backdrop with a gentle gradient. " +
    "LIGHTING: warm soft key from the front-side with soft shadow on the far cheek — cozy, flattering, " +
    "slightly golden skin rendering while staying natural.",
  cool_grey:
    "LOOK — COOL GREY STUDIO: a smooth light-to-mid grey seamless backdrop with subtle vignette. " +
    "LIGHTING: crisp soft key with controlled contrast and a clean rim separating hair from the background — " +
    "modern, editorial, slightly cooler tone.",
  dark_mood:
    "LOOK — DARK MOOD: a deep charcoal / near-black backdrop. " +
    "LIGHTING: single soft key sculpting the face with gentle falloff and strong eye catchlights, " +
    "quiet and elegant. Wardrobe reads dark and minimal.",
};

// 흑백 변환 — 카테고리 무관 전역 토글. 프롬프트 맨 끝에 붙여 색을 확실히 제거한다.
export const MONO_INSTRUCTION =
  "FINAL COLOR TREATMENT — the output MUST be a true BLACK AND WHITE (monochrome) photograph: " +
  "no color anywhere, rich full tonal range from deep blacks to clean whites, film-like grayscale gradation, " +
  "preserved skin texture and strong eye catchlights. Do not leave any color tint or partial coloring. ";

export const POSE_FRAGMENTS = {
  // 증명사진
  id_shoulders:
    "FRAMING: standard ID/passport head-AND-shoulders crop. The ENTIRE head must be inside the frame — never crop the top of the head or hair, always leave clear headroom above the hair. — zoom out a little, do NOT crop tightly on the face. " +
    "The whole head with a small margin above the hair AND the entire shoulder line down to roughly the upper chest are clearly visible. Both shoulders fully in frame; never cut off the shoulders.",
  id_neckline:
    "FRAMING: tighter ID crop ending around the neckline. CRITICAL: the ENTIRE head including the very top of the hair must remain fully inside the frame with visible headroom above it — never cut off the top of the head. — the head and face fill more of the frame, cropping just below the collar/neckline so only the very top of the shoulders shows. Keep a small even margin above the hair; keep the face centered and perfectly front-facing.",
  // 전문가 프로필
  pro_arms_crossed:
    "POSE: standing front-facing with arms confidently crossed over the chest, shoulders relaxed, a calm approachable expression. Upper-body framing down to about the waist.",
  pro_hand_pocket:
    "POSE: standing in a relaxed three-quarter stance with one hand casually tucked into a trouser pocket and the other arm natural at the side, a light confident smile. Upper-body to mid-thigh framing.",
  pro_seated:
    "POSE: seated on a modern chair, body angled slightly, leaning a touch forward with hands resting naturally (lightly clasped or on a knee), a warm professional expression. Upper-to-mid body framing.",
  pro_standing:
    "POSE: standing front-facing in a composed, calm posture — optionally leaning lightly against a desk or ledge with arms relaxed at the sides. Upper-body framing.",
  // 뷰티 프로필 — 오너가 준 레퍼런스 86장에서 반복되는 구도만 뽑았다.
  sp_bust_soft:
    "POSE & FRAMING: front-facing bust-up portrait, shoulders relaxed and squared, chin slightly down, " +
    "a soft closed-lip smile and calm eyes looking straight into the lens. Clean, simple, symmetrical composition.",
  sp_hand_face:
    "POSE & FRAMING: three-quarter turn with one hand raised gently to the jawline, cheek or collarbone — " +
    "fingers relaxed and elegant, never covering the face. Head tilted a touch toward the shoulder, soft gaze. Bust-up framing.",
  sp_over_shoulder:
    "POSE & FRAMING: body turned away from the camera and the head looking back over the shoulder, " +
    "the line of the neck and shoulder clearly visible, gaze into the lens. Upper-body framing.",
  sp_seated_lean:
    "POSE & FRAMING: seated or leaning with the forearm resting on a surface (or against a wall), body angled " +
    "about 30 degrees, weight settled and relaxed, an unhurried natural expression. Upper-to-mid body framing.",
  sp_hair_touch:
    "POSE & FRAMING: one hand lifted into the hair, sweeping a strand back from the face or resting lightly at the " +
    "temple — wrist soft, elbow raised naturally. Hair falls with movement. Bust-up framing, relaxed confident mood.",
  sp_side_profile:
    "POSE & FRAMING: near-profile view (about 75–90 degrees) emphasising the jawline, neck and shoulder line, " +
    "chin lifted very slightly, gaze off-camera into the distance. Clean, sculptural, editorial. Bust-up framing.",
  // 🔴 2026-08-20 오너 레퍼런스: 한국 '얼빡' 컷. 예전 문구는 "얼굴이 프레임 대부분"
  //   정도라 반신 가드에 눌려 평범한 상반신이 나왔다. 잘라내는 지점을 명시한다.
  sp_beauty_closeup:
    "POSE & FRAMING — EXTREME BEAUTY CLOSE-UP (얼빡). This overrides every other framing instruction: " +
    "the camera is very close and the face FILLS the frame edge to edge. Crop straight through the hair above " +
    "the eyebrows so the top of the head is outside the frame, and let the chin sit near the bottom edge — " +
    "shoulders are mostly or entirely out of shot. No empty space around the head. " +
    // 오너 지시(2026-08-20): 고개 각도는 자유롭게. 선택한 카메라 앵글(요)과는 다른 축이라
    //   충돌하지 않는다 — 여기서 푸는 것은 고개의 기울기(롤)와 턱의 높이뿐이다.
    "HEAD ANGLE IS FREE: tilt the head, let it lean toward a shoulder, raise or drop the chin — vary it. " +
    "Do not default to a level, perfectly symmetrical front-on pose, and make each take differ from the last. " +
    "The frame itself may sit gently off-horizontal. " +
    // 오너 지시: 정면이어도 정중앙 대칭은 금지 — 정면이면 3분할로 잡는다.
    "🔴 A dead-centre, perfectly level, straight-on composition is NOT acceptable. Either the head is turned or " +
    "tilted off-axis, OR — if the face is square to the camera — compose to the RULE OF THIRDS: put the eye line " +
    "on the upper third and shift the face off the vertical centre. " +
    // 🔴 이 단서가 없으면 모델이 '여백'을 만들려고 카메라를 뒤로 빼서 얼빡이 풀린다(2026-08-20 실측).
    "⚠️ Off-centre does NOT mean zooming out. The extreme crop above is non-negotiable and outranks this: " +
    "the face still fills the frame edge to edge, and the shift happens INSIDE that tight crop — one cheek runs " +
    "off the edge while hair or a soft shadow takes the narrow side. Never pull the camera back, never add a " +
    "margin of empty background, never turn this into a bust or half-body shot. " +
    "A few loose strands of hair fall across the forehead and cheek. " +
    // 오너 레퍼런스: 양손으로 얼굴을 감싸는 구도. 손이 프레임을 만드는 요소다.
    "HANDS ARE ALLOWED TO FRAME THE FACE: one or both hands may come up alongside the cheeks and jaw, " +
    "fingers long and relaxed and resting lightly on the skin — hands may enter from the bottom of the frame and " +
    "may partly overlap the jaw or hairline, but never cover the eyes, nose or mouth. Nails are clean and bare. " +
    "Eyes look into the lens, lips relaxed and slightly parted. " +
    "Skin, eyes and lips are the whole subject — everything else falls away.",
  sp_full_standing:
    "POSE & FRAMING: full-length standing shot, head to below the knees or full body, weight on one leg with the " +
    "other relaxed, one hand at the waist or falling naturally at the side, posture tall and easy. " +
    "The whole figure sits comfortably in frame with balanced headroom — a full-length fashion-profile composition.",
  // 배우/모델 프로필
  actor_closeup:
    "POSE & FRAMING: emotive front-facing close-up, head-and-shoulders tight crop, expressive eyes carrying subtle emotion, lips relaxed, a quietly intense cinematic gaze straight into the lens.",
  actor_threequarter:
    "POSE & FRAMING: three-quarter side view, face turned about 30–45 degrees, gaze cast off-camera into the distance, cinematic and contemplative. Upper-body framing.",
  actor_wall_casual:
    "POSE & FRAMING: leaning back naturally against a plain wall in a relaxed casual stance, one shoulder toward the wall, hands loose, an effortless candid mood. Upper-to-mid body framing.",
  actor_dynamic:
    "POSE & FRAMING: a dynamic expressive pose with a sense of movement or energy — mid-turn, a hand through the hair, or seated with expressive body language — confident and lively. Half-body framing.",
  // ── 2.0 오디션 스튜디오 씬(st_) 자세 — "FRAMING OVERRIDE" = 전신/클로즈업(반신 구도 문장을 빼는 표시).
  st_lean_forward:
    "POSE & FRAMING: seated on a low stool, leaning forward with the forearms resting on the thighs and the hands loosely together between the knees, shoulders slightly rounded, head tilted a touch to one side, an intense soulful gaze straight into the lens. Medium shot, centered, eye level.",
  st_arm_extend:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, the whole figure head to toe with the floor reflection below): a bold avant-garde editorial stance — torso angled, chin lifted, one arm extended outward breaking the frame line, weight on one leg — piercing direct gaze.",
  st_stool_elbows:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, the whole seated figure from head to shoes): seated on the low stool, elbows resting on the knees, hands loosely clasped, leaning slightly toward the camera with an intense direct gaze into the lens.",
  st_square_pocket:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, head to toe with room for the set on both sides): standing square to the camera, one hand in a trouser pocket and the other arm relaxed, a composed intense gaze into the lens.",
  st_chair_recline:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, the whole figure and the chair in frame): seated low and reclined on the folding chair, one leg crossed high over the other knee, both arms hanging loose over the chair sides, torso sunk back, head tilted slightly forward, an unbroken direct gaze down the lens — commanding, unbothered ease.",
  st_sphere_seated:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, the whole figure and the sphere in frame): sitting upright atop the large gold sphere, ankles crossed and lowered, one hand resting lightly on its curved surface, spine poised, chin slightly lowered with quiet authority.",
  st_cube_perch:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, the whole seated figure in frame): perched on the black cube, legs crossed with one leg extended toward the camera, one hand lightly touching the temple, the other forearm resting on the knee, a slight head tilt and a commanding gaze.",
  st_floor_crosslegged:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, full body): seated cross-legged on the studio floor, one hand resting on the leg and the other holding the ankle, upright spine, a calm intense gaze into the lens, bare feet visible in the foreground.",
  st_prone_closeup:
    "POSE & FRAMING (FRAMING OVERRIDE — CLOSE-UP, the face and hands fill the frame): lying prone with the forearms folded in front, the chin resting on the stacked hands, fingers lightly framing the face, head tilted slightly, direct intense eye contact.",
  st_pool_arm_across:
    "POSE & FRAMING (FRAMING OVERRIDE — FULL-LENGTH, head to toe including the reflection in the water): standing ankle-deep in the reflecting pool, one arm crossed over the body gripping the opposite shoulder, a severe confident stance, gaze locked to the camera.",
  st_hat_brim:
    "POSE & FRAMING (FRAMING OVERRIDE — CLOSE-UP, the face, hat and hand fill the frame): chin softly lifted, eyes gently lowered toward the camera, one hand touching the far side of the hat brim — graceful and poised.",
  st_hat_arms_crossed:
    "POSE & FRAMING: waist-up three-quarter profile, body angled away from the camera, arms crossed over the chest, head tilted slightly down toward the shoulder so the hat brim shades the forehead while the eyes stay visible.",
};

const DEFAULT_POSE = {
  idphoto: "id_shoulders",
  proheadshot: "pro_arms_crossed",
  actorprofile: "actor_closeup",
  signature: "pro_standing",
  outfitref: "pro_standing",
  beautyprofile: "sp_bust_soft",
};

// 묶음 생성 자세 풀 — concepts.json 의 poses[] 와 동일한 순서/구성.
const POSE_POOL = {
  idphoto: ["id_shoulders", "id_neckline"],
  proheadshot: ["pro_arms_crossed", "pro_hand_pocket", "pro_seated", "pro_standing"],
  actorprofile: ["actor_closeup", "actor_threequarter", "actor_wall_casual", "actor_dynamic"],
  signature: ["pro_standing", "pro_arms_crossed", "pro_hand_pocket", "pro_seated"],
  outfitref: ["pro_standing", "pro_arms_crossed", "pro_hand_pocket", "pro_seated"],
  beautyprofile: ["sp_bust_soft", "sp_hand_face", "sp_hair_touch", "sp_over_shoulder",
                  "sp_side_profile", "sp_beauty_closeup", "sp_seated_lean", "sp_full_standing"],
};

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 묶음 생성(3/6/12장) 자세·앵글 배분 (2026-08-11 오너 지시).
//   3장  → 서로 다른 자세 3개를 랜덤으로 (앵글은 유저가 고른 값 유지)
//   6장  → 모든 자세(4) 한 장씩 + 남는 2장은 랜덤 자세를 "다른 앵글"로
//   12장 → 모든 자세를 3장씩, 반복될 때마다 앵글을 바꿔서
//   일반화: i번째 = shuffled[i % pool], 라운드 0 은 선택 앵글, 라운드 1↑ 은 그 자세에
//   아직 안 쓴 앵글 중 랜덤. 그래서 같은 (자세,앵글) 조합이 중복되지 않는다.
//   🔴 증명사진은 예외 — 규격(정면·고정 프레이밍)이 생명이라 변형하지 않는다.
export function buildBatchVariants({ mode, count, poseId, angleId }) {
  const pool = POSE_POOL[mode];
  const baseAngle = ANGLE_FRAGMENTS[angleId] ? angleId : "front";
  if (!pool || mode === "idphoto") {
    return Array.from({ length: count }, () => ({ poseId, angleId }));
  }
  const deck = shuffled(pool);
  const usedAngles = new Map(); // poseId → Set(angleId)
  const out = [];
  for (let i = 0; i < count; i++) {
    const pose = deck[i % deck.length];
    const round = Math.floor(i / deck.length);
    const used = usedAngles.get(pose) || new Set();
    let angle = baseAngle;
    if (round > 0) {
      const remain = ANGLE_KEYS.filter((a) => !used.has(a));
      const from = remain.length ? remain : ANGLE_KEYS;
      angle = from[Math.floor(Math.random() * from.length)];
    }
    used.add(angle);
    usedAngles.set(pose, used);
    out.push({ poseId: pose, angleId: angle });
  }
  return out;
}

export function buildIdPhoto(outfit, bgHex, bgName, poseFrag, exprFrag, inner) {
  return (
    "Create a clean, professional ID / passport-style photograph using the person in the provided photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    "Front-facing, looking straight at the camera, eyes open and clearly visible, face and both ears visible, hair tidy, no hat, no sunglasses. " +
    poseFrag + " " + exprFrag + " " +
    "Dress the person in a business-formal suit jacket " + outfitColorPhrase(outfit) +
    " over " + innerPhrase(inner) + ", styled appropriately for the person's apparent gender and build (a women's blazer for women, a men's suit for men). " +
    REALISTIC_GARMENT +
    "Do NOT broaden, square off, or enlarge the shoulders, and do NOT widen the neck; the jacket follows the body's actual contour with seamless, anatomically-correct transitions. " +
    "Background: a clean, BRIGHT, light solid " + bgName + " (" + bgHex + ") studio backdrop with a very subtle smooth gradient (slightly brighter just behind the head). Keep it light, fresh and airy — never dark, muddy, or heavy. " +
    SOLID_BACKDROP_ONLY +
    "LIGHTING: bright, clean, evenly diffused HIGH-KEY studio lighting exactly like a professional Korean ID-photo studio — face, clothing and background all brightly and evenly lit and well-exposed, while KEEPING natural skin texture (do not smooth or airbrush the skin). ABSOLUTELY NO dark, dim, moody, underexposed, or dramatic/heavy shadows. " +
    GROOMING +
    PHOTOREALISM +
    "Sharp focus, high resolution, photorealistic and true-to-life — like a bright official ID photo taken at a professional photo studio."
  );
}

export function buildProHeadshot(outfit, bgHex, bgName, poseFrag, exprFrag, inner, angleFrag) {
  return (
    "Create a polished, professional corporate headshot / business profile photograph using the person in the provided photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    poseFrag + " " + (angleFrag ? angleFrag + " " : "") + exprFrag + " " +
    "Dress the person in smart professional business attire " + outfitColorPhrase(outfit) +
    " — a well-tailored blazer or modern business outfit appropriate to the person's apparent gender and build, worn over " + innerPhrase(inner) + ". " +
    REALISTIC_GARMENT +
    HUMAN_PROPORTION + HALF_BODY_FRAMING +
    "Background: a clean, professional studio backdrop in solid " + bgName + " (" + bgHex + ") with a subtle smooth gradient and gentle depth, like a modern corporate portrait studio. " +
    SOLID_BACKDROP_ONLY +
    "LIGHTING: soft, flattering professional studio lighting with gentle dimensionality (a soft key light plus fill) — bright and clean but with natural, premium-looking subtle shadowing; avoid harsh or heavy shadows. " +
    GROOMING +
    PHOTOREALISM +
    "A confident, trustworthy, LinkedIn-quality executive headshot. Sharp focus, high resolution, photorealistic and true-to-life, 85mm portrait look."
  );
}

// 뷰티 프로필 — 한국 프로필 사진관(개인 프로필) 결과물.
//   레퍼런스 86장 공통점: 하이키 배경, 물광 피부, 반신·3/4, 미니멀 의상, 은은한 표정.
//   전문가 프로필과의 차이: 직업/신뢰가 아니라 "예쁘게 잘 나온 나"가 목적이라
//   조명이 더 밝고 평평하며, 의상은 정장이 아니라 미니멀한 상의다.
export function buildBeautyProfile(outfit, bgHex, bgName, poseFrag, exprFrag, lookFrag, angleFrag, outfitTypeId, retouch, makeup) {
  return (
    "Create a polished Korean beauty-profile studio portrait (뷰티 프로필 / 개인 프로필) using the person in the provided photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    (Number(retouch) >= 30 || Number(makeup) >= 30
      ? "This is a beauty-forward portrait — the person should look their best while remaining unmistakably themselves. "
      : "This is a plain, honest portrait — do not flatter or beautify the person beyond what the skin/makeup settings below allow. ") +
    poseFrag + " " + (angleFrag ? angleFrag + " " : "") + exprFrag + " " +
    "WARDROBE: " + (BEAUTY_OUTFITS[outfitTypeId] || BEAUTY_OUTFITS.fine_knit) + ", " + outfitColorPhrase(outfit) + ". " +
    "No busy patterns, no logos, no heavy jackets — the neckline stays clean so attention goes to the face. " +
    "Styled appropriately for the person's apparent gender and build. " +
    REALISTIC_GARMENT +
    HUMAN_PROPORTION +
    // 전신 포즈에는 반신 프레이밍 가드를 붙이지 않는다(서로 모순).
    //   🔴 얼빡(익스트림 클로즈업)도 마찬가지 — "머리 위부터 허리까지"가 클로즈업을 눌러버렸다.
    (/full-length|head-to-toe|CLOSE-UP/i.test(poseFrag) ? "" : HALF_BODY_FRAMING) +
    (lookFrag ? lookFrag + " " :
      BEAUTY_LOOKS.white_highkey + " ") +
    // 🔴 사용자가 고른 배경색이 룩의 하드코딩 배경("white seamless" 등)에 눌리던 버그
    //   (2026-08-26 오너: 오렌지 지정 6장 전부 미적용). bgHex/bgName 을 받아놓고 안 쓰고 있었다.
    //   룩 조각 "뒤에" 배경 오버라이드를 붙인다 — 뒤 문장이 이긴다(이 파일의 검증된 규칙).
    //   기본 흰색(#FFFFFF)일 땐 붙이지 않는다: 룩 고유 배경(dark_mood 차콜 등)을 지켜야 하고,
    //   기본 룩(white_highkey)은 어차피 흰 배경이다. "흰색을 일부러 고른" 경우와 구분할 수
    //   없는 건 알려진 한계 — 상태 기본값이 흰색이라 신호가 없다.
    (bgHex && bgHex.toLowerCase() !== "#ffffff"
      ? "BACKGROUND OVERRIDE — this replaces any backdrop color described in the LOOK above: " +
        "the seamless studio background must be a solid " + bgName + " (" + bgHex + ") with a subtle smooth " +
        "gradient and gentle depth. Keep the LIGHTING style from the LOOK exactly as described; only the " +
        "backdrop color changes. The background color must be unmistakably " + bgName + ". "
      : "") +
    (Number(retouch) >= 30 ? "Hair is glossy with clean strand separation and softly framing the face. " : "Hair is as it is — no added shine or styling polish. ") +
    // 🔴 보정 강도를 넘겨야 한다 — 고정 PHOTOREALISM 은 "모공 필수"라 100 을 눌러버린다.
    photorealism(retouch) +
    // 🔴 순서 주의: 피부 판정(retouchFragment)이 PHOTOREALISM 뒤에 와야 한다.
    //   앞에 두면 "잡티 전무" 지시를 뒤따라오는 "원본 특징을 지켜라"가 되살려버린다.
    //   뒤에 오는 문장이 더 세게 먹힌다 — 최종 판정은 항상 이쪽이어야 한다.
    retouchFragment(retouch, makeup) +
    BEAUTY_DOF +
    etherealFragment(retouch) +
    "The result should look like it came from a professional Korean profile studio — bright, clean, flattering. " +
    "Sharp focus, high resolution, photorealistic, 85mm portrait look."
  );
}

// "입고 싶은 옷" — 의상은 전적으로 참고 이미지에서 온다(OUTFIT_REF_INSTRUCTION 이 뒤에 붙는다).
//   그래서 여기서는 옷 색/종류를 일절 서술하지 않는다 — 서술하면 참고 옷과 충돌한다.
export function buildOutfitRef(bgHex, bgName, poseFrag, exprFrag, angleFrag) {
  return (
    "Create a polished, professional studio portrait photograph using the person in the provided FIRST photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    poseFrag + " " + (angleFrag ? angleFrag + " " : "") + exprFrag + " " +
    "WARDROBE: the person is wearing the exact garment given in the clothing reference image described below — " +
    "do not invent or substitute any other clothing. " +
    REALISTIC_GARMENT +
    HUMAN_PROPORTION + HALF_BODY_FRAMING +
    "Background: a clean studio backdrop in solid " + bgName + " (" + bgHex + ") with a subtle smooth gradient and gentle depth. " +
    SOLID_BACKDROP_ONLY +
    "LIGHTING: soft, flattering professional studio lighting with gentle dimensionality (a soft key light plus fill) — " +
    "bright and clean, showing the garment's true color and fabric texture accurately; avoid harsh or heavy shadows. " +
    GROOMING +
    PHOTOREALISM +
    "Sharp focus, high resolution, photorealistic and true-to-life, 85mm portrait look."
  );
}

export function buildActorProfile(outfit, bgHex, bgName, poseFrag, outfitTypeId, exprFrag, lookFrag, angleFrag) {
  const outfitTypeFrag = outfitTypeId && ACTOR_OUTFIT_FRAGMENTS[outfitTypeId]
    ? outfitTypeFrag_resolve(outfitTypeId, outfit)
    : "a fashionable, well-fitted contemporary outfit " + outfitColorPhrase(outfit) + " suited to a casting / agency profile, appropriate to the person's apparent gender and build.";
  return (
    "Create a striking model / actor profile portrait (casting look-book / headshot style) using the person in the provided photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    "This is a beauty/character portrait — expressive and photogenic, but still unmistakably the same real person, not a beautified avatar. " +
    poseFrag + " " + (angleFrag ? angleFrag + " " : "") + exprFrag + " " +
    "Style the person in " + outfitTypeFrag + " " +
    REALISTIC_GARMENT +
    HUMAN_PROPORTION + (/FRAMING OVERRIDE/.test(poseFrag || "") ? "" : HALF_BODY_FRAMING) +
    (lookFrag ? lookFrag.replace(/\{BG\}/g, bgName + " (" + bgHex + ")") + " " :
      "Background: a clean cinematic backdrop in solid " + bgName + " (" + bgHex + ") with a smooth gradient; allow tasteful cinematic depth and subtle vignetting. ") +
    (lookFrag && /LIGHTING OVERRIDE/.test(lookFrag) ? "" :
      "LIGHTING: professional cinematic studio lighting — sculpted soft light with gentle contrast and clear catchlights in the eyes, allowing more mood and dimension than an ID photo while keeping skin natural and true-to-life. ") +
    GROOMING +
    PHOTOREALISM +
    "High-fashion casting-profile quality, expressive and cinematic. Sharp focus, high resolution, photorealistic, 85mm portrait look."
  );
}

// ── Signature 전문직 커스텀 엔진 ──────────────────────────────
// 직군별 복장/배경/이름표기 프리셋. 로고는 클라 후처리 합성(가슴/명패 여백 확보).
// profession 미지정/미매칭이면 doctor(의사) 로 폴백.
export const PROFESSION_PRESETS = {
  doctor: {
    intro: "a polished professional MEDICAL / doctor profile headshot",
    attire: "a crisp, clean white doctor's lab coat over smart professional attire (a collared shirt/blouse). NO stethoscope",
    // 이름: 가운 왼쪽 가슴 자수
    nameOn: (n) => "On the LEFT chest of the white coat there is neat, small professional embroidery reading exactly \"" + n + "\" in navy thread — clean, legible, correctly spelled, subtle and realistic. ",
    bg: "a clean, BRIGHT medical/clinic studio backdrop",
    logoNote: "Leave the UPPER-LEFT chest area of the coat relatively clean (space for a badge/logo). ",
    lighting: "soft, flattering, bright professional studio lighting like a hospital staff profile photo; clean and credible, no harsh shadows",
    closer: "A confident, warm, credible medical-professional headshot.",
  },
  lawyer: {
    intro: "a distinguished professional ATTORNEY / lawyer profile headshot",
    attire: "a sharp, formal dark business suit with a crisp shirt (and tie for men), impeccably tailored and authoritative",
    nameOn: null, // 변호사는 자수 대신 명패(로고 합성)로
    bg: "a distinguished law-office / law-library backdrop with rows of legal books and a warm wood-panelled office softly blurred behind",
    logoNote: "Leave clean space near the lower third for a firm nameplate/logo. ",
    lighting: "warm, refined professional lighting with gentle dimensionality, prestigious and trustworthy",
    closer: "A commanding, credible legal-professional portrait.",
  },
  realtor: {
    intro: "a polished professional REAL-ESTATE agent / realtor profile headshot",
    attire: "a sharp, approachable modern business suit or blazer, friendly and professional",
    nameOn: null,
    bg: "a bright, modern real-estate office or upscale interior backdrop, clean and inviting",
    logoNote: "Leave clean space for a brokerage logo/name badge. ",
    lighting: "bright, friendly, clean professional lighting — approachable and confident",
    closer: "A friendly, trustworthy realtor headshot ideal for listings and business cards.",
  },
  graduate: {
    intro: "a proud GRADUATION / academic portrait",
    attire: "a graduation cap and gown (academic regalia) with a tassel, over a shirt/blouse, worn correctly",
    nameOn: null,
    bg: "a tasteful university campus / commencement backdrop, softly blurred, celebratory yet elegant",
    logoNote: "Leave clean space for a school crest/logo. ",
    lighting: "bright, celebratory, flattering natural-looking light",
    closer: "A proud, dignified graduation portrait.",
  },
  professor: {
    intro: "a distinguished ACADEMIC / professor profile headshot",
    attire: "refined academic-professional attire — a smart blazer (optionally with academic regalia), scholarly and composed",
    nameOn: null,
    bg: "a university library / faculty office backdrop with bookshelves softly blurred behind",
    logoNote: "Leave clean space for a university crest/logo. ",
    lighting: "warm, scholarly professional lighting, composed and credible",
    closer: "A composed, authoritative academic portrait.",
  },
  finance: {
    intro: "a sharp CORPORATE / finance professional profile headshot",
    attire: "an impeccably tailored dark corporate business suit, polished and confident",
    nameOn: null,
    bg: "a modern corporate finance office backdrop, sleek and professional",
    logoNote: "Leave clean space for a company logo/name badge. ",
    lighting: "crisp, premium corporate lighting with subtle dimensionality",
    closer: "A confident, high-trust corporate headshot.",
  },
};

// profession + customName(선택) + hasLogo 로 시그니처 프롬프트 조립.
export function buildSignaturePrompt(profession, customName, bgHex, bgName, poseFrag, exprFrag, hasLogo, inner, orgName, angleFrag) {
  const p = PROFESSION_PRESETS[profession] || PROFESSION_PRESETS.doctor;
  const safe = String(customName || "").trim().replace(/["\\\n\r]/g, "").slice(0, 40);
  // 이름: 좌측 가슴에 네이비 실 자수 (직군 무관 통일).
  const nameFrag = safe
    ? "On the LEFT chest of the garment there is neat, small professional EMBROIDERY reading exactly \"" + safe + "\" in navy thread — clean, legible, correctly spelled, subtle and realistic, stitched into the fabric. "
    : "";
  // 소속/병원명: 로고 이미지가 없어도 텍스트만으로 소속을 새길 수 있게 한다(이미지 준비 부담 제거).
  //   이름 아래 한 단 작은 글씨로 — 실제 가운/유니폼의 기관명 자수와 동일한 배치.
  const orgSafe = String(orgName || "").trim().replace(/["\\\n\r]/g, "").slice(0, 60);
  const orgFrag = orgSafe
    ? "Directly BELOW the embroidered name, on the same LEFT chest area, there is a SECOND line of smaller neat EMBROIDERY reading exactly \"" + orgSafe + "\" in the same navy thread — one clean single line, smaller than the name, correctly spelled, subtle and realistic, stitched into the fabric (never a printed label, sticker, badge or white patch). "
    : "";
  // 로고: 2번째 입력 이미지로 제공 → 이름 자수 "바로 아래"에 실 자수로 새김(흰 배지/카드/스티커 금지).
  const logoFrag = hasLogo
    ? "A SECOND image is provided: it is a small logo/emblem. EMBROIDER that exact logo onto the LEFT chest of the garment, positioned directly BELOW the embroidered text lines, as small realistic thread EMBROIDERY stitched into the fabric (matching the garment's weave, folds and lighting). It must look sewn into the cloth — NOT a flat sticker, NOT a printed patch, NOT a white card or plastic badge, no white rectangle behind it. Keep it small, tasteful, correctly shaped and clearly recognizable. "
    : p.logoNote;
  return (
    "Create " + p.intro + " using the person in the provided FIRST photo. " +
    SCENE_REPLACE +
    IDENTITY_PRESERVE +
    poseFrag + " " + (angleFrag ? angleFrag + " " : "") + exprFrag + " " +
    "Dress the person in " + p.attire + ", styled appropriately for the person's apparent gender and build. " +
    (inner ? "The shirt/blouse worn underneath is " + innerPhrase(inner).replace(/^a /, "") + ". " : "") +
    REALISTIC_GARMENT +
    HUMAN_PROPORTION + HALF_BODY_FRAMING +
    nameFrag +
    orgFrag +
    logoFrag +
    "Background: " + p.bg + " in solid " + bgName + " (" + bgHex + ") with a subtle smooth gradient. " +
    SOLID_BACKDROP_ONLY +
    "LIGHTING: " + p.lighting + ". " +
    GROOMING +
    PHOTOREALISM +
    p.closer + " Sharp focus, high resolution, photorealistic and true-to-life, 85mm portrait look."
  );
}

function outfitTypeFrag_resolve(outfitTypeId, colorHint) {
  const base = ACTOR_OUTFIT_FRAGMENTS[outfitTypeId];
  // 블랙룩은 색상 오버라이드 무시, 나머지는 색상 힌트를 앞에 추가
  if (outfitTypeId === "actor_outfit_black" || String(outfitTypeId).startsWith("st_")) return base;
  const colorStr = colorHint ? outfitColorPhrase(colorHint) + " " : "";
  return colorStr + base;
}

// 헤어스타일 15종 (성별 무관·단정). id → 프롬프트 조각. 없거나 keep 이면 헤어 변경 안 함.
const HAIR_FRAGMENTS = {
  short_crop: "a neat short cropped haircut, tidy and clean",
  crew_cut: "a clean short crew cut, evenly trimmed and neat",
  pompadour: "a neatly styled pompadour, hair with volume swept up and back, groomed",
  side_part: "a groomed side-part hairstyle, combed neatly to one side",
  side_volume: "a neat side-parted hairstyle with soft volume lifted at the front and swept smoothly to one side, groomed and polished",
  dandy: "a soft, tidy dandy cut, lightly swept and natural, clean",
  pixie: "a neat short pixie cut, tidy and styled",
  bob: "a sleek chin-length bob, smooth and tidy",
  bob_bangs: "a chin-length bob with neat blunt bangs across the forehead",
  medium: "tidy, smooth shoulder-length hair, well-groomed",
  long_straight: "sleek long straight hair, smooth and neat",
  long_layered: "neat long layered hair, tidy and smooth",
  soft_wave: "soft, neat waves in medium-long hair, groomed",
  ponytail: "hair neatly tied back into a clean, sleek ponytail",
  top_bun: "hair neatly tied up into a tidy top-knot bun",
  low_bun: "hair neatly styled into a smooth low chignon bun",
};
export function hairInstruction(hairId) {
  const f = HAIR_FRAGMENTS[hairId];
  if (!f) return ""; // 원본 유지/미지정 → 헤어 손대지 않음
  return " HAIRSTYLE: restyle the person's hair into " + f +
    ". Keep the exact same face, facial features, skin tone and identity unchanged — change ONLY the hairstyle to this, blended naturally and realistically.";
}

// 스튜디오 모드 판정 — mode 우선, 없으면 구버전 호환(증명사진 conceptId 409 / 제목) 자동 감지.
//   묶음 생성이 자세 풀을 고르려면 핸들러에서도 mode 를 알아야 해서 분리했다.
export function resolveStudioMode({ studioMode, conceptId, conceptTitle, STUDIO_MODES }) {
  const modes = STUDIO_MODES || ["idphoto", "proheadshot", "actorprofile", "signature", "outfitref", "beautyprofile"];
  if (modes.includes(studioMode)) return studioMode;
  if (Number(conceptId) === 409 || /증명사진|id ?photo/i.test(conceptTitle || "")) return "idphoto";
  return null;
}

// 얼굴 참조 문구 — 개수 기반, 위치 서수 금지(BACKEND §4 #7, rimikimi 드레스룸 방식).
//   입력 이미지 순서 = [주 사진, (로고), 얼굴 참조…, (옷 사진)]. 옷 사진은 늘 맨 뒤("LAST image")라
//   OUTFIT_REF_INSTRUCTION 과 어긋나지 않고, 로고는 늘 두 번째(시그니처 "SECOND image")다.
//   옷 사진이 있으면 "얼굴 참조는 옷이 아니다 — 그 안의 옷·포즈·배경은 무시"를 못 박아 두 서수 체계를 가른다.
export function faceRefClauseFor(n, hasOutfitRef) {
  if (!n) return "";
  const many = n > 1;
  return (
    `IDENTITY REFERENCES: besides the primary photo, ${n} more photo${many ? "s" : ""} of the SAME person's face ` +
    `${many ? "are" : "is"} included among the input images` +
    (hasOutfitRef
      ? `, placed BEFORE the clothing reference (the clothing reference is always the LAST image). ` +
        `${many ? "They are" : "It is"} NOT a garment and NOT part of the outfit — ignore any clothing, pose and ` +
        `background inside ${many ? "them" : "it"}. `
      : ". ") +
    `Use ${many ? "all of them" : "it"} together with the primary photo to reproduce this person's facial identity — ` +
    "face shape, eyes, nose, lips, jawline and skin tone — exactly. " +
    `${many ? "They are identity references" : "It is an identity reference"} ONLY: ` +
    "never change the composition, pose, outfit, framing or background described above. "
  );
}

// 스튜디오 컨셉이면 조립된 instruction 문자열을, 아니면 null 을 반환.
export function buildStudioInstruction({
  studioMode, conceptId, conceptTitle, poseId, idSuit, idInner, idBg, idBgName, actorOutfitId, actorLookId, expressionId, angleId, customName, orgName, profession, hairId, hasLogo, hasOutfitRef, monochrome, beautyOutfitId, retouch, makeup, STUDIO_MODES,
}) {
  const mode = resolveStudioMode({ studioMode, conceptId, conceptTitle, STUDIO_MODES });
  if (!mode) return null;

  const poseFrag =
    (poseId && POSE_FRAGMENTS[poseId]) || POSE_FRAGMENTS[DEFAULT_POSE[mode]];
  const exprFrag =
    EXPRESSION_FRAGMENTS[expressionId] || EXPRESSION_FRAGMENTS.neutral;
  const bgHex = idBg || (mode === "actorprofile" ? "#1c1c1f" : "#FFFFFF");
  const bgName = idBgName || "neutral";

  const hairFrag = hairInstruction(hairId);
  const angleFrag = ANGLE_FRAGMENTS[angleId] || null;
  let inst = null;
  if (mode === "idphoto") inst = buildIdPhoto(idSuit, bgHex, bgName, poseFrag, exprFrag, idInner);
  else if (mode === "proheadshot") inst = buildProHeadshot(idSuit, bgHex, bgName, poseFrag, exprFrag, idInner, angleFrag);
  else if (mode === "actorprofile") inst = buildActorProfile(idSuit, bgHex, bgName, poseFrag, actorOutfitId, exprFrag, ACTOR_LOOK_FRAGMENTS[actorLookId] || null, angleFrag);
  else if (mode === "signature") inst = buildSignaturePrompt(profession, customName, bgHex, bgName, poseFrag, exprFrag, hasLogo, idInner, orgName, angleFrag);
  else if (mode === "outfitref") inst = buildOutfitRef(bgHex, bgName, poseFrag, exprFrag, angleFrag);
  else if (mode === "beautyprofile") inst = buildBeautyProfile(idSuit, bgHex, bgName, poseFrag, exprFrag, BEAUTY_LOOKS[actorLookId] || null, angleFrag, beautyOutfitId, retouch, makeup);
  // 흑백 토글은 카테고리 무관 — 프롬프트 맨 끝(헤어 지시 뒤)에 붙여 최종 색 처리를 확정한다.
  if (!inst) return null;
  // 의상 참고 이미지는 앞의 의상 서술을 덮어써야 하므로 맨 뒤(헤어 앞)에 붙인다.
  return inst + (hasOutfitRef ? " " + OUTFIT_REF_INSTRUCTION : "") + hairFrag +
    (monochrome ? " " + MONO_INSTRUCTION : "");
}

// ── 카탈로그(목적 4 · 룩 · 세부 조정 값) — picbox api/_lib/catalog.js 의 검증 규칙을 그대로 ──
import CATALOG from "../_data/studio-catalog.json" with { type: "json" };

const KNOB_KEY = {
  suits: "idSuit", inners: "idInner", bgs: "idBg", expressions: "expressionId", angles: "angleId",
  hair: "hairId", mono: "monochrome", actorOutfits: "actorOutfitId", moods: "actorLookId",
  beautyOutfits: "beautyOutfitId", beautyLooks: "actorLookId", retouch: "retouch", makeup: "makeup",
};
const HEX_RE = /^#?[0-9a-fA-F]{6}$/;
const normHex = (v) => (v.startsWith("#") ? v : "#" + v);

// overrides 에서 "이 목적의 세부 조정 항목 + 알려진 값"만 남긴다(프롬프트 주입 불가).
export function sanitizeOverrides(purposeId, overrides) {
  const out = {};
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return out;
  const knobs = CATALOG.knobs || {};
  const allowed = CATALOG.purposeKnobs?.[purposeId] || [];
  const exclude = CATALOG.purposeKnobExclude?.[purposeId] || {};
  const ids = (k) => new Set((knobs[k] || []).map((x) => x.id));
  for (const knob of allowed) {
    const key = KNOB_KEY[knob];
    if (!key || !Object.prototype.hasOwnProperty.call(overrides, key)) continue;
    const v = overrides[key];
    if ((exclude[knob] || []).includes(v)) continue;
    switch (knob) {
      case "mono": if (typeof v === "boolean") out.monochrome = v; break;
      case "retouch": case "makeup": {
        const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
        if (Number.isFinite(n)) out[key] = Math.max(0, Math.min(100, Math.round(n)));
        break;
      }
      case "suits": case "inners":
        if (typeof v === "string" && (ids(knob).has(v) || HEX_RE.test(v))) out[key] = HEX_RE.test(v) ? normHex(v) : v;
        break;
      case "bgs":
        if (typeof v === "string" && HEX_RE.test(v)) {
          const hex = normHex(v);
          const known = (knobs.bgs || []).find((b) => String(b.hex).toLowerCase() === hex.toLowerCase());
          out.idBg = known ? known.hex : hex;
          out.idBgName = known ? known.name : "custom solid";
        }
        break;
      case "hair": case "moods":
        if (v === null || v === "") out[key] = null;
        else if (typeof v === "string" && ids(knob).has(v)) out[key] = v;
        break;
      default:
        if (typeof v === "string" && ids(knob).has(v)) out[key] = v;
    }
  }
  return out;
}

function mergeRecipe(preset, sanitized) {
  const r = { ...(preset?.recipe || {}), ...(sanitized || {}) };
  if (r.studioMode === "beautyprofile" && sanitized && "actorLookId" in sanitized &&
      sanitized.actorLookId !== preset?.recipe?.actorLookId) {
    r.idBg = "#FFFFFF";
    r.idBgName = "pure white";
  }
  return r;
}

/**
 * 앱이 보낸 { purpose, presetId, overrides } → 생성 지시문.
 * 입력 이미지 순서 = [지시문, 주 사진, 얼굴 참조…, (옷 사진)] — 옷 사진은 항상 맨 뒤.
 * @returns {{instruction:string, title:string, purpose:string} | {error:string}}
 */
export function resolveStudio({ purpose, presetId, overrides }, { faceRefCount = 0, hasOutfit = false } = {}) {
  const p = (CATALOG.purposes || []).find((x) => x.id === purpose);
  if (!p) return { error: "알 수 없는 목적이에요." };
  const preset = (CATALOG.presets || []).find((x) => x.id === presetId && x.purpose === p.id);
  if (!preset) return { error: "그 목적의 룩이 아니에요." };
  const recipe = mergeRecipe(preset, sanitizeOverrides(p.id, overrides));
  const inst = buildStudioInstruction({ ...recipe, conceptId: p.conceptId, hasOutfitRef: hasOutfit });
  if (!inst) return { error: "지시문을 만들지 못했어요." };
  const clause = faceRefClauseFor(faceRefCount, hasOutfit);
  return { instruction: inst + (clause ? " " + clause : ""), title: preset.title?.ko || preset.id, purpose: p.id };
}

/** 앱이 그릴 카탈로그(목적·룩·세부 조정 값). 썸네일은 브루클린 서버 것을 그대로 쓴다. */
export function studioCatalog() {
  return { purposes: CATALOG.purposes, presets: CATALOG.presets, knobs: CATALOG.knobs,
    purposeKnobs: CATALOG.purposeKnobs, purposeKnobExclude: CATALOG.purposeKnobExclude };
}
