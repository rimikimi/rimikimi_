package com.rimikimi.livecamera

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.PointF
import android.graphics.RectF
import android.media.FaceDetector
import android.net.Uri
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * 인플(뷰티)용 얼굴 사각형 — 안드로이드 기본 `android.media.FaceDetector`(새 의존성 없음).
 * ML Kit 는 Play Services/모델 다운로드가 붙어 무겁고, 우리는 사각형 하나면 된다.
 *
 * 이 검출기는 눈 사이 가운데점 + 눈 사이 거리만 준다 → iOS Vision 얼굴 사각형(눈썹~턱)과 같은 틀로 환산한다
 * (filters.js INFL 의 cy·rx·ry 가 그 틀 기준이라 틀이 같아야 타원이 얼굴에 맞는다).
 *   폭 = 높이 = 2.3 × 눈 사이 거리, 눈 높이 = 사각형 위에서 36%  (예제 사진으로 Vision 상자와 맞춘 값)
 * 결과: 정규화 [x, y, w, h], **위가 0** (편집기 payload `faces` 와 같은 모양), 큰 얼굴부터 최대 3개.
 */
object FaceUtil {
  private const val BOX_PER_EYE = 2.3f
  private const val EYE_FROM_TOP = 0.36f

  fun detect(src: Bitmap): List<RectF> {
    val k = minOf(1f, 640f / max(src.width, src.height))
    var w = (src.width * k).roundToInt().coerceAtLeast(2)
    if (w % 2 == 1) w -= 1 // FaceDetector 는 짝수 폭만 받는다
    val h = (src.height * k).roundToInt().coerceAtLeast(2)
    val small = Bitmap.createBitmap(w, h, Bitmap.Config.RGB_565)
    Canvas(small).drawBitmap(src, null, android.graphics.Rect(0, 0, w, h), null)
    val found = arrayOfNulls<FaceDetector.Face>(3)
    val n = try { FaceDetector(w, h, 3).findFaces(small, found) } catch (_: Throwable) { 0 }
    small.recycle()
    val out = mutableListOf<RectF>()
    val mid = PointF()
    for (i in 0 until n) {
      val f = found[i] ?: continue
      if (f.confidence() < 0.3f) continue
      f.getMidPoint(mid)
      val bw = f.eyesDistance() * BOX_PER_EYE
      val x = (mid.x - bw / 2f) / w
      val y = (mid.y - bw * EYE_FROM_TOP) / h
      out.add(RectF(x, y, x + bw / w, y + bw / h))
    }
    return out.sortedByDescending { it.width() }.take(3)
  }

  fun toList(r: List<RectF>): List<List<Double>> =
    r.map { listOf(it.left.toDouble(), it.top.toDouble(), it.width().toDouble(), it.height().toDouble()) }

  /** 저장된 사진(file:// 또는 content://)에서 — 이미 세워서 저장한 사진이라 회전은 없다. */
  fun detectUri(ctx: Context, uri: String): List<List<Double>> {
    val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
    val bmp = try {
      if (uri.startsWith("content://")) ctx.contentResolver.openInputStream(Uri.parse(uri))?.use { BitmapFactory.decodeStream(it, null, sampled(ctx, uri)) }
      else BitmapFactory.decodeFile(uri.removePrefix("file://"), sampledFile(uri.removePrefix("file://")))
    } catch (_: Throwable) { null } ?: return emptyList()
    val r = detect(bmp)
    bmp.recycle()
    return toList(r)
  }

  private fun sampledFile(path: String): BitmapFactory.Options {
    val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, b)
    return BitmapFactory.Options().apply { inSampleSize = sample(b.outWidth, b.outHeight) }
  }

  private fun sampled(ctx: Context, uri: String): BitmapFactory.Options {
    val b = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    try { ctx.contentResolver.openInputStream(Uri.parse(uri))?.use { BitmapFactory.decodeStream(it, null, b) } } catch (_: Throwable) {}
    return BitmapFactory.Options().apply { inSampleSize = sample(b.outWidth, b.outHeight) }
  }

  private fun sample(w: Int, h: Int): Int {
    var s = 1
    while (max(w, h) / (s * 2) >= 640) s *= 2
    return s
  }

  /** 카메라 분석 프레임 → 세운(+거울) 비트맵. */
  fun upright(bmp: Bitmap, rotation: Int, mirror: Boolean): Bitmap {
    if (rotation == 0 && !mirror) return bmp
    val m = Matrix()
    if (rotation != 0) m.postRotate(rotation.toFloat())
    if (mirror) m.postScale(-1f, 1f)
    return Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, m, true)
  }
}
