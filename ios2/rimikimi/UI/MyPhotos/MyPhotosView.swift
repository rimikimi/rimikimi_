import SwiftUI

/// 내 사진 — 서버 갤러리 그리드 + 맨 위 진행 카드(생성 중).
struct MyPhotosView: View {
    @Environment(AppState.self) private var app
    @State private var items: [GalleryItem] = []
    @State private var loading = false
    @State private var error: String?

    private let columns = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]

    var body: some View {
        ScrollViewReader { proxy in
        ScrollView {
            LazyVStack(spacing: Spacing.s4) {
                ProgressCard()
                if !app.auth.isSignedIn {
                    EmptyState(message: Copy.mineLoginPrompt, actionTitle: Copy.signIn) {
                        app.loginMessage = nil
                        app.loginSheet = true
                    }
                } else if loading && items.isEmpty {
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(0..<6, id: \.self) { _ in SkeletonBlock(cornerRadius: Radius.thumb).photoRatio() }
                    }
                    .padding(.horizontal, Spacing.page)
                } else if items.isEmpty {
                    EmptyState(message: error ?? Copy.mineEmpty, actionTitle: Copy.mineEmptyCta) { app.tab = .gallery }
                } else {
                    Text(Copy.mineNotice)
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.page)
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(items) { item in
                            NavigationLink(value: Route.result(ResultPayload(
                                items: [.init(id: item.id, image: nil, url: item.url, expiresAt: item.expiresAt)],
                                conceptId: item.conceptId, conceptTitle: item.conceptTitle ?? ""))) {
                                RemoteImage(url: item.url, cornerRadius: Radius.thumb)
                                    .photoRatio()
                                    .overlay(alignment: .bottomLeading) {
                                        if let e = item.expiresAt {
                                            Text(e, style: .timer)
                                                .font(AppFont.caption).monospacedDigit()
                                                .foregroundStyle(.white)
                                                .padding(.horizontal, 6).padding(.vertical, 3)
                                                .background(.black.opacity(0.45), in: Capsule())
                                                .padding(6)
                                        }
                                    }
                            }
                            .buttonStyle(PressScaleButtonStyle())
                        }
                    }
                    .padding(.horizontal, Spacing.page)
                }
                Color.clear.frame(height: 1).id("bottomAnchor")
            }
            .padding(.top, Spacing.s2)
            .padding(.bottom, app.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle(Copy.tabMyPhotos)
        .task(id: app.auth.session?.userID) { await reload() }
        .onChange(of: app.generation.doneTick) { _, _ in
            Task { await reload() }
        }
        .refreshable { await reload() }
        #if DEBUG
        // 결함 #4 검증 캡처용 — `reload()` 가 늦게 끝나 콘텐츠가 나중에 자라는 경우까지 커버(`GalleryHomeView`
        // 와 같은 이유, 기기별 로드 타이밍 차이로 재현됨).
        .defaultScrollAnchor(app.devScrollToBottom ? .bottom : .top)
        .onChange(of: loading) { _, isLoading in
            guard app.devScrollToBottom, !isLoading else { return }
            devRepeatScrollToBottom(proxy)
        }
        .onAppear {
            guard app.devScrollToBottom, !loading else { return }
            devRepeatScrollToBottom(proxy)
        }
        #endif
        }
    }

    #if DEBUG
    /// `GalleryHomeView.devRepeatScrollToBottom` 과 같은 이유(`LazyVGrid` 레이아웃 수렴 여러 프레임 필요).
    private func devRepeatScrollToBottom(_ proxy: ScrollViewProxy) {
        for delay in [0.2, 0.5, 0.9, 1.4] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                proxy.scrollTo("bottomAnchor", anchor: .bottom)
            }
        }
    }
    #endif

    private func reload() async {
        guard let token = await app.auth.validAccessToken() else { items = []; return }
        loading = true
        defer { loading = false }
        do {
            items = try await RimikimiAPI.shared.fetchGallery(token: token)
            // 격자의 "만든 컨셉" 표시 — 만든 시각은 갤러리 항목의 `createdAt` 을 그대로 쓴다.
            // (지금 시각으로 적으면 표시 수명이 실제 보관 기간보다 길어진다.)
            app.favorites.markGenerated(items.compactMap { item in
                item.conceptId.map { ($0, item.createdAt ?? Date()) }
            })
            error = nil
        } catch {
            self.error = Copy.mineLoadFailed
        }
    }
}

