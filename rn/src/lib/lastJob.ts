import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================================================================
// 완료 푸시 탭 → 결과 화면 직행 (3주차, SPEC §3).
//
// 서버 푸시 payload 는 `{kind:"genDone", count}` 뿐이라 알림 자체에는 어떤 결과인지
// 정보가 없다(api/_lib/push.js). 대신 이 기기에서 가장 최근에 "완료된" 생성을 여기
// 기억해 뒀다가, 알림을 탭하면 그 결과로 바로 연다 — 서버 payload 확장 없이도 된다.
// (그 job 이 여전히 GenerationProvider 메모리에 있으면 여러 장 다 보이고, 앱이 완전히
// 재시작된 뒤라 메모리가 비었으면 여기 저장한 첫 장 url 로 단일 장 결과를 보여준다.)
// ============================================================================

const KEY = "rimikimi_last_done_job";
const MAX_AGE_MS = 10 * 60 * 1000; // 알림이 늦게 와도 걸리게, 너무 오래된 건 무시

export interface LastDoneJob {
  jobId: string;
  conceptId: string;
  title: string;
  url: string;
  at: number;
}

export async function setLastDoneJob(j: Omit<LastDoneJob, "at">): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...j, at: Date.now() }));
  } catch { /* 무시 — 없으면 그냥 내 사진 탭으로 간다 */ }
}

/** 알림 탭 시점에 읽는다. 오래됐으면(10분+) null — 엉뚱한 결과로 튀는 것 방지. */
export async function peekLastDoneJob(): Promise<LastDoneJob | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as LastDoneJob;
    if (!j?.at || Date.now() - j.at > MAX_AGE_MS) return null;
    if (!j.jobId || !j.url) return null;
    return j;
  } catch {
    return null;
  }
}
