// ============================================================
// "새 컨셉 도착" 원격 푸시
//
// ⚠️ 핵심: 알림은 "받는 사람의 저녁 8시"에 떠야 한다.
//    처음엔 11:10 UTC 에 한 번만 쐈는데, 그건 한국이 20시일 때 LA 는 새벽
//    4시다. 앱은 이미 여러 나라에서 쓰고 있으므로 그대로 두면 대부분의
//    해외 사용자가 자다가 알림을 받는다.
//
// 해결: 기기가 자기 UTC 오프셋을 토픽에 담아 구독한다(drop_p540 = UTC+9).
//    크론은 15분마다 돌면서 "지금 현지 20시인 오프셋" 하나를 계산해
//    그 토픽에만 쏜다. 기기 목록도, 시간대 DB 도 필요 없다.
//    15분 간격인 이유: 실제 시간대 오프셋은 15분 단위까지 존재한다
//    (인도 +5:30, 네팔 +5:45, 채텀 +12:45).
// ============================================================

import ALL from "../_data/concepts.json" with { type: "json" };
import { sendToTopic } from "./push.js";

const DROP_HOUR_LOCAL = 20;      // 현지 저녁 8시
const LOOKBACK_MS = 24 * 60 * 60 * 1000;

// src/push.js 의 dropTopicFor 와 규칙이 같아야 한다.
export function dropTopicFor(offsetMinutes) {
  const s = offsetMinutes < 0 ? "m" : "p";
  return `drop_${s}${Math.abs(offsetMinutes)}`;
}

// 지금 이 순간 현지시각이 20:00 인 UTC 오프셋(분) — 하나가 아니다.
// 예) 11:00 UTC 라면 +9시간(한국).
//
// ⚠️ 24시간 차이 나는 오프셋은 같은 UTC 시각에 20시가 된다. 08:00 UTC 에는
//    UTC+12(뉴질랜드)와 UTC-12 가 동시에 저녁 8시다. 하나만 고르면 반대쪽은
//    영영 알림을 못 받는다 — 실제로 사모아(+13)·미국령 사모아(-11)가 이 짝이다.
//    그래서 실존 범위(-12:00 ~ +14:00) 안에 드는 후보를 전부 돌려준다.
export function offsetsWhereLocalIsDropHour(now) {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const base = DROP_HOUR_LOCAL * 60 - utcMin;
  return [base - 1440, base, base + 1440].filter((o) => o >= -12 * 60 && o <= 14 * 60);
}

export async function notifyConceptDrop(req, res) {
  const now = new Date();
  // 크론이 몇 분 밀려도 가장 가까운 15분 슬롯으로 맞춘다. 안 그러면 오프셋이
  // 어긋나 어느 시간대에도 해당되지 않아 알림이 통째로 누락된다.
  const STEP = 15 * 60 * 1000;
  let slot = new Date(Math.round(now.getTime() / STEP) * STEP);
  // ?slot=HHMM(UTC) — 호출이 늦어도 타깃 슬롯을 고정한다 (2026-08-26 실측:
  // Vercel Hobby 크론은 최대 59분 밀리는데, 밀린 시각으로 슬롯을 잡으면
  // "그 순간 20시인 시간대"가 KST 가 아니게 돼 drop_p540 이 매일 빠졌다).
  const forced = String(req.query?.slot || "");
  if (/^\d{4}$/.test(forced)) {
    const s = new Date(now);
    s.setUTCHours(Number(forced.slice(0, 2)), Number(forced.slice(2)), 0, 0);
    // 자정 직후 호출이 다음날 슬롯을 가리키면 하루 되돌린다
    if (s.getTime() - now.getTime() > 12 * 3600 * 1000) s.setUTCDate(s.getUTCDate() - 1);
    slot = s;
  }

  const offsets = offsetsWhereLocalIsDropHour(slot);
  const topics = offsets.map(dropTopicFor);

  // 최근 24시간 안에 공개된 것 = 그 사람이 아직 안내받지 못한 가장 최근 드롭.
  // 드롭이 하루 한 번이라 24시간 창에는 정확히 한 묶음만 들어온다.
  const t0 = slot.getTime() - LOOKBACK_MS;
  const fresh = [];
  for (const c of ALL) {
    if (!c?.publishAt) continue; // 처음부터 공개된 건 새 드롭이 아니다
    const t = Date.parse(c.publishAt);
    if (Number.isFinite(t) && t > t0 && t <= slot.getTime()) fresh.push(c);
  }

  const info = { topics, offsetMinutes: offsets, count: fresh.length };
  if (!fresh.length) {
    return res.status(200).json({ ok: true, sent: false, reason: "no fresh drops", ...info });
  }

  const titles = fresh.map((c) => c.title).filter(Boolean);
  const shown = titles.slice(0, 3).join(", ");
  const body = shown
    ? `오늘의 새 컨셉 ${fresh.length}종 · ${shown}`
    : `오늘의 새 컨셉 ${fresh.length}종이 올라왔어요`;

  // dry=1 이면 실제로 쏘지 않고 무엇이 나갈지만 확인한다 (수동 점검용)
  if (req.query?.dry) {
    return res.status(200).json({ ok: true, sent: false, dry: true, body, ...info });
  }

  const results = [];
  for (const topic of topics) {
    const r = await sendToTopic(topic, {
      title: "새로운 컨셉이 도착했어요 ✨",
      body,
      data: { kind: "drop", count: fresh.length, firstId: fresh[0]?.id ?? "" },
    });
    results.push({ topic, ok: r.ok, error: r.error });
  }
  const ok = results.every((r) => r.ok);
  return res.status(ok ? 200 : 502).json({ ok, sent: ok, results, body, ...info });
}
