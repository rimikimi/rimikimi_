import AVFoundation
import UIKit
import Observation

/// `BurstCameraView` 의 촬영 담당. 세션 구성 · 셔터 · 전후면 전환 · 플래시 · 줌.
@MainActor
@Observable
final class BurstCameraModel {
    static let maxShots = 10

    let session = AVCaptureSession()
    private(set) var shots: [UIImage] = []
    private(set) var denied = false
    private(set) var flashOverlay = false
    var flashOn = false
    private(set) var zoom: CGFloat = 1
    private(set) var zoomAtGestureStart: CGFloat = 1

    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "burstcamera.session")
    private var input: AVCaptureDeviceInput?
    private var position: AVCaptureDevice.Position = .back
    private var delegate: ShotDelegate?

    // MARK: 세션

    func start() async {
        guard await AVCaptureDevice.requestAccess(for: .video) else { denied = true; return }
        denied = false
        guard session.inputs.isEmpty else {
            if !session.isRunning { await run() }
            return
        }
        session.beginConfiguration()
        session.sessionPreset = .photo
        addInput(for: position)
        if session.canAddOutput(output) {
            session.addOutput(output)
            output.maxPhotoQualityPrioritization = .quality
        }
        configureOutputConnection()
        session.commitConfiguration()
        await run()
    }

    private func run() async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            queue.async { [session] in session.startRunning(); c.resume() }
        }
    }

    func stop() {
        let s = session
        queue.async { if s.isRunning { s.stopRunning() } }
    }

    private func addInput(for pos: AVCaptureDevice.Position) {
        guard let device = AVCaptureDevice.default(
            pos == .front ? .builtInWideAngleCamera : .builtInDualWideCamera, for: .video, position: pos)
            ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: pos),
              let i = try? AVCaptureDeviceInput(device: device), session.canAddInput(i) else { return }
        session.addInput(i)
        input = i
        zoom = 1
        zoomAtGestureStart = 1
    }

    /// 세로 고정 앱이라 사진도 세로로 나와야 한다. 전면은 보이는 대로(거울) 저장한다 — 셀카는
    /// 화면에서 본 그대로가 기대값이다.
    private func configureOutputConnection() {
        guard let c = output.connection(with: .video) else { return }
        if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        if c.isVideoMirroringSupported {
            c.automaticallyAdjustsVideoMirroring = false
            c.isVideoMirrored = (position == .front)
        }
    }

    // MARK: 동작

    func flip() {
        position = position == .back ? .front : .back
        session.beginConfiguration()
        if let old = input { session.removeInput(old) }
        addInput(for: position)
        configureOutputConnection()
        session.commitConfiguration()
        HapticPlayer.selection()
    }

    func capture() {
        guard shots.count < Self.maxShots else { return }
        let s = AVCapturePhotoSettings()
        // 플래시는 기기가 지원할 때만. 전면은 화면 플래시가 없으므로 요청하지 않는다.
        if output.supportedFlashModes.contains(.on), flashOn, position == .back { s.flashMode = .on }
        s.photoQualityPrioritization = .quality
        let d = ShotDelegate { [weak self] image in
            Task { @MainActor in self?.add(image) }
        }
        delegate = d                 // 콜백이 올 때까지 살려 둔다
        output.capturePhoto(with: s, delegate: d)
        HapticPlayer.selection()
        flashOverlay = true
        Task {
            try? await Task.sleep(for: .milliseconds(90))
            flashOverlay = false
        }
    }

    private func add(_ image: UIImage?) {
        guard let image, shots.count < Self.maxShots else { return }
        shots.append(image)
    }

    func remove(at i: Int) {
        guard shots.indices.contains(i) else { return }
        shots.remove(at: i)
        HapticPlayer.selection()
    }

    // MARK: 줌

    func setZoom(_ v: CGFloat) {
        guard let device = input?.device else { return }
        let maxZoom = min(device.activeFormat.videoMaxZoomFactor, 8)
        let clamped = min(maxZoom, max(1, v))
        guard (try? device.lockForConfiguration()) != nil else { return }
        device.videoZoomFactor = clamped
        device.unlockForConfiguration()
        zoom = clamped
    }

    func commitZoom() { zoomAtGestureStart = zoom }
}

/// `AVCapturePhotoCaptureDelegate` 는 NSObject 를 요구해서 따로 둔다.
private final class ShotDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    private let onShot: (UIImage?) -> Void
    init(onShot: @escaping (UIImage?) -> Void) { self.onShot = onShot }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { onShot(nil); return }
        onShot(UIImage(data: data))
    }
}
