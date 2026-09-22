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

    /// 저장 형식 판(版).
    ///   2 = 스캔본이 90도 누워 저장되던 것을 고친 뒤(2026-09-22)
    ///   3 = 그 고침이 **방향을 반대로 잡아** 180도 뒤집혀 저장되던 것을 다시 고친 뒤(빌드 8 실측)
    ///
    /// 판이 올라가면 갖고 있던 사진을 버린다. 이 사진들은 생성할 때 `faceRefs` 로 그대로 모델에
    /// 참조로 실려 가므로(`RimikimiAPI` body["faceRefs"]), 누운 참조를 계속 보내면 얼굴이 안 지켜진다
    /// — 오너가 "스캔해온 게 더 얼굴 유지가 안 된다" 고 한 게 이것이다. 앱만 고치고 파일을 두면
    /// 이미 스캔해 둔 사람은 계속 누운 걸 보내게 된다.
    private static let version = 3
    private var versionURL: URL { dir.appendingPathComponent("version") }

    init() {
        discardIfStale()
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

    /// 옛 판으로 저장된 사진을 지운다. 지우고 나면 프로필 화면이 다시 "얼굴 스캔하기" 로 돌아가
    /// 새로 찍게 된다 — 누운 사진을 소리 없이 계속 쓰는 것보다 낫다.
    private func discardIfStale() {
        let saved = (try? String(contentsOf: versionURL, encoding: .utf8))
            .flatMap { Int($0.trimmingCharacters(in: .whitespacesAndNewlines)) } ?? 1
        guard saved < Self.version else { return }
        for a in Angle.allCases { try? FileManager.default.removeItem(at: url(a)) }
        try? String(Self.version).write(to: versionURL, atomically: true, encoding: .utf8)
    }

    func save(_ new: [Angle: UIImage]) {
        try? String(Self.version).write(to: versionURL, atomically: true, encoding: .utf8)
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
