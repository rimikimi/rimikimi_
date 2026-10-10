package com.rimikimi.livecamera

import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/** 지금 고른 필터 — JS(`filters.ts`)가 LUT 와 값들을 계산해 넘긴다. 셰이더 유니폼과 1:1. */
class Look {
  @Volatile var preset = 0f
  @Volatile var special = 0f
  @Volatile var lut: ByteArray? = null      // 256×RGBA (r,g,b = 채널별 LUT)
  @Volatile var lutDirty = true
  @Volatile var bwOn = 0f
  @Volatile var bw = floatArrayOf(0.3f, 0.59f, 0.11f)
  @Volatile var sat = 0f
  @Volatile var vib = 0f
  @Volatile var sh = floatArrayOf(0f, 0f, 0f)
  @Volatile var hi = floatArrayOf(0f, 0f, 0f)
  @Volatile var hslN = 0f
  @Volatile var hslA = FloatArray(16)  // c, w, h, 0 × 4
  @Volatile var hslB = FloatArray(16)  // s, l, 0, 0 × 4
  @Volatile var c1 = floatArrayOf(0f, 0f, 0f)
  @Volatile var c2 = floatArrayOf(255f, 255f, 255f)
  @Volatile var grain = 0f
  @Volatile var vignette = 0f
  @Volatile var leak = 0f
  /** "색감" 슬라이더(0..1) — 0 = 기본 카메라 색, 1 = 프리셋 색 그대로. 효과(그레인 등)는 그대로 남는다. */
  @Volatile var intensity = 1f
}

class LiveRenderer(private val onSurfaceTexture: (SurfaceTexture) -> Unit, private val requestRender: () -> Unit) : GLSurfaceView.Renderer {
  val look = Look()

  // 화면 맞춤(카메라 쪽이 정한다)
  @Volatile var rotation = 90f         // 버퍼를 세우려면 시계방향으로 돌릴 각도(센서 → 화면)
  /**
   * 셰이더가 직접 돌릴 각도. 카메라가 SurfaceTexture 에 바로 쓰면 회전값이 이미 transform matrix 에
   * 들어 있다(CameraX TransformationInfo.hasCameraTransform) — 그때 또 돌리면 90° 누운 화면이 된다
   * (에뮬레이터에서 미리보기만 누워 있고 찍힌 사진은 서 있었다). 그 경우 0.
   */
  @Volatile var shaderRotation = 0f
  @Volatile var mirror = 0f
  @Volatile var bufW = 1920
  @Volatile var bufH = 1080
  @Volatile var viewW = 1
  @Volatile var viewH = 1

