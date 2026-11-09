// ============================================================================
// 홈 '비 오는 창문' 시뮬레이션 — iOS `UI/Ambient/RainWorld.swift` 를 그대로 옮겼다(상수·확률 동일, 2026-11-09).
//
// - 좌표는 홈 화면 기준 pt. 앨범 카드 = '액자'(ledge), 카드 자리는 홈이 스크롤에 맞춰 알려 준다(report).
// - 비: 빗줄기 50% 액자 뒤 · 30% 액자 윗면에 맞음(튀고 고임) · 20% 액자 앞(앞면에서 작게 튐). 뇌우면 번개.
// - 눈: 눈송이(뒤·윗면·앞), 윗면에 소복이 쌓이고 많이 기울면 덩어리로 미끄러져 떨어진다, 앞면에 내려앉아 녹는다.
// - iOS 에 있지만 실제로 안 쓰이는 것(앞면 방울 faceDrops·hangs·drips — iOS 에서 생성 코드가 꺼져 있다)은 옮기지 않았다.
//   액자 앞면 빗물은 셰이더(stage D)가 따로 그린다.
// ============================================================================

export type Plane = "back" | "hit" | "front";
export interface Rect { x: number; y: number; w: number; h: number }
export interface Streak { x: number; y: number; len: number; speed: number; near: boolean; alpha: number; lastHitY: number; macro: boolean; plane: Plane; stopY: number }
export interface Splash { x: number; y: number; vx: number; vy: number; life: number; size: number }
export interface Ring { x: number; y: number; age: number }
export interface Flake { x: number; y: number; r: number; phase: number; speed: number; plane: Plane; bokeh: boolean; kind: number }
export interface Clump { x: number; y: number; vx: number; vy: number; r: number }
export interface Melt { id: string; rx: number; ry: number; r: number; age: number }
export interface Ledge { frame: Rect; level: number[]; vel: number[]; seen: number }
export interface Bolt { pts: { x: number; y: number }[]; width: number }

export const COLS = 24;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const rint = (a: number, b: number) => Math.floor(rnd(a, b + 1)); // a…b 포함
const contains = (f: Rect, x: number, y: number) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;

export class RainWorld {
  mode: "rain" | "snow" = "rain";
  streaks: Streak[] = [];
  splashes: Splash[] = [];
  rings: Ring[] = [];
  flakes: Flake[] = [];
  snowClumps: Clump[] = [];
  melts: Melt[] = [];
  ledges = new Map<string, Ledge>();
  bolts: Bolt[] = [];
  flash = 0;
  wind = 0;
  /** 빗줄기 방향(단위 벡터) — 그리기에서도 쓴다. */
  rainDir = { dx: 0, dy: 1 };
  /** dev — 번개 간격 고정(초). null 이면 18~40초. */
  devBoltEvery: number | null = null;
  /** 카드 모서리 둥글기(pt) — 물·눈은 모서리 안쪽 평평한 구간에만 얹힌다. */
  radius = 14;

  private screen = { w: 0, h: 0 };
  private last = 0;
  private spawnClock = 0;
  private heavy = false;
  private nextBolt = 0;
  private boltPulses: number[] = [];

  // 튜닝(pt) — iOS 와 같다
  private readonly maxWater = 6;
  private readonly maxSnow = 15;
  private readonly spillTilt = 0.28;
  private readonly snowSlideTilt = 0.55;

  /** 카드가 화면에 있을 때 자리를 알려 온다(홈 좌표). */
  report(id: string, frame: Rect, now: number) {
    const l = this.ledges.get(id);
    if (l) { l.frame = frame; l.seen = now; return; }
    // 처음 보일 때부터 조금 고여(쌓여) 있게 — 빈 상태로 시작하면 밋밋하다
    const level = Array.from({ length: COLS }, () => (this.mode === "rain" ? rnd(0.3, 1.2) : 5 + rnd(0, 2.5)));
    this.ledges.set(id, { frame, level, vel: new Array(COLS).fill(0), seen: now });
  }
  level(id: string): number[] { return this.ledges.get(id)?.level ?? []; }

