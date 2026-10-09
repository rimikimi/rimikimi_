import Foundation
import CoreImage

/// 카메라 탭 **실시간 필터** 엔진 — 웹 편집기의 `src/filters.js`(applyLook)를 Core Image 커널로
/// 그대로 옮긴 것(오너 지시 2026-10-09 "필터는 실시간으로 볼 수 있어야 하는데??").
///
/// 촬영한 사진은 지금처럼 편집기(WKWebView, filters.js)가 다시 입힌다 — 여기는 **미리보기 전용**이다.
/// 그래서 목표는 "편집기에서 처음 열렸을 때 보이는 그림과 같게"다:
///   편집기 = `applyLookWithStrength(p, {...fxOf(p), seed: 7}, 0.7)` (강도 0.7 = 프리셋 그대로)
///   → `applyLook(p)` (색 패스) 다음, 효과가 있으면 `applyLook(null, fx)` (효과 패스)
///
/// 픽셀 단위 수식을 그대로 옮기고, JS 가 Uint8 배열에 쓰는 지점마다 같은 방식으로 반올림한다
///   · LUT = Math.round(반올림 올림) · 색/효과 패스 끝 = floor(x+0.5) · 그 밖의 저장 = 짝수 반올림(rint)
/// 맥에서 같은 사진을 node(filters.js)와 이 커널로 돌려 프리셋마다 차이를 숫자로 잰다
/// (scratch/live-filter — 앱에는 안 들어간다).
///
/// ⚠️ 이 파일은 UIKit 을 쓰지 않는다 — 맥 검증 스크립트가 이 파일을 그대로 컴파일한다.
/// ⚠️ 프리셋 표는 filters.js 의 FILM_PRESETS 를 스크립트로 옮긴 것이다. 웹에서 값을 바꾸면 여기도
///    다시 뽑아야 한다(scratch/live-filter/genpresets.mjs).
enum LiveFilter {
    /// 센서 원본(가로) → 세로로 세운 이미지(원점 0,0). 미리보기 프레임·찍힌 사진 공용(오너 실기기 2026-10-09:
    /// 전면 미리보기·사진이 90° 누움 — 연결의 회전 설정이 전면 전환 뒤 먹지 않았다. 설정에 기대지 않고 픽셀로 세운다).
    /// - appliedMirror: 들어온 이미지가 이미 좌우로 뒤집혀 있는지(가로 상태 기준)
    /// - wantMirror: 결과를 거울(셀카 보이는 대로)로 할지
    /// 후면·거울 끔 = 시계방향 90°(.right), 거울 = .leftMirrored(= .right 후 좌우 뒤집기). 이미 세로면 거울만 맞춘다.
    static func upright(_ img: CIImage, appliedMirror: Bool, wantMirror: Bool) -> CIImage {
        var i = img
        if i.extent.width > i.extent.height {
            if appliedMirror { i = i.oriented(.upMirrored) }
            i = i.oriented(wantMirror ? .leftMirrored : .right)
        } else if appliedMirror != wantMirror {
            i = i.oriented(.upMirrored)
        }
        return i.transformed(by: .init(translationX: -i.extent.minX, y: -i.extent.minY))
    }

    enum Special { case duotone, thermal, glitch, vhs, pixelate, sketch }

    /// 색상 대역(HSL) 조정 한 줄 — c: 중심 색상, w: 반경, h: 색상 이동, s·l: 배율 δ
    struct Band { var c: Double; var w: Double; var h: Double; var s: Double; var l: Double }

    /// 프리셋 기본 효과(편집기 fxOf) — 트윙클(별빛)은 카메라 칩에 없어서 옮기지 않았다.
    struct FX {
        var grain: Double = 0, vignette: Double = 0, leak: Double = 0, glow: Double = 0, blur: Double = 0
        /// 저해상도 칸 크기(짧은 변 대비) — filters.js lowres
        var lowres: Double = 0
        var any: Bool { grain > 0 || vignette > 0 || leak > 0 || glow > 0 || blur > 0 || lowres > 0 }
    }

    struct Preset {
        var temp: Double = 0, tint: Double = 0, ex: Double = 0, con: Double = 0
        var fade: Double = 0, whitePull: Double = 0, sat: Double = 0, vib: Double = 0
        var sh: [Double]? = nil, hi: [Double]? = nil, bw: [Double]? = nil
        var hsl: [Band] = []
        var fx = FX()
        var special: Special? = nil
        var c1: [Double]? = nil, c2: [Double]? = nil

        /// 픽셀 크기에 따라 결과가 달라지는 프리셋(그레인·블러·모자이크…) — 편집기와 같은
        /// 해상도(긴 변 1080)에서 돌려야 같은 그림이 된다. 색만 바꾸는 프리셋은 해상도와 무관하다.
        var needsEditorGrid: Bool { fx.any || (special != nil && special != .duotone && special != .thermal) }
    }

    /// 편집기 미리보기 긴 변 (PhotoEditor.jsx PREVIEW_MAX)
    static let editorLongSide: CGFloat = 1080

