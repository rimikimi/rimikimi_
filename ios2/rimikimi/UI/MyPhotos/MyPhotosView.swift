import SwiftUI

/// 내 사진 — 서버 갤러리 그리드 + 맨 위 진행 카드(생성 중).
struct MyPhotosView: View {
    @Environment(AppState.self) private var app
    @State private var items: [GalleryItem] = []
    @State private var loading = false
    @State private var error: String?

    private let columns = [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)]

    var body: some View {
        ScrollView {
            LazyVStack(spacing: Spacing.s4) {
                ProgressCard()
                if !app.auth.isSignedIn {
                    EmptyState(message: "로그인하면 내가 만든 이미지를 볼 수 있어요", actionTitle: "로그인") {
                        app.loginMessage = nil
                        app.loginSheet = true
                    }
                } else if loading && items.isEmpty {
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(0..<6, id: \.self) { _ in SkeletonBlock(cornerRadius: Radius.thumb).aspectRatio(CardMetrics.aspect, contentMode: .fit) }
                    }
                    .padding(.horizontal, Spacing.page)
                } else if items.isEmpty {
                    EmptyState(message: error ?? "아직 생성한 이미지가 없어요", actionTitle: "컨셉 선택하러 가기") { app.tab = .gallery }
                } else {
                    Text("생성된 이미지는 1시간만 보관돼요. 오래 보관하려면 앨범에 저장해 주세요.")
                        .font(AppFont.footnote).foregroundStyle(Color.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, Spacing.page)
                    LazyVGrid(columns: columns, spacing: 6) {
                        ForEach(items) { item in
                            NavigationLink(value: Route.result(ResultPayload(
                                items: [.init(id: item.id, image: nil, url: item.url, expiresAt: item.expiresAt)],
                                conceptId: item.conceptId, conceptTitle: item.conceptTitle ?? ""))) {
                                RemoteImage(url: item.url, cornerRadius: Radius.thumb)
                                    .aspectRatio(CardMetrics.aspect, contentMode: .fit)
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
            }
            .padding(.top, Spacing.s2)
            .padding(.bottom, TabBarMetrics.contentBottomPad)
        }
        .scrollIndicators(.hidden)
        .background(Color.bg)
        .inlineTitle("내 사진")
        .task(id: app.auth.session?.userID) { await reload() }
        .onChange(of: app.generation.state) { _, s in
            if case .done = s { Task { await reload() } }
        }
        .refreshable { await reload() }
    }

    private func reload() async {
        guard let token = await app.auth.validAccessToken() else { items = []; return }
        loading = true
        defer { loading = false }
        do {
            items = try await RimikimiAPI.shared.fetchGallery(token: token)
            error = nil
        } catch {
            self.error = "갤러리를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
        }
    }
}

/// 진행 카드 — 만드는 중 / 완성 / 실패. 완료되면 카드가 결과로 바뀌고 탭하면 결과 화면.
struct ProgressCard: View {
    @Environment(AppState.self) private var app

    var body: some View {
        switch app.generation.state {
        case .idle:
            EmptyView()
        case .running(let job, let waiting):
            card {
                HStack(spacing: Spacing.s3) {
                    ProgressView().tint(Color.accent)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("이미지를 만들고 있어요").font(AppFont.headline)
                        Text(waiting ? "연결이 잠시 끊겼지만 서버는 계속 만들고 있어요.\n결과를 기다리는 중이에요..."
                             : (job.count > 1 ? "\(job.count)장을 만드는 중이라 몇 분까지 걸릴 수 있어요" : "최대 몇 분까지 걸릴 수 있어요"))
                            .font(AppFont.footnote).foregroundStyle(Color.ink2)
                        Text(job.conceptTitle).font(AppFont.caption).foregroundStyle(Color.ink3)
                    }
                    Spacer()
                }
            }
        case .done(let job, let items):
            Button { app.present(items, job: job) } label: {
                card {
                    HStack(spacing: Spacing.s3) {
                        if let first = items.first {
                            ResultThumb(item: first)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("완성!").font(AppFont.headline)
                            Text(job.conceptTitle).font(AppFont.footnote).foregroundStyle(Color.ink2)
                        }
                        Spacer()
                        Text("보기").font(AppFont.calloutEmphasis).foregroundStyle(Color.accent)
                    }
                }
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.985))
        case .failed(let job, let message):
            card {
                HStack(alignment: .top, spacing: Spacing.s3) {
                    Image(systemName: "exclamationmark.circle").foregroundStyle(Color.accent).font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("생성 실패").font(AppFont.headline)
                        Text(message).font(AppFont.footnote).foregroundStyle(Color.ink2).lineLimit(4)
                        Text(job.conceptTitle).font(AppFont.caption).foregroundStyle(Color.ink3)
                        if app.generation.quotaExceeded {
                            Button("크레딧 충전") { app.creditsSheet = true }
                                .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false)).padding(.top, 4)
                        }
                    }
                    Spacer()
                    Button { app.generation.dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(Color.ink2)
                            .frame(width: 28, height: 28).background(Color.fill, in: Circle())
                    }
                    .buttonStyle(.plain).accessibilityLabel("닫기")
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
