import SwiftUI
import AVFoundation
import Vision
import UIKit

/// 얼굴 스캔 — Face ID 등록처럼 **영상으로** 얼굴을 훑어 정면·좌·우 3장을 모은다
/// (오너 지시 2026-09-22: "face id같은 영상으로 얼굴 스캔하는 걸 얘기한 거지 api로 가져오라고 한 게 아님").
///
/// 애플의 Face ID(TrueDepth 등록) 자체는 앱이 못 쓴다 — 그건 시스템 전용이다. 대신 전면 카메라
/// 영상을 Vision 으로 실시간 분석해(`VNDetectFaceRectanglesRequest` 의 yaw + `VNDetectFaceCaptureQualityRequest`)
/// 각도가 맞고 화질이 충분한 순간을 **자동으로** 잡는다. 셔터 버튼은 없다.
///
/// ⚠️ 왼쪽/오른쪽을 미리 정하지 않는다. 전면 카메라 미러링 때문에 yaw 부호가 기기·프레임 처리에
/// 따라 뒤집힐 수 있어서, "한쪽으로" → "이제 반대쪽으로" 로 안내하고 **첫 번째로 잡힌 방향의 반대**를
/// 두 번째로 요구한다. 부호를 추측해서 반대로 안내하는 사고를 원천 차단한다.
struct FaceScanView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var model = FaceScanModel()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if model.captured.count < 3 {
                scanning
            } else {
                confirm
            }
        }
        .task { await model.start() }
        .onDisappear { model.stop() }
    }

    // MARK: 스캔 중

    private var scanning: some View {
        VStack(spacing: 0) {
            HStack {
                Button("닫기") { dismiss() }
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, Spacing.page)
            .padding(.top, Spacing.s3)

            Spacer(minLength: 0)

            ZStack {
                CameraPreview(session: model.session)
                    .clipShape(Circle())
                    .overlay { Circle().strokeBorder(.white.opacity(0.18), lineWidth: 2) }
                    .frame(width: 300, height: 300)

                // Face ID 등록의 그 고리 — 한 칸씩 차오른다.
                FaceScanRing(progress: model.ringProgress, flash: model.justCaptured)
                    .frame(width: 328, height: 328)
            }

            Spacer(minLength: 0)

            VStack(spacing: Spacing.s2) {
                Text(model.title)
                    .font(AppFont.sectionTitle)
                    .foregroundStyle(.white)
                    .contentTransition(.opacity)
                Text(model.hint)
                    .font(AppFont.footnote)
                    .foregroundStyle(.white.opacity(0.7))
                    .multilineTextAlignment(.center)
                    .frame(height: 34)
            }
            .padding(.horizontal, Spacing.page)
            .animation(.easeOut(duration: 0.2), value: model.title)

            Spacer(minLength: 0)

            HStack(spacing: Spacing.s3) {
                ForEach(FaceProfileStore.Angle.allCases, id: \.self) { a in
                    ShotSlot(image: model.captured[a], label: a.label)
                }
            }
            .padding(.bottom, Spacing.s5)
        }
    }

    // MARK: 확인

    private var confirm: some View {
        VStack(spacing: Spacing.s4) {
            Spacer()
            Text("이 얼굴을 사용할까요?")
                .font(AppFont.title2).foregroundStyle(.white)
            Text("이 사진들은 이 아이폰 안에만 저장돼요.\n사진을 만들 때만 참조로 쓰이고 서버에 보관하지 않아요.")
                .font(AppFont.footnote).foregroundStyle(.white.opacity(0.72))
                .multilineTextAlignment(.center)
                .padding(.horizontal, Spacing.page)

            HStack(spacing: Spacing.s3) {
                ForEach(FaceProfileStore.Angle.allCases, id: \.self) { a in
                    ShotSlot(image: model.captured[a], label: a.label, size: 96)
                }
            }
            Spacer()
            VStack(spacing: Spacing.s2) {
                Button("이 얼굴로 시작하기") {
                    app.saveFaceProfile(model.captured)
                    dismiss()
                }
                .buttonStyle(PrimaryButtonStyle(isDisabled: false))
                Button("다시 찍기") { model.reset() }
                    .buttonStyle(TextButtonStyle(color: .white))
            }
            .padding(.horizontal, Spacing.page)
            .padding(.bottom, Spacing.s5)
        }
    }
}

/// 모아 놓은 컷 한 칸.
private struct ShotSlot: View {
    var image: UIImage?
    var label: String
    var size: CGFloat = 64

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(.white.opacity(0.12))
                if let image {
                    Image(uiImage: image).resizable().scaledToFill()
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .frame(width: size, height: size / CardMetrics.aspect * 0.75)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            Text(label).font(AppFont.caption).foregroundStyle(.white.opacity(image == nil ? 0.4 : 0.85))
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.8), value: image != nil)
    }
}

/// Face ID 등록의 눈금 고리 — 36칸. 진행률만큼 흰색으로 찬다.
private struct FaceScanRing: View {
    var progress: Double
    var flash: Bool

    private let ticks = 36

    var body: some View {
        ZStack {
            ForEach(0..<ticks, id: \.self) { i in
                let on = Double(i) / Double(ticks) < progress
                Capsule()
                    .fill(on ? Color.white : Color.white.opacity(0.22))
                    .frame(width: 3, height: on ? 16 : 11)
                    .offset(y: -160)
                    .rotationEffect(.degrees(Double(i) / Double(ticks) * 360))
                    .animation(.easeOut(duration: 0.25).delay(Double(i % 6) * 0.01), value: on)
            }
        }
        .scaleEffect(flash ? 1.04 : 1)
        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: flash)
    }
}

/// `AVCaptureVideoPreviewLayer` 를 SwiftUI 로.
private struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView()
        v.layer.session = session
        v.layer.videoGravity = .resizeAspectFill
        return v
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {}

    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        override var layer: AVCaptureVideoPreviewLayer { super.layer as! AVCaptureVideoPreviewLayer }
    }
}
