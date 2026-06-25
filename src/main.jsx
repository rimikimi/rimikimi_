import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import PortraitStudio from "./PortraitStudio.jsx";

// ── 네이티브 API 베이스 패치 ──
// 네이티브(번들 모드)에서 webview origin 은 capacitor://localhost 라
// 상대경로 fetch("/api/...") 가 로컬로 가서 깨진다(=서버 미도달, "오류 200").
// 네이티브일 때 /api/* 호출을 Vercel 절대주소로 자동 치환.
if (Capacitor.isNativePlatform()) {
  const API_BASE = "https://rimikimi-app.vercel.app";
  const _fetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (typeof input === "string" && input.startsWith("/api/")) {
        input = API_BASE + input;
      } else if (input instanceof Request && input.url) {
        const u = input.url;
        // capacitor://localhost/api/... 또는 상대 /api/...
        const m = u.match(/^(?:capacitor:\/\/localhost|https?:\/\/localhost(?::\d+)?)?(\/api\/.*)$/);
        if (m) input = new Request(API_BASE + m[1], input);
      }
    } catch (_) {}
    return _fetch(input, init);
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PortraitStudio />
  </React.StrictMode>
);
