import UIKit
import Observation

/// "내 사진" — 컨셉 생성에 자동으로 쓰이는 등록 사진. 기기 안(Application Support)에만 둔다.
/// 서버로는 생성 요청에 실릴 때만 나가고 저장되지 않는다(웹 `profile.photo.hint2` 와 같은 약속).
@MainActor
@Observable
final class UserPhotoStore {
    private(set) var image: UIImage?

    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("rimikimi", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("my_photo.jpg")
    }

    init() {
        if let data = try? Data(contentsOf: fileURL) { image = UIImage(data: data) }
    }

    var hasPhoto: Bool { image != nil }

    func set(_ new: UIImage) {
        // 1024 로 줄여 둔다 — 요청 때 다시 줄이지만 디스크와 메모리를 아낀다.
        let small = ImageUtil.resize(new, maxSide: 1280)
        image = small
        if let data = small.jpegData(compressionQuality: 0.9) { try? data.write(to: fileURL, options: .atomic) }
    }

    func clear() {
        image = nil
        try? FileManager.default.removeItem(at: fileURL)
    }
}
