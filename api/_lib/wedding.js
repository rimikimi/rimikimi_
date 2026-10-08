// ============================================================
// 조세핀(웨딩) 지시문 — josephine app/api/_lib/wedding.js 를 그대로 옮겼다(2026-10-09).
// 리미키미 홈 "웨딩·커플" 칸의 본식 80 · 2부 80 드레스(조세핀 프리셋 드레스)용.
// ⚠️ 문구를 고치지 말 것 — 조세핀에서 실측으로 다듬은 문구다. 고칠 땐 양쪽을 같이.
// ============================================================
// ============================================================
// Josephine — 웨딩 화보 프롬프트 조립 (서버 전용 · 단일 진실원천)
//
// 클라이언트는 선택값 ID만 전송(dressFit·dressColor·sceneCat·sceneId·poseId·
// bodyProfile·fromPhoto 여부) → 서버가 이 파일에서 프롬프트 문자열을 조립한다.
// 프롬프트 유출/조작 방지 (BUILD_PROMPT §1, §6).
//
// ⚠️ 이미지 생성 프롬프트 함정 (memory: ai-image-prompt-tells):
//    "editorial / Vogue / magazine" 어휘 금지 — 가짜 잡지 로고가 픽셀에 박힘.
//    오직 "사진 촬영(photography)" 어휘만 사용. 생성 후 콘택트 시트 전수 검수.
//
// 각 옵션 항목은 { tier, frag } 를 가진다. tier = 이 옵션을 쓰기 위한 최소 등급.
//   "free" | "bouquet" | "atelier".  generate.js 가 사용자 tier 로 검증한다.
// ============================================================

// ── 신원 보존 (신부/신랑 얼굴·정체성 절대 변형 금지) ──
//  🔴 2026-08-24 실측: "do not beautify, smooth" 가 잡티 제거를 원천 차단하고 있었다.
//    참조 1장일 땐 약하게 걸렸지만 페이스 프로필(3장)에서는 확실히 먹어, 뒤에서 어떤
//    피부 지시를 해도 뺨의 점이 그대로 재현됐다. 신원 보존의 진의는 "얼굴형·이목구비를
//    바꾸지 말라"이지 "피부 표면을 그대로 두라"가 아니므로, 금지 대상을 형태로 한정하고
//    피부 표면 판정은 retouch 토글(EXPRESSION_SKIN / faceClause)에 위임한다.
const IDENTITY_PRESERVE =
  "Keep each person's exact face, identity, facial features and natural likeness — " +
  "do not slim, reshape, restructure or change who they are, and keep their real skin tone. " +
  "Preserve real proportions, neck, shoulders and posture. The people in the result must be " +
  "unmistakably the same real people from the provided photo(s). ";

//  🔴 2026-08-24 실측 3회차: "do not beautify" 제거만으로는 부족했다(3장 중 1장만 깨끗).
//    남은 원인은 이 신원 보존 문장 자체 — "exact face / facial features / likeness" 가
//    모델에게 뺨의 큰 점을 "이 사람의 식별 특징"으로 붙들게 한다. 뒤에서 어떤 피부 지시를
//    해도 앞의 이 문장이 되살린다.
//    보정 켜짐일 때는 신원을 **구조**로만 정의한다 — 무엇을 지켜야 하는지 구체적으로
//    열거해서 유사도를 잃지 않으면서, 피부 표면은 신원에서 명시적으로 제외한다.
const IDENTITY_PRESERVE_RETOUCH =
  "Keep each person unmistakably themselves through facial STRUCTURE: skull and jaw " +
  "proportions, eye shape, size and spacing, brow line and shape, nose bridge and tip, " +
  "lip shape and fullness, ear shape, hairline and natural hair. Do not slim, reshape or " +
  "restructure any of these, and keep their real skin tone. Preserve real proportions, neck, " +
  "shoulders and posture. Their skin SURFACE is not part of their identity — a professional " +
  "wedding retoucher's finish is expected there. ";

// ── 표정·피부 마감 (오너 지시 2026-08-15) ──
//  신원 보존이 최우선이라 "보정"은 조명 수준으로만 건다. 얼굴형·이목구비·피부톤 자체는
//  바꾸지 않고, 웨딩 사진답게 은은한 미소와 고른 조명만 얹는다.
const EXPRESSION_SKIN =
  "Expression: a soft, gentle closed-lip smile — warm and natural, never a wide grin or a blank stare. " +
  "Skin: keep their real skin tone and texture (pores, fine lines) intact; only lift it the way good " +
  "bridal lighting does — even, luminous and clean, with soft fill light removing harsh shadows and " +
  "dullness. Do not whiten, airbrush, plastify or change their complexion. ";

