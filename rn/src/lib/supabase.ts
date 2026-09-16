import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";
import { getEnv } from "./env";

// ============================================================================
// Supabase client. 세션은 expo-secure-store 에 보관한다(SPEC: session persisted).
//
// Justin 셸에서 가져온 두 가지 방어:
//   1. native 에서 navigator.locks 가 로그인을 영원히 멈추게 하므로 pass-through lock
//   2. onAuthStateChange 콜백 안에서 절대 await 하지 않는다 (auth.tsx)
// detectSessionInUrl 은 false — 딥링크 콜백은 auth.tsx 가 직접 처리한다(?code 와
// #access_token 둘 다).
//
// SecureStore 는 값 하나가 2048B 를 넘으면 경고를 낸다(Android 는 저장은 된다). Supabase
// 세션 JSON 은 보통 1.5~3KB 라 청크로 나눠 담는다.
// ============================================================================

const CHUNK = 1800;

const chunkedStore = {
  async getItem(key: string): Promise<string | null> {
    const head = await SecureStore.getItemAsync(key);
    if (head == null) return null;
    if (!head.startsWith("__chunks:")) return head;
    const n = Number(head.slice(9));
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${key}.${i}`);
      if (p == null) return null;
      parts.push(p);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await SecureStore.setItemAsync(key, `__chunks:${n}`);
  },
  async removeItem(key: string): Promise<void> {
    const head = await SecureStore.getItemAsync(key);
    if (head?.startsWith("__chunks:")) {
      const n = Number(head.slice(9));
      for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};

// 웹 `/dev` 프리뷰 전용: expo-secure-store 는 웹에서 `getValueWithKeyAsync is not a function` 로
// 부팅 자체를 막는다(SecureStore 는 네이티브 키체인/키스토어 전용, 웹 구현이 없다). Android 는
// 여전히 위 chunkedStore(SecureStore) 를 쓴다 — 이 분기는 웹에서만 갈린다.
const webStore = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client) return client;
  const env = getEnv();
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: Platform.OS === "web" ? webStore : chunkedStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: async (_name, _acquireTimeout, fn) => fn(),
    },
  });
  return client;
}

let appStateBound = false;

/** Refresh tokens while the app is in the foreground; stop when backgrounded. */
export function bindAppStateRefresh() {
  if (appStateBound) return;
  appStateBound = true;
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase().auth.startAutoRefresh();
    else supabase().auth.stopAutoRefresh();
  });
}
