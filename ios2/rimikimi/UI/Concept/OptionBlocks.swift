import SwiftUI
import PhotosUI

/// "내 사진: 등록된 사진 사용 · 변경" 카드 한 줄. 사진이 없으면 여기서 고른다.
struct MyPhotoCard: View {
    @Environment(AppState.self) private var app
    @State private var pick: PhotosPickerItem?

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Thumb(image: app.userPhoto.image)
            VStack(alignment: .leading, spacing: 2) {
                Text("내 사진").font(AppFont.headline)
                Text(app.userPhoto.hasPhoto ? "등록된 사진 사용" : "얼굴이 잘 보이는 사진 한 장이면 충분해요")
                    .font(AppFont.footnote).foregroundStyle(Color.ink2).lineLimit(2)
            }
            Spacer()
            PhotosPicker(selection: $pick, matching: .images, photoLibrary: .shared()) {
                Text(app.userPhoto.hasPhoto ? "변경" : "고르기")
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
        }
        .padding(Spacing.s3)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let img = await PhotoLoader.image(from: item) { app.userPhoto.set(img); HapticPlayer.success() }
                pick = nil
            }
        }
    }
}

/// 일회용 사진 슬롯(매직부스 변환 사진 · 커플 상대 사진).
struct PhotoSlotCard: View {
    var title: String
    var subtitle: String
    var image: UIImage?
    var onPick: (UIImage) -> Void
    @State private var pick: PhotosPickerItem?

    var body: some View {
        HStack(spacing: Spacing.s3) {
            Thumb(image: image)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(AppFont.headline)
                Text(image == nil ? subtitle : "사진 준비됨 · 서버에 저장되지 않아요").font(AppFont.footnote).foregroundStyle(Color.ink2).lineLimit(2)
            }
            Spacer()
            PhotosPicker(selection: $pick, matching: .images, photoLibrary: .shared()) {
                Text(image == nil ? "고르기" : "변경")
            }
            .buttonStyle(SecondaryButtonStyle(small: true, fullWidth: false))
        }
        .padding(Spacing.s3)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
        .onChange(of: pick) { _, item in
            guard let item else { return }
            Task {
                if let img = await PhotoLoader.image(from: item) { onPick(img) }
                pick = nil
            }
        }
    }
}

/// 드레스룸 — 입어볼 의상(한 번에 5장까지).
struct GarmentsBlock: View {
    @Binding var garments: [UIImage]
    @State private var picks: [PhotosPickerItem] = []
    private let max = 5

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.s3) {
            Text("입어볼 의상 (한 번에 5장까지 선택)").font(AppFont.headline).tracking(Tracking.headline)
            ScrollView(.horizontal) {
                HStack(spacing: Spacing.s2) {
                    ForEach(Array(garments.enumerated()), id: \.offset) { i, g in
                        Image(uiImage: g).resizable().scaledToFill()
                            .frame(width: 72, height: 96)
                            .clipShape(RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
                            .overlay(alignment: .topTrailing) {
                                Button { garments.remove(at: i) } label: {
                                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(.white).frame(width: 22, height: 22)
                                        .background(Color.ink.opacity(0.7), in: Circle())
                                }
                                .buttonStyle(.plain).padding(4)
                                .accessibilityLabel("의상 \(i + 1) 삭제")
                            }
                    }
                    if garments.count < max {
                        PhotosPicker(selection: $picks, maxSelectionCount: max - garments.count, matching: .images, photoLibrary: .shared()) {
                            VStack(spacing: 4) {
                                Image(systemName: "plus").font(.system(size: 18, weight: .semibold))
                                Text(garments.isEmpty ? "의상 올리기" : "더 추가").font(AppFont.caption)
                            }
                            .foregroundStyle(Color.ink2)
                            .frame(width: 72, height: 96)
                            .background(Color.fill, in: RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
                        }
                        .buttonStyle(PressScaleButtonStyle())
                    }
                }
            }
            .scrollIndicators(.hidden)
            Text("빠진 의상은 AI가 판단해서 생성해줘요.").font(AppFont.footnote).foregroundStyle(Color.ink2)
        }
        .padding(Spacing.s4)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.card, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
        .padding(.horizontal, Spacing.page)
        .onChange(of: picks) { _, items in
            guard !items.isEmpty else { return }
            Task {
                for item in items {
                    if garments.count >= max { break }
                    if let img = await PhotoLoader.image(from: item) { garments.append(img) }
                }
                picks = []
            }
        }
    }
}

struct Thumb: View {
    var image: UIImage?
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous).fill(Color.fill)
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "person.crop.square").font(.system(size: 20)).foregroundStyle(Color.ink3)
            }
        }
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: Radius.thumb, style: .continuous))
    }
}

enum PhotoLoader {
    static func image(from item: PhotosPickerItem) async -> UIImage? {
        guard let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) else { return nil }
        // 방향을 픽셀에 굽고 크기를 줄여 둔다 — 요청 때 다시 1024 로 줄인다.
        return ImageUtil.resize(img, maxSide: 1600)
    }
}
