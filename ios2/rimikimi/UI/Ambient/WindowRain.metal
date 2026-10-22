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

static float2 Drops(float2 uv, float t, float l0, float l1, float l2) {
    float s = StaticDrops(uv, t) * l0;
    float2 m1 = DropLayer(uv, t) * l1;
    float2 m2 = DropLayer(uv * 1.85, t) * l2;
    float c = s + m1.x + m2.x;
    c = smoothstep(.3, 1., c);
    return float2(c, max(m1.y * l0, m2.y * l1));
}

[[ stitchable ]] half4 windowRain(float2 pos, SwiftUI::Layer layer, float2 size, float t, float amount, float2 down, float seed) {
    // 화면 비율 보정 좌표(짧은 변 기준) — 카드마다 다르게 보이도록 위치로 시간 오프셋
    float2 uv = (pos - size * .5) / size.y;
    // 중력 방향으로 회전: down = 화면 좌표의 아래 방향(단위벡터). 기본 (0,1).
    float ang = atan2(down.x, down.y);
    float cs = cos(ang), sn = sin(ang);
    uv = float2(cs * uv.x - sn * uv.y, sn * uv.x + cs * uv.y);
    uv.y = -uv.y;                               // 셰이더 원본은 위쪽이 +y
    uv += float2(seed * 3.17, seed * 1.73);     // 카드마다 다른 무늬
    float T = t * .2;
    float rain = clamp(amount, 0., 1.);
    float staticDrops = smoothstep(-.5, 1., rain) * 2.;
    float l1 = smoothstep(.25, .75, rain);
    float l2 = smoothstep(.0, .5, rain);
    float2 c = Drops(uv * .9, T, staticDrops, l1, l2);
    // 법선(굴절) — 주변 차분
    float2 e = float2(.001, 0.);
    float cx = Drops(uv * .9 + e, T, staticDrops, l1, l2).x;
    float cy = Drops(uv * .9 + e.yx, T, staticDrops, l1, l2).x;
    float2 n = float2(cx - c.x, cy - c.x);
    // 굴절된 장면 — 물방울 안은 장면이 휘어 보이고, 자국은 아주 옅게
    float2 off = n * size.y * 1.6;
    off = float2(cs * off.x + sn * off.y, -sn * off.x + cs * off.y);   // 회전 되돌림
    off.y = -off.y;
    half4 col = layer.sample(pos + off);
    // 방울 테두리 살짝 어둡게·반사광
    float edge = smoothstep(.0, .4, length(n) * 60.);
    col.rgb *= half(1. - .18 * edge * c.x);
    col.rgb += half3(.12 * c.x * smoothstep(.6, 1., c.x));
    return col;
}