  private makeBolt() {
    const { w, h } = this.screen;
    const path = (a: { x: number; y: number }, b: { x: number; y: number }, rough: number, depth: number) => {
      let pts = [a, b];
      let disp = rough;
      for (let d = 0; d < depth; d++) {
        const next = [pts[0]];
        for (let k = 1; k < pts.length; k++) {
          const p0 = pts[k - 1], p1 = pts[k];
          next.push({ x: (p0.x + p1.x) / 2 + rnd(-disp, disp), y: (p0.y + p1.y) / 2 + rnd(-disp * 0.3, disp * 0.3) });
          next.push(p1);
        }
        pts = next; disp *= 0.55;
      }
      return pts;
    };
    const out: Bolt[] = [];
    const x0 = rnd(w * 0.15, w * 0.85);
    const end = { x: x0 + rnd(-w * 0.3, w * 0.3), y: h * rnd(0.55, 0.9) };
    const main = path({ x: x0, y: -20 }, end, 90, 7);
    out.push({ pts: main, width: 2.4 });
    for (let n = rint(3, 6); n > 0; n--) {
      const k = Math.floor(rnd(main.length / 6, (main.length * 4) / 5));
      const a = main[k];
      const br = path(a, { x: a.x + rnd(-160, 160), y: a.y + rnd(60, 220) }, 40, 5);
      out.push({ pts: br, width: 1.1 });
      if (Math.random() < 0.5) {
        const a2 = br[Math.floor(br.length / 2)];
        out.push({ pts: path(a2, { x: a2.x + rnd(-80, 80), y: a2.y + rnd(30, 110) }, 18, 4), width: 0.6 });
      }
    }
    this.bolts = out;
  }

  /** 한 프레임. now = ms. */
  step(now: number, w: number, h: number, g: { dx: number; dy: number }, mode: "rain" | "snow", heavy: boolean) {
    // 번개 — 18~40초마다, 0.07~0.13초 간격으로 한두 번 번쩍(자주 치면 버그 같다 — 오너)
    if (heavy) {
      if (now >= this.nextBolt) {
        const k = rint(1, 2);
        this.boltPulses = Array.from({ length: k }, (_, i) => now + i * rnd(70, 130));
        if (this.screen.w > 0) this.makeBolt();
        this.nextBolt = now + 1000 * (this.devBoltEvery ?? rnd(18, 40));
      }
      this.flash = Math.max(0, ...this.boltPulses.map((p) => { const t = (now - p) / 1000; return t < 0 ? 0 : Math.exp(-t * 11); }));
    } else this.flash = 0;
    this.heavy = heavy;
    if (mode !== this.mode) {
      this.mode = mode;
      this.streaks = []; this.splashes = []; this.rings = []; this.flakes = []; this.snowClumps = []; this.melts = [];
      this.ledges.clear();
    }
    this.screen = { w, h };
    const dt = Math.min((now - this.last) / 1000, 1 / 20);
    this.last = now;
    if (!(dt > 0) || w <= 0) return;
    // 화면에서 사라진 카드는 잊는다(스크롤로 나갔다 다시 오면 다시 쌓인다)
    for (const [id, l] of this.ledges) if (now - l.seen >= 1500) this.ledges.delete(id);
    if (!this.flakes.length && mode === "snow") for (let i = 0; i < 26; i++) this.flakes.push(this.newFlake(true));
    if (mode === "rain") this.stepRain(dt, g); else this.stepSnow(dt, g);
  }

