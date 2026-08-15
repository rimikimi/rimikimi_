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
import { notifyConceptDrop } from "../_lib/dropNotice.js";

const JOBS = {
  "refresh-apple-secret": refreshAppleSecret,
  "notify-drop": notifyConceptDrop,
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