// 잡티·점 보정 판정 (retouch 토글). 기본 켜짐 = 웨딩 리터처가 마감한 피부.
// 브룩클린 08e2c3a 교훈: 점·주근깨를 이름으로 부르지 않는다 — 부르면 그려진다.
//  🔴 2026-08-24, 리미키미 로직 이식 (rimikimi_app/api/generate.js PHOTOREALISM).
//    프롬프트 4회 시도(절 순서·beautify 제거·신원 문장 교체)로 2/5 까지밖에 못 갔던 이유는
//    "표면 표시" 같은 추상어로만 말했기 때문이다. 리미키미는 **결점을 구체적으로 열거해
//    지우라고** 지시한다 — 브룩클린 교훈("이름 부르면 그려진다")은 "보존하라"는 맥락에서
//    참이었고, "제거하라"는 맥락에서는 반대로 이름이 있어야 지워진다.
//    리미키미 주석: "잡티 보존을 지시했더니 여드름·홍조가 살아나 제품 목적과 어긋났다."
export const SKIN_RETOUCH_ON =
  "SKIN — retouch it the way a professional beauty/bridal retoucher would: cleanly remove " +
  "acne, pimples, spots, moles, beauty marks, freckles, blemishes, blotchy redness, irritation, " +
  "dark under-eye circles and uneven patches, and even out the overall skin tone into soft, " +
  "clear, healthy skin with a natural glow. BUT keep it photographic: pore texture stays visible " +
  "though softened, fine skin detail and the natural highlights and shadows of the face remain, " +
  "and the person's real skin tone and undertone are unchanged. Aim for 'she has really good " +
  "skin in this photo', NOT porcelain-doll or mannequin skin — never blurred, smudged, plastic, " +
  "waxy, or airbrushed flat. Do NOT change the person's face shape, features, proportions or " +
  "identity while doing this. Keep natural facial asymmetry. ";
export const SKIN_RETOUCH_OFF =
  "Skin finish: keep the skin exactly as it appears in the reference photo(s), including every " +
  "natural marking in the same place. Only lift the lighting the way bridal lighting does. ";

// ── 사실적 원단/드레스 렌더 (플라스틱·붙인 느낌 방지) ──
const REALISTIC_GARMENT =
  "The wedding dress and attire must look like REAL, photographed garments with a bespoke, " +
  "made-to-measure tailored fit that follows each person's own frame — natural fabric texture, " +
  "weave and drape, delicate lace and beadwork where present, soft natural creases and fabric " +
  "shadows. STRICTLY AVOID any artificial look: no plastic/glossy/rubbery fabric, no painted or " +
  "illustrated appearance, no stiff cardboard shapes, no floating or pasted-on garment, no " +
  "costume-like styling, no AI artifacts. ";

// ── 사진 품질 공통 (에디토리얼/잡지 어휘 금지, 순수 촬영 어휘만) ──
const PHOTO_QUALITY =
  "Photorealistic, true-to-life, sharp focus, high resolution, natural skin texture. " +
  "Shot on a full-frame camera with an 85mm f/1.4 portrait lens, soft natural lighting, " +
  "gentle depth of field. A real photograph taken by a professional wedding photographer. ";

// ── 모드 ──
export const MODES = {
  bride_solo: {
    tier: "free",
    frag:
      "Create a beautiful full-length professional wedding photograph of the bride (the woman in " +
      "the provided photo) wearing a wedding dress. ",
  },
  couple: {
    tier: "free",
    frag:
      "Create one beautiful professional wedding photograph of the couple together — the two " +
      "people from the two provided photos (bride and groom) standing close and naturally posed " +
      "as a married couple. The bride wears a wedding dress and the groom wears a matching formal " +
      "tuxedo or suit. Both faces must be clearly the two real people provided. ",
  },
  groom_solo: {
    tier: "free",
    frag:
      "Create a beautiful full-length professional wedding photograph of the groom (the man in " +
      "the provided photo) wearing formal wedding attire. ",
  },
};

// 신랑 솔로용 포즈 오버라이드 (드레스/부케 전제 문구를 예복용으로 대체).
// 자연스러운 남성 에디토리얼 포즈: 무게중심 이동(contrapposto), 손의 명확한 의도
// (주머니·커프스·라펠), 편안한 어깨. "양손 옆에 내림/정면 차렷"은 뻣뻣해서 제거.
const GROOM_POSES = {
  classic:       "POSE: standing at ease facing the camera, body weight shifted onto one leg for a relaxed natural stance, one hand slipped casually into a trouser pocket with the thumb hooked outside, the other arm loose, shoulders relaxed, a warm confident half-smile. Full-length composition.",
  quarter:       "POSE: the body angled about 30–45 degrees into an easy three-quarter stance, weight on the back leg, one hand fastening the jacket button while the other rests near the pocket, chin level, a composed confident look. Full-length composition.",
  overshoulder:  "POSE: standing with the torso turned partly away, the head glancing back over one shoulder toward the lens with a quiet confident expression, one hand tucked in a pocket, jacket buttoned. Full-length composition.",
  bouquet:       "POSE: standing facing the camera, one hand raised to gently adjust the boutonnière on the lapel while the other rests relaxed at the side, a poised confident posture with an easy natural stance. Full-length composition.",
  seated:        "POSE: seated relaxed on a stool leaning slightly forward, one forearm resting on the thigh and the hands loosely clasped, an easy confident expression. Full figure visible.",
  seated2:       "POSE: seated on a bench turned three-quarters, one ankle crossed over the opposite knee in a relaxed masculine posture, one arm stretched along the backrest, a composed look. Full figure visible.",
  waist_front:   "POSE: a WAIST-UP portrait crop from the head to just below the waist, facing the camera, one hand adjusting a shirt cuff, relaxed shoulders, a warm confident expression, legs out of frame.",
  waist_quarter: "POSE: a WAIST-UP portrait crop from the head to just below the waist, the upper body turned three-quarters toward the light, one hand resting on the lapel, a composed confident expression, legs out of frame.",
};
// 신랑 포즈 공통 품질 지시 — 뻣뻣함/마네킹/차렷/손 오류 방지.
const GROOM_POSE_QUALITY =
  "Keep the posture natural and relaxed with an easy shift of weight and loose shoulders; place the hands with clear purpose and render them anatomically correct (five fingers each, no distortion). Avoid a stiff symmetric at-attention pose, avoid arms hanging limply glued to the sides, avoid a rigid mannequin or ID-photo look. Confident, natural masculine bearing. ";

