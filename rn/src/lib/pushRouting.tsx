import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { notifications } from "./push";
import { peekLastDoneJob } from "./lastJob";
import { useGeneration } from "./generation";
import { useAuth } from "./auth";
import { fetchGallery } from "./api";

// ============================================================================
// 완료 푸시 탭 → 결과 화면 라우팅 (4주차, SPEC §3).
//
// 3주차엔 서버 payload 에 어떤 결과인지 정보가 없어 이 기기의 로컬 TTL(lastJob.ts, 10분)
// 로만 우회했다. 서버가 이제 `api/generate.js` 의 push data 에 `galleryId` 를 실어 보낸다
// (기존 kind/count 필드는 그대로, 추가만 — 구버전 클라는 무시한다). 있으면 그걸로 정확한
// 결과를 연다. 없으면(구버전 서버·페이스 앵커 등 galleryId 없는 알림) 기존 로컬 TTL 폴백.
//
// 우선순위:
//   1) 이 기기 메모리(GenerationProvider)에 같은 galleryId 이미지를 가진 job 이 있으면
//      그 job 전체(여러 장 배치)로 연다 — 앱이 안 죽었던 가장 흔한 경우.
//   2) 메모리에 없으면(앱이 재시작됐거나 job 이 이미 지워짐) 서버 갤러리에서 그 항목을
//      직접 찾아 그 한 장으로 연다.
//   3) galleryId 자체가 없거나 위 둘 다 실패하면 로컬 TTL(peekLastDoneJob) 폴백 → 그마저
//      없으면 내 사진 탭.
// ============================================================================

export function usePushResultRouting(): void {
  const { jobs } = useGeneration();
  const { session } = useAuth();
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const tokenRef = useRef<string | undefined>(undefined);
  tokenRef.current = session?.access_token;

  useEffect(() => {
    const N = notifications();
    if (!N) return;
    let lastHandled: string | null = null;

    const openFallback = async () => {
      const j = await peekLastDoneJob();
      if (j) {
        router.navigate({ pathname: "/result/[jobId]", params: { jobId: j.jobId, url: j.url, conceptId: j.conceptId, title: j.title } });
      } else {
        router.navigate("/(tabs)/photos");
      }
    };

    const openByGalleryId = async (galleryId: string): Promise<boolean> => {
      const mem = jobsRef.current.find((j) => j.images.some((im) => im.galleryId === galleryId));
      if (mem) {
        router.navigate({ pathname: "/result/[jobId]", params: { jobId: mem.id } });
        return true;
      }
      const token = tokenRef.current;
      if (!token) return false;
      try {
        const items = await fetchGallery(token);
        const it = items.find((x) => String(x.id) === galleryId);
        if (it?.url) {
          router.navigate({
            pathname: "/result/[jobId]",
            params: {
              jobId: galleryId,
              url: it.url,
              conceptId: it.conceptId != null ? String(it.conceptId) : undefined,
              title: it.conceptTitle ?? undefined,
            },
          });
          return true;
        }
      } catch { /* 폴백으로 내려간다 */ }
      return false;
    };

    const go = (r: { notification: { request: { identifier: string; content: { data?: unknown } } } } | null) => {
      if (!r) return;
      const id = r.notification.request.identifier;
      if (id && id === lastHandled) return;
      lastHandled = id;
      const data = (r.notification.request.content.data ?? {}) as Record<string, unknown>;
      const galleryId = typeof data.galleryId === "string" && data.galleryId ? data.galleryId : null;
      setTimeout(() => {
        void (async () => {
          if (galleryId && (await openByGalleryId(galleryId))) return;
          await openFallback();
        })();
      }, 350);
    };

    const sub = N.addNotificationResponseReceivedListener(go);
    N.getLastNotificationResponseAsync().then(go).catch(() => undefined);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
