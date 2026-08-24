// iOS UINavigationController 식 화면 전환 (push / pop / 인터랙티브 pop)
//
// 왜 필요했나
//   예전 전환은 "이전 화면이 즉시 사라지고 새 화면만 12px 페이드업" 이었다.
//   이건 웹 페이지 전환이다. iOS 는 **두 화면이 동시에** 움직인다:
//     push — 새 화면이 오른쪽에서 들어오고, 이전 화면은 30% 만 왼쪽으로 밀리며 어두워진다
//     pop  — 현재 화면이 오른쪽으로 빠지며 그 아래 이전 화면이 제자리로 돌아온다
//   이 "두 겹" 이 없으면 아무리 이징을 바꿔도 네이티브처럼 안 보인다.
//
// 어떻게
//   앱은 화면을 하나만 렌더한다(<main> 안에 현재 화면 하나). 그래서 나가는 화면을
//   DOM 스냅샷(cloneNode)으로 떠서 고스트 레이어로 띄운다. iOS 도 인터랙티브 pop 에서
//   스냅샷을 쓴다. 스냅샷은 화면별로 캐시해두기 때문에, 엣지 스와이프를 **시작하는 순간**
//   돌아갈 화면을 뒤에 깔아줄 수 있다(= 손가락을 따라 이전 화면이 따라 들어옴).
//
// ⚠️ 애니메이션은 transform / opacity 만 쓴다. 둘 다 합성(GPU) 속성이라 리페인트가 없다.
// ⚠️ 레이어는 배경을 직접 칠해야 한다. main 은 배경이 투명(그라데이션은 app 에 있음)이라
//    그냥 겹치면 뒤 화면이 비쳐 보인다. app 의 계산된 그라데이션을 같은 크기·오프셋으로
//    복사해서 각 레이어를 불투명하게 만든다.

const EASE_NAV = "cubic-bezier(0.32,0.72,0,1)"; // iOS 내비게이션 곡선
const D_PUSH = 380;
const D_POP = 340;
const PARALLAX = 0.3; // 뒤 화면이 밀려나는 비율 (iOS 와 동일)
const DIM_MAX = 0.16;
const SHADOW = "-12px 0 30px rgba(35,31,32,0.16)";

const snaps = new Map(); // screen -> { node, scrollTop }
let layers = []; // 현재 떠 있는 고스트/딤 엘리먼트
let pending = null; // capture() 가 남긴 "다음 렌더에서 재생할 전환"
let suppressOnce = false; // 제스처가 이미 애니메이션을 끝냈으면 재생 생략
let stampNext = false; // 다음 렌더에서 화면 내부 진입 애니메이션을 꺼야 하는가
let endTimer = null;

// 전환으로 들어온 화면은 내부 진입 애니메이션(.fade/.cardIn)을 재생하지 않는다.
// 화면이 오른쪽에서 들어오는 동시에 내용이 또 떠오르면 두 번 움직여 어지럽다.
//
// ⚠️ 이걸 CSS(부모 속성 → animation:none)로 끄면 안 된다. 전환이 끝나고 속성을 지우는
//    순간 그 애니메이션이 **처음부터 다시 재생**돼서, 자리 잡은 화면이 opacity 0 부터
//    다시 올라온다 = 전환마다 한 번씩 깜빡인다. 실제로 그 버그가 났었다.
//    되돌릴 일이 없도록 해당 엘리먼트에 인라인으로 박는다(다음 화면은 새 엘리먼트라 무관).
function stampNoEnterAnim(mainEl) {
  if (!mainEl) return;
  const els = mainEl.querySelectorAll(".fade, .cardIn");
  for (const el of els) el.style.animation = "none";
}

export function prefersReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function killLayers() {
  for (const l of layers) {
    try {
      l.remove();
    } catch {}
  }
  layers = [];
}

function resetMain(el) {
  if (!el) return;
  try {
    el.getAnimations().forEach((a) => a.cancel());
  } catch {}
  const s = el.style;
  s.transform = "";
  s.opacity = "";
  s.boxShadow = "";
  s.zIndex = "";
  s.position = "";
  s.willChange = "";
  s.pointerEvents = "";
  s.background = "";
  s.backgroundImage = "";
  s.backgroundSize = "";
  s.backgroundPosition = "";
  s.backgroundRepeat = "";
  s.backgroundColor = "";
}

function endTransition(appEl, mainEl) {
  clearTimeout(endTimer);
  endTimer = null;
  killLayers();
  resetMain(mainEl);
}

