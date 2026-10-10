import type { GalleryItem } from "./api";
import { thumbUrl } from "./concepts";

// 내 사진 — 2.1(iOS 63895f8)부터 앨범으로 묶지 않는다. 여기엔 DEV 캡처용 가짜 갤러리만 남았다.

/**
 * ⚠️ DEV 전용 — 로그인 없이 앨범 모양을 캡처하려고 넣는 가짜 갤러리(iOS `dev/myphotos?fake=1`).
 * 호출부가 `__DEV__` 일 때만 부른다. 릴리스 번들에서는 호출되지 않는다.
 */
export function devFakeGallery(): GalleryItem[] {
  const ids: [string, number][] = [["454", 3], ["963", 2], ["408", 1], ["313", 4], ["1015", 1], ["311", 2]];
  const now = Date.now();
  const out: GalleryItem[] = [];
  let n = 0;
  for (const [id, count] of ids) {
    for (let i = 0; i < count; i++) {
      out.push({
        id: `fake_${id}_${i}`,
        conceptId: id,
        conceptTitle: null,
        createdAt: new Date(now - (n++) * 600_000).toISOString(),
        url: thumbUrl(id),
      });
    }
  }
  return out;
}
