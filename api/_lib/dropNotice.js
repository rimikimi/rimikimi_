// ============================================================
// "새 컨셉 도착" 원격 푸시 (매일 20시 KST 드롭 직후 크론이 호출)
//
// 컨셉은 publishAt 시각이 지나면 자동으로 공개된다(api/concepts.js).
// 여기서는 "방금 공개된 것"만 골라 토픽으로 한 번 쏜다.
//
// 창(window)을 2시간으로 잡은 이유: Vercel 크론은 정시에 딱 맞춰 도는 게
// 아니라 몇 분~수십 분 밀릴 수 있다. 너무 좁으면 드롭을 놓치고, 너무
// 넓으면 어제 것까지 다시 알린다. 드롭 간격이 24시간이라 2시간이면 안전하다.
// ============================================================

import ALL from "../_data/concepts.json" with { type: "json" };
import { sendToTopic } from "./push.js";

export const DROP_TOPIC = "concepts";
const WINDOW_MS = 2 * 60 * 60 * 1000;

export async function notifyConceptDrop(req, res) {
  const now = Date.now();
  const since = now - WINDOW_MS;

  const fresh = [];
  for (const c of ALL) {
    if (!c?.publishAt) continue; // 예약 없이 처음부터 공개된 건 새 드롭이 아니다
    const t = Date.parse(c.publishAt);
    if (Number.isFinite(t) && t > since && t <= now) fresh.push(c);
  }

  if (!fresh.length) {
    return res.status(200).json({ ok: true, sent: false, reason: "no fresh drops" });
  }

  const titles = fresh.map((c) => c.title).filter(Boolean);
  const shown = titles.slice(0, 3).join(", ");
  const body = shown
    ? `오늘의 새 컨셉 ${fresh.length}종 · ${shown}`
    : `오늘의 새 컨셉 ${fresh.length}종이 올라왔어요`;

  // dry=1 이면 실제로 쏘지 않고 무엇이 나갈지만 확인한다 (수동 점검용)
  if (req.query?.dry) {
    return res.status(200).json({ ok: true, sent: false, dry: true, count: fresh.length, body });
  }

  const r = await sendToTopic(DROP_TOPIC, {
    title: "새로운 컨셉이 도착했어요 ✨",
    body,
    data: { kind: "drop", count: fresh.length, firstId: fresh[0]?.id ?? "" },
  });

  return res.status(r.ok ? 200 : 502).json({ ...r, sent: r.ok, count: fresh.length, body });
}
