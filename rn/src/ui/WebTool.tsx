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
import { chrome, color, space, themedStyles } from "@/theme/tokens";

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

export function WebTool({ title, tool, query, initialPayload }: {
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
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refresh: refreshQuota } = useQuota();
  const [loading, setLoading] = useState(true);
  const webRef = useRef<WebView>(null);
  // 웹뷰의 localStorage 는 앱과 별개 저장소이고 웹은 navigator.language 로 언어를 정한다.
  // 안 넘기면 **껍데기는 한국어인데 안쪽 편집기·카메라만 기기 언어(영어)** 로 뜬다.
  // 지금 이 앱의 문구(copy.ts)는 한국어 전용이라 웹뷰도 한국어로 고정한다.
  // ⚠️ 앱에 영어 문구를 붙이는 날 여기도 같이 바꿀 것.
  const params = new URLSearchParams({ tool, native: "1", lang: "ko", ...(query ?? {}) });
  const hash = session ? `#access_token=${encodeURIComponent(session.access_token)}&refresh_token=${encodeURIComponent(session.refresh_token)}` : "";
  const uri = `${getEnv().apiBase}/?${params.toString()}${hash}`;

  // nativeBridge.js 가 이미 window.__rimikimiResolve 를 정의해 뒀다 — 여기선 그걸 부르기만 한다.
  const resolve = (id: string | undefined, result: unknown) => {
    if (!id) return; // close 는 id 없이 옴(fire-and-forget) — 응답할 필요 없음
    webRef.current?.injectJavaScript(`window.__rimikimiResolve(${JSON.stringify(id)}, ${JSON.stringify(result)}); true;`);
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
          const payload = JSON.stringify(initialPayload ?? {});
          webRef.current?.injectJavaScript(`window.__rimikimiInit && window.__rimikimiInit(${payload}); true;`);
          break;
        }
        case "saveToAlbum": {
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
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" hitSlop={12} onPress={() => router.back()}>
            <IconClose size={24} color={color.ink} />
          </Pressable>
        </View>
      </View>
      <WebView
        ref={webRef}
        source={{ uri }}
        style={styles.web}
        onLoadEnd={() => setLoading(false)}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={BRIDGE_JS}
        onError={() => Alert.alert("불러오지 못했어요", "네트워크를 확인해 주세요.")}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={["https://*"]}
      />
      {loading ? <View style={styles.loading} pointerEvents="none"><Spinner size={28} color={color.accent} /></View> : null}
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
