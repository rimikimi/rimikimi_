// ============================================================
// rimikimi Service Worker — 가벼운 PWA 캐싱
//
// 정책 요약:
//   1. /api/* → 절대 캐시 X (항상 최신)
//   2. concepts.json → stale-while-revalidate (먼저 캐시 보여주고 백그라운드 갱신)
//   3. /thumbs/*.webp → cache-first (한번 받으면 영구 캐싱, 용량 절약)
//   4. JS/CSS/HTML 등 정적 자원 → 네트워크 우선, 실패 시 캐시
//
// 새 버전 배포 시: 아래 VERSION 만 올리면 됨.
// ============================================================

const VERSION = "v160";
const STATIC_CACHE = `rimikimi-static-${VERSION}`;
const THUMB_CACHE = `rimikimi-thumbs-${VERSION}`;
const DATA_CACHE = `rimikimi-data-${VERSION}`;

// 설치: 핵심 정적 파일을 미리 받아두기 (오프라인 첫 페이지 진입 가능)
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 옛 버전 캐시 정리 + (업그레이드일 때만) 열린 탭 새로고침
// ⚠️ 2026-09-29: 예전엔 **첫 설치 때도** 모든 창을 새로고침했다 — 처음 방문하거나 배포 직후 편집기를
//    처음 열면 사진을 넣자마자 페이지가 리셋돼 "사진 선택" 화면으로 튕겼다(라이브에서 재현).
//    · 첫 설치(예전 rimikimi 캐시가 없음)면 새로고침할 이유가 없다 — 이미 새 코드로 떠 있다.
//    · 편집기·카메라(?tool=, 앱 웹뷰 포함)는 사진·편집 상태가 메모리에만 있어 새로고침하면 날아간다.
//      JS/HTML 은 네트워크 우선이라 그 창도 이미 새 코드다 → 건드리지 않는다.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const old = keys.filter((k) => !k.endsWith(`-${VERSION}`));
      const isUpgrade = old.some((k) => k.startsWith("rimikimi-"));
      await Promise.all(old.map((k) => caches.delete(k)));
      await self.clients.claim();
      if (!isUpgrade) return;
      // 나머지 열린 탭은 새로고침 (옛 썸네일 표시 방지)
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        let isTool = false;
        try { isTool = new URL(c.url).searchParams.has("tool"); } catch (_) {}
        if (isTool) continue;
        c.navigate(c.url);
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 1) API 는 우회 (캐시 X)
  if (url.pathname.startsWith("/api/")) return;

  // 외부 도메인은 캐싱 안 함 (Supabase, Google 등)
  if (url.origin !== self.location.origin) return;

  // 2) concepts.json — SWR (stale-while-revalidate)
  if (url.pathname === "/concepts.json") {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }

  // 3) 썸네일 — stale-while-revalidate
  //    (cache-first 였는데 깨진 썸네일이 영구 캐싱되는 문제로 SWR 로 변경)
  if (url.pathname.startsWith("/thumbs/")) {
    event.respondWith(staleWhileRevalidate(req, THUMB_CACHE));
    return;
  }

  // 4) 그 외 정적 자원 — 네트워크 우선, 실패 시 캐시
  event.respondWith(networkFirst(req, STATIC_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return new Response("Offline", { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return hit || (await fetchPromise) || new Response("Offline", { status: 503 });
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req);
    return hit || new Response("Offline", { status: 503 });
  }
}
