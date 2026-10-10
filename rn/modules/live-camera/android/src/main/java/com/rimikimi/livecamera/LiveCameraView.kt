package com.rimikimi.livecamera

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.opengl.GLSurfaceView
import android.os.Build
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceOrientedMeteringPointFactory
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.Promise
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * 카메라·필터 탭의 뷰파인더(iOS `CameraFilterTab` + `BurstCameraModel` 안드로이드 판).
 *
 *  · 미리보기: CameraX Preview → 우리 SurfaceTexture → GLES 셰이더(LiveShader)로 필터를 입혀 그린다.
 *  · 촬영: ImageCapture(원본). 사진은 **항상 세워서** 저장하고, 전면 + 좌우반전이면 보이는 대로(거울) 저장한다.
 *  · 탭 초점·노출, 길게 = AE/AF 잠금(자동 해제 끔), 노출 보정(±2EV), 줌(배율), 플래시.
 *  · `active=false` 면 카메라를 놓는다(탭을 떠나면 — iOS onDisappear 와 같다).
 */
@SuppressLint("ViewConstructor")
class LiveCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onReady by EventDispatcher()
  private val onCameraError by EventDispatcher()

  private val glView = GLSurfaceView(context)
  val renderer: LiveRenderer

  private var surfaceTexture: SurfaceTexture? = null
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var imageCapture: ImageCapture? = null
  private var preview: Preview? = null

  private var active = false
  private var front = false
  private var mirror = true
  private var flash = false
  private var bound = false
  /** 인플 얼굴 추적 — 분석 프레임을 4장에 한 번만 본다(iOS 와 같은 간격). */
  private val faceExec = Executors.newSingleThreadExecutor()
  private var frameNo = 0

  init {
    renderer = LiveRenderer(
      onSurfaceTexture = { st -> post { surfaceTexture = st; rebind() } },
      requestRender = { glView.requestRender() },
    )
    glView.setEGLContextClientVersion(2)
    glView.preserveEGLContextOnPause = true
    glView.setRenderer(renderer)
    glView.renderMode = GLSurfaceView.RENDERMODE_WHEN_DIRTY
    addView(glView)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    glView.layout(0, 0, right - left, bottom - top)
  }

  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    glView.measure(widthMeasureSpec, heightMeasureSpec)
    super.onMeasure(widthMeasureSpec, heightMeasureSpec)
  }

  // ── props ─────────────────────────────────────────────────────────────
  fun setActive(v: Boolean) {
    if (v == active) return
    active = v
    if (v) { glView.onResume(); rebind() } else { unbind(); glView.onPause() }
  }

  fun setFacing(v: String) {
    val f = v == "front"
    if (f == front) return
    front = f
    applyMirror()
    rebind()
  }

  fun setMirror(v: Boolean) { mirror = v; applyMirror() }

  fun setFlash(v: Boolean) {
    flash = v
    imageCapture?.flashMode = if (v && !front) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
  }

  private fun applyMirror() {
    renderer.mirror = if (front && mirror) 1f else 0f
    glView.requestRender()
  }

  // ── camera ────────────────────────────────────────────────────────────
  private fun unbind() {
    try { provider?.unbindAll() } catch (_: Exception) {}
    camera = null; imageCapture = null; preview = null; bound = false
  }

  private fun rebind() {
    if (!active) return
    val st = surfaceTexture ?: return
    val owner = appContext.currentActivity as? LifecycleOwner ?: return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      try {
        val p = future.get()
        provider = p
        p.unbindAll()
        val selector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
        val rs = ResolutionSelector.Builder().setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY).build()
        val pv = Preview.Builder().setResolutionSelector(rs).setTargetRotation(Surface.ROTATION_0).build()
        pv.setSurfaceProvider(ContextCompat.getMainExecutor(context)) { req ->
          val res: Size = req.resolution
          st.setDefaultBufferSize(res.width, res.height)
          renderer.bufW = res.width; renderer.bufH = res.height
          req.setTransformationInfoListener(ContextCompat.getMainExecutor(context)) { info ->
            renderer.rotation = info.rotationDegrees.toFloat()
            renderer.shaderRotation = if (info.hasCameraTransform()) 0f else info.rotationDegrees.toFloat()
            glView.requestRender()
          }
          val surface = Surface(st)
          req.provideSurface(surface, ContextCompat.getMainExecutor(context)) { surface.release() }
        }
        val ic = ImageCapture.Builder()
          .setResolutionSelector(rs)
          .setTargetRotation(Surface.ROTATION_0)
          .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
          .setFlashMode(if (flash && !front) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF)
          .build()
        // 인플(special 7)일 때만 얼굴을 찾는다 — 작은 RGBA 프레임 → 세움(+거울) → FaceDetector.
        val ia = ImageAnalysis.Builder()
          .setResolutionSelector(rs)
          .setTargetRotation(Surface.ROTATION_0)
          .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
          .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
          .build()
        ia.setAnalyzer(faceExec) { image ->
          try {
            val want = renderer.look.preset > 0.5f && renderer.look.special.toInt() == 7
            if (want && (frameNo++ % 4 == 0)) {
              val raw = image.toBitmap()
              val up = FaceUtil.upright(raw, image.imageInfo.rotationDegrees, renderer.mirror > 0.5f)
              val found = FaceUtil.detect(up)
              if (up !== raw) up.recycle()
              raw.recycle()
              updateFaces(found)
            }
          } catch (e: Throwable) {
            Log.w("LiveCamera", "face analyze: ${e.message}")
          } finally {
            image.close()
          }
        }
        val cam = try { p.bindToLifecycle(owner, selector, pv, ic, ia) } catch (e: Exception) {
          // 세 가지를 한꺼번에 못 묶는 기기 — 얼굴 분석 없이(인플은 원본 그대로 보인다)
          Log.w("LiveCamera", "bind with analysis failed, retry without: ${e.message}")
          p.unbindAll(); p.bindToLifecycle(owner, selector, pv, ic)
        }
        camera = cam; imageCapture = ic; preview = pv; bound = true
        applyMirror()
        sendReady(cam)
      } catch (e: Exception) {
        Log.e("LiveCamera", "bind failed", e)
        onCameraError(mapOf("message" to (e.message ?: e.javaClass.simpleName)))
      }
    }, ContextCompat.getMainExecutor(context))
  }

  @SuppressLint("UnsafeOptInUsageError")
  @androidx.annotation.OptIn(markerClass = [ExperimentalCamera2Interop::class])
  private fun lensStops(cam: Camera, minZ: Float, maxZ: Float): List<Double> {
    if (front) return emptyList()
    val stops = mutableListOf<Double>()
    if (minZ < 0.95f) stops.add(((minZ * 10).roundToInt() / 10.0))
    stops.add(1.0)
    if (maxZ >= 2f) stops.add(2.0)
    // 망원 — 묶인 물리 카메라 중 초점거리가 주 카메라의 2.5배 넘는 게 있으면(기본 카메라처럼 있는 것만)
    try {
      if (Build.VERSION.SDK_INT >= 28) {
        val info = Camera2CameraInfo.from(cam.cameraInfo)
        val mgr = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val main = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.minOrNull()
        val logical = mgr.getCameraCharacteristics(info.cameraId)
        if (main != null && main > 0f) {
          var best = 0f
          for (id in logical.physicalCameraIds) {
            val f = mgr.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.maxOrNull() ?: continue
            val r = f / main
            if (r > 2.5f && r <= maxZ + 0.01f && r > best) best = r
          }
          if (best > 0f) stops.add((best * 10).roundToInt() / 10.0)
        }
      }
    } catch (_: Exception) {}
    return stops
  }

  /** 새 검출 반영 — 놓치면 0.5초 동안 마지막 사각형 유지(깜빡임 방지), 찾으면 가까운 이전 것과 반반 섞어 떨림을 줄인다(iOS 와 같다). */
  private fun updateFaces(found: List<android.graphics.RectF>) {
    if (found.isEmpty()) return
    val old = renderer.faces
    renderer.faces = found.map { f ->
      val n = floatArrayOf(f.left, f.top, f.width(), f.height())
      val prev = old.minByOrNull { o -> Math.hypot((o[0] + o[2] / 2 - (n[0] + n[2] / 2)).toDouble(), (o[1] + o[3] / 2 - (n[1] + n[3] / 2)).toDouble()) }
      if (prev != null && Math.hypot((prev[0] + prev[2] / 2 - (n[0] + n[2] / 2)).toDouble(), (prev[1] + prev[3] / 2 - (n[1] + n[3] / 2)).toDouble()) < n[2] * 0.5) {
        FloatArray(4) { i -> prev[i] + (n[i] - prev[i]) * 0.5f }
      } else n
    }
    renderer.facesAt = System.currentTimeMillis()
    glView.requestRender()
  }

  private fun sendReady(cam: Camera) {
    val zs = cam.cameraInfo.zoomState.value
    val minZ = zs?.minZoomRatio ?: 1f
    val maxZ = zs?.maxZoomRatio ?: 1f
    val ex = cam.cameraInfo.exposureState
    val step = ex.exposureCompensationStep.toFloat()
    val evMin = if (ex.isExposureCompensationSupported) ex.exposureCompensationRange.lower * step else 0f
    val evMax = if (ex.isExposureCompensationSupported) ex.exposureCompensationRange.upper * step else 0f
    onReady(mapOf(
      "minZoom" to minZ.toDouble(),
      "maxZoom" to maxZ.toDouble(),
      "lensStops" to lensStops(cam, minZ, maxZ),
      "evMin" to evMin.toDouble(),
      "evMax" to evMax.toDouble(),
      "front" to front,
    ))
  }

  /** 화면 좌표(뷰 px) → 버퍼 정규 좌표(초점 지점). 셰이더의 toBuf 와 같은 계산. */
  private fun toBuffer(x: Float, y: Float): Pair<Float, Float>? {
    val vw = width.toFloat(); val vh = height.toFloat()
    if (vw <= 0f || vh <= 0f) return null
    val rot = renderer.rotation.toInt()
    val upW = if (rot % 180 == 0) renderer.bufW else renderer.bufH
    val upH = if (rot % 180 == 0) renderer.bufH else renderer.bufW
    val sc = maxOf(vw / upW, vh / upH)
    var u = 0.5f + (x / vw - 0.5f) * (vw / (upW * sc))
    val v = 0.5f + (y / vh - 0.5f) * (vh / (upH * sc))
    if (renderer.mirror > 0.5f) u = 1f - u
    return when {
      rot < 45 -> Pair(u, v)
      rot < 135 -> Pair(v, 1f - u)
      rot < 225 -> Pair(1f - u, 1f - v)
      else -> Pair(1f - v, u)
    }
  }

  fun focus(x: Float, y: Float, lock: Boolean) {
    val cam = camera ?: return
    val (bx, by) = toBuffer(x, y) ?: return
    val pt = SurfaceOrientedMeteringPointFactory(1f, 1f).createPoint(bx.coerceIn(0f, 1f), by.coerceIn(0f, 1f))
    val b = FocusMeteringAction.Builder(pt, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
    if (lock) b.disableAutoCancel() else b.setAutoCancelDuration(5, TimeUnit.SECONDS)
    try {
      cam.cameraControl.setExposureCompensationIndex(0)
      cam.cameraControl.startFocusAndMetering(b.build())
    } catch (_: Exception) {}
  }

  fun setExposure(ev: Float) {
    val cam = camera ?: return
    val ex = cam.cameraInfo.exposureState
    if (!ex.isExposureCompensationSupported) return
    val step = ex.exposureCompensationStep.toFloat()
    if (step <= 0f) return
    val idx = (ev / step).roundToInt().coerceIn(ex.exposureCompensationRange.lower, ex.exposureCompensationRange.upper)
    try { cam.cameraControl.setExposureCompensationIndex(idx) } catch (_: Exception) {}
  }

  fun setZoom(z: Float) {
    val cam = camera ?: return
    val zs = cam.cameraInfo.zoomState.value ?: return
    try { cam.cameraControl.setZoomRatio(z.coerceIn(zs.minZoomRatio, zs.maxZoomRatio)) } catch (_: Exception) {}
  }

  /** 한 장 찍기 — 세워서(+전면 거울이면 거울로) JPEG 로 저장하고 {uri, width, height} 를 돌려준다. */
  fun capture(promise: Promise) {
    val ic = imageCapture ?: run { promise.reject("E_NOT_READY", "camera not ready", null); return }
    val wantMirror = front && mirror
    ic.takePicture(ContextCompat.getMainExecutor(context), object : ImageCapture.OnImageCapturedCallback() {
      override fun onCaptureSuccess(image: ImageProxy) {
        Thread {
          try {
            val buf = image.planes[0].buffer
            val bytes = ByteArray(buf.remaining()); buf.get(bytes)
            val rot = image.imageInfo.rotationDegrees
            image.close()
            var bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            if (rot != 0 || wantMirror) {
              val m = Matrix()
              if (rot != 0) m.postRotate(rot.toFloat())
              if (wantMirror) m.postScale(-1f, 1f)
              val out = Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
              if (out !== bmp) bmp.recycle()
              bmp = out
            }
            val f = File(context.cacheDir, "rimikimi_cam_${System.currentTimeMillis()}.jpg")
            FileOutputStream(f).use { bmp.compress(Bitmap.CompressFormat.JPEG, 95, it) }
            val res = mapOf("uri" to "file://" + f.absolutePath, "width" to bmp.width, "height" to bmp.height)
            bmp.recycle()
            promise.resolve(res)
          } catch (e: Exception) {
            promise.reject("E_CAPTURE", e.message ?: "capture failed", e)
          }
        }.start()
      }

      override fun onError(exception: ImageCaptureException) {
        promise.reject("E_CAPTURE", exception.message ?: "capture failed", exception)
      }
    })
  }

  fun release() {
    unbind()
    glView.queueEvent { renderer.releaseSurface() }
  }

  @Suppress("unused")
  private fun near(a: Float, b: Float) = abs(a - b) < 0.01f
}
