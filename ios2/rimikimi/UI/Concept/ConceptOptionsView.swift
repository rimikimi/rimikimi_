import SwiftUI
import PhotosUI

/// 컨셉 → 옵션 화면(푸시). 상단 바 제목=컨셉명, 미리보기 크게, "내 사진" 카드 한 줄, 컨셉별 옵션, 만들기.
/// STEP 02(사진 업로드) 화면은 없다 — 매직부스 일회용 사진·커플 상대 사진·드레스룸 의상은 여기 슬롯.
struct ConceptOptionsView: View {
    @Environment(AppState.self) private var app
    var concept: Concept

    @State private var batchCount = 1
    @State private var fourcutCount = 4
    @State private var fourcutStyleKey = ""
    @State private var dressStyle = "mirror"
    @State private var garments: [UIImage] = []
    @State private var partnerPhoto: UIImage?
    @State private var artPhoto: UIImage?

    private var styles: [FourcutStyle] {
        FourcutDefaults.resolve(concept.fourcutStyles ?? app.concepts.concepts.first { $0.isFourcut }?.fourcutStyles)
    }

    /// 이 컨셉이 실제로 보낼 본인 사진 — 매직부스는 일회용 사진, 나머지는 등록 사진.
    private var mainPhoto: UIImage? { concept.isArtTransform ? artPhoto : app.userPhoto.image }

    private var missingReason: String? {
        if mainPhoto == nil { return concept.isArtTransform ? "변환할 사진을 골라주세요" : "먼저 내 사진을 등록해 주세요" }
        if concept.isCouple && partnerPhoto == nil { return "상대 사진도 올려주세요 🙂" }
        if concept.isDressroom && garments.isEmpty { return "입어볼 의상 사진을 먼저 올려주세요 🙂" }
        return nil
    }

    private var cost: Int { concept.isFourcut || concept.isArtTransform ? 1 : BatchOption.cost(for: batchCount) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Spacing.s4) {
                // 히어로도 거의 화면 폭 — 400px 썸네일은 여기서 뭉갠다(오너 지적 2026-09-22).
                RemoteImage(url: concept.largeURL, cornerRadius: Radius.card, fallback: concept.thumbURL)
                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                    .padding(.horizontal, Spacing.page)
                    .padding(.top, Spacing.s2)

                if concept.isArtTransform {
                    PhotoSlotCard(title: "변환할 사진", subtitle: "인물, 풍경, 동물, 정물 무엇이든 좋아요", image: artPhoto) { artPhoto = $0 }
                } else {
                    MyPhotoCard()
                }
                if concept.isCouple {
                    PhotoSlotCard(title: "상대 사진", subtitle: "얼굴이 잘 보이는 사진이면 좋아요", image: partnerPhoto) { partnerPhoto = $0 }
                }
                if concept.isDressroom {
                    GarmentsBlock(garments: $garments)
                    OptionBlock(title: "어떤 컷으로 만들까요?") {
                        SegmentedPair(options: [("mirror", "거울셀카"), ("model", "일상컷")], selection: $dressStyle)
                    }
                }
                if concept.isFourcut {
                    OptionBlock(title: "컷 수") {
                        HStack(spacing: Spacing.s2) {
                            ForEach(FourcutDefaults.counts, id: \.self) { n in
                                OptionChip(title: "\(n)컷", isActive: fourcutCount == n) { choose { fourcutCount = n } }
                            }
                        }
                    }
                    OptionBlock(title: "스타일") {
                        FlowChips(styles: styles, selection: $fourcutStyleKey)
                    }
                }
                if !concept.isFourcut && !concept.isArtTransform {
                    OptionBlock(title: "한 번에 만들기", note: app.quota.map { "크레딧 \($0.creditsAvailable)개 보유" }) {
                        HStack(spacing: Spacing.s2) {
                            ForEach(BatchOption.all, id: \.count) { b in
                                OptionChip(title: b.label, subtitle: app.quota?.unlimited == true ? "무제한" : "\(b.cost) 크레딧",
                                           badge: b.badge, isActive: batchCount == b.count) { choose { batchCount = b.count } }
                            }
                        }
                    }
                }
                Text(concept.isArtTransform ? "업로드하신 사진을 선택한 컨셉으로 변환해 드려요." : "선택한 컨셉으로 내 얼굴 특징을 살린 이미지를 만들어 드려요.")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    .padding(.horizontal, Spacing.page)
            }
            .padding(.bottom, Spacing.s5)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(concept.title)
        .toolbar(.hidden, for: .tabBar)
        .scrollEdgeEffectStyle(.hard, for: .bottom)
        .safeAreaBar(edge: .bottom) {
            VStack(spacing: Spacing.s2) {
                Text(missingReason ?? " ")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2)
                    .frame(height: 18)
                    .opacity(missingReason == nil ? 0 : 1)
                    .animation(.easeOut(duration: 0.18), value: missingReason)
                Button(action: generate) {
                    Text("만들기 · \(cost) 크레딧")
                }
                .buttonStyle(PrimaryButtonStyle(isDisabled: missingReason != nil))
                .disabled(missingReason != nil)
            }
            .padding(.horizontal, Spacing.page)
            .padding(.top, Spacing.s3)
            .padding(.bottom, Spacing.s2)
        }
        .onAppear {
            if fourcutStyleKey.isEmpty {
                fourcutStyleKey = concept.fourcutStyle.flatMap { k in styles.first { $0.key == k }?.key } ?? styles.first?.key ?? "cute"
            }
        }
    }

    private func choose(_ change: () -> Void) {
        change()
        HapticPlayer.selection()
    }

    private func generate() {
        guard let photo = mainPhoto, missingReason == nil else { return }
        var req = GenerateRequest(concept: concept, photo: photo)
        req.partnerPhoto = concept.isCouple ? partnerPhoto : nil
        req.garments = concept.isDressroom ? garments : []
        req.dressStyle = dressStyle
        req.count = (concept.isFourcut || concept.isArtTransform) ? 1 : batchCount
        if concept.isFourcut { req.cutCount = fourcutCount; req.fourcutStyle = fourcutStyleKey }
        app.requireLogin(.generate(req), message: "생성된 이미지 저장을 위해 로그인이 필요합니다")
    }
}

/// 옵션 묶음 — 제목(17/600) + 내용. 흰 카드.
struct OptionBlock<Content: View>: View {
    var title: String
    var note: String? = nil
    @ViewBuilder var content: () -> Content
    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(AppFont.headline).tracking(Tracking.headline)
                if let note { Text("· " + note).font(AppFont.footnote).foregroundStyle(Color.ink2) }
            }
            ScrollView(.horizontal) { content().padding(.vertical, 6) }.scrollIndicators(.hidden).scrollClipDisabled()
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
    }
}

/// 스타일 칩 — 두 줄로 흐르게.
struct FlowChips: View {
    var styles: [FourcutStyle]
    @Binding var selection: String
    var body: some View {
        let rows = stride(from: 0, to: styles.count, by: 2).map { i in Array(styles[i..<min(i + 2, styles.count)]) }
        VStack(alignment: .leading, spacing: Spacing.s2) {
            ForEach(0..<2, id: \.self) { r in
                HStack(spacing: Spacing.s2) {
                    ForEach(rows.compactMap { $0.count > r ? $0[r] : nil }, id: \.key) { s in
                        OptionChip(title: [s.emoji, s.label].compactMap { $0 }.joined(separator: " "), isActive: selection == s.key) {
                            guard selection != s.key else { return }
                            selection = s.key
                            HapticPlayer.selection()
                        }
                    }
                }
            }
        }
    }
}
