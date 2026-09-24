// ============================================================
// Vercel Cron 진입점 — 작업 하나당 파일 하나로 두지 않고 여기서 분기한다.
//
// 왜 [job] 하나로 합쳤나:
//   서버리스 함수 개수가 배포 상한(12개)에 딱 차 있다. 크론을 하나 더
//   추가하려고 파일을 새로 만들면 빌드는 성공하고 "Deploying outputs"
//   단계에서 조용히 실패한다(실제로 4번 겪음). 동적 라우트 1개로 묶으면
//   작업을 몇 개 늘려도 함수는 계속 1개다.
//
// 등록: vercel.json 의 crons 에 /api/cron/<job> 경로로 넣는다.
//   Vercel 이 Authorization: Bearer <CRON_SECRET> 을 붙여서 호출한다.
// ============================================================

import { refreshAppleSecret } from "../_lib/appleSecret.js";
import { notifyConceptDrop, dropTopicFor } from "../_lib/dropNotice.js";
import { sendToTopic } from "../_lib/push.js";

// 일회성 공지 푸시. 크론 스케줄에 등록하지 않고 **수동으로만** 호출한다
// (CRON_SECRET 이 있어야 하므로 아무나 못 쏜다).
//   /api/cron/announce?title=...&body=...[&dry=1]
// 대상은 드롭 알림과 같은 토픽(한국 = drop_p540) — 앱이 이미 구독해 둔 유일한 토픽이다.
// ⚠️ 알림을 켠 사람에게만 간다. 전체 가입자 수와 도달 수는 다르다.
async function announce(req, res) {
  const title = String(req.query?.title || "").slice(0, 120);
  const body = String(req.query?.body || "").slice(0, 300);
  if (!title || !body) {
    return res.status(400).json({ error: "title 과 body 가 필요합니다." });
  }
  const topic = dropTopicFor(540); // KST
  if (req.query?.dry) {
    return res.status(200).json({ ok: true, sent: false, dry: true, topic, title, body });
  }
  const r = await sendToTopic(topic, { title, body, data: { kind: "announce" } });
  // 영어 사용자 토픽(<topic>_en): title_en·body_en 을 줬을 때만 보낸다(한국어 공지를 영어 사용자에게 보내지 않게).
  const titleEn = String(req.query?.title_en || "").slice(0, 120);
  const bodyEn = String(req.query?.body_en || "").slice(0, 300);
  if (titleEn && bodyEn) await sendToTopic(`${topic}_en`, { title: titleEn, body: bodyEn, data: { kind: "announce" } });
  return res.status(r?.ok ? 200 : 502).json({
    ok: !!r?.ok, sent: !!r?.ok, topic, title, body,
    error: r?.ok ? undefined : String(r?.error || "").slice(0, 200),
  });
}

const JOBS = {
  "refresh-apple-secret": refreshAppleSecret,
  "notify-drop": notifyConceptDrop,
  "announce": announce,
};

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const job = String(req.query?.job || "");
  const run = JOBS[job];
  if (!run) return res.status(404).json({ error: "unknown job", job });

  return run(req, res);
}