// ── 드레스 핏 (Fit-n-Line) ──
// 무료 3핏 / Bouquet 7핏 / Atelier custom.  Advanced 전체는 v1.x.
export const DRESS_FITS = {
  aline:    { tier: "free",    frag: "an elegant A-line wedding gown with a fitted bodice flowing into a smooth flared skirt" },
  ballgown: { tier: "free",    frag: "a romantic ball-gown wedding dress with a fitted bodice and a full, voluminous skirt" },
  mermaid:  { tier: "free",    frag: "a form-fitting mermaid wedding dress hugging the figure and flaring below the knee" },
  empire:   { tier: "bouquet", frag: "an Empire-line wedding gown with a high waist just under the bust and a softly draping skirt" },
  sheath:   { tier: "bouquet", frag: "a sleek sheath wedding dress with a slim, straight silhouette following the body's line" },
  princess: { tier: "bouquet", frag: "a princess-line wedding gown with vertical seams shaping a fitted bodice into a full skirt" },
  trumpet:  { tier: "bouquet", frag: "a trumpet wedding dress fitted through the bodice and hips, flaring gently from mid-thigh" },
  // Atelier custom(Simple/Advanced/From Photo)는 아래 customDress 로 처리
};

// ── 드레스 컬러 ──
export const DRESS_COLORS = {
  white:    { tier: "free",    phrase: "pure bright white" },
  offwhite: { tier: "bouquet", phrase: "soft off-white" },
  ivory:    { tier: "bouquet", phrase: "warm ivory" },
  // Atelier: 자유 #hex → customColorPhrase()
};

// ── 포즈 ──
// 무료: classic / quarter / overshoulder.  유료(Bouquet+): 나머지.
export const POSES = {
  classic:       { tier: "free",    frag: "POSE: standing gracefully facing the camera, a serene natural smile, both hands resting softly together at the waist. Full-length composition, head to hem visible." },
  quarter:       { tier: "free",    frag: "POSE: the body turned about 45 degrees into a three-quarter (quarter-profile) angle toward the light, one hand resting softly on the hip, chin slightly lifted, an elegant poised stance. Full-length composition." },
  overshoulder:  { tier: "free",    frag: "POSE: turned with the back partly toward the camera, the head glancing back softly over one shoulder toward the lens, one hand resting near the hip, an elegant contemplative mood. Full-length composition." },
  seated:        { tier: "bouquet", frag: "POSE: seated elegantly on a simple stool, the gown draped naturally over the legs, hands resting in the lap, an upright poised expression. Full figure visible." },
  seated2:       { tier: "bouquet", frag: "POSE: seated on a bench turned three-quarters to the side, the legs angled elegantly to one side and crossed at the ankles, one hand resting on the bench and the other in the lap, a poised graceful seated posture. Full figure visible." },
  waist_front:   { tier: "bouquet", frag: "POSE: a WAIST-UP portrait crop — the frame filled from the top of the head down to just below the waist, facing the camera with a serene natural smile, hands softly together, legs out of frame." },
  waist_quarter: { tier: "bouquet", frag: "POSE: a WAIST-UP portrait crop — the frame filled from the head down to just below the waist, the upper body turned three-quarters toward the light, one hand near the collarbone, a soft elegant expression, legs out of frame." },
  embrace:       { tier: "atelier", frag: "POSE: the couple in a tender close embrace, foreheads near, sharing a quiet intimate moment." },
};

// ── 커플 전용 포즈 ── (두 사람 관계가 드러나는 포즈, 두 얼굴 모두 보이게)
export const COUPLE_POSES = {
  sidebyside:   { tier: "free",    frag: "POSE: the bride and groom standing close side by side facing the camera, the groom's arm softly around the bride's waist, both with warm natural smiles. Full-length composition, both faces clearly visible." },
  handhold:     { tier: "free",    frag: "POSE: the couple standing together holding hands, turned slightly toward each other while both glance to the camera, a warm relaxed mood. Full-length composition, both faces visible." },
  faceeach:     { tier: "free",    frag: "POSE: the bride and groom facing each other and holding both hands, foreheads almost touching, sharing a tender smile, both faces visible in a three-quarter view." },
  backhug:      { tier: "bouquet", frag: "POSE: the groom gently embracing the bride from behind with his arms around her, both looking toward the camera with soft smiles and cheeks close. Full-length composition, both faces clearly visible." },
  foreheadkiss: { tier: "bouquet", frag: "POSE: the groom tenderly kissing the bride's forehead while she smiles softly, an intimate loving moment; both faces visible." },
  walking:      { tier: "bouquet", frag: "POSE: the couple walking together hand in hand toward the camera, mid-stride and laughing naturally, a candid joyful mood. Full-length, both faces visible." },
  dip:          { tier: "atelier", frag: "POSE: a graceful dance dip — the groom supporting the bride as she leans back, the two gazing at each other, an elegant dynamic romantic moment; both faces visible." },
  embrace:      { tier: "atelier", frag: "POSE: the couple in a tender close embrace, foreheads together, sharing a quiet intimate moment; both faces visible." },
};
// 커플 포즈 공통 품질 지시 (두 사람 자연스러운 상호작용 + 두 얼굴 다 보이게 + 손 정확)
const COUPLE_POSE_QUALITY = "Render both people fully and naturally with correct anatomy; BOTH faces must be clearly visible (neither face fully turned away or hidden); a natural affectionate interaction between the two, relaxed postures, and hands rendered correctly with five fingers each. ";