    // filters.js FILM_PRESETS — genpresets.mjs 로 생성 (원본 none 은 없음 = 처리 안 함)
    static let presets: [String: Preset] = [
        "golden": .init(temp: 20, ex: 0.04, con: 0.18, fade: 10, whitePull: 8, sat: 0.12, vib: 0.15, sh: [6, 3, -8], hi: [12, 9, -12], hsl: [.init(c: 110, w: 60, h: -18, s: -0.12, l: 0), .init(c: 30, w: 25, h: 0, s: 0.08, l: 0.02)]),
        "peach": .init(temp: 12, tint: 6, ex: 0.07, con: 0.08, fade: 14, whitePull: 14, sat: -0.08, vib: 0.25, sh: [4, 2, 0], hi: [10, 5, -2], hsl: [.init(c: 30, w: 28, h: 0, s: -0.06, l: 0.04), .init(c: 110, w: 60, h: -10, s: -0.15, l: 0)]),
        "slide": .init(temp: -6, tint: -2, con: 0.26, fade: 4, sat: 0.2, vib: 0.1, sh: [-3, 0, 8], hi: [0, 0, 0], hsl: [.init(c: 225, w: 55, h: 0, s: 0.25, l: -0.05), .init(c: 120, w: 50, h: 0, s: 0.1, l: 0)]),
        "retro": .init(temp: 6, tint: 2, ex: -0.05, con: 0.32, fade: 2, whitePull: 4, sat: 0.18, sh: [4, -2, -4], hi: [6, 2, -6], hsl: [.init(c: 0, w: 30, h: 0, s: 0.2, l: -0.06), .init(c: 60, w: 35, h: -10, s: 0.1, l: 0), .init(c: 220, w: 60, h: 0, s: -0.15, l: -0.05)]),
        "vivid": .init(con: 0.28, sat: 0.18, vib: 0.12, sh: [0, -2, 4], hi: [2, 0, -2], hsl: [.init(c: 225, w: 60, h: 0, s: 0.3, l: -0.04), .init(c: 120, w: 55, h: 0, s: 0.25, l: -0.03), .init(c: 0, w: 25, h: 0, s: 0.2, l: 0), .init(c: 30, w: 18, h: 0, s: -0.1, l: 0)]),
        "green": .init(temp: 4, tint: -8, con: 0.15, fade: 8, whitePull: 6, sat: 0.1, vib: 0.12, sh: [0, 6, -2], hi: [6, 4, -4], hsl: [.init(c: 120, w: 60, h: 6, s: 0.2, l: -0.03), .init(c: 60, w: 25, h: 20, s: -0.1, l: 0)]),
        "pastel": .init(temp: -4, tint: -10, ex: 0.18, con: -0.05, fade: 24, whitePull: 16, sat: -0.15, vib: 0.2, sh: [-2, 7, 5], hi: [2, 5, 3], hsl: [.init(c: 120, w: 70, h: 8, s: -0.2, l: 0.05), .init(c: 220, w: 60, h: 0, s: -0.15, l: 0.05), .init(c: 30, w: 25, h: 0, s: -0.08, l: 0)]),
        "cine": .init(temp: -14, tint: 6, con: 0.2, fade: 12, whitePull: 6, sat: 0.05, vib: 0.1, sh: [-6, 4, 10], hi: [14, 2, -4], hsl: [.init(c: 120, w: 70, h: 55, s: -0.2, l: 0), .init(c: 220, w: 50, h: -18, s: 0, l: 0), .init(c: 30, w: 22, h: 0, s: 0.05, l: 0)], fx: .init(grain: 0.3)),
        "newtro": .init(temp: 8, tint: 8, con: 0.22, fade: 8, whitePull: 6, sat: 0.16, sh: [6, -2, 0], hi: [8, 2, -4], hsl: [.init(c: 0, w: 35, h: 0, s: 0.15, l: 0), .init(c: 180, w: 60, h: 0, s: -0.2, l: 0), .init(c: 30, w: 20, h: 0, s: 0.05, l: 0)]),
        "softmono": .init(ex: 0.05, con: 0.12, fade: 16, whitePull: 12, bw: [0.28, 0.56, 0.16], fx: .init(grain: 0.35)),
        "warm": .init(temp: 10, tint: 10, ex: 0.08, con: 0.1, fade: 6, whitePull: 4, sat: 0.06, vib: 0.15, sh: [2, 0, 0], hi: [9, 2, 2], hsl: [.init(c: 30, w: 25, h: 0, s: 0, l: 0.03), .init(c: 220, w: 50, h: 0, s: -0.1, l: 0)]),
        "cool": .init(temp: -14, tint: -4, con: 0.16, fade: 6, whitePull: 4, sat: 0.04, vib: 0.1, sh: [-2, 2, 5], hi: [0, 2, 5], hsl: [.init(c: 225, w: 60, h: 0, s: 0.12, l: 0), .init(c: 110, w: 50, h: 15, s: -0.08, l: 0)]),
        "vintage": .init(temp: 14, tint: 2, ex: -0.02, con: -0.08, fade: 22, whitePull: 18, sat: -0.15, vib: 0.05, sh: [6, 4, -2], hi: [8, 6, -6], hsl: [.init(c: 120, w: 60, h: -25, s: -0.3, l: 0), .init(c: 220, w: 60, h: 0, s: -0.25, l: 0), .init(c: 30, w: 30, h: 0, s: -0.05, l: 0.03)], fx: .init(grain: 0.25)),
        "docu": .init(temp: -4, ex: -0.03, con: 0.2, fade: 10, whitePull: 10, sat: -0.28, vib: 0.1, sh: [0, 2, 6], hi: [4, 2, -2], hsl: [.init(c: 220, w: 70, h: -10, s: 0.05, l: 0), .init(c: 0, w: 30, h: 0, s: -0.15, l: 0), .init(c: 30, w: 25, h: 0, s: -0.12, l: 0)]),
        "mono": .init(con: 0.35, fade: 2, bw: [0.35, 0.5, 0.15]),
        "digicam": .init(temp: -8, tint: -2, ex: 0.06, con: 0.22, sat: 0.15, vib: 0.1, sh: [0, 2, 6], hi: [4, 4, 10], hsl: [.init(c: 225, w: 60, h: 0, s: 0.2, l: 0), .init(c: 180, w: 40, h: 0, s: 0.15, l: 0)], fx: .init(grain: 0.15)),
        "toy": .init(temp: 4, tint: 6, con: 0.3, fade: 4, sat: 0.24, sh: [0, -4, 8], hi: [6, 0, -6], hsl: [.init(c: 225, w: 55, h: 0, s: 0.3, l: -0.06), .init(c: 0, w: 30, h: 0, s: 0.15, l: 0)], fx: .init(grain: 0.25, vignette: 0.65)),
        "dispo": .init(temp: 6, ex: 0.1, con: 0.25, fade: 6, sat: 0.12, vib: 0.08, sh: [-2, 4, 0], hi: [10, 8, 2], hsl: [.init(c: 110, w: 50, h: -8, s: -0.05, l: 0)], fx: .init(grain: 0.45, leak: 0.12)),
        "instant": .init(temp: -2, tint: -6, ex: 0.06, con: -0.06, fade: 20, whitePull: 14, sat: -0.12, vib: 0.08, sh: [-4, 6, 4], hi: [6, 4, -2], hsl: [.init(c: 120, w: 60, h: 10, s: -0.15, l: 0.03)], fx: .init(grain: 0.2)),
        "ph16pro": .init(temp: 2, ex: -0.02, con: 0.3, whitePull: 8, sat: 0.1, vib: 0.12, sh: [-2, 0, 4], hi: [4, 2, -2]),
        "ph15pro": .init(temp: 14, tint: 4, ex: 0.03, con: 0.08, fade: 4, whitePull: 14, sat: 0.04, vib: 0.14, sh: [4, 2, 0], hi: [8, 4, -4]),
        "ph14pro": .init(temp: -10, tint: -1, ex: 0.1, con: 0.04, fade: 6, whitePull: 24, sat: 0.2, vib: 0.25, sh: [-2, 2, 8], hi: [0, 2, 6]),
        "phxs": .init(temp: 18, tint: 6, ex: 0.05, con: -0.1, fade: 16, whitePull: 22, sat: -0.02, vib: 0.1, sh: [8, 4, 0], hi: [10, 5, -6], fx: .init(glow: 0.25)),
        "ph7": .init(temp: 16, tint: -6, ex: 0.03, con: 0.18, fade: 4, whitePull: 4, sat: 0.1, vib: 0.06, sh: [2, 4, -4], hi: [10, 10, -12], fx: .init(grain: 0.12)),
        "ph6s": .init(temp: -14, tint: -8, ex: 0.02, con: 0.2, fade: 2, whitePull: 2, sat: 0.14, vib: 0.04, sh: [-4, 4, 8], hi: [0, 4, 6], fx: .init(grain: 0.14)),
        "ph4s": .init(temp: 26, tint: -6, ex: 0.12, con: 0.32, fade: 8, sat: -0.08, sh: [6, 6, -8], hi: [14, 12, -14], fx: .init(grain: 0.3, vignette: 0.35)),
        "ph3gs": .init(temp: 14, tint: -14, ex: 0.14, con: 0.26, fade: 22, sat: -0.35, vib: -0.05, sh: [-6, 10, 6], hi: [18, 16, -10], fx: .init(grain: 0.55, vignette: 0.45)),
        "sepia": .init(ex: 0.02, con: 0.12, fade: 8, whitePull: 6, sh: [18, 6, -14], hi: [24, 10, -18], bw: [0.3, 0.55, 0.15]),
        "duopink": .init(special: .duotone, c1: [38, 18, 66], c2: [255, 158, 201]),
        "neon": .init(fx: .init(glow: 0.5), special: .duotone, c1: [24, 8, 66], c2: [90, 255, 240]),
        "thermal": .init(special: .thermal),
        "glitch": .init(special: .glitch),
        "vhs": .init(fx: .init(grain: 0.35), special: .vhs),
        "pixelate": .init(special: .pixelate),
        "bloom": .init(temp: 8, tint: 2, ex: 0.06, con: -0.06, fade: 16, whitePull: 10, sat: -0.04, vib: 0.18, sh: [6, 4, 0], hi: [14, 10, 2], fx: .init(leak: 0.3, glow: 0.62)),
        "twinkle": .init(temp: 4, ex: 0.03, con: 0.1, fade: 6, whitePull: 6, sat: 0.06, vib: 0.2, sh: [0, 0, 4], hi: [8, 6, 0], fx: .init(glow: 0.22)),
        "sketch": .init(special: .sketch),
    ]

