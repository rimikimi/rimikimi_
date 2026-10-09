import SwiftUI
import Photos

/// 결과 — 사진 크게 · "내 사진에 저장됐어요 · 앨범에도 저장" · 앨범 저장 / 다듬기 / 공유 / 한 장 더 / 비슷한 컨셉.
struct ResultView: View {
    @Environment(AppState.self) private var app
    var payload: ResultPayload

    @State private var page = 0
    @State private var loaded: [String: UIImage] = [:]
    @State private var saving = false
    @State private var fitImage: UIImage?
    /// 잘라 맞춤 결과 — 원본 대신 보여주고 저장·공유에 쓴다.
    @State private var cropped: [String: UIImage] = [:]

    private var concept: Concept? { payload.conceptId.flatMap { app.concepts.concept(id: $0) } }
    private var current: GenerationCoordinator.ResultItem? { payload.items.indices.contains(page) ? payload.items[page] : nil }
    private var currentImage: UIImage? { current.flatMap { cropped[$0.id] ?? $0.image ?? loaded[$0.id] } }
    /// 제목 — 컨셉을 찾으면 언어에 맞는 이름, 못 찾으면 저장된(서버가 준) 이름.
    private var displayTitle: String { concept?.displayTitle ?? payload.conceptTitle }
    private var needsFit: Bool { currentImage.map(FaceCrop.needsFit) ?? false }

    var body: some View {
        ScrollView {
            VStack(spacing: Spacing.s4) {
                TabView(selection: $page) {
                    ForEach(Array(payload.items.enumerated()), id: \.element.id) { i, item in
                        ResultPhoto(item: item, loaded: $loaded, override: cropped[item.id]).tag(i)
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: payload.items.count > 1 ? .automatic : .never))
                .photoRatio()
                .padding(.horizontal, Spacing.page)
                .padding(.top, Spacing.s2)

                if payload.items.count > 1 {
                    Text(Copy.resultCount(payload.items.count, page: page + 1))
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                }

                // 정방향 맞춤 안내는 뺐다(오너 지시 2026-10-09 "정방향 맞추기는 없애자").

                VStack(spacing: Spacing.s2) {
                    Button(action: saveToAlbum) {
                        Label(saving ? Copy.saving : Copy.saveToAlbum, systemImage: "square.and.arrow.down")
                    }
                    .buttonStyle(PrimaryButtonStyle(isDisabled: currentImage == nil || saving))
                    .disabled(currentImage == nil || saving)

                    HStack(spacing: Spacing.s2) {
                        Button { if let img = currentImage { app.openEditor(image: img) } } label: {
                            Label(Copy.edit, systemImage: "slider.horizontal.3")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(currentImage == nil)
                        if let img = currentImage {
                            ShareLink(item: Image(uiImage: img), preview: SharePreview("rimikimi", image: Image(uiImage: img))) {
                                Label(Copy.share, systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        } else {
                            Button {} label: { Label(Copy.share, systemImage: "square.and.arrow.up") }
                                .buttonStyle(SecondaryButtonStyle()).disabled(true)
                        }
                    }
                    if let concept {
                        Button { oneMore(concept) } label: { Label(Copy.oneMore, systemImage: "arrow.clockwise") }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(.horizontal, Spacing.page)

                if let concept {
                    ConceptRail(title: Copy.similarConcepts, concepts: app.concepts.similar(to: concept))
                }
            }
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(displayTitle.isEmpty ? Copy.resultTitle : displayTitle)
        .toolbar(.hidden, for: .tabBar)
        // 부적절 콘텐츠 신고 (App Store Guideline 1.2 — AI 인물 이미지 서비스는 인앱 신고 경로가 있어야 하고,
        // `public/terms.html` 제7조도 "앱 내 신고 기능"을 약속한다). 화면에 문구로 두지 않고 ⋯ 메뉴 안에
        // (오너 지시 10/1: 경고·안내 문구는 튜토리얼·설정에만). 수신함·제목 규칙은 웹 신고 링크와 같다.
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive, action: reportIssue) { Label(Copy.reportResult, systemImage: "flag") }
                } label: { Image(systemName: "ellipsis") }
            }
        }
        // ATT는 결과 화면이 실제로 보이는 이 시점에만 시도한다(`TrackingPrompt` 주석 참고) — 내비게이션
        // 전환 중(`RootTabView`의 onChange)에 부르면 앱이 아직 `.active`가 아닐 수 있어 팝업 없이
        // 플래그만 타 버릴 위험이 있었다(컴플라이언스 리뷰로 발견). 매번 호출해도 안전 —
        // 이미 물었으면 내부에서 바로 completion만 부르고 끝난다.
        .onAppear { app.afterFirstResult() }
        #if DEBUG
        .onAppear { if app.devAutoOpenFit { app.devAutoOpenFit = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { fitImage = currentImage } } }
        #endif
        .sheet(item: Binding(get: { fitImage.map { FitTarget(image: $0) } }, set: { fitImage = $0?.image })) { t in
            FitSheet(image: t.image) { out in
                if let id = current?.id { cropped[id] = out }
                app.showToast(Copy.fittedToast)
            }
            .presentationDetents([.large])
            .presentationCornerRadius(Radius.sheet)
        }
    }

    private func oneMore(_ concept: Concept) {
        app.myPhotosPath.removeAll()
        app.tab = .gallery
        app.galleryPath = [.concept(concept)]
    }

    /// 웹 `src/PortraitStudio.jsx`의 `mailto:` 신고 링크와 같은 수신함·제목 규칙.
    private func reportIssue() {
        let conceptLabel = concept.map { "\($0.displayTitle) (#\($0.id))" } ?? payload.conceptTitle
        let itemId = current?.id ?? "-"
        var comps = URLComponents()
        comps.scheme = "mailto"
        comps.path = "enquiry@rimikimi.com"
        comps.queryItems = [
            URLQueryItem(name: "subject", value: Copy.reportSubject(itemId)),
            URLQueryItem(name: "body", value: Copy.reportBody(concept: conceptLabel, itemId: itemId)),
        ]
        guard let url = comps.url else { return }
        UIApplication.shared.open(url)
    }

    private func saveToAlbum() {
        guard let img = currentImage, !saving else { return }
        saving = true
        Task {
            defer { saving = false }
            await app.adGateBeforeSave() // 무료 사용자는 광고를 본 뒤 저장
            do {
                try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAsset(from: img) }
                // 앨범에 저장한 컨셉만 "만든 컨셉" 표시가 영구로 남는다(오너 지시 2026-09-22).
                app.favorites.markSaved(payload.conceptId)
                HapticPlayer.success()
                app.showToast(Copy.savedToPhotos)
            } catch {
                app.showToast(Copy.saveFailed)
            }
        }
    }
}

struct FitTarget: Identifiable { let id = UUID(); let image: UIImage }

/// 결과 한 장 — base64 로 받은 것은 바로, 갤러리에서 복구한 것은 URL 로 내려받아 저장·공유에 쓴다.
struct ResultPhoto: View {
    var item: GenerationCoordinator.ResultItem
    @Binding var loaded: [String: UIImage]
    var override: UIImage? = nil
    /// 매직 부스 원본(기기에만 보관, `OriginalStore`) — 있으면 길게 누르는 동안 원본을 보여 준다.
    @State private var original: UIImage?
    @GestureState private var showingOriginal = false

