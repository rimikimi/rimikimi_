import Foundation
import UIKit

/// Vercel `api/` 호출. 요청 필드는 `src/PortraitStudio.jsx` 의 `generateImage()` 와 각 fetch 를 그대로 옮겼다.
struct APIError: LocalizedError {
    var message: String
    var status: Int = 0
    /// fetch 자체가 죽은 경우 — 서버 판정을 못 받았으므로 호출부는 갤러리를 폴링한다.
    var networkFail = false
    var quotaExceeded: Bool { status == 429 }
    var errorDescription: String? { message }
}

struct QuotaInfo: Decodable {
    var used: Int?
    var limit: Int?
    var remaining: Int?
    var unlimited: Bool?
    var blocked: Bool?
    var credits: Int?
    var referralCount: Int?
    var referralCode: String?
    var untilNext: Int?

    var creditsAvailable: Int { credits ?? 0 }
    var freeLeft: Int { max(0, (limit ?? 1) - (used ?? 0)) }
    /// 헤더 크레딧 칩 문구.
    var chipLabel: String {
        if unlimited == true { return "∞ 무제한" }
        if creditsAvailable > 0 { return "🎟 \(creditsAvailable)" }
        return "무료 \(freeLeft)장"
    }
}

struct GalleryItem: Identifiable, Decodable, Hashable {
    let id: String
    let conceptId: String?
    let conceptTitle: String?
    let createdAt: Date?
    let expiresAt: Date?
    let url: URL?

    enum CodingKeys: String, CodingKey { case id, conceptId, conceptTitle, createdAt, expiresAt, url }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if let n = try? c.decode(Int.self, forKey: .id) { id = String(n) } else { id = (try? c.decode(String.self, forKey: .id)) ?? UUID().uuidString }
        if let n = try? c.decode(Int.self, forKey: .conceptId) { conceptId = String(n) } else { conceptId = try? c.decode(String.self, forKey: .conceptId) }
        conceptTitle = try? c.decode(String.self, forKey: .conceptTitle)
        createdAt = (try? c.decode(String.self, forKey: .createdAt)).flatMap(GalleryItem.parse)
        expiresAt = (try? c.decode(String.self, forKey: .expiresAt)).flatMap(GalleryItem.parse)
        url = (try? c.decode(String.self, forKey: .url)).flatMap { URL(string: $0) }
    }
    static func parse(_ s: String) -> Date? { Concept.iso.date(from: s) ?? Concept.isoPlain.date(from: s) }
}

/// `/api/generate` 요청 — 웹 `conceptMeta` 와 1:1.
struct GenerateRequest {
    var concept: Concept
    /// 내 사진(등록 사진) 또는 매직부스 일회용 사진. JPEG 로 축소해 보낸다.
    var photo: UIImage
    /// 커플: 상대 사진.
    var partnerPhoto: UIImage?
    /// 드레스룸: 의상 1~5장.
    var garments: [UIImage] = []
    var dressStyle: String = "mirror"
    /// 묶음 장수(1/3/6/12). 인생네컷·매직부스는 1.
    var count: Int = 1
    /// 인생네컷: 분할 수 + 스타일.
    var cutCount: Int? = nil
    var fourcutStyle: String? = nil
    /// 페이스 프로필 참조(등록 사진). 매직부스는 안 보낸다.
    var faceRef: UIImage? = nil

    var prompt: String { concept.isFourcut ? "인생네컷" : concept.text }
    var skipFacePrecheck: Bool { concept.isArtTransform }
    var creditCost: Int { concept.isFourcut ? 1 : BatchOption.cost(for: count) }
    var effectiveCount: Int { concept.isFourcut ? 1 : count }
    var displayCount: Int { concept.isFourcut ? (cutCount ?? 4) : count }
}

