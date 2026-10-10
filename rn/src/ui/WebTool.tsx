import React, { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { Spinner } from "./Spinner";
import { IconClose } from "./icons";
import { useAuth } from "@/lib/auth";
import { useQuota } from "@/lib/quota";
import { getEnv } from "@/lib/env";
import { saveDataUrlToAlbum, shareDataUrlOrUrl } from "@/lib/nativeMedia";
import { useSaveAdGate } from "@/lib/saveAdGate";
import { chrome, color, space, themedStyles } from "@/theme/tokens";
import { copy } from "@/lib/copy";
import { isKo } from "@/lib/locale";
import { getFilterAccess, startFilterTrialIfNeeded } from "@/lib/iap";
import { withFilterAccess } from "@/lib/editorPayload";
import { FilterPassSheet } from "./FilterPassSheet";

// 1단계(2.0, SPEC §5): 편집기·카메라는 현재 웹(src/PhotoEditor.jsx · CameraStudio.jsx)을 웹뷰로 임베드.
// 저장·공유·앨범·닫기·크레딧 갱신만 네이티브 브리지(3주차) — postMessage 규약.
//
// ============================================================================
// 브리지 규약은 이미 웹(src/nativeBridge.js, 이 워크트리 밖 — iOS 쪽 작업으로 이미 들어와 있다)
// 쪽에 구현돼 있다: `isRimikimiWebView()` 가 `window.webkit.messageHandlers.rimikimi` 의 존재로
// 네이티브 임베드 여부를 판정하고, `wkCall(type, payload)` 가 거기로 `{id,type,payload}` 객체를
// postMessage 한 뒤 네이티브가 `window.__rimikimiResolve(id, result)` 를 불러주길 기다린다
// (닫기는 id 없이 fire-and-forget). 이건 원래 iOS WKWebView 의 스크립트 메시지 핸들러 이름이라
// Android(react-native-webview) 엔 없다 — **웹 쪽을 고칠 필요 없이**, 여기서 그 이름을
// window.ReactNativeWebView.postMessage(JSON.stringify(...)) 로 연결하는 shim 을 심어서
// 웹이 보기엔 똑같이 `window.webkit.messageHandlers.rimikimi.postMessage(obj)` 가 존재하는
// 것처럼 만든다. `window.__rimikimiResolve` 는 nativeBridge.js 자신이 이미 정의해 두므로
// 여기서 또 만들 필요 없다 — 결과만 그 이름으로 불러주면 된다.
//
// 액션(type): ready({}) → 응답 대신 `window.__rimikimiInit(initialPayload)` 를 불러 초기 데이터를 준다
//             saveToAlbum({dataUrl,filename}) → {ok:true}|{error}
//             share({dataUrl,filename,title,text}) → {ok:true}|{ok:false,reason}
//             close({}, id 없음) → 응답 없음, 네이티브가 화면을 닫는다
//             refreshCredits({}) → {ok:true}
//             filterUsed({}, id 없음) → 3일 무료 시작(이미 시작했으면 무시) → window.__rimikimiFilterAccess(상태)
//             paywall({}, id 없음) → 필터 이용권 결제 시트 → 결과를 window.__rimikimiFilterAccess({unlocked})
//               (산·복원했으면 true, 그냥 닫으면 false — 편집기가 저장을 계속할지 정한다)
// 초기 payload 에는 filtersUnlocked · trialEndsAt 를 늘 얹는다(scratchpad filterpass_spec.md).
// ============================================================================
const BRIDGE_JS = `
(function () {
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.rimikimi) return;
  if (!window.webkit) window.webkit = {};
  if (!window.webkit.messageHandlers) window.webkit.messageHandlers = {};
  window.webkit.messageHandlers.rimikimi = {
    postMessage: function (msg) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (_) {}
    },
  };
  true;
})();
`;

export function WebTool({ title, tool, query, initialPayload, devSimulatePaywall }: {
  title: string;
  tool: "filter" | "camera";
  query?: Record<string, string>;
  /**
   * 웹이 `ready` 를 보내면 그대로 `window.__rimikimiInit(payload)` 로 넘겨 주는 초기 데이터.
   * ios2 WebToolView.swift 의 `initialPayload` 와 같은 규약이다 — 편집기에 사진을 미리 실어
   * 보낼 때(카메라로 찍은 직후 "다듬기") 쓴다: `{ mode: "edit", src: "data:image/jpeg;base64,…" }`.
   * ⚠️ ToolEntry.jsx 는 ready 후 1.5초 안에 응답이 없으면 빈 초기값으로 진행한다 —
   *    여기서 ready 를 받자마자 바로 주입해야 사진이 실려 간다.
   */
  initialPayload?: Record<string, unknown>;
  /** dev 전용 — 웹이 아직 paywall 을 안 보내도 로드 뒤 웹 안에서 {type:"paywall"} 을 대신 보내 본다(캡처용). */
  devSimulatePaywall?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refresh: refreshQuota } = useQuota();
  const adGate = useSaveAdGate();
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const webRef = useRef<WebView>(null);
  // 웹뷰의 localStorage 는 앱과 별개 저장소이고 웹은 navigator.language 로 언어를 정한다.
  // 안 넘기면 껍데기와 안쪽 편집기·카메라의 언어가 어긋날 수 있어서 앱 언어(isKo)를 그대로 넘긴다.
  // (2.0.2 영어 지원 때 여기가 "ko" 고정으로 남아 있었다 — 영어 기기에서 편집기만 한국어로 뜸)
  const params = new URLSearchParams({ tool, native: "1", lang: isKo ? "ko" : "en", ...(query ?? {}) });
  const hash = session ? `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}` : "";
  const uri = `${getEnv().apiBase}/?${params.toString()}${hash}`;

  // nativeBridge.js 가 이미 window.__rimikimiResolve 를 정의해 뒀다 — 여기선 그걸 부르기만 한다.
  const resolve = (id: string | undefined, result: unknown) => {
    if (!id) return; // close 는 id 없이 옴(fire-and-forget) — 응답할 필요 없음
    webRef.current?.injectJavaScript(`window.__rimikimiResolve(${JSON.stringify(id)}, ${JSON.stringify(result)}); true;`);
  };

  /** 필터 이용권 상태를 편집기에 알린다(웹 window.__rimikimiFilterAccess). */
  const sendFilterAccess = (r: { unlocked: boolean; trialEndsAt?: string | null }) => {
    webRef.current?.injectJavaScript(`window.__rimikimiFilterAccess && window.__rimikimiFilterAccess(${JSON.stringify(r)}); true;`);
  };
  const closePaywall = (unlocked: boolean) => {
    setPaywallOpen(false);
    const a = getFilterAccess();
    sendFilterAccess({ unlocked: unlocked || a.unlocked, trialEndsAt: a.trialEndsAt });
    // Play 결제창(별도 액티비티)에서 돌아오면 웹뷰가 터치를 못 받는 일이 있었다(웹 nativeBridge restoreWebViewTouch) — 한 번 깨운다.
    webRef.current?.injectJavaScript(`try{window.dispatchEvent(new Event("resize"));document.body&&void document.body.offsetHeight;}catch(_){}; true;`);
  };

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { id?: string; type: string; payload?: Record<string, unknown> } | null = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!msg?.type) return;
    const { id, type, payload } = msg;
    (async () => {
      switch (type) {
        case "ready": {
          // 응답(__rimikimiResolve)이 아니라 __rimikimiInit 으로 준다 — ToolEntry.jsx 규약.
          const payload = JSON.stringify(withFilterAccess(initialPayload));
          webRef.current?.injectJavaScript(`window.__rimikimiInit && window.__rimikimiInit(${payload}); true;`);
          break;
        }
        case "saveToAlbum": {
          await adGate(); // 무료 사용자는 광고를 본 뒤 저장
          const r = await saveDataUrlToAlbum(String(payload?.dataUrl ?? ""), String(payload?.filename ?? "rimikimi"));
          resolve(id, r);
          break;
        }
        case "share": {
          const src = String(payload?.dataUrl ?? "");
          const r = src ? await shareDataUrlOrUrl(src, String(payload?.filename ?? "rimikimi.png")) : { ok: false, reason: "no src" };
          resolve(id, r);
          break;
        }
        case "close": {
          resolve(id, { ok: true });
          router.back();
          break;
        }
        case "refreshCredits": {
          refreshQuota();
          resolve(id, { ok: true });
          break;
        }
        case "filterUsed": {
          const a = await startFilterTrialIfNeeded();
          sendFilterAccess({ unlocked: a.unlocked, trialEndsAt: a.trialEndsAt });
          resolve(id, { ok: true });
          break;
        }
        case "paywall": {
          // 스위치가 꺼져 있거나 이미 열려 있으면 시트 없이 바로 계속
          const a = getFilterAccess();
          if (a.unlocked) { sendFilterAccess({ unlocked: true, trialEndsAt: a.trialEndsAt }); resolve(id, { ok: true, unlocked: true }); break; }
          setPaywallOpen(true);
          resolve(id, { ok: true });
          break;
        }
        default:
          resolve(id, { ok: false, error: "unknown type" });
      }
    })();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <View style={styles.side} />
        <Text size="headline">{title}</Text>
        <View style={[styles.side, { alignItems: "flex-end" }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={copy.common.close} hitSlop={12} onPress={() => router.back()}>
            <IconClose size={24} color={color.ink} />
          </Pressable>
        </View>
      </View>
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.web}
        onLoadEnd={() => {
          setLoading(false);
          if (__DEV__ && devSimulatePaywall) {
            setTimeout(() => webRef.current?.injectJavaScript(`(function(){
              if (!window.__rimikimiFilterAccess) window.__rimikimiFilterAccess = function (r) { console.log("[dev] filterAccess", JSON.stringify(r)); };
              window.webkit.messageHandlers.rimikimi.postMessage({ type: "paywall" });
            })(); true;`), 1500);
          }
        }}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onError={() => Alert.alert(copy.ui.loadFailTitle, copy.ui.checkNetwork)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={["https://*"]}
      />
      {loading ? <View style={styles.loading} pointerEvents="none"><Spinner size={28} color={color.accent} /></View> : null}
      <FilterPassSheet open={paywallOpen} onClose={() => closePaywall(false)} onUnlocked={() => closePaywall(true)} />
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  bar: { height: chrome.headerH, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.screen, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  side: { width: 40 },
  web: { flex: 1, backgroundColor: color.bg },
  loading: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
}));
