import SwiftUI
import AVFoundation
import CoreImage
import Metal
import QuartzCore

/// 카메라 탭 실시간 필터 미리보기 — 카메라 프레임(`AVCaptureVideoDataOutput`)을 받아
/// `LiveFilterEngine` 으로 고른 필터를 입히고 `CAMetalLayer` 에 바로 그린다(오너 지시 2026-10-09).
///
/// 받기·입히기·그리기를 전부 프레임 큐 한 곳에서 한다. GPU 가 밀리면 `nextDrawable()` 이 잠깐
/// 기다려 속도가 저절로 맞춰지고, 그사이 들어온 늦은 프레임은 출력 쪽에서 버린다
/// (`alwaysDiscardsLateVideoFrames`). 촬영(사진 출력)과는 상관없다 — 찍은 사진은 지금처럼
/// 원본 + 고른 필터 키로 편집기에 넘어간다.
final class LiveFilterRenderer: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let queue = DispatchQueue(label: "livefilter.frames", qos: .userInteractive)

    private let srgb = CGColorSpace(name: CGColorSpace.sRGB)

    // 메인(칩 탭·레이아웃)에서 쓰고 프레임 큐에서 읽는 값 — 잠금으로 넘긴다
    private let lock = NSLock()
    private var _presetKey = "none"
    private weak var _layer: CAMetalLayer?
    private var _drawableSize: CGSize = .zero

    // 프레임 큐 전용 — 화면에 붙을 때(attach) 만든다. `@State` 모델은 뷰가 다시 만들어질 때마다
    // 버려지는 사본이 생기므로, 무거운 준비(GPU 큐·커널 컴파일)는 실제로 화면에 붙은 것만 한다.
    private var commandQueue: MTLCommandQueue?
    private var context: CIContext?
    private var engine: LiveFilterEngine?

    private var _wantMirrored = false
    /// 프레임 연결이 지켜야 할 거울 여부(모델이 정한다). 연결이 새로 생겨 설정이 빠지면 프레임에서 바로잡는다.
    var wantMirrored: Bool {
        get { lock.withLock { _wantMirrored } }
        set { lock.withLock { _wantMirrored = newValue } }
    }

    /// 지금 고른 필터 키. "none"·모르는 키 = 원본 그대로.
    var presetKey: String {
        get { lock.withLock { _presetKey } }
        set { lock.withLock { _presetKey = newValue } }
    }

    func attach(_ layer: CAMetalLayer) {
        let device = layer.device ?? MTLCreateSystemDefaultDevice()
        layer.device = device
        lock.withLock { _layer = layer }
        // 커널 컴파일(첫 사용 때 수십 ms)을 첫 프레임 전에 미리. 실패하면 원본으로만 그린다 — 탭이 죽지 않게.
        queue.async { [weak self] in
            guard let self, self.commandQueue == nil, let device, let cq = device.makeCommandQueue() else { return }
            self.commandQueue = cq
            self.context = CIContext(mtlCommandQueue: cq, options: LiveFilter.contextOptions)
            do { self.engine = try LiveFilterEngine() } catch {
                AppLog.ui.error("live filter kernels: \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    func setDrawableSize(_ size: CGSize) {
        lock.withLock { _drawableSize = size }
    }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        // 스스로 바로잡기 — 전·후면 전환 뒤 연결이 새로 생기면 세로(90°)·거울 설정이 빠진 채 프레임이 와서
        // 미리보기가 누워 보였다(오너 실기기 2026-10-09). 다음 프레임부터 맞게 들어온다.
        if connection.isVideoRotationAngleSupported(90), connection.videoRotationAngle != 90 { connection.videoRotationAngle = 90 }
        if connection.isVideoMirroringSupported {
            let want = wantMirrored
            if connection.automaticallyAdjustsVideoMirroring { connection.automaticallyAdjustsVideoMirroring = false }
            if connection.isVideoMirrored != want { connection.isVideoMirrored = want }
        }
        guard let pb = CMSampleBufferGetImageBuffer(sampleBuffer), let context, let commandQueue else { return }
        let (key, layer, size) = lock.withLock { (_presetKey, _layer, _drawableSize) }
        guard let layer, size.width > 0, size.height > 0 else { return }

        // 버퍼(P3 등) → 작업 공간 sRGB 로 변환돼 들어온다. 연결에서 이미 세로·거울 처리됨.
        var img = CIImage(cvPixelBuffer: pb)
        if key != "none", let engine { img = engine.render(frame: img, key: key) }

        // 화면 꽉 채우기(aspectFill) — 기존 미리보기 레이어와 같은 구도
        let e = img.extent
        let s = max(size.width / e.width, size.height / e.height)
        img = img
            .transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY)
                .concatenating(CGAffineTransform(scaleX: s, y: s))
                .concatenating(CGAffineTransform(translationX: (size.width - e.width * s) / 2,
                                                 y: (size.height - e.height * s) / 2)))
            .cropped(to: CGRect(origin: .zero, size: size))

        guard let drawable = layer.nextDrawable(), let cb = commandQueue.makeCommandBuffer() else { return }
        let dest = CIRenderDestination(mtlTexture: drawable.texture, commandBuffer: cb)
        dest.colorSpace = srgb      // 작업 공간과 같게 = 변환 없음
        dest.isFlipped = true       // CI 원점은 아래, 텍스처는 위 (맥 검증에서 확인 — 안 주면 뒤집힌다)
        do { _ = try context.startTask(toRender: img, to: dest) } catch { return }
        cb.present(drawable)
        cb.commit()
    }
}

/// `LiveFilterRenderer` 가 그리는 화면. 기존 `CameraPreviewLayer` 자리에 그대로 들어간다.
struct LiveFilterPreview: UIViewRepresentable {
    let renderer: LiveFilterRenderer

    func makeUIView(context: Context) -> V {
        let v = V()
        v.renderer = renderer
        renderer.attach(v.metalLayer)
        return v
    }
    func updateUIView(_ uiView: V, context: Context) {}

    final class V: UIView {
        override class var layerClass: AnyClass { CAMetalLayer.self }
        var metalLayer: CAMetalLayer { layer as! CAMetalLayer }
        weak var renderer: LiveFilterRenderer?

        override init(frame: CGRect) {
            super.init(frame: frame)
            backgroundColor = .black
            isOpaque = true
            metalLayer.pixelFormat = .bgra8Unorm
            metalLayer.framebufferOnly = false          // Core Image 가 텍스처에 직접 쓴다
            metalLayer.colorspace = CGColorSpace(name: CGColorSpace.sRGB)
        }
        required init?(coder: NSCoder) { fatalError() }

        override func layoutSubviews() {
            super.layoutSubviews()
            let scale = traitCollection.displayScale
            metalLayer.contentsScale = scale
            let size = CGSize(width: (bounds.width * scale).rounded(), height: (bounds.height * scale).rounded())
            metalLayer.drawableSize = size
            renderer?.setDrawableSize(size)
        }
    }
}
