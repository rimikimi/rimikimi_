// ============================================================
// 드레스룸 프롬프트 조립 — 서버(api/generate.js)와 테스트(scripts/test-dressroom.mjs)가
// 같은 코드를 쓰도록 모듈로 분리했다. 여기서 나온 문자열이 그대로 모델에 들어간다.
// ============================================================

export function buildDressroom({ garments, dressStyle }) {
  // ── 드레스룸 (2026-08-25) ─────────────────────────────────────────────
  // 의상 사진(최대 5장)을 입은 내 모습을 만든다. Higgsfield 로 케이스별(상의만/
  // 상+하/3장 레이어드/신발 포함 4장) 실측해 확정한 프롬프트를 서버에서 조립한다.
  // 확정 사양: 최대 5장(아우터·상의·하의·신발·가방) / 확인 질문 없음(빠진 의상은
  // 모델이 판단) / 거울셀카=토프 스웨이드 커튼 피팅룸 / 모델컷=오프화이트 무지.
  const GARMENT_MAX = 5;
  // ── 모델컷 배경 풀 (오너 지시 2026-08-30) ────────────────────────────────
  // 예전엔 "일상 장소 — 예를 들면 인도/카페 앞/가로수길…" 한 문장이 하드코딩이라
  // 모델이 매번 아무거나 골랐다. 이제 서버가 매 요청마다 후보를 랜덤으로 몇 개 뽑고,
  // 그중에서 "이 옷을 실제로 입고 갈 만한 곳"을 모델이 고르게 한다.
  // 색은 오너 규칙대로 전부 hex 로 지정한다.
  // ⚠️ 배경만 늘리면 안 된다. 후보를 순수 랜덤으로 뽑으면 풀이 커질수록 "이 옷에 맞는
  //    곳"이 후보에 안 들어올 확률이 올라간다(운동복인데 후보가 전부 실내인 식).
  //    그래서 그룹별로 하나씩 뽑아 **어떤 옷이 와도 맞는 후보가 최소 하나는** 있게 한다.
  const SCENE_GROUPS = {
    // 평상복·데일리
    casual: [
      "a quiet city sidewalk in front of low-rise shopfronts — pale concrete pavement #C9C4BD, muted stone facades #D6D0C8, soft overcast sky #B9C4CE",
      "a café terrace: small round outdoor table and a bentwood chair, warm terracotta tiles #B5573A, cream plaster wall #EFE6D8, green planters #6B7238",
      "a tree-lined residential street, dappled sunlight through foliage #5E7F4B, warm beige apartment walls #E0D3BC, grey asphalt #7C7C7A",
      "a park path with a wooden bench, mown grass #6E8B4A, weathered oak bench #8B6F4E, bright sky #C6D6E4",
      "a riverside walkway with a low railing, water #6F8CA0, pale walkway stone #CFC8BC, distant skyline haze #AEBAC6",
      "a quiet brick alley with soft shade, red-brown brick #9A5B47, grey stone ground #A9A49C, a sliver of bright sky #CBD8E4",
      "a university campus stone stairway, pale granite steps #CFCAC1, ivy green #4F7A44, red-brick building #9C5B3C",
      "a small neighbourhood flower shop front, buckets of blooms #F2A5C0, green foliage #4F7A44, whitewashed frontage #F4F1EA",
      "a weekend street market lane, striped awnings #E8721C, produce crates #6E8B4A, worn asphalt #8A8A8A",
    ],
    // 단정·실내·차분한 곳 (블라우스·니트·미니멀 룩)
    refined: [
      "a bright museum corridor, smooth white walls #F2F0EC, pale oak floor #D8C3A2, soft even daylight",
      "an independent bookstore interior, warm wooden shelves #7A5638, amber lamp light #E0A93B, cream book spines #EDE3D2",
      "a rooftop terrace above the city, warm concrete floor #C2B8AC, clean white parapet #EDEAE4, wide open sky #A9C2D8",
      "a hotel lobby corner with a low armchair, deep green marble #1F4A3C, brass trim #C9A227, warm ivory wall #F6F1E7",
      "a minimal concept-store interior, polished microcement floor #C6C2BB, white display plinths #F2F0EC, soft track lighting",
    ],
    // 오피스·비즈니스 (정장·블레이저·슬랙스)
    business: [
      "a modern office building lobby, glass curtain wall #B9C4CE, pale stone floor #D6D0C8, brushed steel trim #9AA0A6",
      "a bright corporate corridor beside floor-to-ceiling windows, grey carpet #8A8A8A, white walls #F2F0EC, city daylight",
      "a coworking lounge with a long oak table, warm oak #B08858, soft grey seating #9AA0A6, plants #6B7238",
    ],
    // 활동복 (레깅스·트레이닝·러닝화)
    active: [
      "a riverside running track at morning, red rubberised lane #B5573A, mown grass verge #6E8B4A, hazy city skyline #AEBAC6",
      "a bright pilates/yoga studio, pale oak floor #D8C3A2, soft white walls #F2F0EC, large window daylight, a rolled mat #A3B18A",
      "an outdoor basketball half-court, faded blue asphalt #4A6C8C, white line markings #F4F1EA, chain-link fence #9AA0A6",
      "a public tennis court in daylight, clay-red surface #B5573A, white lines #F4F1EA, deep green fence windbreak #1F4A3C",
      "a wooded hiking trail head, packed earth path #8B6F4E, dense green foliage #4F7A44, dappled sunlight",
      "a bright modern gym floor, rubber flooring #36393D, pale grey walls #C6C2BB, daylight from high windows",
    ],
    // 저녁·차려입는 자리 (원피스·새틴·힐)
    evening: [
      "a warm restaurant interior at night, deep walnut panelling #4A2C1D, amber pendant light #E0A93B, cream linen tables #EDE3D2",
      "a quiet wine bar, dark green wall #1E5133, brass fittings #C9A227, low warm light #E0A93B",
      "a formal event foyer with a chandelier, ivory marble #F6F1E7, gold trim #C9A227, deep carpet #6E1B2E",
      "a neon-lit night street after rain, wet asphalt reflections #2E3238, magenta sign glow #E0218A, cyan sign glow #00E5FF",
      "a hotel poolside at dusk, still water #2EC4B6, pale stone deck #E3D2B4, warm sky #F2B27C",
    ],
    // 계절·특수 (코트·패딩·트렌치·한복·여행)
    seasonal: [
      "an autumn street with fallen leaves, amber foliage #C8791E, rust brick wall #9C5B3C, cool grey pavement #B3AFA9",
      "a snowy winter street, fresh snow #F4F6F8, bare dark branches #4A4A48, cold blue shadows #A9BCCF",
      "a rainy city street under soft grey light, wet pavement #7C7C7A, glossy reflections #B9C4CE, shopfront glow #E0A93B",
      "a seaside promenade in summer, pale sand #E3D2B4, turquoise water #2EC4B6, whitewashed wall #F4F1EA",
      "a hanok village alley, dark tiled roofs #36393D, ochre earthen walls #C08A28, stone path #A9A49C",
      "a palace stone wall path in daylight, weathered granite #A9A49C, deep red timber #9B1B1B, pine green #1E5133",
      "an airport terminal walkway with wide windows, polished floor #D6D0C8, pale steel columns #9AA0A6, bright daylight",
      "a train platform in the afternoon, concrete platform #B3AFA9, yellow safety line #F2C744, soft shade",
    ],
    // 홈웨어·라운지웨어 (잠옷·파자마·홈세트)
    home: [
      "a sunlit living room, warm oak floor #D8C3A2, soft linen sofa #E6D9C3, sheer curtains #F4F1EA",
      "a tidy bedroom corner in morning light, cream bedding #FBF3E4, pale wall #F2EFEE, warm wood side table #B08858",
      "a bright home kitchen, white tiles #F2F0EC, pale wood counter #D8C3A2, morning window light",
    ],
  };
  const MODEL_SCENES = Object.values(SCENE_GROUPS).flat();
  // 그룹마다 하나씩 뽑고 순서를 섞는다 → 후보는 매번 다르지만 커버리지는 항상 보장된다
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const picked = Object.values(SCENE_GROUPS).map(pickOne);
  for (let i = picked.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [picked[i], picked[k]] = [picked[k], picked[i]];
  }
  const sceneChoices = picked.map((s, i) => `  ${i + 1}) ${s}`).join("\n");

  // 프레이밍 — 오너가 "딱 좋다"고 고른 실사 거울셀카 3장에서 잰 비율을 그대로 박는다.
  // (머리 위 20~25% / 인물 70~75% / 발 아래 4~8%. 발이 잘린 컷은 반려된 케이스다.)
  // 예전엔 "FULL BODY head to shoes" 한 줄뿐이라 모델이 무릎~허벅지에서 자르거나
  // 신발을 프레임 밖으로 내보내는 일이 있었다 → 숫자와 금지 조건을 같이 준다.
  const DRESS_FRAMING =
    "FRAMING (STRICT — follow these proportions exactly):\n" +
    "- WHOLE BODY from the top of the head down to the SOLES OF THE SHOES (or bare feet, if the " +
    "outfit is homewear/loungewear worn indoors) is inside the frame.\n" +
    "- The person's head-to-shoe height fills about 75-80% of the image height.\n" +
    "- Leave about 15-20% of empty space ABOVE the top of the head — the top of the head sits " +
    "roughly one sixth of the way down from the top edge. Do NOT leave a large empty area above " +
    "the head: more than about 20% headroom is WRONG, it makes the person look small and far away.\n" +
    "- Leave about 3-7% of visible FLOOR BELOW the shoes, so the feet clearly do not touch the " +
    "bottom edge of the picture.\n" +
    "- This is a full-length outfit photo, NOT a wide shot of the room with a small person in it.\n" +
    "- BOTH FEET are fully visible and complete. NEVER crop the feet, ankles, shoes, shins or " +
    "the top of the head. A cropped foot makes the picture unusable.\n" +
    "- Shoot from far enough back (about 2 metres between camera and person, camera at chest " +
    "height, lens level and straight-on). If unsure, step BACK and include more ground — never " +
    "zoom in.\n" +
    "- The person is centred horizontally. They may be STANDING or SEATED (a café chair, a park " +
    "bench, a low step, a stone ledge) — either is fine, but even when seated the WHOLE body " +
    "including both shoes must stay inside the frame with the same margins above and below.\n";
  const garmentList = (Array.isArray(garments) ? garments : [])
    .filter((g) => g && typeof g.base64 === "string" && /^image\//.test(g.mimeType || ""))
    .slice(0, GARMENT_MAX);
  const isDressroom = garmentList.length > 0;
  const dressMirror = dressStyle !== "model"; // 기본 = 거울셀카

  // 참조 순서: [본인 사진] + [의상 1..N]. 서수(SECOND, THIRD…)가 이 순서를 가리킨다.
  const ORDINALS = ["SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"];
  const garmentListing = garmentList
    .map((_, i) => `the ${ORDINALS[i]} reference image is one of the garments/items`)
    .join(", ");

  const dressroomInstruction =
    "Virtual fitting-room photo. The FIRST reference image shows a person — reproduce this " +
    "person's exact facial identity: same face, bone structure, eyes, nose, lips, same hair, " +
    "same natural body proportions. " +
    // "remaining" 이라 쓰면 안 된다 — 맨 뒤에 얼굴 참조가 더 붙는다(faceClause 참고)
    `The NEXT ${garmentList.length} reference image(s) show clothing/fashion items: ` +
    garmentListing + ". " +
    "The person is WEARING ALL of these EXACT items together as one outfit. First identify what " +
    "each item is (top, bottom, dress, outerwear, shoes, bag, accessory), then dress the person " +
    "in all of them with a natural, correct layering order (outerwear over tops, shoes on feet, " +
    "a bag carried or held naturally). Reproduce EVERY item exactly — same colours, same pattern, " +
    "same buttons and hardware, same fabric, same fit and length. Do not redesign, recolour or " +
    "simplify any item.\n\n" +
    // 빠진 부위는 묻지 않고 모델이 채운다 (오너 확정: 확인 단계 없음)
    "If the uploaded items do not make a complete outfit (e.g. only a top, or only shoes), " +
    "complete the look yourself with simple, well-matching neutral pieces that let the uploaded " +
    "items be the focus. If a dress or a full set is uploaded, no extra garments are needed.\n\n" +
    (dressMirror
      ? "SCENE — full-body MIRROR SELFIE in a clothing-store fitting room. The picture IS the " +
        "view in the single mirror the person is shooting into — the frame shows ONLY three " +
        "things: the person, the taupe curtain behind them, and the wooden floor. THERE IS NO " +
        "OTHER MIRROR IN THE ROOM. Nothing reflective appears at either side edge of the " +
        "picture: no mirror frame, no glass panel, no metal trim, no second reflection, no " +
        "repeated copy of the person, no infinite-mirror effect. The side walls are plain, " +
        "soft warm white #F2EFEE.\n" +
        "EXACT SCENE COLOURS (match these hex values):\n" +
        "- Curtain base colour #837166 (greige-taupe). Lit folds no lighter than #9B8879, " +
        "shadowed folds no darker than #6B584E. Matte suede, never glossy, never grey-blue, " +
        "never brown-orange.\n" +
        "- Wooden floor #CBAB8E (light oak), pale natural planks.\n" +
        "- Walls and ceiling #F2EFEE (soft warm white).\n" +
        "BEHIND: a floor-length TAUPE SUEDE fitting-room curtain in that exact colour, heavy " +
        "matte suede texture with soft vertical folds, drawn mostly closed, filling the " +
        "background — and the light oak floor. The person holds their phone at chest height, " +
        "phone visible but NOT covering the face. Natural relaxed mirror-selfie stance.\n" +
        DRESS_FRAMING +
        "LIGHTING — bright, soft and flattering like a well-lit modern retail fitting room: " +
        "overall bright neutral-warm ambience, only a GENTLE hint of warm downlight from above. " +
        "NO dramatic spotlight, NO strong pool of light, NO visible light fixtures. " +
        "Real phone mirror-selfie feel, natural handheld framing."
      // 오너 지시(2026-08-26): 스튜디오 무지 배경 → 일상 배경. 포즈는 모델, 시선은 자유.
      : "SCENE — a full-body everyday OUTFIT SNAP, taken by a friend on an iPhone.\n" +
        "First LOOK AT THE OUTFIT the person is wearing — its formality, season, fabric weight " +
        "and colours — then pick the ONE location below where a real person would actually wear " +
        "that outfit:\n" + sceneChoices + "\n" +
        "Choose only one and commit to it. If NONE of them suits the outfit — for example " +
        "activewear with only indoor or dressy options on the list — then ignore the list and " +
        "use the ordinary everyday place where that outfit actually belongs (a running path, a " +
        "gym, a playground, a market street…), described in the same plain real-world way.\n" +
        "Dressy or tailored looks belong in the more polished " +
        "options; relaxed or sporty looks belong in the casual ones. The season and weather of " +
        "the location MUST match the clothing — never a heavy winter coat in bright summer light, " +
        "never a thin summer dress against autumn leaves. The background is a believable ordinary " +
        "place with natural depth, gently blurred so the person and the clothes stay the clear " +
        "subject.\n" +
        // "모델 포즈" 라고 쓰면 각 잡힌 화보가 나온다(오너: 너무 모델같음 → candid moment 로).
        // 포즈를 "취한" 게 아니라 "순간을 잡은" 사진으로 장면 자체를 재정의한다.
        "POSE — a CANDID MOMENT, not a pose: the person is caught in a natural unposed " +
        "instant, as if photographed without warning — mid-step down the sidewalk, brushing " +
        "hair from their face, glancing at something across the street, adjusting a sleeve, " +
        "a soft genuine in-between expression or an unguarded small smile. Relaxed shoulders, " +
        "natural weight shift, hands doing something ordinary (in a pocket, holding the bag, " +
        "at their side). ABSOLUTELY NOT a stiff editorial model pose, not posing for the " +
        "camera at all. The GAZE IS FREE and usually off-camera, like a street snap taken by " +
        "a friend.\n" +
        DRESS_FRAMING +
        "LIGHTING — only the light that already belongs to the scene: natural daylight (or the " +
        "street/interior lights at night), soft and gently directional, true-to-life colours. " +
        "NO photography equipment, NO studio lighting, NO reflectors anywhere in the frame.\n" +
        "CAMERA — shot on an iPhone by a friend, held at chest height: the ordinary look of a " +
        "modern phone camera, mild wide-angle, deep-ish focus with only gentle background " +
        "separation, everyday colour rendering. It should read as a real photo somebody took " +
        "and sent you — NOT a fashion editorial, NOT a professional lookbook, no studio polish.") +
    "\n\nOUTPUT FORMAT: a VERTICAL PORTRAIT photograph in 3:4 aspect ratio (taller than wide, " +
    "like a standard phone portrait photo). Do NOT copy the aspect ratio of any reference image — " +
    "reference images may be tall phone screenshots; the output is always 3:4.\n" +
    "Photorealistic skin and fabric texture, true-to-life garment colours. " +
    "One person only — no other people. No text, no logo, no watermark, no border or overlay.";
  return { isDressroom, garmentList, dressMirror, instruction: dressroomInstruction };
}