function boxOf(appEl, mainEl) {
  const ar = appEl.getBoundingClientRect();
  const mr = mainEl.getBoundingClientRect();
  return {
    left: mr.left - ar.left,
    top: mr.top - ar.top,
    width: mr.width,
    height: mr.height,
    appW: ar.width,
    appH: ar.height,
  };
}

// app 의 그라데이션을 이 레이어 위치에 맞춰 그대로 복사 → 레이어가 불투명해진다
function paintBg(el, appEl, b) {
  const cs = getComputedStyle(appEl);
  el.style.backgroundColor = cs.backgroundColor;
  el.style.backgroundImage = cs.backgroundImage;
  el.style.backgroundSize = `${b.appW}px ${b.appH}px`;
  el.style.backgroundPosition = `${-b.left}px ${-b.top}px`;
  el.style.backgroundRepeat = "no-repeat";
}

function mountGhost(appEl, mainEl, snap, z) {
  const b = boxOf(appEl, mainEl);
  const g = document.createElement("div");
  g.setAttribute("aria-hidden", "true");
  g.style.cssText =
    `position:absolute;left:${b.left}px;top:${b.top}px;` +
    `width:${b.width}px;height:${b.height}px;overflow:hidden;` +
    `pointer-events:none;z-index:${z};will-change:transform;`;
  paintBg(g, appEl, b);
  const inner = snap.node.cloneNode(true);
  g.appendChild(inner);
  const dim = document.createElement("div");
  dim.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;background:#231f20;opacity:0;";
  g.appendChild(dim);
  appEl.appendChild(g);
  inner.scrollTop = snap.scrollTop; // overflow:hidden 도 프로그램 스크롤은 먹는다
  layers.push(g);
  return { el: g, dim, width: b.width };
}

function mountDim(appEl, mainEl, z) {
  const b = boxOf(appEl, mainEl);
  const d = document.createElement("div");
  d.setAttribute("aria-hidden", "true");
  d.style.cssText =
    `position:absolute;left:${b.left}px;top:${b.top}px;` +
    `width:${b.width}px;height:${b.height}px;background:#231f20;` +
    `opacity:0;pointer-events:none;z-index:${z};`;
  appEl.appendChild(d);
  layers.push(d);
  return d;
}

function anim(el, from, to, dur, ease) {
  return el.animate([from, to], {
    duration: dur,
    easing: ease || EASE_NAV,
    fill: "both",
  });
}

// ── 화면을 떠나기 직전에 호출 (setScreen 래퍼) ───────────────────────────────
export function capture(appEl, mainEl, fromScreen, dir) {
  if (!mainEl || prefersReduced()) return;
  const node = mainEl.cloneNode(true);
  node.style.cssText +=
    ";position:absolute;left:0;top:0;width:100%;height:100%;flex:none;overflow:hidden;";
  snaps.set(fromScreen, { node, scrollTop: mainEl.scrollTop });
  // 탭바 전환은 가로로 밀지 않는다 — iOS 탭 전환에는 방향이 없다.
  // 스냅샷만 남기고(뒤로가기 제스처가 나중에 쓴다) 화면은 .fade 로 부드럽게 바뀐다.
  if (dir === "tab") {
    pending = null;
    stampNext = false;
    return;
  }
  // 방향이 있는 전환(push/pop/제스처 pop)은 내부 진입 애니메이션을 끈다.
  stampNext = true;
  if (suppressOnce) {
    // 제스처가 이미 끝까지 재생했다 — 화면만 갈아끼우면 된다
    suppressOnce = false;
    pending = null;
    return;
  }
  pending = { dir, from: fromScreen };
}

export function savedScroll(screen) {
  const s = snaps.get(screen);
  return s ? s.scrollTop : 0;
}

export function forget() {
  snaps.clear();
}