    var body: some View {
        let result = override ?? item.image ?? loaded[item.id]
        ZStack {
            // 바탕 칸은 불러오는 동안만 — 사진이 3:4 가 아니어도 남는 자리가 회색 띠로 보이지 않게
            if result == nil { RoundedRectangle(cornerRadius: Radius.card, style: .continuous).fill(Color.fill) }
            if showingOriginal, let original {
                Image(uiImage: original).resizable().scaledToFit()
            } else if let img = result {
                // 결과 전체를 보여준다 — 잘라서 채우지 않는다(오너 지시 2026-10-09 "결과물 전체를 보여줘야 함")
                Image(uiImage: img).resizable().scaledToFit()
            } else {
                ProgressView().tint(Color.ink2)
            }
        }
        .overlay(alignment: .bottom) {
            // 평소엔 문구 없음 — "길게 눌러 원본 보기"는 튜토리얼로 옮겼다(10/1). 누르는 동안만 "원본" 표시.
            if original != nil, result != nil, showingOriginal {
                Text(Copy.resultOriginalBadge)
                    .font(AppFont.footnote).foregroundStyle(.white)
                    .padding(.horizontal, Spacing.s3).padding(.vertical, 6)
                    .background(.black.opacity(0.45), in: Capsule())
                    .padding(.bottom, Spacing.s3)
                    .allowsHitTesting(false)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .contentShape(Rectangle())
        // 길게 누르는 동안만 원본(손 떼면 결과). 짧은 스와이프는 그대로 페이지 넘김.
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.2)
                .sequenced(before: DragGesture(minimumDistance: 0))
                .updating($showingOriginal) { value, state, _ in
                    if case .second(true, _) = value, original != nil { state = true }
                }
        )
        .sensoryFeedback(.selection, trigger: showingOriginal)
        .task(id: item.id) {
            // 완성 직후엔 원본을 결과 id 로 옮겨 적는 중일 수 있다 — 2초까지 다시 본다.
            for _ in 0..<10 {
                if let img = OriginalStore.image(for: item.id) { original = img; return }
                try? await Task.sleep(for: .milliseconds(200))
            }
        }
        // id 로 묶는다 — 같은 화면이 다른 결과로 바뀌어도 다시 내려받게(그냥 .task 는 처음 한 번만 돈다).
        // 네트워크가 잠깐 끊겨도 로딩 표시에 갇히지 않게 3번까지 다시 시도한다.
        .task(id: item.url) {
            guard item.image == nil, loaded[item.id] == nil, let url = item.url else { return }
            for attempt in 0..<3 {
                if attempt > 0 { try? await Task.sleep(for: .seconds(1.5)) }
                if Task.isCancelled { return }
                if let (data, _) = try? await URLSession.shared.data(from: url), let img = UIImage(data: data) {
                    loaded[item.id] = img
                    return
                }
            }
        }
    }
}
