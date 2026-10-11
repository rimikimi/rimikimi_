// 룩 합성 워커 풀 — 기기 코어 수만큼(최대 4) 워커를 띄워 사진을 나눠 처리한다. 워커를 못 쓰면 메인 스레드로 폴백.
import { applyLookWithStrength, applyGeometry } from "./filters";

const SIZE = Math.max(1, Math.min(4, (typeof navigator !== "undefined" && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency - 1 : 2));
let workers = null, seq = 0;
const pending = new Map();

function boot() {
  if (workers !== null) return workers;
  try {
    workers = Array.from({ length: SIZE }, () => {
      const w = new Worker(new URL("./lookWorker.js", import.meta.url), { type: "module" });
      w.busy = 0;
      w.onmessage = (e) => {
        const p = pending.get(e.data.id); if (!p) return;
        pending.delete(e.data.id); w.busy--;
        e.data.error ? p.reject(new Error(e.data.error)) : p.resolve(e.data.buf);
      };
      w.onerror = () => { /* 개별 작업은 reject 로, 풀 자체는 유지 */ };
      return w;
    });
  } catch (_) { workers = []; }
  return workers;
}

/** data(Uint8ClampedArray, 소유권 넘김) 에 정방향·룩을 입혀 새 Uint8ClampedArray 로 돌려준다. */
export async function applyLookAsync({ data, w, h, preset = null, effects = {}, strength = 0.7, geo = null, lens = 0 }) {
  const ws = boot();
  if (!ws.length) {
    if (geo) applyGeometry(data, w, h, { ...geo, lens });
    if (preset) applyLookWithStrength(data, w, h, preset, effects, strength);
    return data;
  }
  const w0 = ws.reduce((a, b) => (b.busy < a.busy ? b : a), ws[0]);
  const id = ++seq;
  w0.busy++;
  const buf = await new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    // preset/effects 는 평범한 객체(구조 복제 가능). faces 는 숫자 배열.
    w0.postMessage({ id, buf: data.buffer, w, h, preset, effects, strength, geo, lens }, [data.buffer]);
  });
  return new Uint8ClampedArray(buf);
}

/** 동시에 돌릴 사진 수 — 12MP 한 장이 메모리 ~150MB 라 2장까지만. */
export const SAVE_CONCURRENCY = 2;