  private var program = 0
  private var oesTex = 0
  private var lutTex = 0
  private var st: SurfaceTexture? = null
  private val texMat = FloatArray(16)
  private val quad: FloatBuffer = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply {
    put(floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)); position(0)
  }
  private val loc = HashMap<String, Int>()
  private val beauty = BeautyPass()
  /** 인플 얼굴(정규화 [x,y,w,h], 세운 화면 좌표·위가 0) — 카메라 분석 스레드가 넣는다. 0.5초 지나면 버린다. */
  @Volatile var faces: List<FloatArray> = emptyList()
  @Volatile var facesAt = 0L

  fun setLook(m: Map<String, Any?>) {
    fun f(k: String, d: Float = 0f) = (m[k] as? Number)?.toFloat() ?: d
    fun arr(k: String, n: Int, d: Float = 0f): FloatArray {
      val l = m[k] as? List<*> ?: return FloatArray(n) { d }
      return FloatArray(n) { i -> (l.getOrNull(i) as? Number)?.toFloat() ?: d }
    }
    val l = look
    l.preset = f("preset")
    l.special = f("special")
    (m["lut"] as? List<*>)?.let { src ->
      val b = ByteArray(256 * 4)
      for (i in 0 until 256) {
        b[i * 4] = ((src.getOrNull(i) as? Number)?.toInt() ?: i).toByte()
        b[i * 4 + 1] = ((src.getOrNull(256 + i) as? Number)?.toInt() ?: i).toByte()
        b[i * 4 + 2] = ((src.getOrNull(512 + i) as? Number)?.toInt() ?: i).toByte()
        b[i * 4 + 3] = 255.toByte()
      }
      l.lut = b; l.lutDirty = true
    }
    l.bwOn = f("bwOn"); l.bw = arr("bw", 3)
    l.sat = f("sat"); l.vib = f("vib")
    l.sh = arr("sh", 3); l.hi = arr("hi", 3)
    val bands = m["hsl"] as? List<*> ?: emptyList<Any>()
    val a = FloatArray(16); val bb = FloatArray(16)
    var n = 0
    for (band in bands.take(4)) {
      val v = band as? List<*> ?: continue
      fun g(i: Int) = (v.getOrNull(i) as? Number)?.toFloat() ?: 0f
      a[n * 4] = g(0); a[n * 4 + 1] = g(1); a[n * 4 + 2] = g(2)
      bb[n * 4] = g(3); bb[n * 4 + 1] = g(4)
      n++
    }
    l.hslA = a; l.hslB = bb; l.hslN = n.toFloat()
    l.c1 = arr("c1", 3); l.c2 = arr("c2", 3, 255f)
    l.grain = f("grain"); l.vignette = f("vignette"); l.leak = f("leak")
    requestRender()
  }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    program = buildProgram(LiveShader.VERT, LiveShader.FRAG)
    beauty.init { v, f -> buildProgram(v, f) }
    val t = IntArray(2)
    GLES20.glGenTextures(2, t, 0)
    oesTex = t[0]; lutTex = t[1]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lutTex)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_NEAREST)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_NEAREST)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    look.lutDirty = true
    loc.clear()
    val s = SurfaceTexture(oesTex)
    s.setOnFrameAvailableListener { requestRender() }
    st?.release()
    st = s
    onSurfaceTexture(s)
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    GLES20.glViewport(0, 0, width, height)
    viewW = width; viewH = height
  }

  private fun u(name: String): Int = loc.getOrPut(name) { GLES20.glGetUniformLocation(program, name) }

  override fun onDrawFrame(gl: GL10?) {
    val s = st ?: return
    try { s.updateTexImage() } catch (e: Exception) { return }
    s.getTransformMatrix(texMat)
    if (program == 0) return
    val l0 = look
    val rot0 = rotation
    val upW0 = if (rot0.toInt() % 180 == 0) bufW else bufH
    val upH0 = if (rot0.toInt() % 180 == 0) bufH else bufW
    val fs = if (System.currentTimeMillis() - facesAt < 500) faces else emptyList()
    val beautyOn = l0.preset > 0.5f && l0.special.toInt() == 7 &&
      beauty.run(oesTex, texMat, shaderRotation, mirror, fs, upW0, upH0, l0.intensity, quad)
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    GLES20.glViewport(0, 0, viewW, viewH)
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
    GLES20.glUseProgram(program)

    val l = look
    if (l.lutDirty) {
      val data = l.lut ?: ByteArray(256 * 4) { i -> if (i % 4 == 3) 255.toByte() else (i / 4).toByte() }
      GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lutTex)
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, 256, 1, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, ByteBuffer.wrap(data))
      l.lutDirty = false
    }
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oesTex)
    GLES20.glUniform1i(u("uTex"), 0)
    GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, lutTex)
    GLES20.glUniform1i(u("uLut"), 1)
    GLES20.glUniformMatrix4fv(u("uTexMat"), 1, false, texMat, 0)

    // 화면 꽉 채우기(aspect fill) — 세운 이미지 기준으로 보이는 몫
    val rot = rotation
    val upW = if (rot.toInt() % 180 == 0) bufW else bufH
    val upH = if (rot.toInt() % 180 == 0) bufH else bufW
    val sc = maxOf(viewW.toFloat() / upW, viewH.toFloat() / upH)
    val fx = viewW / (upW * sc)
    val fy = viewH / (upH * sc)
    GLES20.glUniform2f(u("uFill"), fx, fy)
    GLES20.glUniform1f(u("uRot"), shaderRotation)
    GLES20.glUniform1f(u("uMirror"), mirror)
    // 편집기 미리보기와 같은 격자(긴 변 1080) — 그레인·모자이크 크기가 편집기와 비슷하게 보이도록
    val k = 1080f / maxOf(upW, upH)
    GLES20.glUniform2f(u("uImg"), upW * k, upH * k)

    GLES20.glUniform1f(u("uPreset"), l.preset)
    GLES20.glUniform1f(u("uSpecial"), l.special)
    GLES20.glUniform1f(u("uBwOn"), l.bwOn)
    GLES20.glUniform3fv(u("uBw"), 1, l.bw, 0)
    GLES20.glUniform1f(u("uSat"), l.sat)
    GLES20.glUniform1f(u("uVib"), l.vib)
    GLES20.glUniform3fv(u("uSh"), 1, l.sh, 0)
    GLES20.glUniform3fv(u("uHi"), 1, l.hi, 0)
    GLES20.glUniform1f(u("uHslN"), l.hslN)
    GLES20.glUniform4fv(u("uHslA"), 4, l.hslA, 0)
    GLES20.glUniform4fv(u("uHslB"), 4, l.hslB, 0)
    GLES20.glUniform3fv(u("uC1"), 1, l.c1, 0)
    GLES20.glUniform3fv(u("uC2"), 1, l.c2, 0)
    GLES20.glUniform1f(u("uGrain"), l.grain)
    GLES20.glUniform1f(u("uVig"), l.vignette)
    GLES20.glUniform1f(u("uLeak"), l.leak)
    GLES20.glUniform1f(u("uIntensity"), l.intensity)
    GLES20.glUniform1f(u("uBeauty"), if (beautyOn) 1f else 0f)
    if (beautyOn) {
      GLES20.glActiveTexture(GLES20.GL_TEXTURE2); GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, beauty.maskTex); GLES20.glUniform1i(u("uMaskT"), 2)
      GLES20.glActiveTexture(GLES20.GL_TEXTURE3); GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, beauty.baseTex); GLES20.glUniform1i(u("uBaseT"), 3)
      GLES20.glActiveTexture(GLES20.GL_TEXTURE4); GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, beauty.glowTex); GLES20.glUniform1i(u("uGlowT"), 4)
      GLES20.glUniform2f(u("uTexel"), 1f / upW0, 1f / upH0)
      GLES20.glUniform1f(u("uDetail"), BeautyPass.DETAIL * beauty.faceW)
    } else {
      // 샘플러가 가리키는 유닛을 비워 두지 않는다(드라이버 경고 방지)
      GLES20.glUniform1i(u("uMaskT"), 1); GLES20.glUniform1i(u("uBaseT"), 1); GLES20.glUniform1i(u("uGlowT"), 1)
    }

    val aPos = GLES20.glGetAttribLocation(program, "aPos")
    GLES20.glEnableVertexAttribArray(aPos)
    GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(aPos)
  }

  fun releaseSurface() {
    st?.release(); st = null
  }

  private fun compile(type: Int, src: String): Int {
    val sh = GLES20.glCreateShader(type)
    GLES20.glShaderSource(sh, src)
    GLES20.glCompileShader(sh)
    val ok = IntArray(1)
    GLES20.glGetShaderiv(sh, GLES20.GL_COMPILE_STATUS, ok, 0)
    if (ok[0] == 0) {
      Log.e("LiveCamera", "shader compile: " + GLES20.glGetShaderInfoLog(sh))
      GLES20.glDeleteShader(sh)
      return 0
    }
    return sh
  }

  internal fun buildProgram(v: String, f: String): Int {
    val vs = compile(GLES20.GL_VERTEX_SHADER, v)
    val fs = compile(GLES20.GL_FRAGMENT_SHADER, f)
    if (vs == 0 || fs == 0) return 0
    val p = GLES20.glCreateProgram()
    GLES20.glAttachShader(p, vs); GLES20.glAttachShader(p, fs)
    GLES20.glLinkProgram(p)
    val ok = IntArray(1)
    GLES20.glGetProgramiv(p, GLES20.GL_LINK_STATUS, ok, 0)
    if (ok[0] == 0) {
      Log.e("LiveCamera", "program link: " + GLES20.glGetProgramInfoLog(p))
      return 0
    }
    return p
  }
}
