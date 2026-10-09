import SwiftUI

/// 카메라·필터 탭 — 스노우처럼 켜자마자 카메라(시제품 C안, 오너 지시 2026-10-09).
/// 아래 필터 줄(폰카 / 아날로그 두 묶음, 길게 누르면 즐겨찾기 → 맨 앞 ⭐) · 앨범 · 셔터 · 전환.
/// 촬영은 지금 앱의 연속 촬영 그대로(최대 10장) → 고른 필터로 편집기에 넘긴다. 로그인 없이 쓴다.
struct CameraFilterTab: View {
    @Environment(AppState.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var model = BurstCameraModel()
    @State private var selected = "none"
    @State private var favs: [String] = UserDefaults.standard.stringArray(forKey: "filter.favorites") ?? []
    @State private var visible = false

    private var phone: [String] { ["ph16pro", "ph15pro", "ph14pro", "phxs", "ph7", "ph6s", "ph4s", "ph3gs"] }
    private var analog: [String] { FilterTabView.groups.filter { $0.key != "phone" }.flatMap { $0.presets.map(\.key) } }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if model.denied {
                VStack(spacing: Spacing.s3) {
                    Text(L.t("카메라 권한이 필요해요", "Camera access is needed")).font(AppFont.headline).foregroundStyle(.white)
                    Button(L.t("설정 열기", "Open Settings")) { if let u = URL(string: UIApplication.openSettingsURLString) { openURL(u) } }
                        .buttonStyle(PrimaryButtonStyle())
                        .padding(.horizontal, Spacing.page)
                }
            } else {
                CameraPreviewLayer(session: model.session).ignoresSafeArea()
                Color.white.ignoresSafeArea().opacity(model.flashOverlay ? 0.85 : 0)
                    .animation(.easeOut(duration: 0.18), value: model.flashOverlay).allowsHitTesting(false)
            }
            VStack(spacing: Spacing.s3) {
                Spacer()
                filterStrip
                HStack {
                    if model.shots.isEmpty {
                        sideButton(L.t("앨범", "Album"), "photo.on.rectangle") { Task { await app.perform(.filterPick(presetKey: selected)) } }
                    } else {
                        Button {
                            app.photoPickPreset = selected
                            app.finishBurstCamera(model.shots)
                            while !model.shots.isEmpty { model.remove(at: 0) }
                        } label: {
                            Text(Copy.burstDone(model.shots.count)).font(AppFont.footnote.weight(.bold)).foregroundStyle(.black)
                                .frame(width: 64, height: 40).background(.white, in: Capsule())
                        }
                    }
                    Spacer()
                    ShutterButton(disabled: model.shots.count >= BurstCameraModel.maxShots) { model.capture() }
                    Spacer()
                    sideButton(L.t("전환", "Flip"), "arrow.triangle.2.circlepath.camera") { model.flip() }
                }
                .padding(.horizontal, Spacing.s5)
                .padding(.bottom, app.contentBottomPad - 24)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .coachHost()
        .onAppear { visible = true; Task { await model.start() }; app.enqueueCoach(Coach.filter) }
        .onDisappear { visible = false; model.stop() }
    }

    private func sideButton(_ title: String, _ icon: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 24, weight: .medium))
                Text(title).font(AppFont.caption.weight(.semibold))
            }
            .foregroundStyle(.white).frame(width: 64)
        }
    }

    private var filterStrip: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s2) {
                chip("none", L.t("원본", "Original"))
                if !favs.isEmpty {
                    groupMark("star.fill", tint: Color.favoriteStar)
                    ForEach(favs, id: \.self) { chip($0, Copy.filterName($0)) }
                }
                groupMark("iphone")
                ForEach(phone, id: \.self) { chip($0, Copy.filterName($0)) }
                groupMark("film")
                ForEach(analog, id: \.self) { chip($0, Copy.filterName($0)) }
            }
            .padding(.horizontal, Spacing.page)
        }
        .scrollIndicators(.hidden)
        .coachAnchor("filterStrip")
    }
    private func groupMark(_ icon: String, tint: Color = .white.opacity(0.7)) -> some View {
        Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundStyle(tint).padding(.horizontal, 2)
    }
    private func chip(_ key: String, _ title: String) -> some View {
        let on = selected == key
        return Text(title).font(AppFont.footnote.weight(.bold)).foregroundStyle(on ? .black : .white)
            .padding(.horizontal, 12).frame(height: 32)
            .background(on ? Color.white : Color.white.opacity(0.14), in: Capsule())
            .onTapGesture { selected = key; HapticPlayer.selection() }
            .onLongPressGesture(minimumDuration: 0.4) {
                guard key != "none" else { return }
                if let i = favs.firstIndex(of: key) { favs.remove(at: i); app.showToast(L.t("즐겨찾는 필터에서 뺐어요", "Removed from favorites")) }
                else { favs.append(key); app.showToast(L.t("즐겨찾는 필터에 넣었어요 · 맨 앞에 모여요", "Added to favorites · shown first")) }
                UserDefaults.standard.set(favs, forKey: "filter.favorites")
                HapticPlayer.selection()
            }
    }
}
