// ============================================================
// 로그인 게이트 — 로그인 안 된 사용자에게 보여주는 화면
//   - 로고
//   - 태그라인 "상상이 현실이 되는 곳"
//   - 카카오 / 네이버 / 구글 버튼 3개
// ============================================================

import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function LoginGate({ Logo }) {
  const [busy, setBusy] = useState(null); // 'kakao' | 'naver' | 'google' | null
  const [error, setError] = useState(null);

  // URL 에 ?auth_error=... 가 붙어 있으면 표시
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) {
      setError(decodeURIComponent(err));
      // 깔끔하게 URL 정리
      const url = new URL(window.location.href);
      url.searchParams.delete("auth_error");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  async function signInWithSupabase(provider) {
    setBusy(provider);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + "/" },
      });
      if (error) throw error;
      // 정상이면 브라우저가 OAuth 페이지로 리다이렉트됨 → 여기 안 돌아옴
    } catch (e) {
      setError(e?.message || "로그인 시작에 실패했어요.");
      setBusy(null);
    }
  }

  function signInWithNaver() {
    setBusy("naver");
    setError(null);
    // 우리 백엔드가 처리. redirectTo 로 돌아갈 곳 알려줌.
    const back = window.location.origin + "/";
    window.location.href =
      "/api/auth/naver/start?redirectTo=" + encodeURIComponent(back);
  }

  return (
    <div style={S.wrap}>
      <div style={S.logoBox}>
        {Logo ? <Logo height={70} /> : <span style={S.fallback}>rimikimi</span>}
      </div>

      <p style={S.tagline}>상상이 현실이 되는 곳</p>

      <div style={S.buttons}>
        <button
          style={{ ...S.btnKakao, opacity: busy && busy !== "kakao" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={() => signInWithSupabase("kakao")}
        >
          <KakaoIcon />
          <span>{busy === "kakao" ? "이동 중…" : "카카오로 시작하기"}</span>
        </button>

        <button
          style={{ ...S.btnNaver, opacity: busy && busy !== "naver" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={signInWithNaver}
        >
          <NaverIcon />
          <span>{busy === "naver" ? "이동 중…" : "네이버로 시작하기"}</span>
        </button>

        <button
          style={{ ...S.btnGoogle, opacity: busy && busy !== "google" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={() => signInWithSupabase("google")}
        >
          <GoogleIcon />
          <span>{busy === "google" ? "이동 중…" : "Google로 시작하기"}</span>
        </button>
      </div>

      {error && <p style={S.error}>{error}</p>}

      <p style={S.legal}>
        로그인하면 <u>서비스 이용약관</u>과 <u>개인정보 처리방침</u>에 동의하는
        것으로 간주합니다.
      </p>
    </div>
  );
}

// ---------- 아이콘 (간단한 SVG) ----------

function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3C6.48 3 2 6.58 2 11c0 2.83 1.86 5.31 4.66 6.74-.2.71-.73 2.62-.84 3.03-.13.5.18.49.39.36.16-.1 2.51-1.7 3.52-2.39.74.11 1.5.17 2.27.17 5.52 0 10-3.58 10-8s-4.48-7.91-10-7.91z"
      />
    </svg>
  );
}

function NaverIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

// ---------- 스타일 ----------
const ACCENT = "#e6403c";
const INK = "#231f20";
const BG = "#fffdf9";

const S = {
  wrap: {
    minHeight: "100vh", maxWidth: 440, margin: "0 auto",
    background: BG, color: INK, padding: "60px 24px 40px",
    display: "flex", flexDirection: "column", alignItems: "center",
    fontFamily: "'Quicksand', sans-serif",
  },
  logoBox: { marginTop: 48, marginBottom: 18 },
  fallback: {
    fontFamily: "'Jua', sans-serif", fontSize: 36, color: INK,
  },
  tagline: {
    fontFamily: "'Jua', sans-serif",
    fontSize: 17, color: INK, opacity: 0.7,
    margin: "0 0 56px", letterSpacing: "-0.005em",
  },
  buttons: {
    width: "100%", display: "flex", flexDirection: "column", gap: 12,
  },
  btnBase: {
    width: "100%", border: "none", borderRadius: 14,
    padding: "15px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10,
    transition: "transform 0.06s ease, opacity 0.15s",
  },
  btnKakao: {
    width: "100%", border: "none", borderRadius: 14,
    padding: "15px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10,
    background: "#FEE500", color: "#191919",
  },
  btnNaver: {
    width: "100%", border: "none", borderRadius: 14,
    padding: "15px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10,
    background: "#03C75A", color: "#fff",
  },
  btnGoogle: {
    width: "100%", border: "1.5px solid rgba(35,31,32,0.18)",
    borderRadius: 14, padding: "14px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10,
    background: "#fff", color: INK,
  },
  error: {
    marginTop: 18, fontSize: 12.5, color: ACCENT,
    background: "#fff", border: "1px solid " + ACCENT + "55",
    borderRadius: 12, padding: "10px 14px", lineHeight: 1.5, fontWeight: 600,
  },
  legal: {
    marginTop: 26, fontSize: 11, lineHeight: 1.65, opacity: 0.55,
    textAlign: "center", fontWeight: 500,
  },
};