// ── 씬 (카테고리 → 항목) ──
export const SCENES = {
  studio: {
    suede:      { tier: "free",    frag: "Setting: a professional indoor photo studio against a matte suede curtain backdrop in a deep jewel tone, soft directional studio lighting grazing the velvety pleats.",
                  spots: [
                    "Setting: a professional photo studio against a deep royal-purple matte suede curtain backdrop, soft studio lighting.",
                    "Setting: a professional photo studio against a deep midnight-navy matte suede curtain backdrop, soft studio lighting.",
                    "Setting: a professional photo studio against a deep wine-burgundy matte suede curtain backdrop, soft studio lighting.",
                    "Setting: a professional photo studio against a deep emerald-green matte suede curtain backdrop, soft studio lighting.",
                    "Setting: a professional photo studio against a near-black charcoal matte suede curtain backdrop, dramatic soft lighting.",
                  ] },
    ivory_wall: { tier: "bouquet", frag: "Setting: a professional photo studio against a warm ivory seamless backdrop, gentle studio lighting." },
    wall:       { tier: "bouquet", frag: "Setting: a professional photo studio against a flat matte seamless infinity wall in a deep tone, even soft studio lighting.",
                  spots: [
                    "Setting: a professional photo studio against a flat matte deep royal-purple seamless infinity wall, even soft lighting.",
                    "Setting: a professional photo studio against a flat matte deep midnight-navy seamless infinity wall, even soft lighting.",
                    "Setting: a professional photo studio against a flat matte deep wine-burgundy seamless infinity wall, even soft lighting.",
                    "Setting: a professional photo studio against a flat matte deep emerald-green seamless infinity wall, even soft lighting.",
                    "Setting: a professional photo studio against a flat matte near-black charcoal seamless infinity wall, dramatic soft lighting.",
                  ] },
    flower_arch:{ tier: "atelier", frag: "Setting: a studio scene styled with a lush fresh-flower arch behind the subject, romantic soft lighting." },
    wedding_car:{ tier: "atelier", frag: "Setting: seated inside the interior of a luxurious vintage wedding car — plush cream leather seats, polished wood and chrome, soft daylight through the car window." },
    cathedral:  { tier: "atelier", frag: "Setting: inside a grand cathedral interior with tall stained-glass windows and soft directional daylight." },
  },
  landmarks: {
    paris:     { tier: "free",    frag: "Setting: outdoors in Paris with the Eiffel Tower softly in the background, golden late-afternoon light." },
    nyc:       { tier: "bouquet", frag: "Setting: outdoors in New York City with an iconic skyline backdrop, bright natural daylight." },
    london:    { tier: "bouquet", frag: "Setting: outdoors in London with classic architecture and a red telephone box nearby, soft overcast light." },
    santorini: { tier: "bouquet", frag: "Setting: in Santorini among white-washed buildings and blue domes overlooking the Aegean sea, bright Mediterranean sun." },
    lasvegas:  { tier: "atelier", frag: "Setting: on the Las Vegas Strip with bright signage softly blurred behind, warm evening light." },
    rome:      { tier: "atelier", frag: "Setting: in Rome beside ancient classical architecture, warm Mediterranean afternoon light." },
    florence:  { tier: "atelier", frag: "Setting: in Florence with Renaissance domes and terracotta rooftops behind, soft golden light." },
    sanfrancisco:{ tier: "atelier", frag: "Setting: in San Francisco with the Golden Gate Bridge softly in the distance, gentle coastal light." },
    monaco:    { tier: "atelier", frag: "Setting: in Monaco along the harbor with luxury yachts softly blurred behind, bright Riviera daylight." },
    venice:    { tier: "atelier", frag: "Setting: in Venice beside a canal with a gondola nearby, soft warm afternoon light." },
    hallstatt: { tier: "atelier", frag: "Setting: in Hallstatt with the alpine lakeside village and mountains behind, crisp clear daylight." },
  },
  // Outdoor / Venue 는 v1.x — UI 구조만, 여기 최소 정의(빌드 후순위)
  outdoor: {
    beach:      { tier: "bouquet", frag: "Setting: on a serene beach at the water's edge, soft sunset light." },
    citystreet: { tier: "bouquet", frag: "Setting: on a charming city street with soft bokeh lights, gentle evening light." },
    wildflower: { tier: "atelier", frag: "Setting: in a wide wildflower field under a soft open sky, warm afternoon light." },
    forest:     { tier: "atelier", frag: "Setting: in a lush green forest garden with dappled sunlight." },
    cliff:      { tier: "atelier", frag: "Setting: on a dramatic seaside cliff at sunset with the ocean behind." },
  },
  venue: {
    shilla:      { tier: "bouquet", frag: "Setting: an ultra-premium luxury hotel wedding in a dark grand ballroom — deep charcoal walls, a dark grey carpeted aisle, tall gold candelabra topped with white hydrangea flower balls, low borders of white florals and glowing pillar candles, a luminous glowing white illuminated stage backdrop and a grand crystal chandelier, dim moody candlelit ceremony atmosphere, warm cinematic tone." },
    hyatt:       { tier: "atelier", frag: "Setting: an ultra-premium garden ballroom wedding — a soaring glass skylight ceiling, lush green foliage and blossoming branch arches, abundant pastel and white florals, long elegant banquet tables and tall windows, a moody dusk garden-luxury atmosphere of warm candlelight blended with soft daylight." },
    sixtythree:  { tier: "atelier", frag: "Setting: an epic grand ballroom wedding — a towering ceiling, an extremely long dramatic aisle, a single bright spotlight cutting through a vast dark hall, rows of guest tables fading into darkness, immense theatrical scale, deep gold and shadow tones." },
    brideroom:   { tier: "bouquet", frag: "Setting: a dark opulent premium hotel bridal suite — deep moody lighting, lustrous mother-of-pearl lacquer furniture, a dark velvet chaise, a large ornate gilt mirror, dark floral arrangements in deep burgundy and ivory, warm low lamp glow, luxurious shadowy atmosphere." },
    banquet:     { tier: "atelier", frag: "Setting: a dark candle-lit luxury banquet reception hall — round tables in deep tones with tall floral centerpieces, hundreds of warm candles, crystal glassware, softly glowing low chandeliers and a polished dark floor, intimate dim golden ambiance." },
    flowerstage: { tier: "atelier", frag: "Setting: a dramatic wedding flower stage against a dark backdrop — a massive lush floral arch of white and blush blooms with cascading greenery, dark moody surroundings and a focused warm spotlight, romantic dim atmosphere." },
  },
};

