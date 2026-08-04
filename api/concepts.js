// ============================================================
// 컨셉 목록 — /concepts.json 이 이 함수로 rewrite 된다 (vercel.json).
//
// 왜 정적 파일이 아니라 함수인가:
//   컨셉을 "매일 20시(KST)에 2개씩" 자동 공개하기 위해서다. 각 컨셉에 publishAt 을
//   박아두고 여기서 시간이 지난 것만 내려주면, 크론도 재배포도 필요 없고
//   이미 설치된 앱(구버전 포함)까지 전부 같은 URL 을 보므로 그대로 반영된다.
//
// ⚠️ 앱 전체가 이 응답에 의존한다. 외부 호출·DB 없이 정적 import + 필터만 한다.
//    (실패하면 갤러리가 통째로 빈다)
// ============================================================

import ALL from "./_data/concepts.json" with { type: "json" };

export default function handler(req, res) {
  const now = Date.now();

  let list;
  try {
    list = ALL.filter((c) => {
      if (!c || !c.publishAt) return true; // 예약 없는 건 이미 공개된 것
      const t = Date.parse(c.publishAt);
      return !Number.isFinite(t) || t <= now; // 날짜가 깨졌으면 숨기지 않는다
    }).map(({ publishAt, ...rest }) => rest);
  } catch (_) {
    list = ALL; // 필터가 어떤 이유로든 터지면 전부 내보낸다 (빈 갤러리보다 낫다)
  }

  // 다음 공개 시각까지만 캐시 — 길어야 10분이라 드롭이 늦어도 10분 안에 반영된다.
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
  );
  res.status(200).send(JSON.stringify(list));
}
