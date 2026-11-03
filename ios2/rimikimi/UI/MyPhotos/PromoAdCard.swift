import SwiftUI
import AVFoundation
import UIKit

/// 생성 중 케이스 광고(오너 2026-10-29) — 진행 카드 바로 아래.
/// "이미지가 생성되는 동안 케이스를 구경해보세요" + 30초 영상(무작위 순서로 계속 이어 재생) + "케이스 보러가기".
/// 영상 아무 데나 누르거나 버튼을 누르면 **지금 나오는 시리즈의** 아이폰 상품 페이지로 바로 간다(중간 화면 없음).
/// 우측 상단 = 음소거(소리만, 스토어로 안 감). 음소거 상태는 기억한다.
/// 사진이 완성되면(진행 중인 작업이 없어지면) 카드째 사라진다. 서버 `/promo-ads.json` enabled 로 끈다.
struct PromoAdCard: View {
    let magicBooth: Bool
    @State private var model = PromoAdPlayer()
    private var store: PromoAdStore { PromoAdStore.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text(store.text(store.config?.headline, "이미지가 생성되는 동안\n케이스를 구경해보세요", "Browse our phone cases\nwhile your image is being created"))
                .font(.title3.weight(.heavy))
                .foregroundStyle(Color.ink)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            ZStack(alignment: .top) {
                // 영상이 첫 장면을 그리기 전(받는 중·다음 광고로 넘어가는 순간)에 까만 상자 대신 표지를 보인다.
                Color(white: 0.13)
                if let poster = model.posterURL {
                    AsyncImage(url: poster) { $0.resizable().scaledToFill() } placeholder: { Color.clear }
                        .allowsHitTesting(false)
                }
                PromoVideoLayer(player: model.player)
                    .contentShape(Rectangle())
                    .onTapGesture { model.openCurrent() }
                    .accessibilityLabel(L.t("케이스 상품 보기", "Open the case product"))
                    .accessibilityAddTraits(.isButton)
                HStack {
                    Text("rmkm").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Color.black.opacity(0.85), in: Capsule())
                        .allowsHitTesting(false)
                    Spacer()
                    Button { model.toggleMute() } label: {
                        Image(systemName: model.muted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                            .frame(width: 36, height: 36)
                            .background(Color.black.opacity(0.85), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(model.muted ? L.t("소리 켜기", "Unmute") : L.t("소리 끄기", "Mute"))
                }
                .padding(10)
            }
            .aspectRatio(9.0 / 16.0, contentMode: .fit)
            .frame(maxWidth: 262)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .frame(maxWidth: .infinity)

            Button { model.openCurrent() } label: {
                Text(store.text(store.config?.button, "케이스 보러가기", "Shop cases") + "  ›")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.onInk)
                    .frame(maxWidth: .infinity).frame(height: 52)
                    .background(Color.ink, in: Capsule())
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
        }
        .padding(.top, Spacing.s3)
        .padding(.horizontal, Spacing.page)
        .padding(.bottom, Spacing.s5)
        .onAppear {
            model.appeared(PromoAdStore.shared.playlist(magicBooth: magicBooth))
            // 캡처·검증용: `-dev.promoTapAt 20` = 20초 뒤 영상 탭과 같은 동작.
            let at = UserDefaults.standard.double(forKey: "dev.promoTapAt")
            if at > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + at) { model.openCurrent() } }
        }
        .onDisappear { model.disappeared() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in model.pause() }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in model.resume() }
    }
}

/// 광고 재생기 — 목록을 하나씩 재생하고 끝나면 다음 것, 목록 끝이면 처음으로(반복).
/// ⚠️ 화면에서 빠질 때 영상을 비우지(stop) 말 것. LazyVStack 은 위 진행 카드 높이가 바뀌면(한 장 완성 등)
///    onAppear 를 onDisappear **보다 먼저** 부르기도 해서, 예전엔 새로 시작한 직후 비워져 까만 상자로 남았다
///    (2026-11-03 오너 "광고가 왜 뜨다 안뜨다 함?"). 보이는 횟수를 세서 멈춤/재생만 하고, 정리는 카드가 사라질 때(deinit).
@Observable
final class PromoAdPlayer {
    let player = AVPlayer()
    private(set) var muted: Bool = UserDefaults.standard.bool(forKey: "promoAds.muted")
    private var list: [PromoAdStore.Ad] = []
    private var index = 0
    @ObservationIgnored private var endObserver: NSObjectProtocol?
    @ObservationIgnored private var visible = 0

    /// 지금 광고의 표지 — 영상 아래에 깔린다.
    var posterURL: URL? { list.indices.contains(index) ? PromoAdStore.url(list[index].poster?.ios) : nil }

    func appeared(_ ads: [PromoAdStore.Ad]) {
        visible += 1
        if list.isEmpty { start(ads) } else if player.currentItem == nil { load() } else { player.play() }
    }

    func disappeared() {
        visible -= 1
        // 같은 순간에 다시 나타나는 경우(순서 뒤바뀜)를 기다렸다가 정말 안 보일 때만 멈춘다.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.visible <= 0 else { return }
            self.visible = 0
            self.player.pause()
        }
    }

    private func start(_ ads: [PromoAdStore.Ad]) {
        guard !ads.isEmpty else { return }
        list = ads; index = 0
        if let first = UserDefaults.standard.string(forKey: "dev.promoFirst"), let i = list.firstIndex(where: { $0.id == first }) {
            list.insert(list.remove(at: i), at: 0)
        }
        // 다른 앱 음악을 끊지 않고(무음 스위치도 따른다) 섞어서 재생.
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        player.isMuted = muted
        player.actionAtItemEnd = .pause
        endObserver = NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] n in
            guard let self, let item = n.object as? AVPlayerItem, item === self.player.currentItem else { return }
            self.index = (self.index + 1) % self.list.count
            self.load()
        }
        load()
    }

    private func load() {
        guard list.indices.contains(index), let url = PromoAdStore.url(list[index].video.ios) else { return }
        player.replaceCurrentItem(with: AVPlayerItem(url: url))
        player.play()
    }

    deinit {
        player.pause()
        if let o = endObserver { NotificationCenter.default.removeObserver(o) }
    }

    func pause() { player.pause() }
    func resume() { if visible > 0 { player.play() } }

    func toggleMute() {
        muted.toggle()
        player.isMuted = muted
        UserDefaults.standard.set(muted, forKey: "promoAds.muted")
    }

    /// 지금 재생 위치의 시리즈 상품으로 바로 이동(네이버 앱이 있으면 앱, 없으면 사파리).
    func openCurrent() {
        guard list.indices.contains(index) else { return }
        let t = player.currentTime().seconds
        guard let url = PromoAdStore.link(of: list[index], at: t.isFinite ? t : 0) else { return }
        UIApplication.shared.open(url)
    }
}

/// AVPlayerLayer 를 꽉 채워(잘라서) 보여 주는 얇은 뷰 — 기본 VideoPlayer 는 재생 컨트롤이 붙는다.
struct PromoVideoLayer: UIViewRepresentable {
    let player: AVPlayer
    func makeUIView(context: Context) -> PlayerView {
        let v = PlayerView(); v.playerLayer.player = player; v.playerLayer.videoGravity = .resizeAspectFill
        v.backgroundColor = .clear; return v
    }
    func updateUIView(_ uiView: PlayerView, context: Context) { uiView.playerLayer.player = player }
    final class PlayerView: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }
}
