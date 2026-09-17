import Foundation
import UIKit
import Observation

/// 생성 작업들의 진행·복구·결과. 화면(옵션 → 홈 → 내 사진 진행 카드 → 결과)은 이 상태를 본다.
///
/// ⚠️ **한 번에 하나만** 이던 구조를 다중 작업으로 바꿨다 (오너 지시 2026-09-18:
///    "이미지 생성 중일 때 다른거 이미지 생성 또 요청하면 생성 안하네??").
///    예전 `start()` 첫 줄은 `guard !isRunning else { return }` 이었다. 생성이 돌고 있으면
///    두 번째 요청을 **아무 신호 없이 버렸다** — 에러도 토스트도 로그도 없고 서버로 요청조차
///    나가지 않았다. 게다가 버튼은 잠기지 않았고, 버려지기 직전에 성공 햅틱이 울렸으며,
///    화면은 "내 사진" 으로 넘어가 **이전 작업**의 제목이 달린 진행 카드를 보여줬다.
///    그래서 "눌렀고 진동도 왔는데 안 만들어진다" 가 됐다.
///
///    이제 작업을 목록(`entries`)으로 들고, 마커도 작업별로 저장한다. 한 작업이 끝나며
///    마커를 지워도 다른 작업의 마커는 남는다(예전엔 전역 마커 하나라 서로 지웠다).
///
/// 복구 규칙은 웹 `tryRecoverGeneration` 그대로: fetch 자체가 죽었을 때(networkFail)만 갤러리를
/// 5초마다, 시작 후 5분까지 폴링한다. 갤러리 조회 자체가 3번 연속 실패하면 오프라인으로 보고 접는다.
/// 402/429 같은 서버의 명시적 거절은 즉시 실패로 보여준다.
@MainActor
@Observable
final class GenerationCoordinator {
    struct Job: Codable, Equatable, Identifiable {
        /// 작업마다 고유. 마커·복구·화면이 전부 이 값으로 작업을 구분한다.
        var id: String = UUID().uuidString
        var conceptId: String
        var conceptTitle: String
        var startedAt: Date
        var count: Int

