import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { bindAppStateRefresh, supabase } from "./supabase";
import { NATIVE_REDIRECT, getEnv } from "./env";
import { loginIap, logoutIap } from "./iap";
import { clearRegisteredPhoto } from "./photo";
import { deleteProfile } from "./faceProfile";

WebBrowser.maybeCompleteAuthSession();

// ============================================================================
// Auth — Supabase OAuth(apple/kakao/naver/google) via expo-web-browser auth session,
// deep link com.rimikimi.app://login-callback (SPEC §3).
//
//   · 로그인 시점은 '만들기' · 필터 사진 고르기 직전 · 카메라 열기 직전 뿐이다. 화면 어디에도
//     "로그인하세요" 게이트가 없다 → `requireLogin(reason, action)` 하나로 통한다.
//   · 로그인 뒤 하던 동작 자동 재개: 메모리의 pending action 을 세션이 생기면 실행한다.
//     OAuth 왕복 중 프로세스가 죽는 경우를 위해 복귀 경로(route)만 AsyncStorage 에 남긴다
//     (1.x `rimikimi_pending_continue` 와 같은 뜻).
//   · onAuthStateChange 콜백 안에서는 절대 await 하지 않는다(Justin B1).
//   · 콜백 URL 은 `?code`(PKCE, apple/kakao/google) 와 `#access_token`(네이버 = 서버 magic
//     link) 둘 다 처리한다(Justin B2).
// ============================================================================

export type Provider = "apple" | "kakao" | "naver" | "google";
export type LoginReason = "make" | "filter" | "camera";

const PENDING_ROUTE_KEY = "rimikimi_pending_continue";
const PENDING_ROUTE_MAX_AGE = 30 * 60 * 1000;

interface Pending { reason: LoginReason; action: () => void | Promise<void>; route?: string }

interface AuthValue {
  session: Session | null;
  loading: boolean;
  /** 로그인 시트 상태(루트 레이아웃이 그린다) */
  sheetOpen: boolean;
  sheetReason: LoginReason | null;
  busy: Provider | null;
  error: string | null;
  closeSheet: () => void;
  signIn: (p: Provider) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * 로그인돼 있으면 즉시 action. 아니면 시트를 띄우고 로그인 성공 시 action 을 이어서 실행.
   * `route` 는 프로세스가 죽었다 살아났을 때 돌아갈 화면(expo-router href).
   */
  requireLogin: (reason: LoginReason, action: () => void | Promise<void>, route?: string) => void;
  /** 부팅 시 살아남은 복귀 경로 — index.tsx 가 한 번 읽고 지운다 */
  takePendingRoute: () => Promise<string | null>;
}

const Ctx = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

