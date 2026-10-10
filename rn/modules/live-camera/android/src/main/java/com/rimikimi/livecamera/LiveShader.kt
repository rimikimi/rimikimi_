package com.rimikimi.livecamera

/**
 * 웹 `src/filters.js` 의 applyLook(색 패스 + 그레인·비네트·빛샘)을 GLSL ES 1.00 으로 옮긴 것.
 * 카메라 미리보기 전용 — 목표는 "편집기에서 처음 열렸을 때 보이는 그림과 같게"(iOS LiveFilter.swift 와 같은 목표).
 *
 *  · 값은 0..255 척도로 계산한다(JS 와 같은 상수를 그대로 쓰기 위해).
 *  · 채널 LUT(온도·틴트·노출·톤커브)는 JS `buildLuts` 가 만든 256칸 표를 텍스처로 받는다.
 *  · 특수(재미) 프리셋: 듀오톤·서모는 정확히, 글리치·VHS·모자이크·스케치는 같은 수식을 픽셀 대신
 *    샘플링으로 근사한다(스케치의 박스 블러 = 9점 평균).
 *  · "색감" = 프리셋 결과와 원본을 uIntensity 로 섞는다(편집기 강도 k = strength/0.7 와 같은 뜻).
 *    효과(그레인·비네트·빛샘)는 그 위에 항상 원래 세기로 얹는다.
 *  · ES 1.00 + GL_OES_EGL_image_external — 에뮬레이터(SwiftShader)도 지원하는 쪽으로 골랐다.
 */
object LiveShader {
  const val VERT = """
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}
"""

