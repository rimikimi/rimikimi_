import SwiftUI
import UIKit
import Photos

/// 아이폰 **기본 카메라 화면**을 그대로 띄운다 (오너 지시 2026-09-17: "아이폰 기본 카메라를 띄우라고").
///
/// 왜 이렇게 하나
///   그동안 카메라는 웹(`src/CameraStudio.jsx`)을 WKWebView 로 띄우고 있었다. 웹뷰의
///   getUserMedia 로는 **터치 포커스·하드웨어 줌·노출 제어를 쓸 수 없다** — 아무리 손봐도
///   기본 카메라처럼 되지 않는다. `UIImagePickerController(sourceType: .camera)` 는
///   애플이 만든 그 화면 자체라, 포커스·줌·플래시·HDR 이 전부 그대로 동작한다.
///
///   ⚠️ 맞바꾼 것: **촬영 중 라이브 필터 미리보기는 없다.** 기본 카메라 UI 위에 우리 필터를
///   얹을 방법이 없기 때문이다. 대신 찍은 직후 편집기로 넘겨 필터를 입힌다
///   (찍기 → 필터, 순서만 바뀐다. 저장본 품질은 오히려 더 좋다 — 카메라 원본 그대로다).
struct SystemCameraPicker: UIViewControllerRepresentable {
    /// 촬영 완료 — 원본 UIImage. 취소하면 호출되지 않는다.
    var onPicked: (UIImage) -> Void
    var onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let c = UIImagePickerController()
        // 시뮬레이터엔 카메라가 없다 — 그때는 사진 보관함으로 떨어뜨려 화면 확인이라도 되게 한다.
        c.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        if c.sourceType == .camera {
            c.cameraCaptureMode = .photo
            c.cameraDevice = .rear          // 기본 후면 (오너 지시)
        }
        c.allowsEditing = false             // 애플 기본 촬영 화면 그대로
        c.delegate = context.coordinator
        return c
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let parent: SystemCameraPicker
        init(_ parent: SystemCameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let img = (info[.originalImage] as? UIImage)
            if let img { parent.onPicked(img.fixedOrientation()) } else { parent.onCancel() }
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.onCancel()
        }
    }
}

extension UIImage {
    /// EXIF 회전을 픽셀에 굽는다. 이걸 안 하면 캔버스·서버로 넘길 때 눕는다.
    func fixedOrientation() -> UIImage {
        guard imageOrientation != .up else { return self }
        let f = UIGraphicsImageRendererFormat.default()
        f.scale = scale
        return UIGraphicsImageRenderer(size: size, format: f).image { _ in
            draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

/// 촬영 결과를 앨범에 저장한다 (SPEC §3 "셔터 → 즉시 앨범 저장").
/// 권한이 없으면 조용히 실패한다 — 호출부가 결과로 안내한다.
enum CameraAlbum {
    static func save(_ image: UIImage) async -> Bool {
        let status = await withCheckedContinuation { (c: CheckedContinuation<PHAuthorizationStatus, Never>) in
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { c.resume(returning: $0) }
        }
        guard status == .authorized || status == .limited else { return false }
        return await withCheckedContinuation { (c: CheckedContinuation<Bool, Never>) in
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }, completionHandler: { ok, _ in c.resume(returning: ok) })
        }
    }
}