// ── 신랑 의상 (커플 모드) 프리셋 ──
export const GROOM_OUTFITS = {
  black_tux:  "a classic black tuxedo with a crisp white dress shirt and bow tie",
  navy_suit:  "a tailored navy suit with a white shirt and tie",
  white_tux:  "an elegant white dinner-jacket tuxedo with black trousers",
  beige_suit: "a soft beige tailored suit with a white shirt",
};

// ── 예복 재단 옵션 (라펠 / 여밈·버튼 / 피스) ──
//  색상만 있던 예복에 실제 테일러링 요소를 더한다. 각 값은 선택(미지정 시 문구 생략).
export const GROOM_LAPELS = {
  notch:  "notch lapels",
  peak:   "sharp peak lapels",
  shawl:  "a rounded shawl collar",
  mandarin: "a collarless mandarin (band) collar",
};
export const GROOM_CLOSURES = {
  single1: "single-breasted with a single button",
  single2: "single-breasted with two buttons",
  single3: "single-breasted with three buttons",
  double4: "double-breasted with a four-button (2x2) front",
  double6: "double-breasted with a six-button (2x3) front",
};
export const GROOM_PIECES = {
  two:   "a two-piece (jacket and trousers)",
  three: "a three-piece with a matching waistcoat",
};

// 선택된 재단 옵션 → 문구. 아무것도 없으면 "".
export function groomCutPhrase(sel) {
  const bits = [];
  if (GROOM_PIECES[sel.groomPieces]) bits.push(GROOM_PIECES[sel.groomPieces]);
  if (GROOM_CLOSURES[sel.groomClosure]) bits.push(GROOM_CLOSURES[sel.groomClosure]);
  if (GROOM_LAPELS[sel.groomLapel]) bits.push(GROOM_LAPELS[sel.groomLapel]);
  if (!bits.length) return "";
  return "Tailoring details of the suit: " + bits.join(", ") +
    ". Render these cut details accurately and precisely. ";
}

// ── 커스텀 색상 (#hex) ──
function customColorPhrase(hex) {
  const v = String(hex || "").trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(v)) {
    const h = v.startsWith("#") ? v : "#" + v;
    return "the exact color " + h.toUpperCase();
  }
  return "warm ivory";
}

// ── 몸매 정보 → 서술 문구 (유료 공통. 로컬 저장, 서버 미보존) ──
export function bodyProfilePhrase(bp) {
  if (!bp || typeof bp !== "object") return "";
  const parts = [];
  const h = Number(bp.heightCm);
  const w = Number(bp.weightKg);
  const hOk = Number.isFinite(h) && h >= 120 && h <= 210;
  const wOk = Number.isFinite(w) && w >= 30 && w <= 200;
  if (hOk) parts.push(`approximately ${Math.round(h)}cm tall`);
  // 이미지 모델은 "58kg" 같은 수치를 체형으로 못 옮긴다. 키와 함께 있을 때만
  // BMI 로 환산해 서술어를 붙이고, 몸무게만 있으면 수치를 참고로만 넘긴다.
  if (wOk && hOk) {
    const bmi = w / ((h / 100) ** 2);
    const build =
      bmi < 17.5 ? "a very slender, delicate build" :
      bmi < 20   ? "a slim, lightly built figure" :
      bmi < 23   ? "a balanced, healthy build" :
      bmi < 26   ? "a softly curved, fuller build" :
      bmi < 30   ? "a full, curvy build" :
                   "a plus-size build";
    parts.push(`about ${Math.round(w)}kg — ${build}`);
  } else if (wOk) {
    parts.push(`weighing about ${Math.round(w)}kg`);
  }
  const shapeMap = { slim: "a slim figure", normal: "an average figure", glam: "a curvy glamorous figure", plus: "a fuller plus figure" };
  if (bp.shape && shapeMap[bp.shape]) parts.push(shapeMap[bp.shape]);
  if (bp.shoulder === "narrow") parts.push("narrower shoulders");
  if (bp.shoulder === "wide") parts.push("broader shoulders");
  if (bp.upperVolume) parts.push("a fuller upper body");
  if (bp.lowerVolume) parts.push("a fuller lower body");
  if (!parts.length) return "";
  return (
    "Tailor the dress fit to the bride's real body: " + parts.join(", ") +
    ". The gown must flatter and fit this body naturally. "
  );
}

