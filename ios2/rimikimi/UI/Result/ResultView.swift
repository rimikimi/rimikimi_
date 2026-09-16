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
                .aspectRatio(CardMetrics.aspect, contentMode: .fit)
                .padding(.horizontal, Spacing.page)
                .padding(.top, Spacing.s2)

                if payload.items.count > 1 {
                    Text("\(payload.items.count)장 만들었어요 · \(page + 1) / \(payload.items.count)")
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                }

                Text("내 사진에 저장됐어요 · 앨범에도 저장")
                    .font(AppFont.callout).foregroundStyle(Color.ink2)

                if needsFit, let img = currentImage {
                    Button { fitImage = img } label: {
                        HStack(spacing: Spacing.s2) {
                            Image(systemName: "aspectratio").foregroundStyle(Color.accent)
                            Text("사진이 3:4 가 아니에요 · 정방향 맞춤").font(AppFont.calloutEmphasis)
                            Spacer()
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.ink3)
                        }
                        .padding(Spacing.s3)
                        .background(Color.accentTint, in: RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                        .contentShape(RoundedRectangle(cornerRadius: Radius.button, style: .continuous))
                    }
                    .buttonStyle(PressScaleButtonStyle(scale: 0.985))
                    .padding(.horizontal, Spacing.page)
                }

                VStack(spacing: Spacing.s2) {
                    Button(action: saveToAlbum) {
                        Label(saving ? "저장 중…" : "앨범에 저장", systemImage: "square.and.arrow.down")
                    }
                    .buttonStyle(PrimaryButtonStyle(isDisabled: currentImage == nil || saving))
                    .disabled(currentImage == nil || saving)

                    HStack(spacing: Spacing.s2) {
                        Button { if let img = currentImage { app.openEditor(image: img) } } label: {
                            Label("다듬기", systemImage: "slider.horizontal.3")
                        }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(currentImage == nil)
                        if let img = currentImage {
                            ShareLink(item: Image(uiImage: img), preview: SharePreview("rimikimi", image: Image(uiImage: img))) {
                                Label("공유", systemImage: "square.and.arrow.up")
                            }
                            .buttonStyle(SecondaryButtonStyle())
                        } else {
                            Button {} label: { Label("공유", systemImage: "square.and.arrow.up") }
                                .buttonStyle(SecondaryButtonStyle()).disabled(true)
                        }
                    }
                    if let concept {
                        Button { oneMore(concept) } label: { Label("한 장 더", systemImage: "arrow.clockwise") }
                            .buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(.horizontal, Spacing.page)

                if let concept {
                    ConceptRail(title: "비슷한 컨셉", concepts: app.concepts.similar(to: concept))
                }
            }
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(payload.conceptTitle.isEmpty ? "결과" : payload.conceptTitle)
        .toolbar(.hidden, for: .tabBar)
        #if DEBUG
        .onAppear { if app.devAutoOpenFit { app.devAutoOpenFit = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { fitImage = currentImage } } }
        #endif
        .sheet(item: Binding(get: { fitImage.map { FitTarget(image: $0) } }, set: { fitImage = $0?.image })) { t in
            FitSheet(image: t.image) { out in
                if let id = current?.id { cropped[id] = out }
                app.showToast("3:4 로 맞췄어요")
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

    private func saveToAlbum() {
        guard let img = currentImage, !saving else { return }
        saving = true
        Task {
            defer { saving = false }
            do {
                try await PHPhotoLibrary.shared().performChanges { PHAssetChangeRequest.creationRequestForAsset(from: img) }
                HapticPlayer.success()
                app.showToast("사진첩에 저장됐어요")
            } catch {
                app.showToast("저장에 실패했어요. 잠시 후 다시 시도해 주세요.")
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

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Radius.card, style: .continuous).fill(Color.fill)
            if let img = override ?? item.image ?? loaded[item.id] {
                Image(uiImage: img).resizable().scaledToFill()
            } else {
                ProgressView().tint(Color.ink2)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .task {
            guard item.image == nil, loaded[item.id] == nil, let url = item.url else { return }
            if let (data, _) = try? await URLSession.shared.data(from: url), let img = UIImage(data: data) {
                loaded[item.id] = img
            }
        }
    }
}
