package com.rimikimi.livecamera

import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.util.Log
import java.nio.FloatBuffer
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * 인플(뷰티) 미리보기 — filters.js `beautyRGBA` / iOS `LiveFilterEngine.beauty` 와 같은 단계를 GLES 2.0 FBO 로.
 *   ① 작업 격자(얼굴 폭 140칸)로 면적 평균 축소  ② 마스크 = 피부색 × 얼굴 타원 → 가우시안 페더
 *   ③ bilateral(9×9 탭)  ④ 글로우 원천(base-150) → 가우시안
 * 마지막 합성(고주파 되돌림·밝게·붉은기 빼기·글로우)은 화면 셰이더(LiveShader, special 7)가 이 텍스처들을 읽어 한다.
 * 격자는 **세운 버퍼 좌표**(위가 0) 전체를 덮는다 — 화면 uv(up)를 그대로 격자 uv 로 쓴다.
 * 상수는 filters.js INFL / LiveFilter.Infl 와 같다(값 바꾸면 셋 다).
 */
class BeautyPass {
  companion object {
    const val CY = 0.45f; const val RX = 0.56f; const val RY = 0.74f
    const val WORK = 140f
    const val SIG_S = 0.044f; const val DETAIL = 0.0013f; const val FEATHER = 1f / 60f; const val GLOW_S = 0.032f
    // 인플 v2(e243434) — 톤(밝기·홍조·글로우)은 목·귀·이마 피부까지 넓은 타원. 스무딩은 얼굴만.
    const val TCY = 0.75f; const val TRX = 1.0f; const val TRY = 1.35f
    const val SMOOTH = 0.7f; const val LIFT = 0.07f; const val RED = 0.14f; const val GLOW = 0.22f

    private const val COMMON = """
precision highp float;
varying vec2 vUv;
float ss(float a, float b, float x) { return smoothstep(a, b, x); }
float skin(vec3 c) {
  float Y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
  float cr = (c.r - Y) * 0.713 + 128.0, cb = (c.b - Y) * 0.564 + 128.0;
  return ss(36.0, 44.0, Y) * ss(129.0, 137.0, cr) * (1.0 - ss(174.0, 182.0, cr)) * ss(73.0, 81.0, cb) * (1.0 - ss(126.0, 134.0, cb));
}
vec4 samp(sampler2D t, vec2 up) { return texture2D(t, vec2(up.x, 1.0 - up.y)); }
"""
    // ① 축소 — 화면 셰이더와 같은 toBuf 로 OES 를 읽는다
    private const val DOWN = """
#extension GL_OES_EGL_image_external : require
""" + COMMON + """
uniform samplerExternalOES uTex;
uniform mat4 uTexMat;
uniform float uRot;
uniform float uMirror;
uniform vec2 uCell;   // 칸 크기(up 단위)
uniform float uN;
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
void main() {
  vec2 o = vUv - 0.5 * uCell;
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 4; j++) for (int i = 0; i < 4; i++) {
    if (float(i) >= uN || float(j) >= uN) continue;
    acc += texture2D(uTex, toBuf(o + (vec2(float(i), float(j)) + 0.5) * (uCell / uN))).rgb;
  }
  gl_FragColor = vec4(acc / (uN * uN), 1.0);
}
"""
    // ② 마스크 — r = 스무딩(피부 × 얼굴 타원), g = 톤(피부 × 목·귀까지 넓은 타원). 세운 버퍼 픽셀, 위가 0
    private const val MASK = COMMON + """
uniform sampler2D uSmall;
uniform vec2 uImg;      // 세운 버퍼 크기(px)
uniform vec4 uE[3];
uniform vec4 uT[3];
uniform float uCount;
void main() {
  vec2 X = vUv * uImg;
  float reg = 0.0, treg = 0.0;
  for (int k = 0; k < 3; k++) {
    if (float(k) >= uCount) break;
    vec2 d = (X - uE[k].xy) / uE[k].zw;
    reg = max(reg, 1.0 - ss(0.35, 1.0, dot(d, d)));
    vec2 dt = (X - uT[k].xy) / uT[k].zw;
    treg = max(treg, 1.0 - ss(0.45, 1.0, dot(dt, dt)));
  }
  float sk = skin(samp(uSmall, vUv).rgb * 255.0);
  gl_FragColor = vec4(reg * sk, treg * sk, 0.0, 1.0);
}
"""
    // 분리형 가우시안 한 방향 — 반경 최대 32칸
    private const val GAUSS = COMMON + """
uniform sampler2D uSrc;
uniform vec2 uStep;     // 한 칸(up 단위) × 방향
uniform float uSigma;
void main() {
  float R = min(32.0, ceil(uSigma * 3.0));
  vec4 acc = vec4(0.0); float ws = 0.0;
  for (int ii = -32; ii <= 32; ii++) {
    float i = float(ii);
    if (abs(i) > R) continue;
    float w = exp(-(i * i) / (2.0 * uSigma * uSigma));
    acc += samp(uSrc, clamp(vUv + uStep * i, 0.0, 1.0)) * w; ws += w;
  }
  gl_FragColor = acc / ws;
}
"""
    // ③ bilateral — 9×9 탭(반경 R 4등분), 색 거리 = RGB 합
    private const val BILAT = COMMON + """
uniform sampler2D uSmall;
uniform sampler2D uMask;
uniform vec2 uCellUv;
uniform float uSigS;
uniform float uR;
uniform float uSigC;
void main() {
  vec4 c = samp(uSmall, vUv);
  if (samp(uMask, vUv).r < 0.002) { gl_FragColor = c; return; }
  vec3 c0 = c.rgb * 255.0;
  float is2 = 1.0 / (2.0 * uSigS * uSigS), ic2 = 1.0 / (2.0 * uSigC * uSigC);
  vec3 acc = vec3(0.0); float aw = 0.0;
  for (int ty = -4; ty <= 4; ty++) {
    float oy = floor(float(ty) * uR / 4.0 + 0.5);
    for (int tx = -4; tx <= 4; tx++) {
      float ox = floor(float(tx) * uR / 4.0 + 0.5);
      vec3 q = samp(uSmall, clamp(vUv + vec2(ox, oy) * uCellUv, 0.0, 1.0)).rgb * 255.0;
      vec3 dd = abs(q - c0);
      float d = dd.r + dd.g + dd.b;
      float w = exp(-(ox * ox + oy * oy) * is2 - d * d * ic2);
      acc += q * w; aw += w;
    }
  }
  gl_FragColor = vec4(acc / aw / 255.0, 1.0);
}
"""
    // ④ 글로우 원천 — 밝은 부분만
    private const val HI = COMMON + """
uniform sampler2D uBase;
void main() {
  vec3 v = samp(uBase, vUv).rgb * 255.0;
  gl_FragColor = vec4(max(vec3(0.0), v - 150.0) / 255.0, 1.0);
}
"""
  }

