// 유리창 빗물 — 게임·데모신에서 쓰는 방식(셰이더 안에서 격자별로 물방울 하나씩: 크게 맺혀 미끄러지며
// 작은 물방울 자국을 남기고, 정지한 잔방울이 반짝이고, 렌즈 굴절로 뒤 장면이 비친다).
// CPU 시뮬레이션 없이 매 픽셀 계산 → 합쳐짐·떨어짐·자국이 자연스럽게 나온다.
// 중력(기울기) = uv 를 회전시켜 '아래' 방향을 바꾼다. t = 시간(초), amount = 비 세기 0…1.
#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

static float3 N13(float p) {
    float3 p3 = fract(float3(p) * float3(.1031, .11369, .13787));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract(float3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}
static float N(float t) { return fract(sin(t * 12345.564) * 7658.76); }
static float Saw(float b, float t) { return smoothstep(0., b, t) * smoothstep(1., b, t); }

// 큰 물방울 층 — 격자 한 칸에 한 방울: 가만히 커지다 갑자기 미끄러져 내려가고(saw), 지나간 자리에 작은 자국 방울
static float2 DropLayer(float2 uv, float t) {
    float2 UV = uv;
    uv.y += t * 0.75;
    float2 a = float2(6., 1.);
    float2 grid = a * 2.;
    float2 id = floor(uv * grid);
    float colShift = N(id.x);
    uv.y += colShift;
    id = floor(uv * grid);
    float3 n = N13(id.x * 35.2 + id.y * 2376.1);
    float2 st = fract(uv * grid) - float2(.5, 0);
    float x = n.x - .5;
    float y = UV.y * 20.;
    float wiggle = sin(y + sin(y));
    x += wiggle * (.5 - abs(x)) * (n.z - .5);
    x *= .7;
    float ti = fract(t + n.z);
    y = (Saw(.85, ti) - .5) * .9 + .5;
    float2 p = float2(x, y);
    float d = length((st - p) * a.yx);
    float mainDrop = smoothstep(.4, .0, d);
    float r = sqrt(smoothstep(1., y, st.y));
    float cd = abs(st.x - x);
    float trail = smoothstep(.23 * r, .15 * r * r, cd);
    float trailFront = smoothstep(-.02, .02, st.y - y);
    trail *= trailFront * r * r;
    y = UV.y;
    float trail2 = smoothstep(.2 * r, .0, cd);
    float droplets = max(0., (sin(y * (1. - y) * 120.) - st.y)) * trail2 * trailFront * n.z;
    y = fract(y * 10.) + (st.y - .5);
    float dd = length(st - float2(x, y));
    droplets = smoothstep(.3, 0., dd);
    float m = mainDrop + droplets * r * trailFront;
    return float2(m, trail);
}

// 정지한 잔방울 — 깜빡이듯 생겼다 사라지는 작은 물방울
static float StaticDrops(float2 uv, float t) {
    uv *= 40.;
    float2 id = floor(uv);
    uv = fract(uv) - .5;
    float3 n = N13(id.x * 107.45 + id.y * 3543.654);
    float2 p = (n.xy - .5) * .7;
    float d = length(uv - p);
    float fade = Saw(.025, fract(t + n.z));
    return smoothstep(.3, 0., d) * fract(n.z * 10.) * fade;
}

// 물 양 — 잔방울은 액자에 붙어 있으니 화면 좌표 그대로(기울여도 안 돈다).
// 흐르는 방울은 무늬 전체를 돌리면 액자 물이 통째로 빙글 도는 것처럼 보인다(오너 10/22 "전체가 돌아가는 게 아니고
// 흐르는 물방울의 방향만 따라서"). 그래서 세로로 흐르는 층과 가로로 흐르는 층 두 개를 90° 단위로만 두고,
// 기울기에 따라 둘의 양을 섞는다 → 기울이면 새 방울이 그 방향으로 흐르기 시작하고 기존 무늬는 돌지 않는다.
// p = 화면 비율 보정 좌표(위쪽 +y). v = (가로 비중, 세로 비중, 가로 부호, 세로 부호).
static float Water(float2 p, float4 v, float2 seedOff, float t, float l0, float l1, float l2) {
    float s = StaticDrops(p * .9 + seedOff, t) * l0;
    float m = 0.;
    if (v.y > 0.01) {                                   // 아래(또는 위)로 흐르는 층
        float2 q = p * v.w * .9 + seedOff;
        m += (DropLayer(q, t).x * l1 + DropLayer(q * 1.85, t).x * l2) * v.y;
    }
    if (v.x > 0.01) {                                   // 옆으로 흐르는 층 — 좌표를 정확히 90° 돌린 것
        float2 q = float2(p.y, -p.x) * v.z * .9 + seedOff.yx + 7.3;
        m += (DropLayer(q, t).x * l1 + DropLayer(q * 1.85, t).x * l2) * v.x;
    }
    return smoothstep(.3, 1., s + m);
}

[[ stitchable ]] half4 windowRain(float2 pos, SwiftUI::Layer layer, float2 size, float t, float amount, float2 down, float seed) {
    // 화면 비율 보정 좌표(짧은 변 기준), 위쪽 +y
    float2 p = (pos - size * .5) / size.y;
    p.y = -p.y;
    // down = 화면 좌표의 아래 방향(단위벡터). 세로·가로 비중은 제곱 비율(합 1).
    float dx2 = down.x * down.x, dy2 = down.y * down.y, dd = max(1e-4, dx2 + dy2);
    float4 v = float4(dx2 / dd, dy2 / dd, down.x >= 0. ? 1. : -1., down.y >= 0. ? 1. : -1.);
    float2 seedOff = float2(seed * 3.17, seed * 1.73);     // 카드마다 다른 무늬
    float T = t * .2;
    float rain = clamp(amount, 0., 1.);
    float l0 = smoothstep(-.5, 1., rain) * 0.9;   // 잔방울 — 사진이 가려지지 않게 절제
    float l1 = smoothstep(.25, .75, rain);
    float l2 = smoothstep(.0, .5, rain);
    float c = Water(p, v, seedOff, T, l0, l1, l2);
    // 대부분 픽셀은 물이 없다 — 굴절용 2번 더 계산하지 않고 바로 원본
    if (c < 0.001) return layer.sample(pos);
    // 법선(굴절) — 화면 좌표에서 주변 차분
    float e = .001;
    float cx = Water(p + float2(e, 0.), v, seedOff, T, l0, l1, l2);
    float cy = Water(p + float2(0., e), v, seedOff, T, l0, l1, l2);
    float2 n = float2(cx - c, cy - c);
    float2 off = n * size.y * 1.6;
    off.y = -off.y;
    half4 col = layer.sample(pos + off);
    // 방울 테두리 살짝 어둡게·반사광
    float edge = smoothstep(.0, .4, length(n) * 60.);
    col.rgb *= half(1. - .18 * edge * c);
    col.rgb += half3(.07 * c * smoothstep(.7, 1., c));
    return col;
}
