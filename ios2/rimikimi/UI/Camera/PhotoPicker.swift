import SwiftUI
import PhotosUI

/// 시스템 사진 선택창(PHPickerViewController).
///
/// 왜 네이티브로 고르나
///   필터를 고른 다음 웹 편집기로 넘어갈 때, 웹에서 파일 선택창을 **자동으로 열 수 없다** —
///   사파리/WKWebView 는 사용자 제스처 없는 `input.click()` 을 막는다(2026-09-17 실측).
///   그래서 웹에는 "사진 선택" 버튼만 있는 빈 화면이 떴다(오너 지적).
///   앱이 먼저 사진을 고르고 편집기에 실어 보내면 그 화면 자체가 사라진다.
///
/// PHPicker 는 사진 권한을 요구하지 않는다(사용자가 고른 것만 앱에 넘어온다).
struct PhotoPicker: UIViewControllerRepresentable {
    var limit: Int = 10
    var onPicked: ([UIImage]) -> Void
    var onCancel: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var c = PHPickerConfiguration(photoLibrary: .shared())
        c.filter = .images
        c.selectionLimit = limit
        c.preferredAssetRepresentationMode = .current
        let vc = PHPickerViewController(configuration: c)
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        private let parent: PhotoPicker
        init(_ parent: PhotoPicker) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard !results.isEmpty else { parent.onCancel(); return }
            // 고른 **순서를 지켜서** 담는다 — 비동기로 오므로 인덱스에 넣고 마지막에 추린다.
            var out = [UIImage?](repeating: nil, count: results.count)
            let group = DispatchGroup()
            for (i, r) in results.enumerated() {
                guard r.itemProvider.canLoadObject(ofClass: UIImage.self) else { continue }
                group.enter()
                r.itemProvider.loadObject(ofClass: UIImage.self) { obj, _ in
                    if let img = obj as? UIImage { out[i] = img.fixedOrientation() }
                    group.leave()
                }
            }
            group.notify(queue: .main) { [parent] in
                let imgs = out.compactMap { $0 }
                if imgs.isEmpty { parent.onCancel() } else { parent.onPicked(imgs) }
            }
        }
    }
}
