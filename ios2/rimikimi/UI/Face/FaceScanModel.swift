import AVFoundation
import Vision
import UIKit
import Observation

/// `FaceScanView` 의 카메라·판정. 전면 카메라 프레임을 Vision 으로 보고 조건이 맞는 순간을 자동으로 잡는다.
///
/// 판정 세 가지(전부 통과해야 잡는다):
///  1) 얼굴이 **하나만** 보인다
///  2) 얼굴이 화면에서 충분히 크다(가로 ≥ 28%) — `_design/face-profile-v1.md` 품질 게이트
///  3) `VNDetectFaceCaptureQualityRequest` 점수가 기준 이상(흐림·저조도·눈감음을 한 번에 거른다)
/// 여기에 단계별 각도 조건(정면 = |yaw| 작음, 옆 = |yaw| 큼)을 더하고, **연속 3프레임** 유지될 때만
/// 잡는다(고개가 스쳐 지나가는 순간에 찍히지 않게).
@MainActor
@Observable
final class FaceScanModel {
    enum Step { case front, side1, side2, done }

    let session = AVCaptureSession()
    private(set) var captured: [FaceProfileStore.Angle: UIImage] = [:]
    private(set) var step: Step = .front
    private(set) var justCaptured = false
    /// 첫 옆모습에서 잡힌 yaw 부호. 두 번째 옆모습은 **반대 부호**를 요구한다.
    private var firstSideSign: Double = 0
    private var holdFrames = 0
    private var lastQualityFail: String?

    private let queue = DispatchQueue(label: "facescan.video")
    private let output = AVCaptureVideoDataOutput()
    private var delegate: FrameDelegate?

    var ringProgress: Double {
        switch step {
        case .front: return holdProgress / 3
        case .side1: return (1 + holdProgress) / 3
        case .side2: return (2 + holdProgress) / 3
        case .done: return 1
        }
    }
    private var holdProgress: Double { min(1, Double(holdFrames) / Double(Self.holdNeeded)) }

    var title: String {
        switch step {
        case .front: return "정면을 봐주세요"
        case .side1: return "고개를 한쪽으로 천천히"
        case .side2: return "이제 반대쪽으로"
        case .done: return "다 됐어요"
        }
    }
    var hint: String {
        if let lastQualityFail { return lastQualityFail }
        switch step {
        case .front: return "얼굴을 원 안에 꽉 채워 주세요"
        case .side1, .side2: return "45도쯤에서 잠깐 멈추면 자동으로 찍혀요"
        case .done: return ""
        }
    }

    private static let holdNeeded = 3          // 연속 프레임
    private static let minFaceWidth: CGFloat = 0.28
    private static let minQuality: Float = 0.35
    private static let frontYaw: Double = 10   // 도
    private static let sideYaw: Double = 22

    // MARK: 세션

