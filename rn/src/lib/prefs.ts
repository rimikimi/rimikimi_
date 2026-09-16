import AsyncStorage from "@react-native-async-storage/async-storage";

// 기기 안 플래그 키 — 라우트 파일에서 상수를 export 하지 않기 위해 여기 둔다.
export const GUIDE_SEEN_KEY = "rimikimi_guide_seen_v2";
/** 첫 생성 완료 → 홈 상단 초대 카드 1회 (SPEC §3 결과: "첫 생성 완료 직후 1회 초대 카드") */
export const INVITE_CARD_DUE_KEY = "rimikimi_invite_card_due";
export const INVITE_CARD_DONE_KEY = "rimikimi_invite_card_done";
/** 첫 생성 완료 여부 — 초대 카드 조건 */
export const FIRST_GEN_DONE_KEY = "rimikimi_first_gen_done";
/** 알림 토글(사용자 의사). OS 권한과 별개 — 둘 다 켜져야 등록한다. */
export const NOTIFY_ON_KEY = "rimikimi_notify_on";

export async function getFlag(key: string): Promise<boolean> {
  try { return (await AsyncStorage.getItem(key)) === "1"; } catch { return false; }
}
export async function setFlag(key: string, on: boolean): Promise<void> {
  try { if (on) await AsyncStorage.setItem(key, "1"); else await AsyncStorage.removeItem(key); } catch { /* 무시 */ }
}