  private var progDown = 0; private var progMask = 0; private var progGauss = 0; private var progBilat = 0; private var progHi = 0
  private val tex = IntArray(6)   // small, mask, tmp, base, hi, glow
  private val fbo = IntArray(6)
  private var gw = 0; private var gh = 0
  var ready = false; private set
  /** 화면 셰이더용 */
  val maskTex get() = tex[1]
  val baseTex get() = tex[3]
  val glowTex get() = tex[5]
  var scale = 1f; private set
  var faceW = 0f; private set

  fun init(build: (String, String) -> Int) {
    progDown = build(LiveShader.VERT, DOWN)
    progMask = build(LiveShader.VERT, MASK)
    progGauss = build(LiveShader.VERT, GAUSS)
    progBilat = build(LiveShader.VERT, BILAT)
    progHi = build(LiveShader.VERT, HI)
    GLES20.glGenTextures(6, tex, 0)
    GLES20.glGenFramebuffers(6, fbo, 0)
    gw = 0; gh = 0
    ready = progDown != 0 && progMask != 0 && progGauss != 0 && progBilat != 0 && progHi != 0
    if (!ready) Log.e("LiveCamera", "beauty programs failed")
  }

  private fun ensure(w: Int, h: Int) {
    if (w == gw && h == gh) return
    gw = w; gh = h
    for (i in 0 until 6) {
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex[i])
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo[i])
      GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, tex[i], 0)
    }
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
  }

  private fun draw(prog: Int, target: Int, quad: FloatBuffer) {
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, fbo[target])
    GLES20.glViewport(0, 0, gw, gh)
    val a = GLES20.glGetAttribLocation(prog, "aPos")
    GLES20.glEnableVertexAttribArray(a)
    GLES20.glVertexAttribPointer(a, 2, GLES20.GL_FLOAT, false, 0, quad)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(a)
  }

  private fun bindTex(prog: Int, name: String, unit: Int, t: Int) {
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0 + unit)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, t)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(prog, name), unit)
  }

  private fun gauss(src: Int, tmp: Int, dst: Int, sigma: Float, quad: FloatBuffer) {
    if (sigma < 0.3f) { copy(src, dst, quad); return }
    GLES20.glUseProgram(progGauss)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progGauss, "uSigma"), sigma)
    bindTex(progGauss, "uSrc", 2, tex[src])
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progGauss, "uStep"), 1f / gw, 0f)
    draw(progGauss, tmp, quad)
    bindTex(progGauss, "uSrc", 2, tex[tmp])
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progGauss, "uStep"), 0f, 1f / gh)
    draw(progGauss, dst, quad)
  }

  private fun copy(src: Int, dst: Int, quad: FloatBuffer) {
    GLES20.glUseProgram(progGauss)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progGauss, "uSigma"), 0.01f)
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progGauss, "uStep"), 0f, 0f)
    bindTex(progGauss, "uSrc", 2, tex[src])
    draw(progGauss, dst, quad)
  }

  /**
   * 한 프레임 — faces: 정규화 [x,y,w,h](세운 화면 좌표, 위가 0). upW·upH = 세운 버퍼 크기.
   * 끝나면 기본 프레임버퍼로 돌려놓는다(뷰포트는 호출부가 다시 잡는다).
   */
  fun run(oes: Int, texMat: FloatArray, rot: Float, mirror: Float, faces: List<FloatArray>, upW: Int, upH: Int, a: Float, quad: FloatBuffer): Boolean {
    if (!ready || faces.isEmpty()) return false
    val F = faces.take(3).map { floatArrayOf(it[0] * upW, it[1] * upH, it[2] * upW, it[3] * upH) }
    val fw = F.maxOf { it[2] }
    if (fw < 8f) return false
    val s = min(1f, WORK / fw)
    scale = s; faceW = fw
    ensure(max(1, ceil(upW * s).toInt()), max(1, ceil(upH * s).toInt()))

    // ① 축소
    GLES20.glUseProgram(progDown)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes)
    GLES20.glUniform1i(GLES20.glGetUniformLocation(progDown, "uTex"), 0)
    GLES20.glUniformMatrix4fv(GLES20.glGetUniformLocation(progDown, "uTexMat"), 1, false, texMat, 0)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progDown, "uRot"), rot)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progDown, "uMirror"), mirror)
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progDown, "uCell"), 1f / gw, 1f / gh)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progDown, "uN"), min(4f, ceil(1f / s)))
    draw(progDown, 0, quad)

    // ② 마스크 → 페더
    GLES20.glUseProgram(progMask)
    bindTex(progMask, "uSmall", 1, tex[0])
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progMask, "uImg"), upW.toFloat(), upH.toFloat())
    val e = FloatArray(12); val t = FloatArray(12)
    for (i in 0 until 3) {
      if (i < F.size) {
        val f = F[i]
        e[i * 4] = f[0] + f[2] / 2f; e[i * 4 + 1] = f[1] + CY * f[3]; e[i * 4 + 2] = RX * f[2]; e[i * 4 + 3] = RY * f[3]
        t[i * 4] = f[0] + f[2] / 2f; t[i * 4 + 1] = f[1] + TCY * f[3]; t[i * 4 + 2] = TRX * f[2]; t[i * 4 + 3] = TRY * f[3]
      } else {
        e[i * 4] = -1e6f; e[i * 4 + 1] = -1e6f; e[i * 4 + 2] = 1f; e[i * 4 + 3] = 1f
        t[i * 4] = -1e6f; t[i * 4 + 1] = -1e6f; t[i * 4 + 2] = 1f; t[i * 4 + 3] = 1f
      }
    }
    GLES20.glUniform4fv(GLES20.glGetUniformLocation(progMask, "uE"), 3, e, 0)
    GLES20.glUniform4fv(GLES20.glGetUniformLocation(progMask, "uT"), 3, t, 0)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progMask, "uCount"), F.size.toFloat())
    draw(progMask, 2, quad)
    gauss(2, 4, 1, FEATHER * 2.5f * fw * s, quad)

    // ③ bilateral
    GLES20.glUseProgram(progBilat)
    bindTex(progBilat, "uSmall", 1, tex[0])
    bindTex(progBilat, "uMask", 3, tex[1])
    val sigS = SIG_S * fw * s
    GLES20.glUniform2f(GLES20.glGetUniformLocation(progBilat, "uCellUv"), 1f / gw, 1f / gh)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progBilat, "uSigS"), sigS)
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progBilat, "uR"), max(1f, ceil(1.5f * sigS)))
    GLES20.glUniform1f(GLES20.glGetUniformLocation(progBilat, "uSigC"), 22f + 18f * a)
    draw(progBilat, 3, quad)

    // ④ 글로우 원천 → 번지기
    GLES20.glUseProgram(progHi)
    bindTex(progHi, "uBase", 1, tex[3])
    draw(progHi, 4, quad)
    gauss(4, 2, 5, GLOW_S * fw * s, quad)

    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    return true
  }
}