  const val FRAG = """
#extension GL_OES_EGL_image_external : require
precision highp float;
varying vec2 vUv;
uniform samplerExternalOES uTex;
uniform sampler2D uLut;
uniform mat4 uTexMat;
uniform vec2 uFill;
uniform float uRot;
uniform float uMirror;
uniform vec2 uImg;
uniform float uPreset;
uniform float uSpecial;
uniform float uBwOn;
uniform vec3 uBw;
uniform float uSat;
uniform float uVib;
uniform vec3 uSh;
uniform vec3 uHi;
uniform float uHslN;
uniform vec4 uHslA[4];
uniform vec4 uHslB[4];
uniform vec3 uC1;
uniform vec3 uC2;
uniform float uGrain;
uniform float uVig;
uniform float uLeak;
uniform float uIntensity;
// 인플(special 7) — BeautyPass 가 만든 작업 격자 텍스처(세운 화면 uv 그대로)
uniform float uBeauty;
uniform sampler2D uMaskT;
uniform sampler2D uBaseT;
uniform sampler2D uGlowT;
uniform vec2 uTexel;     // 세운 버퍼 한 픽셀(up 단위)
uniform float uDetail;   // 고주파 분리 σ(버퍼 px)

vec2 toBuf(vec2 up) {
  vec2 u = clamp(up, 0.0, 1.0);
  if (uMirror > 0.5) u.x = 1.0 - u.x;
  vec2 b;
  if (uRot < 45.0) b = u;
  else if (uRot < 135.0) b = vec2(u.y, 1.0 - u.x);
  else if (uRot < 225.0) b = vec2(1.0 - u.x, 1.0 - u.y);
  else b = vec2(1.0 - u.y, u.x);
  vec4 t = uTexMat * vec4(b.x, 1.0 - b.y, 0.0, 1.0);
  return t.xy;
}
vec3 src(vec2 up) { return texture2D(uTex, toBuf(up)).rgb * 255.0; }
vec3 srcPx(vec2 p) { return src(p / uImg); }
float luma(vec3 c) { return c.r * 0.299 + c.g * 0.587 + c.b * 0.114; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 rgb2hsl(vec3 c) {
  vec3 n = c / 255.0;
  float mx = max(n.r, max(n.g, n.b));
  float mn = min(n.r, min(n.g, n.b));
  float l = (mx + mn) * 0.5;
  if (mx == mn) return vec3(0.0, 0.0, l);
  float d = mx - mn;
  float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
  float h;
  if (mx == n.r) h = ((n.g - n.b) / d + (n.g < n.b ? 6.0 : 0.0)) * 60.0;
  else if (mx == n.g) h = ((n.b - n.r) / d + 2.0) * 60.0;
  else h = ((n.r - n.g) / d + 4.0) * 60.0;
  return vec3(h, s, l);
}
float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}
vec3 hsl2rgb(vec3 hsl) {
  float h = hsl.x, s = hsl.y, l = hsl.z;
  if (s <= 0.0) return vec3(l * 255.0);
  float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
  float p = 2.0 * l - q;
  float hh = h / 360.0;
  return vec3(hue2rgb(p, q, hh + 1.0 / 3.0), hue2rgb(p, q, hh), hue2rgb(p, q, hh - 1.0 / 3.0)) * 255.0;
}
vec3 hslBands(vec3 c) {
  vec3 hsl = rgb2hsl(c);
  if (hsl.y < 0.03) return c;
  float dh = 0.0, ds = 0.0, dl = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uHslN) break;
    float dist = abs(hsl.x - uHslA[i].x);
    if (dist > 180.0) dist = 360.0 - dist;
    if (dist >= uHslA[i].y) continue;
    float w = 1.0 - dist / uHslA[i].y;
    dh += uHslA[i].z * w;
    ds += uHslB[i].x * w;
    dl += uHslB[i].y * w;
  }
  if (dh == 0.0 && ds == 0.0 && dl == 0.0) return c;
  float h = mod(hsl.x + dh + 360.0, 360.0);
  float s = clamp(hsl.y * (1.0 + ds), 0.0, 1.0);
  float l = clamp(hsl.z * (1.0 + dl), 0.0, 1.0);
  return hsl2rgb(vec3(h, s, l));
}
float lut(float v, int ch) {
  float x = (floor(clamp(v, 0.0, 255.0) + 0.5) + 0.5) / 256.0;
  vec4 t = texture2D(uLut, vec2(x, 0.5));
  return (ch == 0 ? t.r : ch == 1 ? t.g : t.b) * 255.0;
}
vec3 colorPass(vec3 c) {
  c = vec3(lut(c.r, 0), lut(c.g, 1), lut(c.b, 2));
  if (uBwOn > 0.5) {
    float v = dot(c, uBw);
    return vec3(v);
  }
  float L = luma(c);
  if (uSat != 0.0 || uVib != 0.0) {
    float mx = max(c.r, max(c.g, c.b));
    float mn = min(c.r, min(c.g, c.b));
    float boost = 1.0 + uSat + uVib * (1.0 - (mx - mn) / 255.0);
    c = L + (c - L) * boost;
  }
  if (uHslN > 0.5) c = hslBands(c);
  float l01 = L / 255.0;
  float ws = (1.0 - l01) * (1.0 - l01);
  float wh = l01 * l01;
  c += uSh * ws + uHi * wh;
  return c;
}
vec4 gsamp(sampler2D t, vec2 up) { return texture2D(t, vec2(up.x, 1.0 - up.y)); }
float skinW(vec3 c) {
  float Y = luma(c);
  float cr = (c.r - Y) * 0.713 + 128.0, cb = (c.b - Y) * 0.564 + 128.0;
  return smoothstep(36.0, 44.0, Y) * smoothstep(129.0, 137.0, cr) * (1.0 - smoothstep(174.0, 182.0, cr)) * smoothstep(73.0, 81.0, cb) * (1.0 - smoothstep(126.0, 134.0, cb));
}
// 인플 합성 — filters.js beautyRGBA 마지막 루프 / iOS lfInfl 과 같은 식. a = 색감 슬라이더(0 = 원본)
vec3 beauty(vec2 up, vec3 v, float a) {
  vec4 mk = gsamp(uMaskT, up);
  float m0 = mk.r, t0 = mk.g;
  if ((m0 < 0.002 && t0 < 0.002) || a <= 0.0) return v;
  // 원해상도 고주파 분리 — σ 가 1px 안팎이라 3×3 가우시안으로 충분하다
  vec3 l = vec3(0.0); float lw = 0.0;
  float sd = max(0.3, uDetail);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    float w = exp(-float(i * i + j * j) / (2.0 * sd * sd));
    l += src(up + vec2(float(i), float(j)) * uTexel) * w; lw += w;
  }
  l /= lw;
  float skG = 0.1 + 0.9 * skinW(l);
  float mSkin = m0 * skG, tm = t0 * skG;
  vec3 ba = gsamp(uBaseT, up).rgb * 255.0;
  vec3 dv = abs(l - ba);
  float m = mSkin * (1.0 - smoothstep(45.0, 95.0, dv.r + dv.g + dv.b));
  // ① 스무딩(얼굴만) — INFL.smooth 0.7
  float k = min(1.0, m * 0.7 * a);
  vec3 o = v + (ba + (v - l) * (0.55 - 0.3 * a) - v) * k;
  // ② 톤(목·귀·이마 피부까지) — INFL.lift 0.07 / red 0.14 / glow 0.22
  float Y = luma(o);
  float cb = (o.b - Y) * 0.564, cr = (o.r - Y) * 0.713 * (1.0 - 0.14 * a * tm);
  Y = Y + (255.0 - Y) * 0.07 * a * tm * smoothstep(60.0, 130.0, Y);
  float r = Y + 1.403 * cr, b = Y + 1.773 * cb;
  o = vec3(r, (Y - 0.299 * r - 0.114 * b) / 0.587, b);
  vec3 gl = gsamp(uGlowT, up).rgb * 255.0;
  return 255.0 - ((255.0 - o) * (255.0 - gl * (0.22 * a * tm))) / 255.0;
}
vec3 thermal(float t) {
  t = clamp(t, 0.0, 1.0) * 5.0;
  vec3 s0 = vec3(8.0, 8.0, 60.0), s1 = vec3(90.0, 20.0, 120.0), s2 = vec3(210.0, 40.0, 40.0);
  vec3 s3 = vec3(255.0, 130.0, 20.0), s4 = vec3(255.0, 220.0, 60.0), s5 = vec3(255.0);
  if (t < 1.0) return mix(s0, s1, t);
  if (t < 2.0) return mix(s1, s2, t - 1.0);
  if (t < 3.0) return mix(s2, s3, t - 2.0);
  if (t < 4.0) return mix(s3, s4, t - 3.0);
  return mix(s4, s5, min(1.0, t - 4.0));
}

void main() {
  vec2 up = 0.5 + (vUv - 0.5) * uFill;
  vec2 p = up * uImg;
  float w = uImg.x, h = uImg.y;
  vec3 orig = src(up);
  vec3 c = orig;
  int sp = int(uSpecial + 0.5);
  bool fxOn = true;

  if (uPreset > 0.5 && sp == 7) {
    // 인플 — 강도 = 보정 세기 그 자체(보간 아님, filters.js 와 같다). 효과 없음. 얼굴이 없으면 원본 그대로.
    if (uBeauty > 0.5) c = beauty(up, orig, uIntensity);
    fxOn = false;
  } else if (uPreset > 0.5) {
    vec3 r = orig;
    if (sp == 5) {
      // 모자이크 — 블록 크기 = 짧은 변의 2%(최소 4). 블록 가운데를 샘플링한다.
      float bs = max(4.0, floor(min(w, h) * 0.02 + 0.5));
      r = srcPx((floor(p / bs) + 0.5) * bs);
      fxOn = false;
    } else if (sp == 6) {
      // 스케치 — 그레이 + (반전 블러) 컬러닷지, 종이빛 살짝
      float base = luma(orig);
      float rad = max(2.0, floor(min(w, h) * 0.008 + 0.5));
      float acc = 0.0;
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          acc += 255.0 - luma(srcPx(p + vec2(float(dx), float(dy)) * rad));
        }
      }
      float bl = acc / 9.0;
      float dodge = bl >= 255.0 ? 255.0 : min(255.0, base * 255.0 / (255.0 - bl));
      r = vec3(dodge * 0.985 + 2.0, dodge * 0.975 + 2.0, dodge * 0.95 + 2.0);
      fxOn = false;
    } else if (sp == 3) {
      // 글리치 — 띠마다 가로 어긋남 + RGB 채널 어긋남 + 3줄마다 스캔라인
      float bandH = max(6.0, floor(h * 0.03 + 0.5));
      float band = floor(p.y / bandH);
      float off = hash(vec2(band, 7.0)) < 0.35 ? floor((hash(vec2(band, 13.0)) - 0.5) * w * 0.08 + 0.5) : 0.0;
      float ch = floor(w * 0.008 + 0.5) + 1.0;
      float sx = clamp(p.x + off, 0.0, w - 1.0);
      r = vec3(srcPx(vec2(clamp(sx + ch, 0.0, w - 1.0), p.y)).r, srcPx(vec2(sx, p.y)).g, srcPx(vec2(clamp(sx - ch, 0.0, w - 1.0), p.y)).b);
      if (mod(floor(p.y), 3.0) < 1.0) r *= 0.88;
      fxOn = false;
    } else {
      bool skipColor = false;
      if (sp == 1) {
        r = mix(uC1, uC2, luma(orig) / 255.0);
        skipColor = true;
      } else if (sp == 2) {
        r = thermal(luma(orig) / 255.0);
        skipColor = true;
      } else if (sp == 4) {
        // VHS — 채널 어긋남 + 2줄마다 스캔라인, 그다음 표준 패스(그레인은 프리셋 fx)
        float ch = max(1.0, floor(w * 0.004 + 0.5));
        r = vec3(srcPx(vec2(min(w - 1.0, p.x + ch), p.y)).r, orig.g, srcPx(vec2(max(0.0, p.x - ch), p.y)).b);
        if (mod(floor(p.y), 2.0) < 1.0) r *= 0.9;
      }
      if (!skipColor) r = colorPass(r);
    }
    // 색감 — 0 = 기본 카메라 색, 1 = 프리셋 색 그대로
    c = mix(orig, r, uIntensity);
  }

  if (fxOn) {
    if (uGrain > 0.0) {
      vec2 q = floor(p);
      float n = hash(q + 0.37);
      float m = hash(floor(q / 2.0) + 91.7);
      float rnd = 0.65 * (n - 0.5) + 0.35 * (m - 0.5);
      float L = luma(c);
      float mid = 1.0 - abs(L - 128.0) / 160.0;
      float amt = uGrain * 46.0 * max(0.25, mid);
      c += rnd * amt;
    }
    if (uVig > 0.0) {
      vec2 d = p - vec2(w, h) * 0.5;
      float dd = length(d) / length(vec2(w, h) * 0.5);
      float t = dd < 0.55 ? 0.0 : (dd - 0.55) / 0.45;
      c *= 1.0 - uVig * 0.5 * t * t;
    }
    if (uLeak > 0.0) {
      float r1 = length(vec2(w, h)) * 0.55;
      float d1 = length(vec2(p.x - w, p.y)) / r1;
      float s1 = d1 < 1.0 ? (1.0 - d1) * (1.0 - d1) * uLeak : 0.0;
      if (s1 > 0.003) {
        c.r = 255.0 - (255.0 - c.r) * (255.0 - 235.0 * s1) / 255.0;
        c.g = 255.0 - (255.0 - c.g) * (255.0 - 110.0 * s1) / 255.0;
        c.b = 255.0 - (255.0 - c.b) * (255.0 - 40.0 * s1) / 255.0;
      }
      float d2 = abs(p.x - w * 0.08) / (w * 0.1);
      float s2 = d2 < 1.0 ? (1.0 - d2) * uLeak * 0.45 : 0.0;
      if (s2 > 0.003) {
        c.r = 255.0 - (255.0 - c.r) * (255.0 - 190.0 * s2) / 255.0;
        c.b = 255.0 - (255.0 - c.b) * (255.0 - 120.0 * s2) / 255.0;
      }
    }
  }
  gl_FragColor = vec4(clamp(c, 0.0, 255.0) / 255.0, 1.0);
}
"""
}
