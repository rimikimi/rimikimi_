// ============================================================
// 공개된 컨셉 목록 만들기 (필터 + 고정핀 + 정렬)
//
// 왜 별도 모듈인가:
//   같은 로직을 두 군데가 써야 한다.
//     1) api/concepts.js  — 런타임에 /concepts.json 으로 서빙
//     2) scripts/build-fallback.mjs — 빌드 때 public/concepts.fallback.json 생성
//   예전엔 폴백을 손으로 만들어서 그대로 굳었다. 2026-08-20 기준 폴백은
//   301종짜리 옛 스냅샷이었고, 782~787(매직 부스 신규)이 통째로 빠져 있었으며
//   330 은 이미 예술/클래식으로 되돌렸는데도 매직 부스로 남아 있었다.
//   → 로직을 한 곳에 두고 빌드가 폴백을 다시 굽게 한다.
//
// ⚠️ api/_lib/ 는 서버리스 함수로 세지 않는다(Vercel Hobby 12개 상한과 무관).
// ============================================================

// 기능 컨셉은 항상 목록 뒤로 (일반 화보 컨셉이 앞에 와야 한다)
const FEATURE_CATS = ["🪄 매직 부스", "🪪 증명사진", "📸 인생네컷"];

// 추천 줄 고정 자리. 앱은 이 값을 보고 해당 위치에 꽂는다(1 = 첫 번째).
// 데이터로만 바꿀 수 있게 서버에 둔다 — 순서 조정에 앱 빌드가 필요 없도록.
const PINNED = {
  408: 2, // 사진 복원 — 추천 두 번째
};

function isFeature(c) {
  const cats = c.categories || (c.category ? [c.category] : []);
  return cats.some((x) => FEATURE_CATS.includes(x)) ||
    c.mode === "idphoto" || c.mode === "fourcut";
}

// publishAt 이 지난 것만. 날짜가 깨졌으면 숨기지 않는다(빈 갤러리보다 낫다).
export function isPublished(c, now) {
  if (!c) return false;
  if (!c.publishAt) return true; // 예약 없는 건 이미 공개된 것
  const t = Date.parse(c.publishAt);
  return !Number.isFinite(t) || t <= now;
}

// ⚠️ 정렬은 서버가 결정한다. 앱은 이 배열 순서를 그대로 그린다.
//    정렬 규칙이 앱 안에 박혀 있으면 순서 하나 바꾸는 데도 스토어 심사를
//    거쳐야 한다(실제로 그래서 새 컨셉이 목록 뒤로 밀린 채 방치됐다).
export function publishedConcepts(ALL, now) {
  const list = ALL.filter((c) => isPublished(c, now));

  for (const c of list) {
    const at = PINNED[Number(c.id)];
    if (at) c.pinFeatured = at;
  }

  const rank = (c) => (c.publishAt ? Date.parse(c.publishAt) : 0);
  list.sort((a, b) => {
    // 기능 컨셉(매직부스·증명사진·인생네컷)은 항상 뒤로
    const fa = isFeature(a) ? 1 : 0, fb = isFeature(b) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    // 실제 공개 시각이 늦은 것 = 최신 → 앞으로. 같으면 id 큰 순.
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return rb - ra;
    return Number(b.id) - Number(a.id);
  });

  // publishAt 은 지우지 않고 그대로 내려준다 — 구버전 앱이 자체 정렬할 때
  // 쓸 수 있고, 이미 지난 시각이라 숨길 이유도 없다.
  return list;
}
