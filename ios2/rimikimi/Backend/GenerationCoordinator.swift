import Foundation
import UIKit
import Observation

/// 생성 한 건의 진행·복구·결과. 화면(옵션 → 홈 → 내 사진 진행 카드 → 결과)은 이 상태를 본다.
///
/// 복구 규칙은 웹 `tryRecoverGeneration` 그대로: fetch 자체가 죽었을 때(networkFail)만 갤러리를
/// 5초마다, 시작 후 5분까지 폴링한다. 갤러리 조회 자체가 3번 연속 실패하면 오프라인으로 보고 접는다.
/// 402/429 같은 서버의 명시적 거절은 즉시 실패로 보여준다.
@MainActor
@Observable
final class GenerationCoordinator {
    struct Job: Codable, Equatable {
        var conceptId: String
        var conceptTitle: String
        var startedAt: Date
        var count: Int
    }

    struct ResultItem: Identifiable, Hashable {
        let id: String
        var image: UIImage?
        var url: URL?
        var expiresAt: Date?
    }

    enum State: Equatable {
        case idle
        case running(Job, waiting: Bool)
        case done(Job, [ResultItem])
        case failed(Job, String)

        static func == (a: State, b: State) -> Bool {
            switch (a, b) {
            case (.idle, .idle): return true
            case let (.running(j1, w1), .running(j2, w2)): return j1 == j2 && w1 == w2
            case let (.done(j1, r1), .done(j2, r2)): return j1 == j2 && r1.map(\.id) == r2.map(\.id)
            case let (.failed(j1, m1), .failed(j2, m2)): return j1 == j2 && m1 == m2
            default: return false
            }
        }
    }

    private(set) var state: State = .idle
    /// 결과가 나온 직후 한 번 결과 화면을 자동으로 연다. 화면이 소비하면 nil 로 되돌린다.
    var pendingPresentation: [ResultItem]?
    /// 서버가 알려준 최신 크레딧 — 프로필/헤더가 이 값을 보고 quota 를 다시 부른다.
    private(set) var lastCredits: Int?
    private(set) var quotaExceeded = false

    private let defaults = UserDefaults.standard
    private let markerKey = "rimikimi.pendingGen.v1"
    private var recovering = false

    static let recoverWindow: TimeInterval = 5 * 60
    static let recoverInterval: UInt64 = 5_000_000_000
    static let offlineStrikes = 3

    var isRunning: Bool { if case .running = state { return true } else { return false } }
    var job: Job? {
        switch state {
        case .running(let j, _), .done(let j, _), .failed(let j, _): return j
        case .idle: return nil
        }
    }

    // MARK: 시작

    func start(_ request: GenerateRequest, token: String) {
        guard !isRunning else { return }
        let job = Job(conceptId: request.concept.id, conceptTitle: request.concept.title,
                      startedAt: Date(), count: request.displayCount)
        writeMarker(job)
        state = .running(job, waiting: false)
        quotaExceeded = false
        Task { await run(request, job: job, token: token) }
    }

    private func run(_ request: GenerateRequest, job: Job, token: String) async {
        do {
            let r = try await RimikimiAPI.shared.generate(request, token: token)
            lastCredits = r.credits
            let items = r.items.map { ResultItem(id: $0.id, image: $0.image, url: nil, expiresAt: $0.galleryExpiresAt) }
            clearMarker()
            state = .done(job, items)
            pendingPresentation = items
            AppLog.api.info("gen.done concept=\(job.conceptId, privacy: .public) items=\(items.count)")
            HapticPlayer.success()
        } catch let e as APIError {
            AppLog.api.error("gen.failed status=\(e.status) networkFail=\(e.networkFail) msg=\(e.message, privacy: .public)")
            // 서버 판정을 못 받은 경우만 기다린다. 429/402 는 기다려도 달라지지 않는다.
            if await recover(poll: e.networkFail) { return }
            quotaExceeded = e.quotaExceeded
            clearMarker()
            state = .failed(job, e.message)
            HapticPlayer.warning()
        } catch {
            if await recover(poll: true) { return }
            clearMarker()
            state = .failed(job, error.localizedDescription)
        }
    }

    // MARK: 복구 (앱 재시작·복귀 포함)

    /// 마커가 남아 있으면 진행 중으로 보고 폴링을 붙인다. 앱 시작·포그라운드 복귀 때 부른다.
    func resumeIfNeeded() {
        guard let job = readMarker(), !isRunning else { return }
        if Date().timeIntervalSince(job.startedAt) > Self.recoverWindow { clearMarker(); return }
        state = .running(job, waiting: true)
        Task { _ = await recover(poll: true) }
    }

    @discardableResult
    private func recover(poll: Bool) async -> Bool {
        guard !recovering, let job = readMarker() else { return false }
        recovering = true
        defer { recovering = false }
        var strikes = 0
        while true {
            switch await lookup(job) {
            case .found(let items):
                clearMarker()
                state = .done(job, items)
                pendingPresentation = items
                HapticPlayer.success()
                return true
            case .offline:
                strikes += 1
                if strikes >= Self.offlineStrikes { return finishWaiting(job) }
            case .notYet:
                strikes = 0
            }
            guard poll, Date().timeIntervalSince(job.startedAt) <= Self.recoverWindow else { return finishWaiting(job) }
            state = .running(job, waiting: true)
            try? await Task.sleep(nanoseconds: Self.recoverInterval)
            if Task.isCancelled { return false }
        }
    }

    private func finishWaiting(_ job: Job) -> Bool {
        clearMarker()
        state = .failed(job, "결과를 받지 못했어요. 내 사진에서 다시 확인해 주세요.")
        return false
    }

    private enum Lookup { case found([ResultItem]), notYet, offline }

    private func lookup(_ job: Job) async -> Lookup {
        guard let token = await AuthStore.shared.validAccessToken() else { return .notYet }
        let items: [GalleryItem]
        do { items = try await RimikimiAPI.shared.fetchGallery(token: token) } catch { return .offline }
        // 시작 시점 이후, 같은 컨셉의 결과 전부(묶음이면 여러 건).
        let mine = items.filter {
            $0.url != nil && $0.conceptId == job.conceptId
                && ($0.createdAt ?? .distantPast) >= job.startedAt.addingTimeInterval(-5)
        }
        guard !mine.isEmpty else { return .notYet }
        return .found(mine.map { ResultItem(id: $0.id, image: nil, url: $0.url, expiresAt: $0.expiresAt) })
    }

    // MARK: 마커

    func dismiss() { state = .idle }

    private func writeMarker(_ job: Job) {
        if let data = try? JSONEncoder().encode(job) { defaults.set(data, forKey: markerKey) }
    }
    private func readMarker() -> Job? {
        guard let data = defaults.data(forKey: markerKey) else { return nil }
        return try? JSONDecoder().decode(Job.self, from: data)
    }
    private func clearMarker() { defaults.removeObject(forKey: markerKey) }
}
