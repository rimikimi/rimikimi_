import UIKit

/// 매직 부스 결과의 **원본 사진**을 기기에만 잠깐 보관한다 — 결과 화면에서 길게 눌러 원본과 비교(오너 지시 2026-09-30).
/// 서버는 올린 사진을 저장하지 않으므로(개인정보처리방침) 원본은 여기에만 있다. 결과처럼 24시간 뒤 지운다.
/// 작업 시작 때 `job-<작업 id>` 로 적어 두고, 결과(갤러리 id)가 나오면 그 id 로 옮겨 적는다 —
/// 앱이 꺼졌다 복구되거나 완료 알림으로 열어도 같은 원본을 찾게.
enum OriginalStore {
    private static let dir: URL = {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("originals", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }()
    private static let keep: TimeInterval = 24 * 3600

    private static func file(_ key: String) -> URL {
        dir.appendingPathComponent(key.replacingOccurrences(of: "/", with: "_") + ".jpg")
    }

    /// 작업 시작 — 긴 변 2048 로 줄여 저장(비교용이라 충분). 백그라운드에서 쓴다.
    static func saveForJob(_ jobId: String, image: UIImage) {
        let url = file("job-" + jobId)
        Task.detached(priority: .utility) {
            prune()
            guard let data = image.downscaled(maxLong: 2048).jpegData(compressionQuality: 0.9) else { return }
            try? data.write(to: url, options: .atomic)
        }
    }

    /// 결과 id 들이 정해지면 작업 원본을 그 id 로 연결한다(파일 복사 — 묶음이면 여러 장이 같은 원본).
    static func link(jobId: String, to itemIds: [String]) {
        let src = file("job-" + jobId)
        Task.detached(priority: .utility) {
            // 저장이 아직 끝나지 않았을 수 있다(아주 빠른 결과) — 잠깐 기다린다.
            for _ in 0..<20 where !FileManager.default.fileExists(atPath: src.path) { try? await Task.sleep(for: .milliseconds(100)) }
            guard FileManager.default.fileExists(atPath: src.path) else { return }
            for id in itemIds {
                let dst = file(id)
                try? FileManager.default.removeItem(at: dst)
                try? FileManager.default.copyItem(at: src, to: dst)
            }
            try? FileManager.default.removeItem(at: src)
        }
    }

    static func image(for itemId: String) -> UIImage? {
        let url = file(itemId)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }

    private static func prune() {
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        for f in files {
            let d = (try? f.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            if Date().timeIntervalSince(d) > keep { try? fm.removeItem(at: f) }
        }
    }
}