// ── Simple 슬라이더(0–4) → 스타일 번들 프리셋 ──
const SIMPLE_STYLE = [
  "a clean, modern minimalist wedding gown with simple lines and no heavy ornament",
  "a softly modern wedding gown with subtle delicate detailing",
  "a balanced classic wedding gown with tasteful lace and gentle structure",
  "a refined classic wedding gown with rich lace and elegant beadwork",
  "a sophisticated ornate wedding gown with intricate lace, beadwork and a dramatic silhouette",
];

// ============================================================
// tier 검증 — 선택값이 사용자 tier 로 허용되는지 확인.
// 반환: { ok:true } 또는 { ok:false, needed, feature }
// ============================================================
const RANK = { free: 0, bouquet: 1, atelier: 2 };
function need(userTier, requiredTier, feature, out) {
  if (RANK[userTier] < RANK[requiredTier]) {
    out.fail = out.fail || { needed: requiredTier, feature };
  }
}

export function validateSelection(userTier, sel) {
  const out = {};
  const t = userTier || "free";
  const mode = MODES[sel.mode] ? sel.mode : "bride_solo";
  need(t, MODES[mode].tier, "mode", out);

  // Custom dress (From Photo / Simple / Advanced) = Atelier
  if (sel.customDress) {
    need(t, "atelier", "customDress", out);
  } else if (sel.dressFit && DRESS_FITS[sel.dressFit]) {
    need(t, DRESS_FITS[sel.dressFit].tier, "dressFit", out);
  }

  // 색상: custom hex = Atelier, 프리셋은 정의된 tier
  if (sel.customColor) need(t, "atelier", "customColor", out);
  else if (sel.dressColor && DRESS_COLORS[sel.dressColor]) need(t, DRESS_COLORS[sel.dressColor].tier, "dressColor", out);

  // 포즈 tier 검증 (커플은 COUPLE_POSES, 신랑솔로는 게이팅 없음, 그 외 POSES)
  const poseTable = mode === "couple" ? COUPLE_POSES : POSES;
  if (sel.poseId && poseTable[sel.poseId]) need(t, poseTable[sel.poseId].tier, "pose", out);

  const cat = SCENES[sel.sceneCat];
  if (cat && cat[sel.sceneId]) need(t, cat[sel.sceneId].tier, "scene", out);

  if (sel.bodyProfile && Object.keys(sel.bodyProfile).length) need(t, "bouquet", "bodyProfile", out);
  if (sel.fromPhoto) need(t, "atelier", "fromPhoto", out);

  return out.fail ? { ok: false, ...out.fail } : { ok: true };
}

