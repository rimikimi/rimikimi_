// 저장용 룩 합성 워커 — 12MP 사진에 필터·정방향을 입히는 픽셀 작업을 메인 스레드 밖에서 돌린다.
// (오너 2026-10-11 "한 번에 저장하는 게 엄청 오래 걸리네" — 10장을 메인 스레드에서 한 장씩 돌리던 것을
//  워커 여러 개로 나눠 동시에 처리한다. filters.js 는 DOM 을 안 써서 그대로 가져온다.)
import { applyLookWithStrength, applyGeometry } from "./filters";

self.onmessage = (e) => {
  const { id, buf, w, h, preset, effects, strength, geo, lens } = e.data;
  const data = new Uint8ClampedArray(buf);
  try {
    if (geo) applyGeometry(data, w, h, { ...geo, lens: lens || 0 });
    if (preset) applyLookWithStrength(data, w, h, preset, effects || {}, strength);
    self.postMessage({ id, buf: data.buffer }, [data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