// ── 새 화면이 커밋된 직후(useLayoutEffect)에 호출 ───────────────────────────
export function run(appEl, mainEl) {
  const p = pending;
  pending = null;
  if (!appEl || !mainEl) return;
  // 페인트 전에 박아야 한 프레임도 재생되지 않는다 (run 은 useLayoutEffect 에서 호출된다)
  if (stampNext) { stampNoEnterAnim(mainEl); stampNext = false; }
  const snap = p && snaps.get(p.from);
  if (!snap) {
    endTransition(appEl, mainEl);
    return;
  }
  killLayers();
  clearTimeout(endTimer);

  const push = p.dir !== "back";
  const w = mainEl.getBoundingClientRect().width || 1;
  const b = boxOf(appEl, mainEl);

  mainEl.style.position = "relative";
  mainEl.style.zIndex = push ? "2" : "1";
  mainEl.style.willChange = "transform";
  mainEl.style.pointerEvents = "none";
  paintBg(mainEl, appEl, b);

  const dur = push ? D_PUSH : D_POP;
  let lead;

  if (push) {
    const ghost = mountGhost(appEl, mainEl, snap, 1);
    mainEl.style.boxShadow = SHADOW;
    lead = anim(mainEl, { transform: "translateX(100%)" }, { transform: "translateX(0px)" }, dur);
    anim(ghost.el, { transform: "translateX(0px)" }, { transform: `translateX(${-PARALLAX * w}px)` }, dur);
    anim(ghost.dim, { opacity: 0 }, { opacity: DIM_MAX }, dur);
  } else {
    const dim = mountDim(appEl, mainEl, 2);
    const ghost = mountGhost(appEl, mainEl, snap, 3);
    ghost.el.style.boxShadow = SHADOW;
    lead = anim(mainEl, { transform: `translateX(${-PARALLAX * w}px)` }, { transform: "translateX(0px)" }, dur);
    anim(ghost.el, { transform: "translateX(0px)" }, { transform: "translateX(100%)" }, dur);
    anim(dim, { opacity: DIM_MAX }, { opacity: 0 }, dur);
  }

  const done = () => endTransition(appEl, mainEl);
  endTimer = setTimeout(done, dur + 120); // 애니메이션이 죽어도 화면이 잠기지 않게
  lead.finished.then(done).catch(() => {});
}

// ── 왼쪽 엣지 스와이프 = 인터랙티브 pop ─────────────────────────────────────
// 돌아갈 화면의 캐시 스냅샷을 뒤에 깔고, 손가락을 따라 두 겹이 같이 움직인다.
// 스냅샷이 없으면 null 을 돌려주고 호출부가 예전 방식으로 폴백한다.
export function beginPop(appEl, mainEl, targetScreen) {
  if (!appEl || !mainEl || prefersReduced()) return null;
  const snap = snaps.get(targetScreen);
  if (!snap) return null;

  killLayers();
  clearTimeout(endTimer);
  const w = mainEl.getBoundingClientRect().width || 1;
  const b = boxOf(appEl, mainEl);

  const under = mountGhost(appEl, mainEl, snap, 1);
  const dim = mountDim(appEl, mainEl, 2);

  mainEl.style.position = "relative";
  mainEl.style.zIndex = "3";
  mainEl.style.willChange = "transform";
  mainEl.style.boxShadow = SHADOW;
  paintBg(mainEl, appEl, b);

  let px = 0;
  function paint(t) {
    mainEl.style.transform = `translateX(${px}px)`;
    under.el.style.transform = `translateX(${-PARALLAX * w * (1 - t)}px)`;
    dim.style.opacity = String(DIM_MAX * (1 - t));
  }
  paint(0);

  return {
    width: w,
    move(nextPx) {
      px = Math.max(0, Math.min(nextPx, w));
      paint(px / w);
    },
    // commit=true 면 애니메이션을 끝까지 재생한 뒤 onDone() 으로 화면을 실제로 바꾼다.
    // onDone 안의 setScreen 은 이미 애니메이션이 끝났으므로 재생을 건너뛴다(suppressOnce).
    // 정리는 다음 useLayoutEffect(= 페인트 직전)에서 하므로 깜빡임이 없다.
    finish(commit, velocity, onDone) {
      const remain = commit ? w - px : px;
      const v = Math.max(0.25, Math.abs(velocity || 0)); // px/ms
      const dur = Math.round(Math.min(420, Math.max(160, remain / v)));
      const endT = commit ? 1 : 0;
      const target = commit ? w : 0;

      const a1 = anim(mainEl, { transform: `translateX(${px}px)` }, { transform: `translateX(${target}px)` }, dur);
      anim(under.el,
        { transform: `translateX(${-PARALLAX * w * (1 - px / w)}px)` },
        { transform: `translateX(${-PARALLAX * w * (1 - endT)}px)` }, dur);
      anim(dim, { opacity: DIM_MAX * (1 - px / w) }, { opacity: DIM_MAX * (1 - endT) }, dur);

      const after = () => {
        if (commit) {
          suppressOnce = true;
          onDone && onDone(); // 리렌더 → useLayoutEffect 가 레이어를 걷어낸다
        } else {
          endTransition(appEl, mainEl);
        }
      };
      const t = setTimeout(after, dur + 120);
      a1.finished.then(() => { clearTimeout(t); after(); }).catch(() => {});
    },
    cancelNow() {
      endTransition(appEl, mainEl);
    },
  };
}