// ============================================================
// 프롬프트 조립.  hasFromPhoto/ hasDressRef 이면 드레스 서술 대신
// "참조 이미지의 드레스를 그대로 입혀라" 지시로 대체.
// ============================================================
export function buildWeddingInstruction(sel) {
  const mode = MODES[sel.mode] ? sel.mode : "bride_solo";
  const lines = [];
  lines.push(MODES[mode].frag);
  lines.push(sel.skinRetouch === false ? IDENTITY_PRESERVE : IDENTITY_PRESERVE_RETOUCH);

  // ── 신랑 솔로: 드레스 서술 없이 예복만 ──
  if (mode === "groom_solo") {
    const g = GROOM_OUTFITS[sel.groomOutfit] || GROOM_OUTFITS.black_tux;
    lines.push("Dress the groom in " + g + ", impeccably tailored to his frame. ");
    const cutSolo = groomCutPhrase(sel);
    if (cutSolo) lines.push(cutSolo);
    lines.push(REALISTIC_GARMENT);
    const gPose = GROOM_POSES[sel.poseId] || GROOM_POSES.classic;
    lines.push(gPose + " ");
    lines.push(GROOM_POSE_QUALITY);
    const gCat = SCENES[sel.sceneCat] || SCENES.studio;
    const gScene = gCat[sel.sceneId] || SCENES.studio.suede;
    lines.push(sceneFrag(gScene, sel.sceneSpot) + " ");
    if (mode !== "groom_solo") lines.push(bouquetPhrase(!sel.noBouquet));
  lines.push(framingPhrase(sel));
  lines.push(EXPRESSION_SKIN);
  lines.push(sel.skinRetouch === false ? SKIN_RETOUCH_OFF : SKIN_RETOUCH_ON);
  lines.push(PHOTO_QUALITY);
    return lines.join("");
  }

  // ── 드레스 서술 ──
  if (sel.fromPhoto) {
    lines.push(
      "Dress the bride in the exact wedding dress shown in the SECOND reference image — " +
      "match its silhouette, neckline, sleeves, fabric, lace and every detail faithfully, " +
      "fitted naturally to the bride's body. "
    );
  } else if (sel.customDress && sel.customDress.mode === "simple") {
    const idx = Math.max(0, Math.min(4, Number(sel.customDress.level) || 0));
    lines.push("Dress the bride in " + SIMPLE_STYLE[idx] + ". ");
  } else {
    const fit = DRESS_FITS[sel.dressFit] || DRESS_FITS.aline;
    lines.push("Dress the bride in " + fit.frag + ". ");
  }

  // ── 색상 (From Photo 면 참조 이미지 우선이라 생략) ──
  if (!sel.fromPhoto) {
    let colorPhrase;
    if (sel.customColor) colorPhrase = customColorPhrase(sel.customColor);
    else colorPhrase = (DRESS_COLORS[sel.dressColor] || DRESS_COLORS.white).phrase;
    lines.push("The dress color is " + colorPhrase + ". ");
  }

  // ── 신랑 의상 (커플) ──
  if (mode === "couple") {
    const g = GROOM_OUTFITS[sel.groomOutfit] || GROOM_OUTFITS.black_tux;
    lines.push("Dress the groom in " + g + ", tailored to his frame. ");
    const cutCouple = groomCutPhrase(sel);
    if (cutCouple) lines.push(cutCouple);
  }

  lines.push(REALISTIC_GARMENT);

  // ── 몸매 정보 (유료) ──
  const bp = bodyProfilePhrase(sel.bodyProfile);
  if (bp) lines.push(bp);

  // ── 포즈 + 씬 ──
  // 씬 프리셋을 골랐으면 포즈·씬을 통째로 대체한다 (배경과 포즈가 한 세트로 설계된
  // 컨셉이라 포즈만 갈아끼우면 컨셉이 깨진다). 드레스 서술은 프리셋에 없다.
  const presetSel = getScenePreset(sel.scenePresetId);
  if (presetSel) {
    lines.push(presetSel.scene + " ");
    lines.push(presetSel.pose + " ");
    if (mode === "couple") lines.push(COUPLE_POSE_QUALITY);
  } else {
    if (mode === "couple") {
      const cpose = COUPLE_POSES[sel.poseId] || COUPLE_POSES.sidebyside;
      lines.push(cpose.frag + " ");
      lines.push(COUPLE_POSE_QUALITY);
    } else {
      const pose = POSES[sel.poseId] || POSES.classic;
      lines.push(pose.frag + " ");
    }
    const cat = SCENES[sel.sceneCat] || SCENES.studio;
    const scene = cat[sel.sceneId] || SCENES.studio.suede;
    lines.push(sceneFrag(scene, sel.sceneSpot) + " ");
  }

  if (mode !== "groom_solo") lines.push(bouquetPhrase(!sel.noBouquet));
  lines.push(framingPhrase(sel));
  lines.push(EXPRESSION_SKIN);
  lines.push(sel.skinRetouch === false ? SKIN_RETOUCH_OFF : SKIN_RETOUCH_ON);
  lines.push(PHOTO_QUALITY);
  return lines.join("");
}

// 씬의 스팟 배열이 있으면 sceneSpot 인덱스의 프롬프트, 없으면 기본 frag.
// 프리셋 드레스 경로(generate.js)는 드레스 서술을 자체 프롬프트로 대체하지만,
// 씬·포즈는 사용자가 고른 값을 그대로 써야 한다. 그 두 조각만 따로 내준다.
export function expressionSkinPhrase(skinRetouch) {
  // 프리셋 드레스·드레스샵 경로에서도 같은 피부 판정을 뒤에 붙인다(뒤 문장이 더 세게 먹는다).
  return EXPRESSION_SKIN + (skinRetouch === false ? SKIN_RETOUCH_OFF : SKIN_RETOUCH_ON);
}

// 부케는 자세와 분리된 소품이다. 어떤 자세를 골라도 붙일 수 있어야 하므로
// 자세 문구를 건드리지 않고 손에 무엇을 드는지만 따로 지시한다.
// 전신 강제. "three-quarter to full-body" 같은 여지를 주면 모델이 무릎에서 자른다.
// 단, 상반신(waist_*) 포즈는 의도적으로 자르는 것이므로 제외한다.
export function framingPhrase(sel) {
  if (String(sel?.poseId || "").startsWith("waist_")) {
    return "Framing: a waist-up crop as described in the pose. ";
  }
  return "FRAMING (mandatory): a FULL-LENGTH shot. The entire figure must be inside the frame — "
    + "from the top of the head down to the hem of the gown and the shoes, with a little empty space "
    + "above the head and below the hem. Do NOT crop at the knees, thighs, hips or waist. "
    + "If the gown has a train, include it. ";
}

export function bouquetPhrase(hold) {
  return hold
    ? "The bride holds a small round bridal bouquet of ivory and blush garden roses with subtle greenery, "
      + "carried naturally in whichever way the chosen pose allows — it must never break or distort the pose, "
      + "and her hands must stay anatomically correct. "
    : "The bride carries NO bouquet and no flowers at all — her hands are free and relaxed. ";
}

