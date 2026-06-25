// ============================================================
// 로그인 게이트 — 로그인 안 된 사용자에게 보여주는 화면
//   - 로고
//   - 태그라인 "상상이 현실이 되는 곳"
//   - Apple / 카카오 / 네이버 / 구글 버튼 4개
//   (Apple 은 App Store 정책상 다른 소셜 로그인이 있을 때 필수)
// ============================================================

import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import {
  detectInApp,
  tryEscapeKakaoAndroid,
  inAppEscapeInstructions,
} from "./inAppBrowser";
import { t, useLang } from "./i18n";
import { isNative } from "./nativeBridge";

// 네이티브 앱 OAuth 복귀용 딥링크 (iOS/Android URL scheme + Supabase Redirect URL 에 등록)
const NATIVE_REDIRECT = "com.rimikimi.app://login-callback";

export default function LoginGate({ Logo }) {
  useLang(); // 언어 바뀌면 리렌더
  const [busy, setBusy] = useState(null); // 'apple' | 'kakao' | 'naver' | 'google' | 'email' | null
  const [error, setError] = useState(null);
  const [inAppNotice, setInAppNotice] = useState(null); // { title, steps }

  // 이메일 로그인/가입 (App Store 심사 데모 계정 + 이메일 가입 사용자용)
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailMode, setEmailMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState(null); // 성공 안내 (확인 메일 등)

  // URL 에 로그인 에러가 붙어 있으면 표시
  //  - 우리 백엔드(네이버): ?auth_error=...
  //  - Supabase OAuth(구글/카카오/애플): ?error=...&error_description=... 또는 #error=...
  React.useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authErr = search.get("auth_error");
    const oErr = search.get("error") || hash.get("error");
    const oDesc =
      search.get("error_description") || hash.get("error_description") || "";
    const oCode = search.get("error_code") || hash.get("error_code") || "";

    if (authErr || oErr) {
      const blob = `${authErr || ""} ${oErr || ""} ${oCode} ${decodeURIComponent(
        oDesc
      )}`.toLowerCase();
      // 사용자가 직접 취소한 경우는 조용히 넘어감
      const cancelled =
        /access_denied|cancel|consent_required|user_denied/.test(blob) &&
        !/exist|already|registered|duplicate/.test(blob);
      if (!cancelled) {
        // 같은 이메일이 다른 provider 로 이미 가입된 충돌 → 친절 안내
        const collision =
          /exist|already|registered|duplicate|server_error|database error|saving new user/.test(
            blob
          );
        if (collision) {
          setError(
            "이 이메일은 이미 다른 방법(구글·카카오·네이버·애플 중 하나)으로 가입돼 있어요.\n처음 가입할 때 쓴 방법으로 로그인해 주세요 🙂"
          );
        } else if (authErr) {
          setError(decodeURIComponent(authErr));
        } else {
          setError(
            decodeURIComponent(oDesc) || "로그인에 실패했어요. 다시 시도해 주세요."
          );
        }
      }
      // URL 정리 (쿼리 + 해시 둘 다)
      const url = new URL(window.location.href);
      ["auth_error", "error", "error_description", "error_code", "provider"].forEach(
        (k) => url.searchParams.delete(k)
      );
      url.hash = "";
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  // 로그인 시도 후 인앱 브라우저를 닫거나(취소) 앱으로 복귀하면
  // "이동 중…" 로딩 상태가 멈춰있던 문제 → 복귀 시 busy 해제
  React.useEffect(() => {
    if (!isNative()) {
      // 웹: 탭 복귀(뒤로가기) 시 멈춘 로딩 해제
      const onVis = () => {
        if (document.visibilityState === "visible") setBusy(null);
      };
      document.addEventListener("visibilitychange", onVis);
      return () => document.removeEventListener("visibilitychange", onVis);
    }
    // 네이티브: 인앱 브라우저가 닫히거나(취소/완료) 앱이 다시 활성화되면 해제
    let cleanup = () => {};
    (async () => {
      try {
        const { Browser } = await import("@capacitor/browser");
        const { App } = await import("@capacitor/app");
        const h1 = await Browser.addListener("browserFinished", () => setBusy(null));
        const h2 = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) setBusy(null);
        });
        cleanup = () => { h1.remove(); h2.remove(); };
      } catch (_) {}
    })();
    return () => cleanup();
  }, []);

  async function signInWithSupabase(provider) {
    // 네이티브 앱: 시스템 브라우저로 OAuth (웹뷰 안에선 구글/애플이 차단됨).
    // skipBrowserRedirect 로 URL 만 받아 시스템 브라우저로 열고, 딥링크로 복귀.
    if (isNative()) {
      setBusy(provider);
      setError(null);
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
        });
        if (error) throw error;
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      } catch (e) {
        setError(e?.message || "로그인 시작에 실패했어요.");
        setBusy(null);
      }
      return;
    }

    // Google + Apple 은 인앱브라우저에서 차단됨 (403 disallowed_useragent).
    // 카톡 안드는 외부 브라우저로 자동 점프 시도, 안 되면 안내문 표시.
    const inApp = detectInApp();
    if (inApp && (provider === "google" || provider === "apple")) {
      if (tryEscapeKakaoAndroid(window.location.href)) {
        // 시스템 브라우저로 점프 트리거됨 — 잠시 후 페이지 떠남
        setBusy(provider);
        return;
      }
      // iOS 카톡 또는 기타 인앱 — 안내문 보여줌
      const info = inAppEscapeInstructions(inApp);
      if (info) {
        setInAppNotice(info);
        return;
      }
    }

    setBusy(provider);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + "/" },
      });
      if (error) throw error;
    } catch (e) {
      setError(e?.message || "로그인 시작에 실패했어요.");
      setBusy(null);
    }
  }

  function signInWithNaver() {
    setBusy("naver");
    setError(null);
    // 네이티브: 시스템 브라우저로 네이버 시작 → 딥링크로 복귀
    if (isNative()) {
      const startUrl =
        "https://rimikimi-app.vercel.app/api/auth/naver/start?redirectTo=" +
        encodeURIComponent(NATIVE_REDIRECT);
      import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: startUrl }))
        .catch(() => {
          setError("로그인 시작에 실패했어요.");
          setBusy(null);
        });
      return;
    }
    // 웹: 우리 백엔드가 처리. redirectTo 로 돌아갈 곳 알려줌.
    const back = window.location.origin + "/";
    window.location.href =
      "/api/auth/naver/start?redirectTo=" + encodeURIComponent(back);
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!em || !password) {
      setError(t("login.email.needFields"));
      return;
    }
    if (password.length < 6) {
      setError(t("login.email.shortPw"));
      return;
    }
    setBusy("email");
    try {
      if (emailMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: em,
          password,
          options: { emailRedirectTo: window.location.origin + "/" },
        });
        if (error) throw error;
        // 이메일 확인이 켜져 있으면 세션이 바로 안 생김 → 안내 표시
        setNotice(t("login.email.checkInbox"));
        setBusy(null);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: em,
          password,
        });
        if (error) throw error;
        // 성공 시 onAuthStateChange 가 상위에서 화면 전환 처리
      }
    } catch (err) {
      setError(err?.message || "로그인에 실패했어요.");
      setBusy(null);
    }
  }

  return (
    <div style={S.wrap}>
      <div style={S.logoBox}>
        {Logo ? <Logo height={70} /> : <span style={S.fallback}>rimikimi</span>}
      </div>

      <p style={S.tagline}>{t("login.tagline")}</p>

      <div style={S.buttons}>
        <button
          style={{ ...S.btnApple, opacity: busy && busy !== "apple" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={() => signInWithSupabase("apple")}
        >
          <AppleIcon />
          <span>{busy === "apple" ? t("login.loading") : t("login.with.apple")}</span>
        </button>

        <button
          style={{ ...S.btnKakao, opacity: busy && busy !== "kakao" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={() => signInWithSupabase("kakao")}
        >
          <KakaoIcon />
          <span>{busy === "kakao" ? t("login.loading") : t("login.with.kakao")}</span>
        </button>

        <button
          style={{ ...S.btnNaver, opacity: busy && busy !== "naver" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={signInWithNaver}
        >
          <NaverIcon />
          <span>{busy === "naver" ? t("login.loading") : t("login.with.naver")}</span>
        </button>

        <button
          style={{ ...S.btnGoogle, opacity: busy && busy !== "google" ? 0.5 : 1 }}
          disabled={!!busy}
          onClick={() => signInWithSupabase("google")}
        >
          <GoogleIcon />
          <span>{busy === "google" ? t("login.loading") : t("login.with.google")}</span>
        </button>
      </div>

      {/* 이메일 로그인 / 가입 (접이식) */}
      {!emailOpen ? (
        <button
          style={S.emailToggle}
          disabled={!!busy}
          onClick={() => { setEmailOpen(true); setError(null); setNotice(null); }}
        >
          {t("login.email.toggle")}
        </button>
      ) : (
        <form style={S.emailForm} onSubmit={handleEmailSubmit}>
          <div style={S.divider}>
            <span style={S.dividerLine} />
            <span style={S.dividerText}>{t("login.or")}</span>
            <span style={S.dividerLine} />
          </div>
          <input
            style={S.input}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("login.email.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            style={S.input}
            type="password"
            autoComplete={emailMode === "signup" ? "new-password" : "current-password"}
            placeholder={t("login.email.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button style={S.emailSubmit} type="submit" disabled={!!busy}>
            {busy === "email"
              ? t("login.loading")
              : emailMode === "signup"
                ? t("login.email.signUp")
                : t("login.email.signIn")}
          </button>
          <button
            style={S.emailSwitch}
            type="button"
            disabled={!!busy}
            onClick={() => {
              setEmailMode(emailMode === "signup" ? "signin" : "signup");
              setError(null);
              setNotice(null);
            }}
          >
            {emailMode === "signup"
              ? t("login.email.toSignIn")
              : t("login.email.toSignUp")}
          </button>
        </form>
      )}

      {notice && <p style={S.successNotice}>{notice}</p>}

      {inAppNotice && (
        <div style={S.notice}>
          <div style={S.noticeTitle}>⚠️ {inAppNotice.title}</div>
          <ol style={S.noticeSteps}>
            {inAppNotice.steps.map((s, i) => (
              <li key={i} style={S.noticeStep}>{s}</li>
            ))}
          </ol>
          <button
            style={S.noticeCopyBtn}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.origin + "/");
                setInAppNotice({
                  ...inAppNotice,
                  title: t("invite.copied"),
                });
              } catch (_) {}
            }}
          >
            {t("login.inapp.copy")}
          </button>
          <button
            style={S.noticeClose}
            onClick={() => setInAppNotice(null)}
          >
            {t("common.close")}
          </button>
        </div>
      )}

      {error && <p style={S.error}>{error}</p>}

      <p style={S.legal}>{t("login.terms")}</p>
    </div>
  );
}

// ---------- 아이콘 (간단한 SVG) ----------

function AppleIcon() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09M12 7.25C11.85 5 13.69 3.12 15.79 3c.29 2.58-2.34 4.5-3.79 4.25"
      />
    </svg>
  );
}

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
    height: "100dvh", maxWidth: 440, margin: "0 auto",
    boxSizing: "border-box",
    background: BG, color: INK,
    // 노치/홈바 안전영역 반영 (기종 자동 대응)
    padding: "calc(env(safe-area-inset-top, 0px) + 48px) 24px calc(env(safe-area-inset-bottom, 0px) + 40px)",
    display: "flex", flexDirection: "column", alignItems: "center",
    fontFamily: "'Quicksand', sans-serif",
    // 내용(이메일 폼 펼침 등)이 길어지면 화면 안에서만 스크롤, 문서 바운스 없음
    overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain",
    WebkitOverflowScrolling: "touch",
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
  btnApple: {
    width: "100%", border: "none", borderRadius: 14,
    padding: "15px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", display: "flex", alignItems: "center",
    justifyContent: "center", gap: 10,
    background: "#000", color: "#fff",
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
    whiteSpace: "pre-line",
  },
  notice: {
    marginTop: 20, padding: "16px 18px",
    background: "#fef9c3", color: "#713f12",
    border: "1.5px solid #facc15", borderRadius: 14,
    fontFamily: "'Quicksand', sans-serif",
  },
  noticeTitle: {
    fontSize: 13.5, fontWeight: 700, lineHeight: 1.45, marginBottom: 8,
  },
  noticeSteps: {
    margin: "0 0 12px", padding: "0 0 0 22px",
    fontSize: 12.5, lineHeight: 1.7, fontWeight: 500,
  },
  noticeStep: { marginBottom: 2 },
  noticeCopyBtn: {
    width: "100%", background: "#713f12", color: "#fff",
    border: "none", borderRadius: 10, padding: "11px 14px",
    fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 8,
    fontFamily: "'Quicksand', sans-serif",
  },
  noticeClose: {
    width: "100%", background: "transparent", color: "#713f12",
    border: "none", padding: "8px", fontSize: 12, fontWeight: 600,
    cursor: "pointer", fontFamily: "'Quicksand', sans-serif",
    opacity: 0.7,
  },
  legal: {
    marginTop: 26, fontSize: 11, lineHeight: 1.65, opacity: 0.55,
    textAlign: "center", fontWeight: 500,
  },
  emailToggle: {
    marginTop: 18, background: "transparent", border: "none",
    color: INK, opacity: 0.6, fontSize: 13, fontWeight: 600,
    cursor: "pointer", textDecoration: "underline",
    fontFamily: "'Quicksand', sans-serif",
  },
  emailForm: {
    width: "100%", display: "flex", flexDirection: "column", gap: 10,
    marginTop: 18,
  },
  divider: {
    display: "flex", alignItems: "center", gap: 12, margin: "2px 0 8px",
  },
  dividerLine: {
    flex: 1, height: 1, background: "rgba(35,31,32,0.14)",
  },
  dividerText: {
    fontSize: 12, opacity: 0.5, fontWeight: 600,
  },
  input: {
    width: "100%", boxSizing: "border-box",
    border: "1.5px solid rgba(35,31,32,0.18)", borderRadius: 12,
    padding: "13px 15px", fontSize: 15,
    fontFamily: "'Quicksand', sans-serif", background: "#fff", color: INK,
    outline: "none",
  },
  emailSubmit: {
    width: "100%", border: "none", borderRadius: 14,
    padding: "15px 18px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    background: ACCENT, color: "#fff", marginTop: 2,
  },
  emailSwitch: {
    background: "transparent", border: "none", color: INK, opacity: 0.6,
    fontSize: 12.5, fontWeight: 600, cursor: "pointer", padding: "6px",
    fontFamily: "'Quicksand', sans-serif",
  },
  successNotice: {
    marginTop: 16, fontSize: 12.5, color: "#166534",
    background: "#f0fdf4", border: "1px solid #86efac",
    borderRadius: 12, padding: "11px 14px", lineHeight: 1.5, fontWeight: 600,
  },
};
