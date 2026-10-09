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
    /// 화면에 보이는 배율(1 = 와이드). 기본 카메라 앱처럼 0.5×(초광각)까지 내려간다.
    private(set) var zoom: CGFloat = 1
    /// 렌즈 버튼(0.5 · 1 · 2 · 망원) — 후면에서만. 기기에 있는 렌즈만 나온다.
    private(set) var lensStops: [CGFloat] = []
    /// 화면 배율 1× 에 해당하는 장치 배율(초광각 묶음이면 보통 2).
    private var zoomBase: CGFloat = 1
    private(set) var zoomAtGestureStart: CGFloat = 1

    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "burstcamera.session")
    private var input: AVCaptureDeviceInput?
    private var position: AVCaptureDevice.Position = .back
    /// 지금 전면인지(좌우반전 토글은 전면에서만 보인다).
    private(set) var isFront = false
    /// 전면 좌우반전(오너 지시 2026-10-09 "전면카메라에서는 좌우반전 토글로") — 켜면 거울처럼(보이는 대로),
    /// 끄면 남이 보는 방향. 미리보기·찍힌 사진 둘 다. 기본 켬(지금까지와 같음), 마지막 선택을 기억한다.
    var frontMirror: Bool = UserDefaults.standard.object(forKey: "camera.frontMirror") as? Bool ?? true {
        didSet {
            UserDefaults.standard.set(frontMirror, forKey: "camera.frontMirror")
            configureOutputConnection()
            HapticPlayer.selection()
        }
    }
    private var delegate: ShotDelegate?

    /// 카메라 탭 실시간 필터 — 있으면 미리보기 프레임을 여기로 흘려 필터를 입혀 그린다
    /// (`LiveFilterPreview`). 연속 촬영 화면(`BurstCameraView`)은 nil = 지금 그대로.
    let live: LiveFilterRenderer?
    private let videoOutput = AVCaptureVideoDataOutput()

    init(livePreview: Bool = false) {
        live = livePreview ? LiveFilterRenderer() : nil
    }

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
        if let live, session.canAddOutput(videoOutput) {
            videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
            videoOutput.alwaysDiscardsLateVideoFrames = true
            videoOutput.setSampleBufferDelegate(live, queue: live.queue)
            session.addOutput(videoOutput)
        }
        configureOutputConnection()
        session.commitConfiguration()
        if areaObserver == nil {
            areaObserver = NotificationCenter.default.addObserver(forName: AVCaptureDevice.subjectAreaDidChangeNotification,
                                                                  object: nil, queue: .main) { [weak self] _ in
                Task { @MainActor in self?.resumeAutoFocus() }
            }
        }
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
        // 후면은 기본 카메라 앱처럼 렌즈를 묶은 가상 카메라(트리플 → 듀얼와이드 → 듀얼 → 와이드).
        // 그래야 0.5×(초광각)·망원으로 줌이 이어진다(오너 지시 2026-10-09 "진짜 카메라랑 똑같이, 줌도").
        let types: [AVCaptureDevice.DeviceType] = pos == .front
            ? [.builtInWideAngleCamera]
            : [.builtInTripleCamera, .builtInDualWideCamera, .builtInDualCamera, .builtInWideAngleCamera]
        let device = types.lazy.compactMap { AVCaptureDevice.default($0, for: .video, position: pos) }.first
        guard let device, let i = try? AVCaptureDeviceInput(device: device), session.canAddInput(i) else { return }
        session.addInput(i)
        input = i
        // 초광각이 묶인 가상 카메라는 배율 1.0 = 초광각이라, 화면에 보이는 "1×"(와이드)는 첫 전환 배율이다.
        let switches = device.virtualDeviceSwitchOverVideoZoomFactors.map { CGFloat(truncating: $0) }
        let hasUltraWide = device.constituentDevices.contains { $0.deviceType == .builtInUltraWideCamera }
        zoomBase = hasUltraWide ? (switches.first ?? 1) : 1
        var stops: [CGFloat] = hasUltraWide ? [0.5, 1, 2] : [1, 2]
        if let tele = (hasUltraWide ? switches.dropFirst().first : switches.first).map({ $0 / zoomBase }), tele > 2.01 { stops.append(tele) }
        lensStops = pos == .front ? [] : stops
        if (try? device.lockForConfiguration()) != nil {
            device.videoZoomFactor = zoomBase
            if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
            if device.isExposureModeSupported(.continuousAutoExposure) { device.exposureMode = .continuousAutoExposure }
            device.isSubjectAreaChangeMonitoringEnabled = true
            device.unlockForConfiguration()
        }
        zoom = 1
        zoomAtGestureStart = 1
    }

    /// 세로 고정 앱이라 사진도 세로로 나와야 한다. 전면은 보이는 대로(거울) 저장한다 — 셀카는
    /// 화면에서 본 그대로가 기대값이다.
    /// 실시간 필터 프레임도 같은 방향·거울로 받는다(미리보기 = 찍히는 사진 구도).
    private func configureOutputConnection() {
        if let c = output.connection(with: .video) {
            if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
            if c.isVideoMirroringSupported {
                c.automaticallyAdjustsVideoMirroring = false
                c.isVideoMirrored = (position == .front && frontMirror)
            }
        }
        // 실시간 필터 프레임은 센서 원본(가로·거울 없음)으로 받고 세로·거울은 렌더러가 직접 입힌다.
        // 연결에 90° 를 맡겼더니 전면 전환 뒤 적용이 안 돼 미리보기가 누웠다(오너 실기기 2026-10-09, 두 번).
        if let c = videoOutput.connection(with: .video) {
            if c.isVideoRotationAngleSupported(0) { c.videoRotationAngle = 0 }
            if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = false }
        }
        live?.setOrientation(front: position == .front, mirrored: position == .front && frontMirror)
    }

    // MARK: 동작

    func flip() {
        position = position == .back ? .front : .back
        session.beginConfiguration()
        if let old = input { session.removeInput(old) }
        addInput(for: position)
        configureOutputConnection()
        session.commitConfiguration()
        isFront = position == .front
        // 입력을 바꾸면 커밋 때 연결이 새로 생겨 방향·거울 설정이 날아갈 수 있다 — 커밋 뒤에 한 번 더
        // (전면으로 바꾸면 미리보기가 90° 누워 보이던 결함, 오너 실기기 2026-10-09).
        configureOutputConnection()
        HapticPlayer.selection()
    }

    func capture() {
        guard shots.count < Self.maxShots else { return }
        let s = AVCapturePhotoSettings()
        // 플래시는 기기가 지원할 때만. 전면은 화면 플래시가 없으므로 요청하지 않는다.
        if output.supportedFlashModes.contains(.on), flashOn, position == .back { s.flashMode = .on }
        s.photoQualityPrioritization = .quality
        // 찍는 순간의 연결에 세로·거울을 다시 걸고(전면 전환 뒤 빠져 있었다), 그래도 가로로 오면
        // 받은 뒤 픽셀로 세운다 — 전면 사진이 누워 저장되던 결함(오너 실기기 2026-10-09).
        let want = position == .front && frontMirror
        if let c = output.connection(with: .video) {
            if c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
            if c.isVideoMirroringSupported { c.automaticallyAdjustsVideoMirroring = false; c.isVideoMirrored = want }
        }
        let d = ShotDelegate(wantMirror: want) { [weak self] image in
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

    /// 화면 배율로 줌(핀치 — 손가락을 바로 따라간다).
    func setZoom(_ v: CGFloat) {
        guard let device = input?.device else { return }
        let f = clampFactor(v * zoomBase, device)
        guard (try? device.lockForConfiguration()) != nil else { return }
        device.videoZoomFactor = f
        device.unlockForConfiguration()
        zoom = f / zoomBase
    }

    /// 렌즈 버튼 — 기본 카메라처럼 부드럽게 넘어간다.
    func jumpZoom(_ v: CGFloat) {
        guard let device = input?.device else { return }
        let f = clampFactor(v * zoomBase, device)
        guard (try? device.lockForConfiguration()) != nil else { return }
        device.ramp(toVideoZoomFactor: f, withRate: 12)
        device.unlockForConfiguration()
        zoom = f / zoomBase
        zoomAtGestureStart = zoom
        HapticPlayer.selection()
    }

    private func clampFactor(_ f: CGFloat, _ device: AVCaptureDevice) -> CGFloat {
        let maxF = min(device.maxAvailableVideoZoomFactor, zoomBase * 15)
        return min(maxF, max(device.minAvailableVideoZoomFactor, f))
    }

    // MARK: 초점·노출

    /// 탭한 곳에 초점·노출(기본 카메라처럼). `p` 는 장치 좌표(0~1, 센서 가로 기준).
    /// 장면이 크게 바뀌면 다시 자동으로 돌아간다(`subjectAreaDidChange`).
    func focus(at p: CGPoint) {
        guard let device = input?.device, (try? device.lockForConfiguration()) != nil else { return }
        if device.isFocusPointOfInterestSupported, device.isFocusModeSupported(.autoFocus) {
            device.focusPointOfInterest = p
            device.focusMode = .autoFocus
        }
        if device.isExposurePointOfInterestSupported, device.isExposureModeSupported(.autoExpose) {
            device.exposurePointOfInterest = p
            device.exposureMode = .autoExpose
        }
        device.isSubjectAreaChangeMonitoringEnabled = true
        device.unlockForConfiguration()
        HapticPlayer.selection()
    }

    /// 노출 보정(기본 카메라의 해 아이콘 끌기) — -2 ~ +2 EV.
    private(set) var exposureBias: Float = 0
    func setExposureBias(_ v: Float) {
        guard let device = input?.device, (try? device.lockForConfiguration()) != nil else { return }
        let b = min(min(device.maxExposureTargetBias, 2), max(max(device.minExposureTargetBias, -2), v))
        device.setExposureTargetBias(b, completionHandler: nil)
        device.unlockForConfiguration()
        exposureBias = b
    }

    private func resumeAutoFocus() {
        guard let device = input?.device, (try? device.lockForConfiguration()) != nil else { return }
        if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusPointOfInterest = CGPoint(x: 0.5, y: 0.5); device.focusMode = .continuousAutoFocus
        }
        if device.isExposureModeSupported(.continuousAutoExposure) {
            device.exposurePointOfInterest = CGPoint(x: 0.5, y: 0.5); device.exposureMode = .continuousAutoExposure
        }
        device.setExposureTargetBias(0, completionHandler: nil)
        device.unlockForConfiguration()
        exposureBias = 0
    }
    @ObservationIgnored private var areaObserver: NSObjectProtocol?

    func commitZoom() { zoomAtGestureStart = zoom }
}

