// 액자 앞면 물방울 — 렌즈 굴절(뒤 사진이 거꾸로·확대돼 비침) + 가는 테 + 왼쪽 위 반사광 + 아래쪽 맺힌 빛.
// 흐르는 방울은 진행 반대쪽으로 늘어난 눈물 모양. 지나간 물길(젖은 자국)은 아주 옅게 장면을 눌러 비춘다.
// drops: [x, y, r, dirx, diry, stretch] (x·y·r 은 pt). trail: [x, y, w, a] 점 목록(물길).
#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

[[ stitchable ]] half4 faceWater(float2 pos, SwiftUI::Layer layer,
                                 device const float *drops, int dropsCount,
                                 device const float *trail, int trailCount) {
    half4 color = layer.sample(pos);
    // 물길 — 점들을 잇는 **연속된 선**까지의 최단 거리로 한 번만 칠한다(점마다 칠하면 고리 사슬이 됐다)
    int tn = trailCount / 4;
    float best = 1e9, bw = 0.0, ba = 0.0, bcx = 0.0;
    for (int k = 1; k < tn; k++) {
        float2 a = float2(trail[(k - 1) * 4], trail[(k - 1) * 4 + 1]);
        float2 b = float2(trail[k * 4], trail[k * 4 + 1]);
        float w = trail[k * 4 + 2], al = trail[k * 4 + 3];
        if (w <= 0.0 || trail[(k - 1) * 4 + 2] <= 0.0) continue;       // 다른 물길로 넘어가는 경계(w=0 표시)
        float2 ab = b - a; float L2 = max(dot(ab, ab), 1e-4);
        float t = clamp(dot(pos - a, ab) / L2, 0.0, 1.0);
        float2 cp = a + ab * t;
        float d = length(pos - cp) / w;
        if (d < best) { best = d; bw = w; ba = al; bcx = cp.x; }
    }
    if (best < 1.0) {
        // 젖은 자국: 장면이 미세하게 안쪽으로 당겨져 비치고 살짝 어둡다 + 한쪽 가장자리에 가는 빛
        half4 s = layer.sample(pos + float2((bcx - pos.x) * 0.35, 0.0));
        float core = 1.0 - best * best;
        color = mix(color, s * half(0.88), half(ba * core * 0.55));
        float glint = smoothstep(0.55, 0.85, best) * (1.0 - smoothstep(0.85, 1.0, best)) * step(0.0, pos.x - bcx);
        color.rgb += half3(ba * 0.20 * glint);
    }
    int n = dropsCount / 6;
    for (int k = 0; k < n; k++) {
        float2 c = float2(drops[k * 6], drops[k * 6 + 1]);
        float r = drops[k * 6 + 2];
        float2 dir = float2(drops[k * 6 + 3], drops[k * 6 + 4]);
        float stretch = drops[k * 6 + 5];
        if (r < 0.4) continue;
        float2 d = pos - c;
        float2 perp = float2(-dir.y, dir.x);
        float along = dot(d, dir), side = dot(d, perp);
        // 앞(진행 방향)은 둥글고 무겁게, 뒤(꼬리)는 길게
        float a2 = along > 0.0 ? along * 1.05 : along / stretch;
        float s2 = side * (along > 0.0 ? 1.0 : mix(1.0, 1.4, clamp(-along / (r * stretch), 0.0, 1.0)));
        float2 q = float2(s2, a2) / r;
        float rr = dot(q, q);
        if (rr < 1.08) {
            float rho = sqrt(min(rr, 1.0));
            float h = sqrt(max(0.0, 1.0 - rr));
            // 렌즈 — 가운데는 반대편 장면이 작게, 가장자리로 갈수록 크게 휜다(거꾸로 비친 상)
            float2 sp = c - d * (1.6 + 2.2 * (1.0 - h)) ;
            half4 refr = layer.sample(sp);
            refr.rgb = refr.rgb * half(1.02) + half3(0.02h);
            // 가는 테(전반사) — 아주 가장자리만
            float rim = smoothstep(0.86, 1.0, rho);
            refr.rgb *= half(1.0 - 0.55 * rim);
            // 아래쪽 안쪽에 모인 빛
            float2 qn = float2(dot(q, float2(1, 0)), dot(q, float2(0, 1)));
            float caustic = exp(-pow((qn.y - 0.58) / 0.16, 2.0)) * exp(-pow(qn.x / 0.5, 2.0));
            refr.rgb = mix(refr.rgb, half3(1.0h), half(0.28 * caustic));
            // 반사광 — 왼쪽 위 작고 선명 + 넓고 옅게
            float2 hl = qn - float2(-0.32, -0.42);
            float spec = exp(-dot(hl, hl) * 40.0) * 0.95 + exp(-dot(hl, hl) * 7.0) * 0.10;
            refr.rgb = mix(refr.rgb, half3(1.0h), half(spec));
            float edge = 1.0 - smoothstep(0.92, 1.08, rr);
            color = mix(color, refr, half(edge));
        } else if (along > 0.0 && rr < 1.7) {
            // 방울 아래 옅은 그늘
            color.rgb *= half(1.0 - 0.06 * (1.7 - rr) / 0.6);
        }
    }
    return color;
}