  // ── 비 ───────────────────────────────────────────────────────────
  private stepRain(dt: number, g: { dx: number; dy: number }) {
    const { w: W, h: H } = this.screen;
    // 하늘에서 내리는 비는 폰 기울기와 상관없이 위→아래(+바람만). 기울기를 따르는 건 액자 위 물뿐.
    const gx = this.wind * 0.45 + 0.08, gy = 1;
    const L = Math.hypot(gx, gy);
    this.rainDir = { dx: gx / L, dy: gy / L };
    const d = this.rainDir;
    // 1) 새 빗줄기 — 먼 층(가늘고 느림)·가까운 층(굵고 길고 빠름)
    this.spawnClock += dt * (this.heavy ? 260 : 150);
    while (this.spawnClock >= 1) {
      this.spawnClock -= 1;
      if (this.streaks.length >= (this.heavy ? 200 : 120)) continue;
      const roll = Math.random();
      const near = roll < 0.35;
      const macro = roll > 0.985; // 아주 가까운(초점 나간) 굵고 흐린 빗줄기 — 깊이감
      let x = rnd(0, W), y = rnd(-120, -10);
      // 비스듬하면 바람 불어오는 쪽 옆면에서도 들어온다
      const sideShare = Math.min(0.6, (Math.abs(d.dx) / Math.max(0.3, d.dy)) * H / (W + H));
      if (Math.random() < sideShare) { x = d.dx > 0 ? -10 : W + 10; y = rnd(-20, H); }
      const pr = Math.random();
      const s: Streak = {
        x, y,
        len: near ? rnd(55, 95) : rnd(28, 50),
        speed: near ? rnd(1700, 2100) : rnd(1150, 1450),
        near: near || macro, alpha: rnd(0.75, 1.15), lastHitY: -9999, macro,
        plane: macro ? "front" : pr < 0.5 ? "back" : pr < 0.8 ? "hit" : "front",
        stopY: -1,
      };
      if (macro) { s.len = rnd(130, 190); s.speed = 2400; }
      this.streaks.push(s);
    }
    // 2) 이동 · 액자 충돌 · 화면 밖 제거
    for (const s of this.streaks) {
      s.x += d.dx * s.speed * dt;
      s.y += d.dy * s.speed * dt;
      // 액자 앞으로 지나가는 비 일부 — 앞면 어딘가에서 멈추고 작게 튄다
      if (s.plane === "front" && !s.macro) {
        for (const l of this.ledges.values()) {
          if (!contains(l.frame, s.x, s.y)) continue;
          if (s.stopY < 0) s.stopY = rnd(Math.max(s.y, l.frame.y + 6), Math.max(s.y + 1, l.frame.y + l.frame.h - 6));
          if (s.y >= s.stopY) {
            if (this.rings.length < 60) this.rings.push({ x: s.x, y: s.y, age: 0.06 });
            if (this.splashes.length < 160) {
              for (let n = rint(1, 2); n > 0; n--) this.splashes.push({ x: s.x, y: s.y, vx: rnd(-30, 30), vy: rnd(-45, -15), life: rnd(0.10, 0.18), size: 0 });
            }
            s.y = H + 999;
          }
          break;
        }
      }
      // 액자 윗면에 맞는 30% — 처음 만나는 윗면에서 멈추고 튀고 고인다
      if (s.plane === "hit") {
        for (const [id, l] of this.ledges) {
          const f = l.frame;
          if (!(s.x > f.x && s.x < f.x + f.w && s.y > f.y && s.y < f.y + s.speed * dt + 2 && Math.abs(s.lastHitY - f.y) > 1)) continue;
          s.lastHitY = f.y;
          this.pour(id, s.x, s.near ? 0.22 : 0.12);
          // 왕관 물보라 — 사방으로 비스듬히 튀는 작은 물방울 + 납작한 물결
          if (this.rings.length < 40) this.rings.push({ x: s.x, y: f.y - Math.max(0, ...l.level) * 0.5, age: 0 });
          if (this.splashes.length < 160) {
            const k = rint(2, 4);
            for (let j = 0; j < k; j++) {
              const ang = Math.PI * (0.15 + (0.7 * (j + rnd(0, 0.8))) / k);
              const sp = rnd(45, 95);
              this.splashes.push({ x: s.x, y: f.y - 1, vx: Math.cos(ang) * sp, vy: -Math.sin(ang) * sp, life: rnd(0.14, 0.26), size: 0 });
            }
          }
          s.y = H + 999;
          break;
        }
      }
    }
    this.streaks = this.streaks.filter((s) => !(s.y - s.len > H || s.x < -150 || s.x > W + 150));
    // 3) 튀는 물방울 — 중력으로 낙하
    for (const p of this.splashes) {
      p.vy += 900 * dt;
      p.vx += this.wind * 120 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.life -= dt;
    }
    this.splashes = this.splashes.filter((p) => p.life > 0 && p.y <= H);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age <= 0.22);
    // 4) 액자 윗면 물 — 출렁이며 낮은 쪽으로, 넘치거나 기울면 모서리로 쪼르르
    for (const id of this.ledges.keys()) this.stepLedgeWater(id, dt, g);
  }

  private col(x: number, f: Rect) {
    const r = this.radius, w = Math.max(1, f.w - r * 2);
    return Math.min(COLS - 1, Math.max(0, Math.floor(((x - f.x - r) / w) * COLS)));
  }

  private pour(id: string, x: number, volume: number) {
    const l = this.ledges.get(id);
    if (!l) return;
    const c = this.col(x, l.frame);
    for (const [o, w] of [[-1, 0.25], [0, 0.5], [1, 0.25]] as const) {
      const k = Math.min(COLS - 1, Math.max(0, c + o));
      l.level[k] = Math.min(this.maxWater * 1.4, l.level[k] + volume * w);
    }
    // 떨어진 자리 수면이 꺼졌다가 잔물결로 번진다
    if (this.mode === "rain") l.vel[c] -= (6 * volume) / 0.16;
  }

  private stepLedgeWater(id: string, dt: number, g: { dx: number; dy: number }) {
    const l = this.ledges.get(id);
    if (!l) return;
    const n = COLS;
    const mean = l.level.reduce((a, b) => a + b, 0) / n;
    const slope = Math.max(-1.8, Math.min(1.8, g.dx / Math.max(0.25, g.dy))); // 수면 기울기
    for (let i = 0; i < n; i++) {
      const x = ((i + 0.5) / n - 0.5) * l.frame.w;
      const target = Math.max(0, mean + slope * x * 0.18);
      l.vel[i] += ((target - l.level[i]) * 55 - l.vel[i] * 8) * dt;
    }
    for (let i = 0; i < n; i++) l.level[i] = Math.max(0, l.level[i] + l.vel[i] * dt);
    const nm = l.level.reduce((a, b) => a + b, 0) / n;
    if (nm > 0.001) for (let i = 0; i < n; i++) l.level[i] *= mean / nm;
    // 쏟아짐 — 낮은 쪽 끝이 넘치거나 많이 기울면
    const left = g.dx < 0, e = left ? 0 : n - 1;
    let spill = 0;
    if (l.level[e] > this.maxWater) spill += (l.level[e] - this.maxWater) * 0.7;
    if (Math.abs(g.dx) > this.spillTilt) spill += l.level[e] * (Math.abs(g.dx) - this.spillTilt) * dt * 6;
    if (spill > 0.01) {
      const take = Math.min(spill, l.level[e] * 0.9);
      l.level[e] -= take;
      // 넘친 물은 낮은 쪽 윗모서리에서 방울로 떨어진다
      if (this.splashes.length < 120 && Math.random() < Math.min(1, take * 2)) {
        const x = left ? l.frame.x + 1.5 : l.frame.x + l.frame.w - 1.5;
        this.splashes.push({ x, y: l.frame.y + this.radius * 0.5, vx: (left ? -1 : 1) * rnd(4, 14), vy: rnd(5, 30), life: 1.4, size: rnd(1.6, 3.2) });
      }
    }
    for (let i = 0; i < n; i++) l.level[i] = Math.max(0, l.level[i] - dt * 0.05); // 아주 천천히 마른다
  }

  // ── 눈 ───────────────────────────────────────────────────────────
  private newFlake(anywhere: boolean): Flake {
    const { w, h } = this.screen;
    const pr = Math.random();
    const bokeh = pr > 0.94; // 아주 가까운(초점 나간) 큰 눈송이
    const plane: Plane = bokeh ? "front" : pr < 0.5 ? "back" : pr < 0.8 ? "hit" : "front";
    const far = plane === "back";
    return {
      x: rnd(0, w), y: anywhere ? rnd(-20, h) : -10,
      r: bokeh ? rnd(7, 11) : far ? rnd(1.3, 2.4) : rnd(2.2, 3.8),
      phase: rnd(0, 6.28),
      speed: bokeh ? rnd(70, 95) : far ? rnd(22, 38) : rnd(36, 58),
      plane, bokeh, kind: rint(0, 3),
    };
  }

  private stepSnow(dt: number, g: { dx: number; dy: number }) {
    const { w: W, h: H } = this.screen;
    const R = this.radius;
    this.spawnClock += dt * 16;
    while (this.spawnClock >= 1) {
      this.spawnClock -= 1;
      if (this.flakes.length >= 110) continue;
      const f = this.newFlake(false);
      if (this.wind > 0.2 && Math.random() < 0.5) { f.x = -8; f.y = rnd(0, H * 0.6); } // 바람 부는 쪽 옆에서도
      if (this.wind < -0.2 && Math.random() < 0.5) { f.x = W + 8; f.y = rnd(0, H * 0.6); }
      this.flakes.push(f);
    }
    const gLen = Math.max(0.2, Math.hypot(g.dx, g.dy));
    for (const f of this.flakes) {
      f.phase += dt * 1.6;
      f.x += ((g.dx / gLen) * f.speed * 0.6 + Math.sin(f.phase) * 9 * (1 + Math.abs(this.wind)) + this.wind * 90) * dt;
      f.y += Math.max(0.3, g.dy / gLen) * f.speed * dt;
      // 앞으로 지나가는 눈송이 일부는 액자 앞면에 내려앉아 녹는다
      if (f.plane === "front" && !f.bokeh && this.melts.length < 40 && Math.random() < dt * 0.25) {
        for (const [id, l] of this.ledges) {
          if (contains(l.frame, f.x, f.y)) { this.melts.push({ id, rx: f.x - l.frame.x, ry: f.y - l.frame.y, r: f.r, age: 0 }); f.y = H + 50; break; }
        }
      }
      // 액자 윗면에 내려앉음 — 윗면에 맞는 눈(30%)만
      if (f.plane === "hit") {
        for (const l of this.ledges.values()) {
          const fr = l.frame;
          if (!(f.x > fr.x + R && f.x < fr.x + fr.w - R && f.y > fr.y - 2 && f.y < fr.y + 8)) continue;
          const c = this.col(f.x, fr);
          for (const [o, w] of [[-1, 0.35], [0, 0.6], [1, 0.35]] as const) {
            const k = Math.min(COLS - 1, Math.max(0, c + o));
            l.level[k] = Math.min(this.maxSnow, l.level[k] + f.r * 0.35 * w * (1 - (l.level[k] / this.maxSnow) * 0.7));
          }
          f.y = H + 50;
          break;
        }
      }
    }
    this.flakes = this.flakes.filter((f) => !(f.y > H + 20 || f.x < -20 || f.x > W + 20));
    for (const c of this.snowClumps) { c.vy += 700 * dt; c.vx += this.wind * 60 * dt; c.x += c.vx * dt; c.y += c.vy * dt; }
    this.snowClumps = this.snowClumps.filter((c) => c.y <= H + 10);
    for (const m of this.melts) m.age += dt;
    this.melts = this.melts.filter((m) => m.age <= 7 && this.ledges.has(m.id));
    // 쌓인 눈 — 안식각대로 무너지고, 많이 기울면 낮은 쪽으로 미끄러져 떨어진다
    for (const l of this.ledges.values()) {
      const n = COLS;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n - 1; i++) {
          const dd = l.level[i] - l.level[i + 1];
          if (Math.abs(dd) > 1.2) { const m = (Math.abs(dd) - 1.2) * 0.5 * (dd > 0 ? 1 : -1); l.level[i] -= m; l.level[i + 1] += m; }
        }
      }
      const tilt = Math.abs(g.dx);
      if (tilt > this.snowSlideTilt) {
        const rate = (tilt - this.snowSlideTilt) * dt * 1.5, dir = g.dx > 0 ? 1 : -1;
        const order = dir > 0 ? Array.from({ length: n }, (_, i) => n - 1 - i) : Array.from({ length: n }, (_, i) => i);
        for (const i of order) {
          const m = l.level[i] * rate;
          l.level[i] -= m;
          const j = i + dir;
          if (j >= 0 && j < n) l.level[j] += m;
          else if (m > 0.02 && this.snowClumps.length < 40 && Math.random() < m * 6) {
            // 끝에서 넘친 눈은 덩어리로 떨어진다
            const x = dir > 0 ? l.frame.x + l.frame.w - R * 0.4 : l.frame.x + R * 0.4;
            this.snowClumps.push({ x, y: l.frame.y, vx: dir * rnd(10, 30), vy: 0, r: rnd(1.6, 3.4) });
          }
        }
      }
    }
  }
}

/** 화면 하나에 하나 — 홈 배경·카드 윗면이 같은 상태를 본다. */
export const rainWorld = new RainWorld();