/// 진행 카드 — 만드는 중 / 완성 / 실패. 완료되면 카드가 결과로 바뀌고 탭하면 결과 화면.
///
/// ⚠️ 카드가 **여러 개** 뜬다 (오너 지시 2026-09-18: 동시에 여러 장 만들기).
///    예전엔 코디네이터가 작업을 하나만 들고 있어서 카드도 하나였고, 두 번째 생성을
///    시작하면 카드에 **이전 작업의 제목**이 떠 있었다.
struct ProgressCard: View {
    @Environment(AppState.self) private var app

    var body: some View {
        VStack(spacing: Spacing.s3) {
            ForEach(app.generation.entries) { entry in
                row(entry)
            }
        }
    }

    @ViewBuilder
    private func row(_ entry: GenerationCoordinator.Entry) -> some View {
        let job = entry.job
        switch entry.phase {
        case .running(let waiting):
            card {
                HStack(spacing: Spacing.s3) {
                    ProgressView().tint(Color.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Copy.genRunning).font(AppFont.headline)
                        Text(waiting ? Copy.genWaiting
                             : (job.count > 1 ? Copy.genBatchHint(job.count) : Copy.genHint))
                            .font(AppFont.footnote).foregroundStyle(Color.ink2)
                        Text(app.concepts.displayTitle(id: job.conceptId, fallback: job.conceptTitle)).font(AppFont.caption).foregroundStyle(Color.ink3)
                    }
                    Spacer()
                }
            }
        case .done(let items):
            // ⚠️ 닫기(X)가 없어 완성 카드가 세션 내내 쌓였다(2026-09-18 스윕 확정).
            //    X 를 "보기" 버튼 **안**에 넣으면 버튼이 중첩돼 탭이 엉킨다 — 형제 버튼으로 둔다.
            card {
                HStack(spacing: Spacing.s3) {
                    Button { app.present(items, job: job) } label: {
                        HStack(spacing: Spacing.s3) {
                            if let first = items.first {
                                ResultThumb(item: first)
                            }
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Copy.genDone).font(AppFont.headline)
                                Text(app.concepts.displayTitle(id: job.conceptId, fallback: job.conceptTitle)).font(AppFont.footnote).foregroundStyle(Color.ink2)
                            }
                            Spacer()
                            Text(Copy.genView).font(AppFont.calloutEmphasis).foregroundStyle(Color.accent)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(PressScaleButtonStyle(scale: 0.985))
                    Button { app.generation.dismiss(entry.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink2)
                            .frame(width: 28, height: 28).background(Color.fill, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel(Copy.close)
                }
            }
        case .failed(let message):
            card {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    Image(systemName: "exclamationmark.circle").foregroundStyle(Color.accent).font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(Copy.genFailed).font(AppFont.headline)
                        Text(message).font(AppFont.footnote).foregroundStyle(Color.ink2).lineLimit(4)
                        Text(app.concepts.displayTitle(id: job.conceptId, fallback: job.conceptTitle)).font(AppFont.caption).foregroundStyle(Color.ink3)
                        if app.generation.quotaExceeded {
                            Button(Copy.getCredits) { app.creditsSheet = true }
                                .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false)).padding(.top, 4)
                        }
                    }
                    Spacer()
                    Button { app.generation.dismiss(entry.id) } label: {
                        Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink2)
                            .frame(width: 28, height: 28).background(Color.fill, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel(Copy.close)
                }
            }
        }
    }

    private func card<C: View>(@ViewBuilder _ content: () -> C) -> some View {
        content()
            .padding(Spacing.s4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .padding(.horizontal, Spacing.page)
    }
}

struct ResultThumb: View {
    var item: GenerationCoordinator.ResultItem
    var body: some View {
        ZStack {
            if let img = item.image { Image(uiImage: img).resizable().scaledToFill() }
            else { RemoteImage(url: item.url, cornerRadius: Radius.thumb) }
        }
        .frame(width: 48, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
    }
}