    // MARK: ① 채널 LUT — filters.js channelGains / toneCurve / buildLuts 를 Double 로 그대로

    static func channelGains(_ temp: Double, _ tint: Double) -> [Double] {
        [1 + temp * 0.0016 + tint * 0.0008, 1 - tint * 0.0016, 1 - temp * 0.0016 + tint * 0.0008]
    }

    static func toneCurve(_ v01: Double, _ con: Double, _ fade: Double, _ whitePull: Double) -> Double {
        var v = v01
        if con != 0 {
            let k = 1 + abs(con) * 6
            func sig(_ x: Double) -> Double { 1 / (1 + exp(-k * (x - 0.5))) }
            let lo = sig(0), hi = sig(1)
            let s = (sig(v) - lo) / (hi - lo)
            v = con > 0 ? s : v + (v - s)
        }
        let f = fade / 255
        if f != 0 { v = v + f * pow(1 - v, 3) }
        let wp = whitePull / 255
        if wp != 0 && v > 0.65 {
            let t = (v - 0.65) / 0.35
            v = 0.65 + 0.35 * (t - wp * 0.9 * t * t)
        }
        return v
    }

    /// 256×3 바이트 (r,g,b 채널별). Math.round = 0.5 올림.
    static func buildLuts(_ p: Preset) -> [[UInt8]] {
        let gains = channelGains(p.temp, p.tint)
        let exGain = pow(2, p.ex)
        return (0..<3).map { c in
            (0..<256).map { v in
                let lin = min(1, (Double(v) / 255) * gains[c] * exGain)
                let x = (toneCurve(lin, p.con, p.fade, p.whitePull) * 255 + 0.5).rounded(.down)
                return UInt8(max(0, min(255, x)))
            }
        }
    }

