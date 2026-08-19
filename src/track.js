// ============================================================
// 퍼널 이벤트 계측 — track(event, props)
//   (viral-loop-and-funnel-standard.md §C)
//
//   - 최소 셋: app_open · signup · generate(engine/concept) · share_done ·
//     invite_sent · purchase(product). 필요하면 다른 이벤트명도 자유롭게 추가 가능.
//   - 개인정보(사진·이름·전화 등)는 props 에 절대 넣지 않는다 — 비식별 메타만.
//   - 실패해도 앱 동작에 영향 0 (fire-and-forget, 오류 무시). 서버 API 를 새로
//     만들지 않고 Supabase anon/authenticated 클라이언트로 직접 insert 한다 —
//     테이블 RLS 가 "본인 것만 insert, select 는 아무도 불가"를 보장한다
//     (supabase/migrations/20260723090000_viral_loop_funnel.sql 참고).
// ============================================================
import { supabase } from "./supabaseClient";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";

const ANON_KEY = "rimikimi_anon_id_v1";
let cachedAnonId = null;
let currentUserId = null;

function getAnonId() {
  if (cachedAnonId) return cachedAnonId;
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(ANON_KEY, id);
    }
    cachedAnonId = id;
  } catch (_) {
    cachedAnonId = "anon";
  }
  return cachedAnonId;
}

// 로그인 상태가 바뀔 때(App 레벨에서 session 변경 시) 호출 — events.user_id 용.
// RLS 가 "authenticated 는 auth.uid() 와 같은 user_id 만" 허용하므로, 여기서 넘긴 값이
// 실제 로그인 사용자와 다르면(스푸핑 시도) insert 자체가 거부된다.
export function setTrackUser(userId) {
  currentUserId = userId || null;
}

// event: "app_open" | "signup" | "generate" | "share_done" | "invite_sent" | "purchase" | ...
// props: 비식별 메타만(예: { engine, concept } / { product }). 개인정보 금지.
// ⚠️ 모든 이벤트에 앱 버전을 붙인다. 이게 없어서 2026-08-19 에 "안드로이드 결제가
//    안 된다"는 신고를 받고도 **사용자가 어떤 빌드를 쓰는지 알 수 없어** 진단이
//    막혔다(계측이 있는 빌드인지조차 구분 못 함). 비식별 메타라 개인정보 아님.
let _appVer = null;
if (Capacitor.isNativePlatform()) {
  CapApp.getInfo()
    .then((i) => { _appVer = `${i?.version || "?"}(${i?.build || "?"})`; })
    .catch(() => {});
}

export function track(event, props = {}) {
  try {
    supabase
      .from("events")
      .insert({
        user_id: currentUserId,
        anon_id: getAnonId(),
        event: String(event).slice(0, 64),
        props: {
          ...(props || {}),
          ...(_appVer ? { v: _appVer } : {}),
          plat: Capacitor.getPlatform(),
        },
      })
      .then(
        () => {},
        () => {} // 실패 무시 — 계측이 앱 동작을 막으면 안 됨
      );
  } catch (_) {
    /* 무시 */
  }
}
