package com.rimikimi.livecamera

import android.graphics.Bitmap
import android.graphics.SurfaceTexture
import android.opengl.GLES11Ext
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.opengl.GLUtils
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

  /** JS 가 넘긴 look 맵 → Look (순수 함수). 미리보기(setLook)와 저장본(renderStill)이 같은 해석을 쓴다. */
  fun parseLook(m: Map<String, Any?>, into: Look = Look()): Look {
    fun f(k: String, d: Float = 0f) = (m[k] as? Number)?.toFloat() ?: d
    fun arr(k: String, n: Int, d: Float = 0f): FloatArray {
      val l = m[k] as? List<*> ?: return FloatArray(n) { d }
      return FloatArray(n) { i -> (l.getOrNull(i) as? Number)?.toFloat() ?: d }
    }
    val l = into
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
    return l
  }

  fun setLook(m: Map<String, Any?>) {
    parseLook(m, look)
    requestRender()
  }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    program = buildProgram(LiveShader.VERT, LiveShader.FRAG)
    beauty.init { v, f -> buildProgram(v, f) }
    stillProgram = 0   // 컨텍스트가 새로 생겼다 — 오프스크린 프로그램은 다음 renderStill 때 다시 만든다
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
    uploadLut(l, lutTex)
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
    bindLook(program, { n -> u(n) }, l, upW, upH, beautyOn, upW0, upH0)

    val aPos = GLES20.glGetAttribLocation(program, "aPos")
    GLES20.glEnableVertexAttribArray(aPos)
    GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(aPos)
  }

  /** LUT 텍스처 올리기(dirty 일 때만). 미리보기는 lutTex, 저장본은 자기 텍스처 — 서로 안 건드린다. */
  private fun uploadLut(l: Look, tex: Int) {
    if (!l.lutDirty) return
    val data = l.lut ?: ByteArray(256 * 4) { i -> if (i % 4 == 3) 255.toByte() else (i / 4).toByte() }
    GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, tex)
    GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, 256, 1, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, ByteBuffer.wrap(data))
    l.lutDirty = false
  }

  /**
   * 필터 유니폼 — 미리보기(onDrawFrame)와 저장본(renderStill)이 같은 함수로 넣는다(값이 어긋나지 않게).
   * upW·upH = 세운 이미지 크기(px). 그레인·모자이크·빛샘 격자는 편집기 미리보기와 같은 "긴 변 1080".
   */
  private fun bindLook(prog: Int, u: (String) -> Int, l: Look, upW: Int, upH: Int, beautyOn: Boolean, texW: Int, texH: Int) {
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
      GLES20.glUniform2f(u("uTexel"), 1f / texW, 1f / texH)
      GLES20.glUniform1f(u("uDetail"), BeautyPass.DETAIL * beauty.faceW)
    } else {
      // 샘플러가 가리키는 유닛을 비워 두지 않는다(드라이버 경고 방지)
      GLES20.glUniform1i(u("uMaskT"), 1); GLES20.glUniform1i(u("uBaseT"), 1); GLES20.glUniform1i(u("uGlowT"), 1)
    }
    GLES20.glUniform1i(u("uLut"), 1)
  }

  // ── 저장본: 찍은 사진에 미리보기와 같은 필터를 오프스크린으로 입힌다 ──────────────
  private var stillProgram = 0
  /** 저장본 인플 작업 격자 긴 변 상한(px) — 6장 × 2048² RGBA ≈ 100MB 까지만 */
  private val STILL_BEAUTY_GRID = 2048
  private val stillLoc = HashMap<String, Int>()
  /** 2D 텍스처용 uTexMat — toBuf 가 (x, 1-y) 를 곱하므로 y 를 되돌려 "위가 0" 좌표가 비트맵 0행이 되게 한다. */
  private val flipMat = floatArrayOf(1f, 0f, 0f, 0f, 0f, -1f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 1f, 0f, 1f)

  /** 이 GL 이 받는 가장 큰 변(텍스처·렌더버퍼 중 작은 쪽). GL 스레드에서. */
  fun maxSide(): Int {
    val a = IntArray(1); val b = IntArray(1)
    GLES20.glGetIntegerv(GLES20.GL_MAX_TEXTURE_SIZE, a, 0)
    GLES20.glGetIntegerv(GLES20.GL_MAX_RENDERBUFFER_SIZE, b, 0)
    val m = minOf(if (a[0] > 0) a[0] else 2048, if (b[0] > 0) b[0] else 2048)
    return m
  }

  /** 저장본 한 장의 GL 자원 — 세 단계(올리기 → 그리기 → 읽기)를 queueEvent 하나씩으로 나눠 사이사이 미리보기 프레임이 그려지게 한다. */
  class StillJob(val w: Int, val h: Int, val look: Look, val faces: List<FloatArray>) {
    val ids = IntArray(3)   // src tex, lut tex, dst tex
    val fb = IntArray(1)
    var beautyOn = false
    var failed = false
  }

  private fun tex2d(id: Int, filter: Int) {
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, id)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, filter)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, filter)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
  }

  /** 미리보기 상태로 되돌린다(프레임버퍼·뷰포트·LUT 재업로드 표시). */
  private fun restorePreview() {
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    GLES20.glViewport(0, 0, viewW, viewH)
    look.lutDirty = true
  }

  /**
   * ① 올리기 — 세워진(+거울 끝난) 비트맵을 텍스처로, LUT·출력 텍스처·FBO 준비. **GL 스레드(queueEvent)에서만.**
   * 미리보기 셰이더와 같은 수식·같은 유니폼(uFill=1, uRot=0, uMirror=0, 격자 긴 변 1080). faces = 인플용 [x,y,w,h](위가 0).
   * 미리보기 상태(look·lutTex)는 건드리지 않는다. 실패하면 null(자원 정리됨).
   */
  fun stillUpload(src: Bitmap, l: Look, faces: List<FloatArray>): StillJob? {
    if (stillProgram == 0) {
      stillProgram = buildProgram(LiveShader.VERT_FLAT, LiveShader.frag(oes = false))
      stillLoc.clear()
      if (stillProgram == 0) return null
    }
    while (GLES20.glGetError() != GLES20.GL_NO_ERROR) { /* 이전 프레임이 남긴 오류 플래그 비우기 */ }
    val job = StillJob(src.width, src.height, l, faces)
    GLES20.glGenTextures(3, job.ids, 0)
    GLES20.glGenFramebuffers(1, job.fb, 0)
    try {
      tex2d(job.ids[0], GLES20.GL_LINEAR)
      GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, src, 0)
      tex2d(job.ids[1], GLES20.GL_NEAREST)
      l.lutDirty = true
      uploadLut(l, job.ids[1])
      tex2d(job.ids[2], GLES20.GL_LINEAR)
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA, job.w, job.h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, null)
      if (GLES20.glGetError() != GLES20.GL_NO_ERROR) { Log.w("LiveCamera", "still: texture alloc failed ${job.w}x${job.h}"); stillRelease(job); return null }
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, job.fb[0])
      GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER, GLES20.GL_COLOR_ATTACHMENT0, GLES20.GL_TEXTURE_2D, job.ids[2], 0)
      if (GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER) != GLES20.GL_FRAMEBUFFER_COMPLETE) {
        Log.w("LiveCamera", "still: FBO incomplete ${job.w}x${job.h}"); stillRelease(job); return null
      }
      return job
    } catch (e: Throwable) {
      Log.w("LiveCamera", "still upload failed", e); stillRelease(job); return null
    } finally {
      restorePreview()
    }
  }

  /** ② 그리기 — 인플이면 BeautyPass(2D 입력) 먼저, 그다음 본 셰이더를 FBO 에. GL 스레드. */
  fun stillDraw(job: StillJob) {
    val l = job.look
    try {
      job.beautyOn = l.preset > 0.5f && l.special.toInt() == 7 &&
        beauty.run(job.ids[0], flipMat, 0f, 0f, job.faces, job.w, job.h, l.intensity, quad, external = false, maxGrid = STILL_BEAUTY_GRID)
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, job.fb[0])
      GLES20.glViewport(0, 0, job.w, job.h)
      GLES20.glClearColor(0f, 0f, 0f, 1f)
      GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)
      GLES20.glUseProgram(stillProgram)
      val su = { n: String -> stillLoc.getOrPut(n) { GLES20.glGetUniformLocation(stillProgram, n) } }
      GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, job.ids[0])
      GLES20.glUniform1i(su("uTex"), 0)
      GLES20.glActiveTexture(GLES20.GL_TEXTURE1)
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, job.ids[1])
      GLES20.glUniformMatrix4fv(su("uTexMat"), 1, false, flipMat, 0)
      GLES20.glUniform2f(su("uFill"), 1f, 1f)
      GLES20.glUniform1f(su("uRot"), 0f)
      GLES20.glUniform1f(su("uMirror"), 0f)
      bindLook(stillProgram, su, l, job.w, job.h, job.beautyOn, job.w, job.h)
      val aPos = GLES20.glGetAttribLocation(stillProgram, "aPos")
      GLES20.glEnableVertexAttribArray(aPos)
      GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, quad)
      GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
      GLES20.glDisableVertexAttribArray(aPos)
      GLES20.glFlush()   // GPU 는 바로 일 시작, 읽기는 다음 이벤트에서(그 사이 미리보기 한 프레임)
    } catch (e: Throwable) {
      Log.w("LiveCamera", "still draw failed", e); job.failed = true
    } finally {
      restorePreview()
    }
  }

  /** ③ 읽기 — glReadPixels → Bitmap, GL 자원 해제. GL 스레드. 실패하면 null. */
  fun stillRead(job: StillJob): Bitmap? {
    var out: Bitmap? = null
    try {
      if (job.failed) return null
      GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, job.fb[0])
      val buf = ByteBuffer.allocateDirect(job.w * job.h * 4).order(ByteOrder.nativeOrder())
      GLES20.glReadPixels(0, 0, job.w, job.h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, buf)
      val err = GLES20.glGetError()
      if (err != GLES20.GL_NO_ERROR) { Log.w("LiveCamera", "still: readPixels error $err"); return null }
      buf.rewind()
      val bmp = Bitmap.createBitmap(job.w, job.h, Bitmap.Config.ARGB_8888)
      bmp.copyPixelsFromBuffer(buf)
      out = bmp
    } catch (e: Throwable) {
      Log.w("LiveCamera", "still read failed", e)
      out?.recycle(); out = null
    } finally {
      restorePreview()
      stillRelease(job)
    }
    return out
  }

  fun stillRelease(job: StillJob) {
    GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER, 0)
    GLES20.glDeleteFramebuffers(1, job.fb, 0)
    GLES20.glDeleteTextures(3, job.ids, 0)
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
