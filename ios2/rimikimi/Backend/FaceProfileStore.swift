import UIKit
import Observation

/// 페이스 프로필 — 정면·좌·우 3장을 **기기에만** 저장한다.
///
/// 설계 정본: 스튜디오 `_design/face-profile-v1.md`(오너 발제 2026-08-24) — "정면, 좌우 각각 45도
/// 측면을 찍게 해서 분석한 다음 '이 얼굴을 사용할까요?' 물어보는" 흐름. 2026-09-22 오너 지시로
/// 촬영 대신 **Face ID 등록처럼 영상으로 스캔**해서 모으는 방식이 됐다(`FaceScanView`).
///
/// ⚠️ **얼굴 특징정보(임베딩)를 만들지 않는다.** 사진 파일 3장만 앱 전용 폴더에 둔다 — 그래야
/// 지금 개인정보처리방침("얼굴 사진 1~3장 … 기기 내부에만 저장 … 임베딩 생성·보관하지 않습니다")이
/// 그대로 참이고, 민감정보 별도 동의·방침 개정이 필요 없다. 생성할 때만 참조로 임시 전송된다
/// (서버는 `faceRefs` 를 참조로만 쓰고 저장하지 않는다 — `api/generate.js` faceRefList).
@MainActor
@Observable
final class FaceProfileStore {
    /// 저장 순서 = 서버에 보내는 순서. `angle` 문자열은 서버 로그(`angles=`)에 그대로 찍힌다.
    enum Angle: String, CaseIterable {
        case front, side1, side2
        var label: String {
            switch self {
            case .front: return "정면"
            case .side1: return "옆모습 ①"
            case .side2: return "옆모습 ②"
            }
        }
    }

    private(set) var shots: [Angle: UIImage] = [:]

    private var dir: URL {
        let d = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("rimikimi/face", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }
    private func url(_ a: Angle) -> URL { dir.appendingPathComponent("\(a.rawValue).jpg") }

    init() {
        for a in Angle.allCases {
            if let data = try? Data(contentsOf: url(a)), let img = UIImage(data: data) { shots[a] = img }
        }
    }

    var hasProfile: Bool { shots[.front] != nil }
    var front: UIImage? { shots[.front] }
    /// 생성 요청에 실을 순서(정면 먼저).
    var ordered: [(angle: Angle, image: UIImage)] {
        Angle.allCases.compactMap { a in shots[a].map { (a, $0) } }
    }

    func save(_ new: [Angle: UIImage]) {
        for (a, img) in new {
            let small = ImageUtil.resize(img, maxSide: 1280)
            shots[a] = small
            if let data = small.jpegData(compressionQuality: 0.9) { try? data.write(to: url(a), options: .atomic) }
        }
    }

    func clear() {
        for a in Angle.allCases { try? FileManager.default.removeItem(at: url(a)) }
        shots = [:]
    }
}