// ── 묶음 생성용 자세 변형 ──
//  다른 요소(드레스·씬·인물·예복)는 전부 고정하고 자세만 바꾼다.
//  [0] 은 사용자가 고른 자세를 반드시 넣고, 나머지는 겹치지 않게 섞어서 채운다.
export function buildPoseVariants({ mode, count, poseId, exclude = [] }) {
  const table = mode === "couple" ? COUPLE_POSES : mode === "groom_solo" ? GROOM_POSES : POSES;
  const keys = Object.keys(table).filter((k) => !exclude.includes(k));
  const first = keys.includes(poseId) ? poseId : keys[0];   // 제외된 자세를 골랐으면 첫 자세로 대체
  const rest = keys.filter((k) => k !== first);
  for (let i = rest.length - 1; i > 0; i--) {          // Fisher-Yates
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const out = [first];
  while (out.length < count) {
    const pick = rest[(out.length - 1) % rest.length];
    out.push(rest.length ? pick : first);
  }
  return out.slice(0, count);
}

// ── 씬 프리셋 (리미키미 브라이덜 이식, 2026-08-26) ──────────────
// 배경·조명·카메라·포즈·소품이 한 세트로 설계된 컨셉. 드레스는 사용자가 따로 고르므로
// 변환 단계에서 의상 서술을 제거했다 — 여기서 다시 붙이지 않는다.
// 프리셋을 고르면 씬/포즈 선택을 **통째로 대체**한다: 원본이 "서재의 앉은 신부"처럼
// 배경과 포즈가 한 몸이라, 포즈만 갈아끼우면 컨셉이 깨진다.
import PRESETS from "../_data/wedding-scenes.json" with { type: "json" };
const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export function getScenePreset(id) { return (id && PRESET_BY_ID[id]) || null; }

export function scenePosePhrase(sel) {
  const preset = getScenePreset(sel.scenePresetId);
  if (preset) return preset.scene + " " + preset.pose + " ";
  const mode = MODES[sel.mode] ? sel.mode : "bride_solo";
  const out = [];
  const poseTable = mode === "couple" ? COUPLE_POSES : POSES;
  const pose = poseTable[sel.poseId] || (mode === "couple" ? COUPLE_POSES.sidebyside : POSES.classic);
  if (pose) out.push((pose.frag || pose) + " ");
  const cat = SCENES[sel.sceneCat] || SCENES.studio;
  const scene = cat[sel.sceneId] || SCENES.studio.suede;
  out.push(sceneFrag(scene, sel.sceneSpot) + " ");
  return out.join("");
}

function sceneFrag(scene, spot) {
  if (scene.spots && scene.spots.length) {
    const i = Math.max(0, Math.min(scene.spots.length - 1, Number(spot) || 0));
    return scene.spots[i];
  }
  return scene.frag;
}

// ── 조세핀 프리셋 드레스 160벌(본식 M01–M80 · 2부 A01–A80) — 표(DRESS_PRESET_CATALOG.md)와 공개 버킷 컷 ──
import DRESSES from "../_data/wedding-dresses.json" with { type: "json" };
const DRESS_BUCKET = "https://aknjtopskvegcmsnbnut.supabase.co/storage/v1/object/public/preset-dresses";
export function findDress(code) { return DRESSES.find((d) => d.code === code) || null; }
export function dressImageURL(code, angle = "front") { return `${DRESS_BUCKET}/${code}/${angle}.webp`; }
export function weddingCatalog() { return DRESSES.map((d) => ({ ...d, thumb: dressImageURL(d.code, "front") })); }

// josephine app/api/generate.js buildPresetDressInstruction 그대로(신랑 예복 기본 = 블랙 턱시도).
export function buildPresetDressInstruction(dress, angles, sel, mode = "bride_solo") {
  const p = [];
  const couple = mode === "couple";
  if (couple) {
    p.push("Create a high-end Korean wedding studio portrait of the SAME TWO people: the woman in the FIRST reference photo and the man in the SECOND reference photo, standing close together and naturally posed as a married couple. Preserve both of their exact faces, skin tones, hairlines and body proportions. Do not beautify, slim, or change who they are.");
  } else {
    p.push("Create a high-end Korean wedding studio portrait of the SAME person as in the FIRST reference photo — preserve their exact face, skin tone, hairline and body proportions. Do not beautify, slim, or change their identity.");
  }
  p.push(`${couple ? "The bride" : "The person"} wears the EXACT SAME wedding dress shown in the REMAINING reference photos (angles: ${angles.join(", ")}). This is one specific real gown, not a style reference: reproduce its silhouette, neckline, sleeves, waistline, skirt volume, train length, fabric, lace pattern and beading exactly as photographed. Do not substitute a similar dress, do not simplify the detailing, do not change the colour.`);
  p.push("The reference gown photos are shot on a headless dress form; ignore the form and the dark backdrop entirely — take only the garment from them.");
  const bits = [];
  if (dress.color) bits.push(`colour ${dress.color}`);
  if (dress.silhouette) bits.push(`${dress.silhouette} silhouette`);
  if (dress.neckline) bits.push(`${dress.neckline} neckline`);
  if (dress.sleeve) bits.push(`${dress.sleeve} sleeves`);
  if (bits.length) p.push(`For reference the gown is: ${bits.join(", ")}.`);
  p.push(scenePosePhrase(sel || {}));
  p.push(framingPhrase(sel || {}));
  p.push("Accessories: understated and refined — pearl and diamond ONLY. No gold, no colored gems, nothing ostentatious.");
  p.push(bouquetPhrase(!(sel && sel.noBouquet)));
  if (couple) {
    const g = GROOM_OUTFITS[sel && sel.groomOutfit] || GROOM_OUTFITS.black_tux;
    p.push(`The groom wears ${g}, impeccably tailored to his frame.`);
    const cut = groomCutPhrase(sel || {});
    if (cut) p.push(cut);
  }
  const bp = bodyProfilePhrase(sel && sel.bodyProfile);
  if (bp) p.push(bp);
  p.push(expressionSkinPhrase(sel && sel.skinRetouch !== false));
  p.push("Photorealistic. Do NOT render any text, logo or watermark inside the image.");
  return p.join(" ");
}