    /// 커널 공통 CIContext 옵션 — **작업 색공간 = sRGB(감마 그대로)**. 기본값(선형 sRGB)이면 커널이
    /// 선형화된 값을 받아 filters.js(sRGB 바이트에 직접 계산)와 완전히 다른 색이 된다.
    /// 카메라 버퍼(P3 등)는 이 공간으로 변환돼 들어온다 — 편집기 캔버스도 sRGB 바이트를 본다.
    static var contextOptions: [CIContextOption: Any] {
        [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
         .workingFormat: CIFormat.RGBAh,
         .cacheIntermediates: false]
    }

    // MARK: Metal 커널 소스 — 앱·맥 검증 스크립트가 같은 문자열을 런타임에 컴파일한다(iOS 15+).
    static let metalSource = #"""
#include <CoreImage/CoreImage.h>
using namespace metal;

// 위에서부터 센 정수 좌표(x, yTop) → CI 좌표(아래가 원점, 픽셀 중심 +0.5)의 0~255 정수값
inline float3 lf_at(coreimage::sampler s, float x, float yTop, float H) {
    return rint(s.sample(s.transform(float2(x + 0.5, H - yTop - 0.5))).rgb * 255.0);
}
inline float3 lf_here(coreimage::sampler s, float2 dc) {
    return rint(s.sample(s.transform(dc)).rgb * 255.0);
}
inline float4 lf_out(float3 v) { return float4(v / 255.0, 1.0); }
// 색/효과 패스 마지막: clamp8(v + 0.5) | 0
inline float3 lf_floorq(float3 v) { return floor(clamp(v + 0.5, 0.0, 255.0)); }
// Uint8ClampedArray 저장 = 짝수 반올림
inline float3 lf_store(float3 v) { return clamp(rint(v), 0.0, 255.0); }
inline float lf_lum(float3 v) { return v.r * 0.299 + v.g * 0.587 + v.b * 0.114; }

inline float3 lf_rgb2hsl(float3 c) {
    float r = c.r / 255.0, g = c.g / 255.0, b = c.b / 255.0;
    float mx = max(r, max(g, b)), mn = min(r, min(g, b));
    float l = (mx + mn) / 2.0;
    if (mx == mn) return float3(0.0, 0.0, l);
    float d = mx - mn;
    float s = l > 0.5 ? d / (2.0 - mx - mn) : d / (mx + mn);
    float h;
    if (mx == r) h = ((g - b) / d + (g < b ? 6.0 : 0.0)) * 60.0;
    else if (mx == g) h = ((b - r) / d + 2.0) * 60.0;
    else h = ((r - g) / d + 4.0) * 60.0;
    return float3(h, s, l);
}
inline float lf_h2c(float p, float q, float t) {
    if (t < 0.0) t += 1.0;
    if (t > 1.0) t -= 1.0;
    if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
    if (t < 1.0 / 2.0) return q;
    if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    return p;
}
inline float3 lf_hsl2rgb(float h, float s, float l) {
    if (s <= 0.0) return float3(l * 255.0);
    float q = l < 0.5 ? l * (1.0 + s) : l + s - l * s;
    float p = 2.0 * l - q;
    float hh = h / 360.0;
    return float3(lf_h2c(p, q, hh + 1.0 / 3.0), lf_h2c(p, q, hh), lf_h2c(p, q, hh - 1.0 / 3.0)) * 255.0;
}
inline void lf_band(float h, float4 bd, float bl, thread float &dh, thread float &ds, thread float &dl) {
    if (bd.y <= 0.0) return;
    float dist = abs(h - bd.x);
    if (dist > 180.0) dist = 360.0 - dist;
    if (dist >= bd.y) return;
    float wgt = 1.0 - dist / bd.y;
    dh += bd.z * wgt; ds += bd.w * wgt; dl += bl * wgt;
}

// JS: (t * 1274126177) 를 double 로 곱해 53비트로 반올림한 뒤 ToInt32 — 그대로 흉내 낸다
// (그레인 무늬를 편집기와 비트 단위로 같게).
inline int lf_mul_js(int t, long k) {
    long p = long(t) * k;
    ulong a = ulong(p < 0 ? -p : p);
    if (a >= (ulong(1) << 53)) {
        uint hiw = uint(a >> 32);
        int bitlen = 64 - int(clz(hiw));
        int shift = bitlen - 53;
        ulong unit = ulong(1) << shift;
        ulong rem = a & (unit - 1);
        ulong base = a - rem;
        ulong hf = unit >> 1;
        if (rem > hf || (rem == hf && ((base >> shift) & ulong(1)) != 0)) base += unit;
        a = base;
    }
    uint u = uint(a & ulong(0xffffffff));
    if (p < 0) u = 0u - u;
    return int(u);
}
inline uint lf_hash(uint a, uint b, uint c, uint ka, uint kb, uint kc) {
    int n = int(a * ka + b * kb + c * kc);
    int t = n ^ (n >> 13);
    int m = lf_mul_js(t, 1274126177);
    return uint(m ^ (m >> 16));
}

//@kernel
// ①~④ 색 패스 (applyLook(p) 의 픽셀 루프 + 듀오톤/서모)
// mode: 0 표준 · 1 듀오톤 · 2 서모
// bands: b0..b3 = (중심, 반경, 색상이동, 채도δ), bl = 대역별 밝기δ
extern "C" [[stitchable]] float4 lfColor(coreimage::sampler src, coreimage::sampler lut,
                          float mode, float useBw, float sat, float vib,
                          float3 bw, float3 sh, float3 hi,
                          float4 b0, float4 b1, float4 b2, float4 b3, float4 bl,
                          float3 c1, float3 c2,
                          coreimage::destination dest) {
    float3 v = lf_here(src, dest.coord());
    if (mode > 0.5 && mode < 1.5) {
        float t = lf_lum(v) / 255.0;
        return lf_out(lf_store(c1 + (c2 - c1) * t));
    }
    if (mode > 1.5) {
        const float3 st[6] = { float3(8, 8, 60), float3(90, 20, 120), float3(210, 40, 40),
                               float3(255, 130, 20), float3(255, 220, 60), float3(255, 255, 255) };
        float t = lf_lum(v) / 255.0 * 5.0;
        int s0 = min(4, int(floor(t)));
        float f = t - float(s0);
        return lf_out(lf_store(st[s0] + (st[s0 + 1] - st[s0]) * f));
    }
    float r = rint(lut.sample(lut.transform(float2(v.r + 0.5, 0.5))).r * 255.0);
    float g = rint(lut.sample(lut.transform(float2(v.g + 0.5, 0.5))).g * 255.0);
    float b = rint(lut.sample(lut.transform(float2(v.b + 0.5, 0.5))).b * 255.0);
    if (useBw > 0.5) {
        float m = r * bw.x + g * bw.y + b * bw.z;
        r = m; g = m; b = m;
    } else {
        float L = r * 0.299 + g * 0.587 + b * 0.114;
        if (sat != 0.0 || vib != 0.0) {
            float mx = max(r, max(g, b)), mn = min(r, min(g, b));
            float boost = 1.0 + sat + vib * (1.0 - (mx - mn) / 255.0);
            r = L + (r - L) * boost; g = L + (g - L) * boost; b = L + (b - L) * boost;
        }
        if (b0.y > 0.0) {
            float3 hsl = lf_rgb2hsl(float3(r, g, b));
            if (hsl.y >= 0.03) {
                float dh = 0.0, ds = 0.0, dl = 0.0;
                lf_band(hsl.x, b0, bl.x, dh, ds, dl);
                lf_band(hsl.x, b1, bl.y, dh, ds, dl);
                lf_band(hsl.x, b2, bl.z, dh, ds, dl);
                lf_band(hsl.x, b3, bl.w, dh, ds, dl);
                if (dh != 0.0 || ds != 0.0 || dl != 0.0) {
                    float h2 = fmod(hsl.x + dh + 360.0, 360.0);
                    float s2 = min(1.0, max(0.0, hsl.y * (1.0 + ds)));
                    float l2 = min(1.0, max(0.0, hsl.z * (1.0 + dl)));
                    float3 o = lf_hsl2rgb(h2, s2, l2);
                    r = o.r; g = o.g; b = o.b;
                }
            }
        }
        float l01 = L / 255.0;
        float ws = (1.0 - l01) * (1.0 - l01);
        float wh = l01 * l01;
        r += sh.x * ws + hi.x * wh; g += sh.y * ws + hi.y * wh; b += sh.z * ws + hi.z * wh;
    }
    return lf_out(lf_floorq(float3(r, g, b)));
}

//@kernel
// ⑤ 효과 패스 (applyLook(null, fx) 의 그레인·비네트·빛샘)
extern "C" [[stitchable]] float4 lfFx(coreimage::sampler src, float grain, float vig, float leak, float seed,
                       float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float3 v = lf_here(src, dc);
    float r = v.r, g = v.g, b = v.b;
    if (grain > 0.0) {
        uint ux = uint(x), uy = uint(y), us = uint(seed);
        uint n = lf_hash(ux, uy, us, 374761393u, 668265263u, 974711u);
        uint m = lf_hash(ux >> 1, uy >> 1, us, 668265263u, 374761393u, 434371u);
        float rnd = 0.65 * (float(n) / 4294967296.0 - 0.5) + 0.35 * (float(m) / 4294967296.0 - 0.5);
        float L = r * 0.299 + g * 0.587 + b * 0.114;
        float mid = 1.0 - abs(L - 128.0) / 160.0;
        float amt = grain * 46.0 * (mid < 0.25 ? 0.25 : mid);
        float add = rnd * amt;
        r += add; g += add; b += add;
    }
    if (vig > 0.0) {
        float cx = W / 2.0, cy = H / 2.0;
        float maxD = sqrt(cx * cx + cy * cy);
        float dx = x - cx, dy = y - cy;
        float d = sqrt(dx * dx + dy * dy) / maxD;
        float t = d < 0.55 ? 0.0 : (d - 0.55) / 0.45;
        float f = 1.0 - vig * 0.5 * t * t;
        r *= f; g *= f; b *= f;
    }
    if (leak > 0.0) {
        float leakR1 = sqrt(W * W + H * H) * 0.55;
        float d1 = sqrt((x - W) * (x - W) + y * y) / leakR1;
        float s1 = d1 < 1.0 ? (1.0 - d1) * (1.0 - d1) * leak : 0.0;
        if (s1 > 0.003) {
            r = 255.0 - ((255.0 - r) * (255.0 - 235.0 * s1)) / 255.0;
            g = 255.0 - ((255.0 - g) * (255.0 - 110.0 * s1)) / 255.0;
            b = 255.0 - ((255.0 - b) * (255.0 - 40.0 * s1)) / 255.0;
        }
        float d2 = abs(x - W * 0.08) / (W * 0.1);
        float s2 = d2 < 1.0 ? (1.0 - d2) * leak * 0.45 : 0.0;
        if (s2 > 0.003) {
            r = 255.0 - ((255.0 - r) * (255.0 - 190.0 * s2)) / 255.0;
            b = 255.0 - ((255.0 - b) * (255.0 - 120.0 * s2)) / 255.0;
        }
    }
    return lf_out(lf_floorq(float3(r, g, b)));
}

//@kernel
// 박스 블러(boxBlurRGBA) — 가로/세로 따로, 가장자리 클램프, 패스마다 Uint8 저장
extern "C" [[stitchable]] float4 lfBoxH(coreimage::sampler src, float rad, float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float3 s = float3(0.0);
    for (float i = -rad; i <= rad; i += 1.0) s += lf_at(src, clamp(x + i, 0.0, W - 1.0), y, H);
    return lf_out(lf_store(s / (2.0 * rad + 1.0)));
}
//@kernel
extern "C" [[stitchable]] float4 lfBoxV(coreimage::sampler src, float rad, float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float3 s = float3(0.0);
    for (float i = -rad; i <= rad; i += 1.0) s += lf_at(src, x, clamp(y + i, 0.0, H - 1.0), H);
    return lf_out(lf_store(s / (2.0 * rad + 1.0)));
}

//@kernel
// 뽀샤시 — 블러본을 스크린 블렌드 + 살짝 밝게
extern "C" [[stitchable]] float4 lfGlow(coreimage::sampler base, coreimage::sampler soft, float amt, float lift,
                         coreimage::destination dest) {
    float2 dc = dest.coord();
    float3 v = lf_here(base, dc), s = lf_here(soft, dc);
    float3 screen = 255.0 - ((255.0 - v) * (255.0 - s)) / 255.0;
    return lf_out(lf_store(clamp(v + (screen - v) * amt + lift, 0.0, 255.0)));
}

//@kernel
// 모자이크 — 블록 평균을 가로 평균 → 세로 평균 두 번으로 (같은 결과, 훨씬 싸다)
extern "C" [[stitchable]] float4 lfBlockH(coreimage::sampler src, float bs, float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float bx = floor(x / bs) * bs;
    float n = min(W, bx + bs) - bx;
    float3 s = float3(0.0);
    for (float i = 0.0; i < n; i += 1.0) s += lf_at(src, bx + i, y, H);
    return float4(s / n / 255.0, 1.0);
}
//@kernel
extern "C" [[stitchable]] float4 lfBlockV(coreimage::sampler src, float bs, float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float by = floor(y / bs) * bs;
    float n = min(H, by + bs) - by;
    float3 s = float3(0.0);
    for (float i = 0.0; i < n; i += 1.0)
        s += src.sample(src.transform(float2(x + 0.5, H - (by + i) - 0.5))).rgb * 255.0;
    return lf_out(lf_store(s / n));
}

//@kernel
// 스케치 — 그레이 반전본(블러 전)
extern "C" [[stitchable]] float4 lfSketchInv(coreimage::sampler src, coreimage::destination dest) {
    float gv = rint(lf_lum(lf_here(src, dest.coord())));
    return lf_out(float3(255.0 - gv));
}
//@kernel
// 스케치 — 컬러닷지 + 종이빛
extern "C" [[stitchable]] float4 lfSketch(coreimage::sampler src, coreimage::sampler blurInv, coreimage::destination dest) {
    float2 dc = dest.coord();
    float base = rint(lf_lum(lf_here(src, dc)));
    float bl = lf_here(blurInv, dc).r;
    float dodge = bl >= 255.0 ? 255.0 : min(255.0, (base * 255.0) / (255.0 - bl));
    return lf_out(lf_store(clamp(float3(dodge * 0.985 + 2.0, dodge * 0.975 + 2.0, dodge * 0.95 + 2.0), 0.0, 255.0)));
}

//@kernel
// 글리치 — 행 띠마다 시드 고정 난수로 가로 어긋남 + RGB 채널 어긋남
extern "C" [[stitchable]] float4 lfGlitch(coreimage::sampler src, float W, float H, float bandH, float chShift, float seed,
                           coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    uint rnd = uint(seed) * 2654435761u;
    int band = int(floor(y / bandH));
    float off = 0.0;
    for (int i = 0; i <= band; i++) {
        rnd ^= rnd << 13; rnd ^= rnd >> 17; rnd ^= rnd << 5;
        if (rnd <= 1503238553u) {   // nextR() < 0.35
            rnd ^= rnd << 13; rnd ^= rnd >> 17; rnd ^= rnd << 5;
            int d = int(rnd - 2147483648u);    // (nextR() - 0.5) * 2^32
            off = floor(float(d) * (W * 0.08 / 4294967296.0) + 0.5);
        } else {
            off = 0.0;
        }
    }
    float sx = clamp(x + off, 0.0, W - 1.0);
    float rr = lf_at(src, clamp(sx + chShift, 0.0, W - 1.0), y, H).r;
    float gg = lf_at(src, sx, y, H).g;
    float bb = lf_at(src, clamp(sx - chShift, 0.0, W - 1.0), y, H).b;
    return lf_out(float3(rr, gg, bb));
}

//@kernel
// VHS — R 은 오른쪽, B 는 왼쪽에서 가져온다
extern "C" [[stitchable]] float4 lfShift(coreimage::sampler src, float chShift, float W, float H, coreimage::destination dest) {
    float2 dc = dest.coord();
    float x = floor(dc.x), y = H - 1.0 - floor(dc.y);
    float rr = lf_at(src, min(W - 1.0, x + chShift), y, H).r;
    float gg = lf_at(src, x, y, H).g;
    float bb = lf_at(src, max(0.0, x - chShift), y, H).b;
    return lf_out(float3(rr, gg, bb));
}

//@kernel
// 스캔라인 — 위에서 period 줄마다 num/den 배 (0.9 를 9/10 로 받아 짝수 반올림까지 JS 와 같게)
extern "C" [[stitchable]] float4 lfScan(coreimage::sampler src, float period, float num, float den, float H,
                         coreimage::destination dest) {
    float2 dc = dest.coord();
    float y = H - 1.0 - floor(dc.y);
    float3 v = lf_here(src, dc);
    if (fmod(y, period) == 0.0) v = lf_store(v * num / den);
    return lf_out(v);
}
"""#
}

/// 커널 묶음 + 프리셋 적용. 렌더 큐 한 곳에서만 쓴다(LUT 캐시가 잠금 없이 돈다).
final class LiveFilterEngine {
    private let kernels: [String: CIKernel]
    private var lutCache: [String: CIImage] = [:]

    /// ⚠️ 커널마다 **따로** 컴파일한다. 한 소스에서 여러 커널을 뽑으면 Core Image 가 입력 개수가 같은
    ///    커널끼리 같은 프로그램으로 캐시해 버려(맥에서 재현 — 두 번째 커널부터 엉뚱한 프로그램이 돌아
    ///    빈 화면) 공통 함수(머리말) + 커널 하나씩 별도 라이브러리로 만든다.
    init() throws {
        let parts = LiveFilter.metalSource.components(separatedBy: "//@kernel")
        let header = parts[0]
        var d: [String: CIKernel] = [:]
        for body in parts.dropFirst() {
            for k in try CIKernel.kernels(withMetalString: header + body) { d[k.name] = k }
        }
        kernels = d
    }

    /// 카메라 프레임 → 필터 입힌 이미지 (원점 0,0). 프레임 해상도 그대로 돌린다 — 예전엔 그레인 등
    /// 효과 프리셋을 편집기 격자(긴 변 1080)로 줄였다 늘려서 화면이 초점 나간 것처럼 흐렸다(오너 실기기 2026-10-09).
    /// 칸·반경은 짧은 변 비율이라 해상도가 달라도 같은 모양이고, 그레인 알갱이만 조금 더 곱다.
    func render(frame: CIImage, key: String) -> CIImage {
        let e = frame.extent
        let img = frame.transformed(by: .init(translationX: -e.minX, y: -e.minY))
            .cropped(to: CGRect(x: 0, y: 0, width: e.width.rounded(.down), height: e.height.rounded(.down)))
        guard LiveFilter.presets[key] != nil else { return img }
        return apply(img, key: key)
    }

    /// 원점 (0,0)·정수 크기 이미지에 프리셋을 입힌다. effects=false 면 효과 패스(그레인 등)를 뺀다(검증용).
    func apply(_ input: CIImage, key: String, effects: Bool = true) -> CIImage {
        guard let p = LiveFilter.presets[key] else { return input }
        let ext = input.extent
        let W = ext.width, H = ext.height
        let minWH = min(W, H)
        let jsRound = { (x: CGFloat) -> CGFloat in (x + 0.5).rounded(.down) } // Math.round
        var img = input

        switch p.special {
        case .pixelate?:
            let bs = max(4, jsRound(minWH * 0.02))
            let h = run("lfBlockH", ext, [img], [img, bs, W, H])
            return run("lfBlockV", ext, [h], [h, bs, W, H])
        case .sketch?:
            let inv = run("lfSketchInv", ext, [img], [img])
            let blurred = box(inv, max(2, jsRound(minWH * 0.008)), W, H)
            return run("lfSketch", ext, [img, blurred], [img, blurred])
        case .glitch?:
            let bandH = max(6, jsRound(H * 0.03))
            let ch = jsRound(W * 0.008) + 1
            let g = run("lfGlitch", ext, [img], [img, W, H, bandH, ch, 7])
            return run("lfScan", ext, [g], [g, 3, 88, 100, H])
        case .vhs?:
            let ch = max(1, jsRound(W * 0.004))
            img = run("lfShift", ext, [img], [img, ch, W, H])
            img = box(img, 1, W, H)
            img = run("lfScan", ext, [img], [img, 2, 9, 10, H])
            // 이후 표준 색 패스는 항등(LUT·채도 없음)이라 건너뛴다
        default:
            img = color(img, p, key: key, ext: ext)
        }

        guard effects, p.fx.any else { return img }
        if p.fx.blur > 0 { img = box(img, jsRound(minWH * 0.02 * p.fx.blur) + 1, W, H) }
        if p.fx.lowres > 0 {
            let bs = max(2, jsRound(minWH * p.fx.lowres))
            let h = run("lfBlockH", ext, [img], [img, bs, W, H])
            img = run("lfBlockV", ext, [h], [h, bs, W, H])
        }
        if p.fx.grain > 0 || p.fx.vignette > 0 || p.fx.leak > 0 {
            img = run("lfFx", ext, [img], [img, p.fx.grain, p.fx.vignette, p.fx.leak, 7, W, H])
        }
        if p.fx.glow > 0 {
            let soft = box(img, jsRound(minWH * 0.015) + 2, W, H)
            img = run("lfGlow", ext, [img, soft], [img, soft, p.fx.glow * 0.85, p.fx.glow * 10])
        }
        return img
    }

    // MARK: 내부

    private func color(_ img: CIImage, _ p: LiveFilter.Preset, key: String, ext: CGRect) -> CIImage {
        let lut = lutImage(key, p)
        let mode: CGFloat = p.special == .duotone ? 1 : p.special == .thermal ? 2 : 0
        func v3(_ a: [Double]?) -> CIVector { let a = a ?? [0, 0, 0]; return CIVector(x: a[0], y: a[1], z: a[2]) }
        var b = [CIVector](repeating: CIVector(x: 0, y: 0, z: 0, w: 0), count: 4)
        var l: [CGFloat] = [0, 0, 0, 0]
        for (i, bd) in p.hsl.prefix(4).enumerated() {
            b[i] = CIVector(x: bd.c, y: bd.w, z: bd.h, w: bd.s)
            l[i] = bd.l
        }
        let args: [Any] = [img, lut, mode, p.bw != nil ? 1 : 0, p.sat, p.vib,
                           v3(p.bw), v3(p.sh), v3(p.hi),
                           b[0], b[1], b[2], b[3], CIVector(x: l[0], y: l[1], z: l[2], w: l[3]),
                           v3(p.c1), v3(p.c2)]
        return run("lfColor", ext, [img, lut], args)
    }

    private func lutImage(_ key: String, _ p: LiveFilter.Preset) -> CIImage {
        if let c = lutCache[key] { return c }
        let luts = LiveFilter.buildLuts(p)
        var bytes = [UInt8](repeating: 255, count: 256 * 4)
        for v in 0..<256 { bytes[v * 4] = luts[0][v]; bytes[v * 4 + 1] = luts[1][v]; bytes[v * 4 + 2] = luts[2][v] }
        // 색공간을 작업 공간(sRGB)과 같게 줘서 변환 없이 바이트 그대로 읽히게 한다
        let img = CIImage(bitmapData: Data(bytes), bytesPerRow: 256 * 4, size: CGSize(width: 256, height: 1),
                          format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)).samplingNearest()
        lutCache[key] = img
        return img
    }

    private func box(_ img: CIImage, _ r: CGFloat, _ W: CGFloat, _ H: CGFloat) -> CIImage {
        let h = run("lfBoxH", img.extent, [img], [img, r, W, H])
        return run("lfBoxV", img.extent, [h], [h, r, W, H])
    }

    /// 커널 실행. ROI 는 입력 전체(1080 격자라 타일을 나눌 일이 거의 없다).
    private func run(_ name: String, _ ext: CGRect, _ inputs: [CIImage], _ args: [Any]) -> CIImage {
        guard let k = kernels[name] else { return inputs.first ?? .empty() }
        let rois = inputs.map(\.extent)
        return k.apply(extent: ext, roiCallback: { i, _ in Int(i) < rois.count ? rois[Int(i)] : .null }, arguments: args)
            ?? inputs.first ?? .empty()
    }
}
