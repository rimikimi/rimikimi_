import SwiftUI

/// 카메라·필터 탭 — 스노우처럼 켜자마자 카메라(시제품 C안, 오너 지시 2026-10-09).
/// 아래 필터 줄(폰카 / 아날로그 두 묶음, 길게 누르면 즐겨찾기 → 맨 앞 ⭐) · 앨범 · 셔터 · 전환.
/// 촬영은 지금 앱의 연속 촬영 그대로(최대 10장) → 고른 필터로 편집기에 넘긴다. 로그인 없이 쓴다.
struct CameraFilterTab: View {
    @Environment(AppState.self) private var app
    @Environment(\.openURL) private var openURL
    @State private var model = BurstCameraModel(livePreview: true)   // 고른 필터를 미리보기에 실시간으로
    @State private var selected = "none"
    @State private var favs: [String] = UserDefaults.standard.stringArray(forKey: "filter.favorites") ?? []
    @State private var visible = false
    @State private var focusMark: FocusMark?
    @State private var biasAtDragStart: Float?
    struct FocusMark: Equatable { let id = UUID(); let point: CGPoint; var touched = Date() }

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
                if let live = model.live {
                    // 기본 카메라처럼 — 탭 = 그 자리 초점·노출, 두 손가락 = 줌(오너 지시 2026-10-09)
                    GeometryReader { geo in
                        LiveFilterPreview(renderer: live)
                            .contentShape(Rectangle())
                            .onTapGesture(coordinateSpace: .local) { pt in
                                if let dp = live.devicePoint(pt, in: geo.size) {
                                    model.focus(at: dp); model.setExposureBias(0)
                                    focusMark = FocusMark(point: pt)
                                }
                            }
                            // 초점을 잡은 뒤 위아래로 끌면 밝기(노출) — 기본 카메라와 같다
                            .simultaneousGesture(DragGesture(minimumDistance: 12)
                                .onChanged { g in
                                    guard focusMark != nil, abs(g.translation.height) > abs(g.translation.width) else { return }
                                    if biasAtDragStart == nil { biasAtDragStart = model.exposureBias }
                                    model.setExposureBias((biasAtDragStart ?? 0) - Float(g.translation.height / 120))
                                    focusMark?.touched = Date()
                                }
                                .onEnded { _ in biasAtDragStart = nil })
                            .simultaneousGesture(MagnifyGesture()
                                .onChanged { model.setZoom(model.zoomAtGestureStart * $0.magnification) }
                                .onEnded { _ in model.commitZoom() })
                            .overlay(alignment: .topLeading) {
                                if let m = focusMark {
                                    HStack(spacing: 6) {
                                        RoundedRectangle(cornerRadius: 4).stroke(Color.yellow, lineWidth: 1.5)
                                            .frame(width: 76, height: 76)
                                        Image(systemName: "sun.max.fill").font(.system(size: 16)).foregroundStyle(Color.yellow)
                                            .offset(y: CGFloat(-model.exposureBias) * 18)
                                    }
                                    .offset(x: 11)   // 해 아이콘 폭만큼 — 네모 가운데가 탭한 자리
                                    .position(m.point)
                                    .id(m.id)
                                    .transition(.opacity)
                                    .allowsHitTesting(false)
                                    .task(id: m.touched) {
                                        try? await Task.sleep(for: .seconds(2))
                                        withAnimation(.easeOut(duration: 0.25)) { if focusMark?.id == m.id { focusMark = nil } }
                                    }
                                }
                            }
                    }
                    .ignoresSafeArea()
                } else {
                    CameraPreviewLayer(session: model.session).ignoresSafeArea()
                }
                Color.white.ignoresSafeArea().opacity(model.flashOverlay ? 0.85 : 0)
                    .animation(.easeOut(duration: 0.18), value: model.flashOverlay).allowsHitTesting(false)
            }
            VStack(spacing: Spacing.s3) {
                HStack {
                    if !model.isFront {
                        CircleGlassButton(system: model.flashOn ? "bolt.fill" : "bolt.slash",
                                          tint: model.flashOn ? Color.heartYellow : .white) { model.flashOn.toggle() }
                    }
                    Spacer()
                    if model.isFront {
                        Button { model.frontMirror.toggle() } label: {
                            Label(L.t("좌우반전", "Mirror"), systemImage: "arrow.left.and.right")
                                .font(AppFont.footnote.weight(.bold))
                                .foregroundStyle(model.frontMirror ? Color.black : Color.white)
                                .padding(.horizontal, 12).frame(height: 34)
                                .background(model.frontMirror ? Color.white : Color.black.opacity(0.35), in: Capsule())
                        }
                        .buttonStyle(PressScaleButtonStyle())
                        .accessibilityAddTraits(model.frontMirror ? [.isSelected] : [])
                    }
                }
                .padding(.horizontal, Spacing.page).padding(.top, Spacing.s2)
                Spacer()
                lensRow
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
                // 탭바와 사이가 너무 떴다(오너 지적 2026-10-09 "갭이 넘 큼", 오너 폰 ~94pt) → 셔터 아래와 탭바 위 사이 ~16pt(시뮬레이터 실측).
                .padding(.bottom, app.contentBottomPad - 104)
            }
        }
        .toolbar(.hidden, for: .navigationBar)
        .coachHost()
        .onAppear { visible = true; Task { await model.start() }; app.enqueueCoach(Coach.filter) }
        .onDisappear { visible = false; model.stop() }
        .onChange(of: selected, initial: true) { model.live?.presetKey = selected }
    }

    /// 렌즈 버튼 — 기본 카메라처럼 0.5 · 1 · 2 · 망원(있는 것만). 지금 배율에 가까운 버튼에 실제 배율을 띄운다.
    @ViewBuilder private var lensRow: some View {
        if !model.lensStops.isEmpty {
            let near = model.lensStops.min { abs($0 - model.zoom) < abs($1 - model.zoom) }
            HStack(spacing: 6) {
                ForEach(model.lensStops, id: \.self) { stop in
                    let on = stop == near
                    Button { model.jumpZoom(stop) } label: {
                        Text(on ? Self.zoomText(model.zoom, active: true) : Self.zoomText(stop, active: false))
                            .font(.system(size: on ? 13 : 11, weight: .bold)).monospacedDigit()
                            .foregroundStyle(on ? Color.yellow : Color.white)
                            .frame(width: on ? 38 : 30, height: on ? 38 : 30)
                            .background(.black.opacity(0.45), in: Circle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(5)
            .background(.black.opacity(0.2), in: Capsule())
        }
    }
    static func zoomText(_ z: CGFloat, active: Bool) -> String {
        let r = (z * 10).rounded() / 10
        let s = r == r.rounded() ? String(Int(r)) : (r < 1 ? String(format: ".%d", Int((r * 10).rounded())) : String(format: "%.1f", r))
        return active ? s + "×" : s
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
