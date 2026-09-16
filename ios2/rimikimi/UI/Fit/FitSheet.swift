import SwiftUI

/// 정방향 맞춤 제안 시트 — 사진이 3:4 가 아닐 때. ① 잘라 맞춤(얼굴 기준 크롭, 무료) ② 채워 맞춤(서버 준비 중).
struct FitSheet: View {
    var image: UIImage
    var onCropped: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var working = false
    @State private var preview: UIImage?

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s4) {
            HStack {
                Text("정방향 맞춤").font(AppFont.title2).tracking(Tracking.title2)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Color.ink)
                        .frame(width: 30, height: 30).background(Color.fill, in: Circle())
                }
                .buttonStyle(.plain).accessibilityLabel("닫기")
            }
            Text("이 사진은 3:4 가 아니에요. 얼굴 기준으로 잘라 맞추거나, 바깥을 채워 맞출 수 있어요.")
                .font(AppFont.callout).foregroundStyle(Color.ink2)

            HStack(spacing: Spacing.s3) {
                VStack(spacing: 6) {
                    Image(uiImage: image).resizable().scaledToFit()
                        .frame(height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
                    Text("원본 \(Int(image.size.width))×\(Int(image.size.height))").font(AppFont.caption).foregroundStyle(Color.ink2)
                }
                .frame(maxWidth: .infinity)
                VStack(spacing: 6) {
                    ZStack {
                        RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous).fill(Color.fill)
                        if let preview { Image(uiImage: preview).resizable().scaledToFit() }
                        else if working { ProgressView() }
                        else { Text("3:4").font(AppFont.headline).foregroundStyle(Color.ink3) }
                    }
                    .frame(width: 135, height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
                    Text("잘라 맞춤 미리보기").font(AppFont.caption).foregroundStyle(Color.ink2)
                }
                .frame(maxWidth: .infinity)
            }

            VStack(spacing: Spacing.s2) {
                Button {
                    guard let preview else { return }
                    HapticPlayer.commit()
                    onCropped(preview)
                    dismiss()
                } label: { Label("잘라 맞춤 · 무료", systemImage: "crop") }
                    .buttonStyle(PrimaryButtonStyle(isDisabled: preview == nil))
                    .disabled(preview == nil)
                Button {
                    app.showToast("채워 맞춤은 준비 중이에요 (서버 fit=outpaint)")
                } label: { Label("채워 맞춤 · 1 크레딧 (준비 중)", systemImage: "arrow.up.left.and.arrow.down.right") }
                    .buttonStyle(SecondaryButtonStyle())
            }
            Text("잘라 맞춤은 기기 안에서만 처리돼요. 채워 맞춤은 원본 픽셀을 유지하고 바깥만 채워요.")
                .font(AppFont.caption).foregroundStyle(Color.ink3)
            Spacer(minLength: 0)
        }
        .padding(Spacing.page)
        .background(Color.bg)
        .task {
            working = true
            preview = await FaceCrop.crop(image)
            working = false
        }
    }
}