    func start() async {
        guard await AVCaptureDevice.requestAccess(for: .video) else { return }
        guard session.inputs.isEmpty else {
            if !session.isRunning { await startRunning() }
            return
        }
        session.beginConfiguration()
        session.sessionPreset = .hd1280x720
        if let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front),
           let input = try? AVCaptureDeviceInput(device: cam), session.canAddInput(input) {
            session.addInput(input)
        }
        output.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        output.alwaysDiscardsLateVideoFrames = true
        let d = FrameDelegate { [weak self] buffer in
            Task { @MainActor in self?.handle(buffer) }
        }
        delegate = d
        output.setSampleBufferDelegate(d, queue: queue)
        if session.canAddOutput(output) { session.addOutput(output) }
        // ⚠️ 여기서 `connection.videoRotationAngle = 90` 으로 세워 놓지 **않는다**.
        //    그렇게 걸어 뒀었는데 오너 기기에서 저장된 세 장이 전부 90도 누워 나왔다(2026-09-22 캡처 실측).
        //    프리뷰(`AVCaptureVideoPreviewLayer`)는 제 연결을 따로 갖고 있어 멀쩡히 보이는 바람에
        //    촬영 중에는 드러나지도 않았다. 각도가 걸렸는지는 믿지 말고 **버퍼 크기로 실측**한다(`upright`).
        session.commitConfiguration()
        await startRunning()
    }

    private func startRunning() async {
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            queue.async { [session] in
                session.startRunning()
                cont.resume()
            }
        }
    }

    func stop() {
        let s = session
        queue.async { if s.isRunning { s.stopRunning() } }
    }

    func reset() {
        captured = [:]
        step = .front
        holdFrames = 0
        firstSideSign = 0
        Task { await start() }
    }

    // MARK: 프레임 판정

    private func handle(_ buffer: CVPixelBuffer) {
        guard step != .done else { return }

        // Vision 에도 **같은** 방향을 준다 — 누운 프레임을 `.up` 이라고 하면 정면/옆모습 판정이
        // 돌아간 좌표계에서 이뤄진다.
        let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: Self.upright(buffer), options: [:])
        let faces = VNDetectFaceRectanglesRequest()
        faces.revision = VNDetectFaceRectanglesRequestRevision3   // yaw/roll/pitch 를 준다
        try? handler.perform([faces])
        guard let observations = faces.results, !observations.isEmpty else {
            fail("얼굴이 안 보여요")
            return
        }
        guard observations.count == 1, let face = observations.first else {
            fail("한 사람만 나오게 해주세요")
            return
        }
        guard face.boundingBox.width >= Self.minFaceWidth else {
            fail("조금 더 가까이 와주세요")
            return
        }

        let yaw = (face.yaw?.doubleValue ?? 0) * 180 / .pi
        switch step {
        case .front:
            guard abs(yaw) <= Self.frontYaw else { fail("정면을 봐주세요"); return }
        case .side1:
            guard abs(yaw) >= Self.sideYaw else { fail(nil); return }
        case .side2:
            guard abs(yaw) >= Self.sideYaw else { fail(nil); return }
            guard yaw * firstSideSign < 0 else { fail("아까와 반대쪽으로 돌려주세요"); return }
        case .done:
            return
        }

        // 화질(흐림·저조도·눈감음) — 각도가 맞은 뒤에만 재서 매 프레임 비용을 아낀다.
        let quality = VNDetectFaceCaptureQualityRequest()
        try? handler.perform([quality])
        let score = (quality.results?.first as? VNFaceObservation)?.faceCaptureQuality ?? 0
        guard score >= Self.minQuality else {
            fail("조금 더 밝은 곳에서, 잠깐 멈춰 주세요")
            return
        }

        lastQualityFail = nil
        holdFrames += 1
        guard holdFrames >= Self.holdNeeded else { return }
        holdFrames = 0
        capture(buffer, yaw: yaw)
    }

    private func fail(_ message: String?) {
        holdFrames = 0
        lastQualityFail = message
    }

    private func capture(_ buffer: CVPixelBuffer, yaw: Double) {
        guard let image = Self.image(from: buffer) else { return }
        switch step {
        case .front:
            captured[.front] = image
            step = .side1
        case .side1:
            captured[.side1] = image
            firstSideSign = yaw
            step = .side2
        case .side2:
            captured[.side2] = image
            step = .done
            stop()
        case .done:
            return
        }
        justCaptured = true
        HapticPlayer.selection()
        Task {
            try? await Task.sleep(for: .milliseconds(260))
            justCaptured = false
        }
    }

    /// 이 버퍼를 똑바로 세우려면 어떤 EXIF 방향으로 읽어야 하는가.
    ///
    /// 전면 카메라 센서는 **가로로 누운 채** 프레임을 준다. 그대로 두면 90도 돌아간 사진이 남는다
    /// (오너 기기 실측: 저장본을 반시계 90도 돌려야 똑바로 섰다 → EXIF 8 = `.left`).
    /// 연결에 회전각이 걸려 세로로 들어오는 기기라면 손댈 게 없으므로 `.up`.
    private static func upright(_ buffer: CVPixelBuffer) -> CGImagePropertyOrientation {
        CVPixelBufferGetWidth(buffer) > CVPixelBufferGetHeight(buffer) ? .left : .up
    }

    private static func image(from buffer: CVPixelBuffer) -> UIImage? {
        // 회전은 **픽셀에 굽는다**. `UIImage.imageOrientation` 으로만 표시해 두면 리사이즈·JPEG 인코딩을
        // 거치는 동안(FaceProfileStore.save) 방향이 떨어져 나가 다시 눕는다.
        let ci = CIImage(cvPixelBuffer: buffer).oriented(upright(buffer))
        let ctx = CIContext()
        guard let cg = ctx.createCGImage(ci, from: ci.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// 델리게이트는 `AVCaptureVideoDataOutputSampleBufferDelegate` 가 NSObject 를 요구해서 따로 둔다.
private final class FrameDelegate: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    private let onFrame: (CVPixelBuffer) -> Void
    private var busy = false

    init(onFrame: @escaping (CVPixelBuffer) -> Void) { self.onFrame = onFrame }

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        // 앞 프레임 분석이 안 끝났으면 버린다 — 밀리면 반응이 느려지고 배터리만 먹는다.
        guard !busy, let px = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        busy = true
        onFrame(px)
        DispatchQueue.main.async { self.busy = false }
    }
}