/// `POST /api/generate {fit:"outpaint", mimeType, base64}` 응답 — generate 와 같은 모양 중 필요한 것만.
struct OutpaintResult {
    var image: UIImage
    var credits: Int?
    var quotaUsed: Int?
    var quotaLimit: Int?
}

struct GenerateResult {
    struct Item: Identifiable {
        let id: String
        let image: UIImage
        let galleryId: String?
        let galleryExpiresAt: Date?
    }
    var items: [Item]
    var credits: Int?
    var quotaUsed: Int?
    var quotaLimit: Int?
    var unlimited: Bool?
    var busyFallback: Bool
}

final class RimikimiAPI {
    static let shared = RimikimiAPI()
    private let session: URLSession

    private init() {
        let cfg = URLSessionConfiguration.default
        // 생성은 100~200초 걸린다(서버 최대 200초). 기본 60초로는 성공 응답을 놓친다.
        cfg.timeoutIntervalForRequest = 240
        cfg.timeoutIntervalForResource = 300
        cfg.urlCache = URLCache(memoryCapacity: 64 << 20, diskCapacity: 512 << 20)
        session = URLSession(configuration: cfg)
    }

    // MARK: 공개

    func fetchConcepts() async throws -> [Concept] {
        var req = URLRequest(url: Config.apiBase.appendingPathComponent("concepts.json"))
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp, data)
        return try JSONDecoder().decode([Concept].self, from: data)
    }

    func fetchPopular() async throws -> [String] {
        struct R: Decodable { struct P: Decodable { let id: LooseID }; let popular: [P]? }
        let (data, resp) = try await session.data(from: Config.apiBase.appendingPathComponent("api/popular"))
        try Self.check(resp, data)
        return (try JSONDecoder().decode(R.self, from: data).popular ?? []).map(\.id.value)
    }

    // MARK: 인증 필요

    func fetchQuota(token: String) async throws -> QuotaInfo {
        let (data, resp) = try await session.data(for: authed("api/quota", token: token))
        try Self.check(resp, data)
        return try JSONDecoder().decode(QuotaInfo.self, from: data)
    }

    func fetchGallery(token: String) async throws -> [GalleryItem] {
        struct R: Decodable { let items: [GalleryItem]? }
        let (data, resp) = try await session.data(for: authed("api/gallery", token: token))
        try Self.check(resp, data)
        return try JSONDecoder().decode(R.self, from: data).items ?? []
    }

    func deleteGalleryItem(id: String, token: String) async throws {
        var req = authed("api/gallery", token: token)
        req.url = URL(string: req.url!.absoluteString + "?id=" + id)
        req.httpMethod = "DELETE"
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp, data)
    }

    /// `POST /api/generate` — 본문은 웹 `generateImage()` 와 동일한 키.
    func generate(_ r: GenerateRequest, token: String, pushToken: String? = nil) async throws -> GenerateResult {
        let photo = ImageUtil.jpegPayload(r.photo, maxSide: 1024, quality: 0.85)
        var body: [String: Any] = [
            "mimeType": photo.mimeType, "base64": photo.base64, "prompt": r.prompt,
            "conceptId": r.concept.id, "conceptTitle": r.concept.title,
            "skipFacePrecheck": r.skipFacePrecheck,
            "count": r.effectiveCount,
            "proSample": false,
        ]
        if let partner = r.partnerPhoto, r.concept.isCouple {
            let p2 = ImageUtil.jpegPayload(partner, maxSide: 1024, quality: 0.85)
            body["mimeType2"] = p2.mimeType; body["base64_2"] = p2.base64; body["couple"] = true
        }
        if r.concept.isFourcut {
            body["fourcutStyle"] = r.fourcutStyle
            body["cutCount"] = r.cutCount
        }
        if r.concept.isDressroom, !r.garments.isEmpty {
            // 의상은 얼굴 디테일이 필요 없어 896px — 6장이 한 요청(4.5MB 한도)에 실린다.
            body["garments"] = r.garments.prefix(5).map { g -> [String: String] in
                let p = ImageUtil.jpegPayload(g, maxSide: 896, quality: 0.85)
                return ["mimeType": p.mimeType, "base64": p.base64]
            }
            body["dressStyle"] = r.dressStyle
        }
        // 이 기기의 푸시 토큰 — 서버가 생성을 마치면 여기로 "완성됐어요"를 쏜다(1.x 와 동일).
        if let pushToken { body["pushToken"] = pushToken }
        // 페이스 프로필(1.x `loadProfileRefs`): 등록 사진을 참조로 같이 보낸다. 서버는 참조로만 쓰고 저장하지 않는다.
        // 매직부스(얼굴 미유지)는 1.x 와 같이 보내지 않는다.
        if !r.skipFacePrecheck, let anchor = r.faceRef {
            let p = ImageUtil.jpegPayload(anchor, maxSide: 1024, quality: 0.85)
            body["faceRefs"] = [["mimeType": p.mimeType, "base64": p.base64, "angle": "anchor"]]
        }

        var req = authed("api/generate", token: token)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch { throw APIError(message: "네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", networkFail: true) }

        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw APIError(message: "서버 응답을 읽을 수 없어요 (오류 \(status))", status: status)
        }
        guard (200...299).contains(status) else {
            var msg = json["error"] as? String ?? "이미지 생성 실패 (오류 \(status))"
            if let detail = json["detail"] { msg += "\n\n[원문] " + String(describing: detail).prefix(300) }
            throw APIError(message: msg, status: status)
        }
        guard let b64 = json["base64"] as? String, let first = ImageUtil.decode(base64: b64) else {
            throw APIError(message: "이미지 응답을 받지 못했어요. 다른 컨셉으로 시도해 주세요.", status: status)
        }
        var items = [GenerateResult.Item(id: Self.str(json["galleryId"]) ?? UUID().uuidString, image: first,
                                         galleryId: Self.str(json["galleryId"]),
                                         galleryExpiresAt: (json["galleryExpiresAt"] as? String).flatMap(GalleryItem.parse))]
        if let images = json["images"] as? [[String: Any]], images.count > 1 {
            for it in images.dropFirst() {
                guard let b = it["base64"] as? String, let img = ImageUtil.decode(base64: b) else { continue }
                items.append(.init(id: Self.str(it["galleryId"]) ?? UUID().uuidString, image: img,
                                   galleryId: Self.str(it["galleryId"]),
                                   galleryExpiresAt: (it["galleryExpiresAt"] as? String).flatMap(GalleryItem.parse)))
            }
        }
        return GenerateResult(items: items,
                              credits: json["credits"] as? Int,
                              quotaUsed: json["quotaUsed"] as? Int,
                              quotaLimit: json["quotaLimit"] as? Int,
                              unlimited: json["unlimited"] as? Bool,
                              busyFallback: json["busyFallback"] as? Bool ?? false)
    }

    /// 정방향 맞춤 "채워 맞춤" — `POST /api/generate {fit:"outpaint", mimeType, base64}` → 세로 3:4, 1 크레딧.
    /// 계약은 4주차 지시대로 고정: 응답은 기존 generate 와 같은 모양 `{mimeType, base64, credits, quotaUsed, quotaLimit}`.
    /// **서버 미배포 시 404/400 이 날 수 있다** — 그대로 APIError 로 던져 호출부가 에러 화면을 보여준다.
    func outpaint(image: UIImage, token: String) async throws -> OutpaintResult {
        let photo = ImageUtil.jpegPayload(image, maxSide: 1536, quality: 0.9)
        var req = authed("api/generate", token: token)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["fit": "outpaint", "mimeType": photo.mimeType, "base64": photo.base64]
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch { throw APIError(message: "네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", networkFail: true) }

        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        // 상태코드·서버 원문은 로그로만 — 사용자 화면엔 절대 숫자를 띄우지 않는다(오너 지시, 4주차).
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            AppLog.ui.error("outpaint.badResponse status=\(status, privacy: .public)")
            throw APIError(message: "채워 맞춤을 하지 못했어요. 잠시 후 다시 시도해 주세요 🙂", status: status)
        }
        guard (200...299).contains(status) else {
            AppLog.ui.error("outpaint.failed status=\(status, privacy: .public) body=\(String(describing: json["error"]), privacy: .private)")
            // 부족한 크레딧(429)은 클라이언트가 네트워크 전에 이미 걸러낸다 — 여기 오는 건 그 밖의 서버 거절.
            throw APIError(message: "채워 맞춤을 하지 못했어요. 크레딧은 차감되지 않았어요 🙂", status: status)
        }
        guard let b64 = json["base64"] as? String, let img = ImageUtil.decode(base64: b64) else {
            AppLog.ui.error("outpaint.emptyResult status=\(status, privacy: .public)")
            throw APIError(message: "채워 맞춤 결과를 받지 못했어요. 잠시 후 다시 시도해 주세요 🙂", status: status)
        }
        return OutpaintResult(image: img, credits: json["credits"] as? Int,
                              quotaUsed: json["quotaUsed"] as? Int, quotaLimit: json["quotaLimit"] as? Int)
    }

    // MARK: 결제 · 초대 · 계정

    /// `POST /api/iap/grant {productId, transactionId}` → 지급 크레딧. 202(pending) 는 잠시 뒤 재시도.
    func iapGrant(productId: String, transactionId: String?, token: String) async throws -> Int? {
        var req = authed("api/iap/grant", token: token)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["productId": productId]
        if let transactionId { body["transactionId"] = transactionId }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        for attempt in 0..<3 {
            let (data, resp) = try await session.data(for: req)
            let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let json = (try? JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:]
            if status == 202 { try? await Task.sleep(nanoseconds: 2_000_000_000 * UInt64(attempt + 1)); continue }
            guard (200...299).contains(status) else {
                throw APIError(message: json["error"] as? String ?? "결제 처리 실패 (오류 \(status))", status: status)
            }
            return json["credits"] as? Int
        }
        throw APIError(message: "구매 확인 중이에요. 잠시 후 크레딧을 확인해 주세요.", status: 202)
    }

    struct ReferralResult: Decodable { let ok: Bool; let reason: String? }
    /// `POST /api/referral/claim {ref}` — 친구 초대 코드 등록.
    func referralClaim(code: String, token: String) async throws -> ReferralResult {
        var req = authed("api/referral/claim", token: token)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: ["ref": code])
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp, data)
        return try JSONDecoder().decode(ReferralResult.self, from: data)
    }

    /// `POST /api/account/delete` — 계정·데이터 영구 삭제.
    func deleteAccount(token: String) async throws {
        var req = authed("api/account/delete", token: token)
        req.httpMethod = "POST"
        let (data, resp) = try await session.data(for: req)
        try Self.check(resp, data)
    }

    // MARK: -

    private func authed(_ path: String, token: String) -> URLRequest {
        var req = URLRequest(url: Config.apiBase.appendingPathComponent(path))
        req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        req.cachePolicy = .reloadIgnoringLocalCacheData
        return req
    }

    private static func check(_ resp: URLResponse, _ data: Data) throws {
        guard let http = resp as? HTTPURLResponse else { return }
        guard (200...299).contains(http.statusCode) else {
            let msg = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(message: msg ?? "요청에 실패했어요 (오류 \(http.statusCode))", status: http.statusCode)
        }
    }

    private static func str(_ v: Any?) -> String? {
        if let s = v as? String { return s }
        if let n = v as? Int { return String(n) }
        return nil
    }
}

/// 숫자/문자열이 섞여 오는 id.
struct LooseID: Decodable {
    let value: String
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { value = String(n) } else { value = try c.decode(String.self) }
    }
}