/// `AVCapturePhotoCaptureDelegate` 는 NSObject 를 요구해서 따로 둔다.
private final class ShotDelegate: NSObject, AVCapturePhotoCaptureDelegate {
    private let onShot: (UIImage?) -> Void
    private let wantMirror: Bool
    private static let ctx = CIContext()
    init(wantMirror: Bool, onShot: @escaping (UIImage?) -> Void) { self.wantMirror = wantMirror; self.onShot = onShot }

    func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto,
                     error: Error?) {
        guard error == nil, let data = photo.fileDataRepresentation() else { onShot(nil); return }
        onShot(Self.upright(data, wantMirror: wantMirror) ?? UIImage(data: data))
    }

    /// EXIF 방향까지 입힌 뒤에도 가로면(= 회전이 안 걸린 것) 픽셀로 세운다. 결과는 방향 정보 없는(.up) 이미지라
    /// 편집기·저장 어디서도 다시 돌아가지 않는다.
    static func upright(_ data: Data, wantMirror: Bool) -> UIImage? {
        guard var ci = CIImage(data: data, options: [.applyOrientationProperty: true]) else { return nil }
        let exif = (ci.properties[kCGImagePropertyOrientation as String] as? UInt32) ?? 1
        let appliedMirror = [2, 4, 5, 7].contains(exif)   // EXIF 에 거울이 들어 있었으면 이미 뒤집혀 들어왔다
        ci = LiveFilter.upright(ci, appliedMirror: appliedMirror, wantMirror: wantMirror)
        guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return nil }
        return UIImage(cgImage: cg, scale: 1, orientation: .up)
    }
}
