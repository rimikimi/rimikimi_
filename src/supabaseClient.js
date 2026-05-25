// ============================================================
// 브라우저용 Supabase 클라이언트 (단일 인스턴스)
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 는 .env.local 에서 읽음
// anon 키는 공개돼도 안전한 키 (브라우저 노출 OK)
// ============================================================

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error(
    "[supabase] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 가 설정되지 않았습니다."
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // 로그인 후 URL 의 #access_token=... 을 자동으로 잡아내서 세션 만들기
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
