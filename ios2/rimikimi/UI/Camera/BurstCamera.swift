import SwiftUI
import AVFoundation
import UIKit

/// 연속 촬영 카메라 — 셔터를 여러 번 눌러 **한 번에 최대 10장**까지 찍고, 그대로 편집기로 넘겨
/// 필터를 통째로 입힌다(오너 지시 2026-09-22).
///
/// 왜 아이폰 기본 카메라를 못 쓰나: `UIImagePickerController` 는 한 장 찍으면 바로 앱으로
/// 돌아온다 — 연속 촬영을 시킬 방법이 없다. 그래서 이 화면만 직접 만든다. 컨셉 사진용 촬영은
/// 그대로 기본 카메라(`SystemCameraPicker`)를 쓴다.
struct BurstCameraView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var model = BurstCameraModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if model.denied {
                permissionNotice
            } else {
                CameraPreviewLayer(session: model.session)
                    .ignoresSafeArea()
                    .gesture(zoomGesture)
                // 셔터를 누른 순간 화면이 한 번 반짝인다(실제로 찍혔다는 신호).
                Color.white
                    .ignoresSafeArea()
                    .opacity(model.flashOverlay ? 0.85 : 0)
                    .animation(.easeOut(duration: 0.18), value: model.flashOverlay)
                    .allowsHitTesting(false)
                controls
            }
        }
        .statusBarHidden()
        .task { await model.start() }
        .onDisappear { model.stop() }
    }

    // MARK: 조작부

    private var controls: some View {
        VStack(spacing: 0) {
            HStack {
                CircleGlassButton(system: "xmark") { dismiss() }
                Spacer()
                if model.zoom > 1.01 {
                    Text(String(format: "%.1f×", model.zoom))
                        .font(AppFont.caption).monospacedDigit()
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(.black.opacity(0.35), in: Capsule())
                }
                Spacer()
                CircleGlassButton(system: model.flashOn ? "bolt.fill" : "bolt.slash",
                                  tint: model.flashOn ? Color.heartYellow : .white) { model.flashOn.toggle() }
            }
            .padding(.horizontal, Spacing.page)
            .padding(.top, Spacing.s3)

            Spacer()

            if !model.shots.isEmpty { thumbnails }

            Text(model.shots.count >= BurstCameraModel.maxShots
                 ? "10장을 다 찍었어요 · 완료를 눌러 주세요"
                 : "여러 장 찍고 한 번에 필터를 입혀요 · 최대 10장")
                .font(AppFont.footnote)
                .foregroundStyle(.white.opacity(0.75))
                .padding(.bottom, Spacing.s3)

            HStack {
                // 왼쪽: 전/후면 전환
                CircleGlassButton(system: "arrow.triangle.2.circlepath.camera") { model.flip() }
                    .frame(width: 84)
                Spacer()
                ShutterButton(disabled: model.shots.count >= BurstCameraModel.maxShots) { model.capture() }
                Spacer()
                // 오른쪽: 완료(찍은 게 있을 때만)
                Group {
                    if model.shots.isEmpty {
                        // ⚠️ 높이를 안 주면 `Color.clear` 가 세로로도 무한히 늘어나 위의 `Spacer` 를
                        //    잡아먹는다(셔터가 화면 한가운데로 갔다 — 시뮬레이터 캡처로 확인).
                        Color.clear.frame(height: 40)
                    } else {
                        Button {
                            app.finishBurstCamera(model.shots)
                            dismiss()
                        } label: {
                            Text("완료 \(model.shots.count)")
                                .font(AppFont.calloutEmphasis)
                                .foregroundStyle(Color.onAccent)
                                .padding(.horizontal, Spacing.s3)
                                .frame(height: 40)
                                .background(Color.accent, in: Capsule())
                        }
                        .buttonStyle(PressScaleButtonStyle())
                    }
                }
                .frame(width: 84)
            }
            .padding(.horizontal, Spacing.page)
            .padding(.bottom, Spacing.s5)
        }
        // ⚠️ 카메라 미리보기(UIViewRepresentable)는 스스로 크기를 주장하지 않아, 이걸 안 주면
        //    조작부가 화면을 안 채우고 가운데 뭉친다(시뮬레이터 캡처에서 실제로 그랬다).
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    /// 찍은 컷 — 탭하면 지운다(잘못 찍은 걸 그 자리에서 버릴 수 있게).
    private var thumbnails: some View {
        ScrollView(.horizontal) {
            HStack(spacing: Spacing.s2) {
                ForEach(Array(model.shots.enumerated()), id: \.offset) { i, img in
                    Button { model.remove(at: i) } label: {
                        Image(uiImage: img)
                            .resizable().scaledToFill()
                            .frame(width: 44, height: 44 / CardMetrics.aspect)
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 13))
                                    .foregroundStyle(.white, .black.opacity(0.5))
                                    .padding(2)
                            }
                    }
                    .buttonStyle(PressScaleButtonStyle())
                }
            }
            .padding(.horizontal, Spacing.page)
        }
        .scrollIndicators(.hidden)
        .frame(height: 44 / CardMetrics.aspect + 4)
        .padding(.bottom, Spacing.s3)
    }

    private var permissionNotice: some View {
        VStack(spacing: Spacing.s3) {
            Image(systemName: "camera.fill").font(.system(size: 34)).foregroundStyle(.white.opacity(0.6))
            Text("카메라 권한이 필요해요").font(AppFont.headline).foregroundStyle(.white)
            Text("설정에서 카메라를 켜면 여러 장을 찍어 한 번에 필터를 입힐 수 있어요.")
                .font(AppFont.footnote).foregroundStyle(.white.opacity(0.7))
                .multilineTextAlignment(.center)
            Button("설정 열기") {
                if let u = URL(string: UIApplication.openSettingsURLString) { openURL(u) }
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
            Button("닫기") { dismiss() }.buttonStyle(TextButtonStyle(color: .white))
        }
        .padding(Spacing.page)
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture()
            .onChanged { model.setZoom(model.zoomAtGestureStart * $0.magnification) }
            .onEnded { _ in model.commitZoom() }
    }
}

/// 셔터 — 흰 원 + 테두리. 누르면 살짝 줄었다 돌아온다.
private struct ShutterButton: View {
    var disabled: Bool
    var action: () -> Void
    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(.white.opacity(disabled ? 0.3 : 0.9), lineWidth: 4).frame(width: 74, height: 74)
                Circle().fill(.white.opacity(disabled ? 0.3 : 1)).frame(width: 60, height: 60)
                    .scaleEffect(pressed ? 0.88 : 1)
            }
            .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in withAnimation(.easeOut(duration: 0.08)) { pressed = true } }
            .onEnded { _ in withAnimation(.easeOut(duration: 0.12)) { pressed = false } })
        .accessibilityLabel("촬영")
    }
}

/// 어두운 유리 원 버튼 — 카메라 화면 위에 얹는 보조 버튼들.
private struct CircleGlassButton: View {
    var system: String
    var tint: Color = .white
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 40, height: 40)
                .background(.black.opacity(0.35), in: Circle())
        }
        .buttonStyle(PressScaleButtonStyle())
    }
}

/// `AVCaptureVideoPreviewLayer` 를 화면에 채워 그린다.
private struct CameraPreviewLayer: UIViewRepresentable {
    let session: AVCaptureSession
    func makeUIView(context: Context) -> V {
        let v = V()
        v.layer.session = session
        v.layer.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ uiView: V, context: Context) {}
    final class V: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        override var layer: AVCaptureVideoPreviewLayer { super.layer as! AVCaptureVideoPreviewLayer }
    }
}
