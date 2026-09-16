import SwiftUI
import WebKit

/// 편집기·카메라 1단계(SPEC §5) — 현재 웹 편집기/카메라를 웹뷰로 임베드. 저장·공유 브리지는 2주차.
struct WebToolView: UIViewRepresentable {
    var url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

struct WebToolScreen: View {
    var url: URL
    var title: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            WebToolView(url: url)
                .ignoresSafeArea(edges: .bottom)
                .background(Color.bg)
                .inlineTitle(title)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("닫기") { dismiss() }
                    }
                }
        }
    }
}