        // 구버전 마커(id 없음)도 읽을 수 있어야 한다 — 업데이트 직후 진행 중이던 건을 잃지 않는다.
        init(id: String = UUID().uuidString, conceptId: String, conceptTitle: String,
             startedAt: Date, count: Int) {
            self.id = id; self.conceptId = conceptId; self.conceptTitle = conceptTitle
            self.startedAt = startedAt; self.count = count
        }
        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString
            conceptId = try c.decode(String.self, forKey: .conceptId)
            conceptTitle = try c.decode(String.self, forKey: .conceptTitle)
            startedAt = try c.decode(Date.self, forKey: .startedAt)
            count = try c.decode(Int.self, forKey: .count)
        }
    }

    struct ResultItem: Identifiable, Hashable {
        let id: String
        var image: UIImage?
        var url: URL?
        var expiresAt: Date?
    }

    enum Phase: Equatable {
        case running(waiting: Bool)
        case done([ResultItem])
        case failed(String)

        static func == (a: Phase, b: Phase) -> Bool {
            switch (a, b) {
            case let (.running(w1), .running(w2)): return w1 == w2
            case let (.done(r1), .done(r2)): return r1.map(\.id) == r2.map(\.id)
            case let (.failed(m1), .failed(m2)): return m1 == m2
            default: return false
            }
        }
    }

    /// 화면에 그릴 작업 하나. 최신이 목록 앞에 온다.
    struct Entry: Identifiable, Equatable {
        var job: Job
        var phase: Phase
        var id: String { job.id }
    }

    private(set) var entries: [Entry] = []

    /// 결과가 나온 직후 한 번 결과 화면을 자동으로 연다. 화면이 소비하면 nil 로 되돌린다.
    var pendingPresentation: [ResultItem]?
    /// 위 결과가 **어느 작업의 것인지**. 여러 개가 동시에 도는 동안 제목이 섞이지 않게 같이 넘긴다.
    var pendingPresentationJob: Job?
    /// 서버가 알려준 최신 크레딧 — 프로필/헤더가 이 값을 보고 quota 를 다시 부른다.
    private(set) var lastCredits: Int?
    private(set) var quotaExceeded = false

    /// onChange 로 "완료/실패가 일어났다" 만 알고 싶을 때 쓰는 카운터.
    /// (entries 전체를 관찰하면 진행 중 waiting 토글에도 반응해 과하게 불린다)
    private(set) var doneTick = 0
    private(set) var failedTick = 0

    private let defaults = UserDefaults.standard
    private let markerKey = "rimikimi.pendingGen.v2"    // [Job] 배열
    private let legacyMarkerKey = "rimikimi.pendingGen.v1"  // 단일 Job (구버전)
    private var recovering: Set<String> = []

    static let recoverWindow: TimeInterval = 5 * 60
    static let recoverInterval: UInt64 = 5_000_000_000
    static let offlineStrikes = 3

    /// 하나라도 돌고 있나. **새 생성을 막는 용도로 쓰지 말 것** — 동시에 만들 수 있어야 한다.
    var isRunning: Bool { entries.contains { if case .running = $0.phase { return true } else { return false } } }
    var runningCount: Int { entries.filter { if case .running = $0.phase { return true } else { return false } }.count }

    // MARK: 시작

    func start(_ request: GenerateRequest, token: String, pushToken: String? = nil) {
        // ⚠️ 여기에 "이미 돌고 있으면 return" 을 다시 넣지 말 것. 그게 이 파일을 고친 이유다.
        let job = Job(conceptId: request.concept.id, conceptTitle: request.concept.title,
                      startedAt: Date(), count: request.displayCount)
        addMarker(job)
        entries.insert(Entry(job: job, phase: .running(waiting: false)), at: 0)
        quotaExceeded = false
        Task { await run(request, job: job, token: token, pushToken: pushToken) }
    }

    private func run(_ request: GenerateRequest, job: Job, token: String, pushToken: String?) async {
        do {
            let r = try await RimikimiAPI.shared.generate(request, token: token, pushToken: pushToken)
            lastCredits = r.credits
            let items = r.items.map { ResultItem(id: $0.id, image: $0.image, url: nil, expiresAt: $0.galleryExpiresAt) }
            removeMarker(job.id)
            setPhase(job.id, .done(items))
            pendingPresentation = items
            pendingPresentationJob = job
            doneTick &+= 1
            AppLog.api.info("gen.done concept=\(job.conceptId, privacy: .public) items=\(items.count)")
            HapticPlayer.success()
        } catch let e as APIError {
            AppLog.api.error("gen.failed status=\(e.status) networkFail=\(e.networkFail) msg=\(e.message, privacy: .public)")
            // 서버 판정을 못 받은 경우만 기다린다. 429/402 는 기다려도 달라지지 않는다.
            if await recover(job, poll: e.networkFail) { return }
            quotaExceeded = e.quotaExceeded
            removeMarker(job.id)
            setPhase(job.id, .failed(e.message))
            failedTick &+= 1
            HapticPlayer.warning()
        } catch {
            if await recover(job, poll: true) { return }
            removeMarker(job.id)
            setPhase(job.id, .failed(error.localizedDescription))
            failedTick &+= 1
        }
    }

    private func setPhase(_ id: String, _ phase: Phase) {
        guard let i = entries.firstIndex(where: { $0.id == id }) else { return }
        entries[i].phase = phase
    }

    // MARK: 복구 (앱 재시작·복귀 포함)

    /// 남아 있는 마커를 **전부** 진행 중으로 되살린다. 앱 시작·포그라운드 복귀 때 부른다.
    func resumeIfNeeded() {
        for job in readMarkers() {
            if Date().timeIntervalSince(job.startedAt) > Self.recoverWindow { removeMarker(job.id); continue }
            if entries.contains(where: { $0.id == job.id }) { continue }
            entries.insert(Entry(job: job, phase: .running(waiting: true)), at: 0)
            Task { _ = await recover(job, poll: true) }
        }
    }

    @discardableResult
    private func recover(_ job: Job, poll: Bool) async -> Bool {
        // ⚠️ 작업별로 막는다. 예전엔 전역 플래그 하나라 한 작업이 복구 중이면
        //    다른 작업은 복구 시도조차 못 했다.
        guard !recovering.contains(job.id), readMarkers().contains(where: { $0.id == job.id })
        else { return false }
        recovering.insert(job.id)
        defer { recovering.remove(job.id) }
        var strikes = 0
        while true {
            switch await lookup(job) {
            case .found(let items):
                removeMarker(job.id)
                setPhase(job.id, .done(items))
                pendingPresentation = items
                pendingPresentationJob = job
                doneTick &+= 1
                HapticPlayer.success()
                return true
            case .offline:
                strikes += 1
                if strikes >= Self.offlineStrikes { return finishWaiting(job) }
            case .notYet:
                strikes = 0
            }
            guard poll, Date().timeIntervalSince(job.startedAt) <= Self.recoverWindow else { return finishWaiting(job) }
            setPhase(job.id, .running(waiting: true))
            try? await Task.sleep(nanoseconds: Self.recoverInterval)
            if Task.isCancelled { return false }
        }
    }

    private func finishWaiting(_ job: Job) -> Bool {
        removeMarker(job.id)
        setPhase(job.id, .failed("결과를 받지 못했어요. 내 사진에서 다시 확인해 주세요."))
        failedTick &+= 1
        return false
    }

    private enum Lookup { case found([ResultItem]), notYet, offline }

    private func lookup(_ job: Job) async -> Lookup {
        guard let token = await AuthStore.shared.validAccessToken() else { return .notYet }
        let items: [GalleryItem]
        do { items = try await RimikimiAPI.shared.fetchGallery(token: token) } catch { return .offline }
        // 시작 시점 이후, 같은 컨셉의 결과 전부(묶음이면 여러 건).
        //
        // ⚠️ 갤러리 행에는 "어느 작업이 만든 것인지" 가 없다. 컨셉 + 시각으로만 고른다.
        //    동시 생성을 열면서 새 구멍이 생겼다: **같은 컨셉을 두 개 동시에** 돌리다 한쪽
        //    연결이 끊기면, 끊긴 쪽의 복구가 **다른 쪽이 만든 사진**을 제 결과로 집어온다
        //    (카드 두 장이 같은 사진을 보여준다). 그래서 이미 다른 작업이 가져간 사진은
        //    후보에서 뺀다. 한 사진은 한 작업에만 속한다.
        //    근본 해결은 서버가 갤러리 행에 작업 id 를 실어 주는 것이다 — 그건 스키마
        //    변경이라 따로 간다. 그때까지는 이 방어로 "같은 사진 두 장" 만 막는다.
        let taken = Set(entries.flatMap { e -> [String] in
            if case .done(let its) = e.phase, e.id != job.id { return its.map(\.id) }
            return []
        })
        let mine = items.filter {
            $0.url != nil && $0.conceptId == job.conceptId
                && ($0.createdAt ?? .distantPast) >= job.startedAt.addingTimeInterval(-5)
                && !taken.contains($0.id)
        }
        guard !mine.isEmpty else { return .notYet }
        return .found(mine.map { ResultItem(id: $0.id, image: nil, url: $0.url, expiresAt: $0.expiresAt) })
    }

    // MARK: 카드 정리

    /// 카드 하나 닫기 (완료·실패 카드의 X).
    func dismiss(_ id: String) {
        entries.removeAll { $0.id == id }
        removeMarker(id)
    }
    /// 끝난 카드 전부 닫기. 돌고 있는 건 남긴다.
    func dismissFinished() {
        entries.removeAll { if case .running = $0.phase { return false } else { return true } }
    }

    // MARK: 마커 (작업별)

    private func readMarkers() -> [Job] {
        if let data = defaults.data(forKey: markerKey),
           let jobs = try? JSONDecoder().decode([Job].self, from: data) {
            return jobs
        }
        // 구버전(단일) 마커 이관 — 업데이트 직후 진행 중이던 건을 잃지 않는다.
        if let data = defaults.data(forKey: legacyMarkerKey),
           let job = try? JSONDecoder().decode(Job.self, from: data) {
            defaults.removeObject(forKey: legacyMarkerKey)
            writeMarkers([job])
            return [job]
        }
        return []
    }
    private func writeMarkers(_ jobs: [Job]) {
        if jobs.isEmpty { defaults.removeObject(forKey: markerKey); return }
        if let data = try? JSONEncoder().encode(jobs) { defaults.set(data, forKey: markerKey) }
    }
    private func addMarker(_ job: Job) {
        var jobs = readMarkers()
        jobs.removeAll { $0.id == job.id }
        jobs.append(job)
        writeMarkers(jobs)
    }
    /// **자기 작업만** 지운다. 예전엔 전역 마커라 먼저 끝난 작업이 남의 마커까지 지웠다.
    private func removeMarker(_ id: String) {
        var jobs = readMarkers()
        jobs.removeAll { $0.id == id }
        writeMarkers(jobs)
    }
}