/** 콜백 URL 에서 세션을 세운다 — ?code 또는 #access_token. 성공하면 true. */
async function consumeCallbackUrl(raw: string): Promise<boolean> {
  const url = new URL(raw);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const errDesc = url.searchParams.get("error_description") ?? hash.get("error_description");
  if (errDesc) throw new Error(decodeURIComponent(errDesc));
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await supabase().auth.exchangeCodeForSession(code);
    if (error) throw error;
    return true;
  }
  const at = hash.get("access_token");
  const rt = hash.get("refresh_token");
  if (at && rt) {
    const { error } = await supabase().auth.setSession({ access_token: at, refresh_token: rt });
    if (error) throw error;
    return true;
  }
  return false;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetReason, setSheetReason] = useState<LoginReason | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<Pending | null>(null);

  useEffect(() => {
    bindAppStateRefresh();
    supabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase().auth.onAuthStateChange((_event, next) => {
      // ⛔ NO await here. State only.
      setSession(next);
      setLoading(false);
    });
    // 시스템 브라우저가 openAuthSessionAsync 를 거치지 않고 딥링크로 바로 돌아온 경우(네이버 등)
    const linkSub = Linking.addEventListener("url", ({ url }) => {
      if (url.startsWith(NATIVE_REDIRECT)) {
        setTimeout(() => { void consumeCallbackUrl(url).catch(() => undefined); }, 0);
      }
    });
    return () => { sub.subscription.unsubscribe(); linkSub.remove(); };
  }, []);

  // 세션이 생기면 하던 동작을 이어서 한다. RevenueCat 앱 유저 ID 도 여기서 맞춘다(1.x loginIap).
  useEffect(() => {
    if (!session?.user?.id) return;
    const uid = session.user.id;
    setTimeout(() => { void loginIap(uid); }, 0);
    const p = pending.current;
    pending.current = null;
    setSheetOpen(false);
    setSheetReason(null);
    void AsyncStorage.removeItem(PENDING_ROUTE_KEY).catch(() => undefined);
    if (p) setTimeout(() => { void p.action(); }, 0);
  }, [session?.user?.id]);

  const requireLogin = useCallback<AuthValue["requireLogin"]>((reason, action, route) => {
    if (session?.user?.id) { void action(); return; }
    pending.current = { reason, action, route };
    if (route) {
      void AsyncStorage.setItem(PENDING_ROUTE_KEY, JSON.stringify({ route, savedAt: Date.now() })).catch(() => undefined);
    }
    setError(null);
    setSheetReason(reason);
    setSheetOpen(true);
  }, [session?.user?.id]);

  const closeSheet = useCallback(() => {
    pending.current = null;
    setSheetOpen(false);
    setSheetReason(null);
    void AsyncStorage.removeItem(PENDING_ROUTE_KEY).catch(() => undefined);
  }, []);

  const signIn = useCallback(async (provider: Provider) => {
    setBusy(provider);
    setError(null);
    try {
      let startUrl: string;
      if (provider === "naver") {
        // 네이버는 우리 백엔드가 처리한다 → magic link → 딥링크(#access_token)
        startUrl = `${getEnv().apiBase}/api/auth/naver/start?redirectTo=${encodeURIComponent(NATIVE_REDIRECT)}`;
      } else {
        const { data, error: e } = await supabase().auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: NATIVE_REDIRECT,
            skipBrowserRedirect: true,
            ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
          },
        });
        if (e || !data?.url) throw e ?? new Error("no_auth_url");
        startUrl = data.url;
      }
      const result = await WebBrowser.openAuthSessionAsync(startUrl, NATIVE_REDIRECT);
      if (result.type !== "success") return; // 취소 — 에러 아님
      const ok = await consumeCallbackUrl(result.url);
      if (!ok) setError("로그인 응답을 이해하지 못했어요.");
    } catch (err) {
      const msg = (err as Error)?.message ?? "";
      if (/exist|already|registered|duplicate|database error|saving new user/i.test(msg)) {
        setError("이 이메일은 이미 다른 방법(구글·카카오·네이버·애플 중 하나)으로 가입돼 있어요.\n처음 가입할 때 쓴 방법으로 로그인해 주세요 🙂");
      } else if (!/access_denied|cancel/i.test(msg)) {
        setError(msg || "로그인에 실패했어요. 다시 시도해 주세요.");
      }
    } finally {
      setBusy(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await logoutIap();
    await supabase().auth.signOut();
    // ⚠️ 로그아웃하면 기기에 남은 **이 사람의 얼굴 데이터**도 지운다 (2026-09-23 스윕 확정).
    //    예전엔 세션만 지워서, 다음 계정이 로그인하면 앞사람의 등록 사진·얼굴 스캔 3장이
    //    그대로 생성 요청에 실려 나갔다(앞사람 얼굴로 이미지가 만들어졌다). iOS 는 dfe153b.
    //    진행/완성 카드·마커는 GenerationProvider 가 사용자 변경을 보고 비운다.
    try { await clearRegisteredPhoto(); } catch { /* ignore */ }
    try { await deleteProfile(); } catch { /* ignore */ }
    setSession(null);
  }, []);

  const takePendingRoute = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(PENDING_ROUTE_KEY);
      if (!raw) return null;
      await AsyncStorage.removeItem(PENDING_ROUTE_KEY);
      const p = JSON.parse(raw) as { route?: string; savedAt?: number };
      if (!p?.route || !p.savedAt || Date.now() - p.savedAt > PENDING_ROUTE_MAX_AGE) return null;
      return p.route;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, loading, sheetOpen, sheetReason, busy, error, closeSheet, signIn, signOut, requireLogin, takePendingRoute }),
    [session, loading, sheetOpen, sheetReason, busy, error, closeSheet, signIn, signOut, requireLogin, takePendingRoute]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
