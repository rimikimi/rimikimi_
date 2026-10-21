package com.rimikimi.livecamera

import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * 카메라·필터 탭 — CameraX 프레임을 GLES 셰이더로 실시간 필터링해 그린다(iOS `LiveFilterPreview` +
 * `BurstCameraModel` 의 안드로이드 판). 필터 수식은 웹 `src/filters.js` 를 셰이더로 옮겼다
 * (`LiveShader.kt`). 찍은 사진은 원본 그대로 편집기(웹뷰)로 넘어가 filters.js 가 다시 입히고(iOS 와 같은 구조),
 * 사진첩 저장본은 `renderStill` 로 같은 셰이더를 오프스크린에 돌려 보던 그대로 굽는다.
 */
class LiveCameraModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LiveCamera")

    // 인플 — 저장된 사진의 얼굴 사각형(정규화 [x,y,w,h], 위가 0). 편집기 payload `faces` 로 넘긴다(iOS FaceRects).
    AsyncFunction("detectFaces") { uri: String ->
      val ctx = appContext.reactContext ?: return@AsyncFunction emptyList<List<Double>>()
      FaceUtil.detectUri(ctx, uri)
    }

    View(LiveCameraView::class) {
      Events("onReady", "onCameraError", "onFirstFrame")

      Prop("active") { view: LiveCameraView, v: Boolean -> view.setActive(v) }
      Prop("facing") { view: LiveCameraView, v: String -> view.setFacing(v) }
      Prop("mirror") { view: LiveCameraView, v: Boolean -> view.setMirror(v) }
      Prop("flash") { view: LiveCameraView, v: Boolean -> view.setFlash(v) }
      Prop("intensity") { view: LiveCameraView, v: Double -> view.renderer.look.intensity = v.toFloat() }
      Prop("look") { view: LiveCameraView, v: Map<String, Any?> -> view.renderer.setLook(v) }

      AsyncFunction("capture") { view: LiveCameraView, promise: Promise -> view.capture(promise) }
      // 찍은 사진에 미리보기와 같은 필터를 입힌 저장본 — look = JS lookFor(presetKey), intensity = 색감 슬라이더
      AsyncFunction("renderStill") { view: LiveCameraView, uri: String, look: Map<String, Any?>, intensity: Double, promise: Promise ->
        view.renderStill(uri, look, intensity.toFloat(), promise)
      }
      AsyncFunction("focus") { view: LiveCameraView, x: Double, y: Double, lock: Boolean -> view.focus(x.toFloat(), y.toFloat(), lock) }
      AsyncFunction("setExposure") { view: LiveCameraView, ev: Double -> view.setExposure(ev.toFloat()) }
      AsyncFunction("setZoom") { view: LiveCameraView, z: Double -> view.setZoom(z.toFloat()) }

      OnViewDestroys { view: LiveCameraView -> view.release() }
    }
  }
}
