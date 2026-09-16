import Constants from "expo-constants";

// Boot-time env. FAIL LOUDLY — 설정이 비어 있는 빌드는 빈 화면이 아니라 안내 화면을 띄운다.
// 값은 app.config.ts `extra` (또는 EXPO_PUBLIC_*) 에서 온다.

function extra(key: string): string | undefined {
  const v = (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export class MissingEnvError extends Error {
  constructor(readonly names: string[]) {
    super(`[env] missing: ${names.join(", ")}`);
  }
}

export interface AppEnv {
  apiBase: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

let cached: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cached) return cached;
  const apiBase = process.env.EXPO_PUBLIC_API_BASE ?? extra("apiBase");
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra("supabaseUrl");
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra("supabaseAnonKey");

  const missing: string[] = [];
  if (!apiBase) missing.push("EXPO_PUBLIC_API_BASE");
  if (!supabaseUrl) missing.push("EXPO_PUBLIC_SUPABASE_URL");
  if (!supabaseAnonKey) missing.push("EXPO_PUBLIC_SUPABASE_ANON_KEY");
  if (missing.length) throw new MissingEnvError(missing);

  cached = { apiBase: apiBase!.replace(/\/+$/, ""), supabaseUrl: supabaseUrl!, supabaseAnonKey: supabaseAnonKey! };
  return cached;
}

export function envProblem(): string | null {
  try {
    getEnv();
    return null;
  } catch (err) {
    return err instanceof MissingEnvError ? err.message : "환경 설정을 읽지 못했어요.";
  }
}

/** 네이티브 OAuth 복귀 딥링크 — Supabase Redirect URL 에 등록된 값 그대로(SPEC §3). */
export const NATIVE_REDIRECT = "com.rimikimi.app://login-callback";
