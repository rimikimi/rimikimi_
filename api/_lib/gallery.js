// ============================================================
// 갤러리 헬퍼 — 1시간 자동 만료
//
// 핵심:
//   - 결과 이미지를 Storage(private 버킷)에 업로드
//   - DB에 expires_at = now() + 1h 기록
//   - 갤러리 조회 시 expires_at 안 지난 것만 + signed URL 발급
//   - 만료된 것은 cron이 진짜 삭제 (이 파일에 helper 만 정의)
// ============================================================

export const TTL_MINUTES = 60; // 1시간

// 이미지 base64 → Storage 업로드 + DB 기록.
// 저장 직전에 이 사용자의 만료된 옛 파일을 청소 (lazy purge — 작성 시).
export async function saveToGallery(admin, user, { conceptId, conceptTitle, base64, mimeType }) {
  if (!base64 || !user?.id) return { error: "invalid input" };

  // 만료 청소 (write-side lazy purge — cron 없이 동작)
  const nowIso = new Date().toISOString();
  try {
    const { data: expired } = await admin
      .from("user_gallery")
      .select("id, storage_path")
      .eq("user_id", user.id)
      .lte("expires_at", nowIso)
      .limit(100);
    if (expired && expired.length > 0) {
      const paths = expired.map((r) => r.storage_path);
      const ids = expired.map((r) => r.id);
      await admin.storage.from("gallery").remove(paths).catch(() => {});
      await admin.from("user_gallery").delete().in("id", ids);
    }
  } catch (_) { /* 청소 실패는 저장 자체엔 영향 없음 */ }

  // 1) base64 -> Uint8Array
  let bin = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  let outMime = mimeType || "image/png";

  // 버킷 한도(10MiB) 초과분은 JPEG 로 재인코딩해서 살린다.
  // 실측 2026-08-25: 드레스룸 2K PNG 원본이 10MiB 를 넘어 upload 가
  // "The object exceeded the maximum allowed size" 로 실패 — 화면엔 떴는데
  // 내 사진엔 안 남았다. q92 JPEG 면 2~4MB 로 줄고 화질 손실은 미미하다.
  const BUCKET_LIMIT = 10 * 1024 * 1024;
  if (bin.length > BUCKET_LIMIT - 256 * 1024) {
    try {
      const sharp = (await import("sharp")).default;
      const out = await sharp(Buffer.from(bin)).jpeg({ quality: 92 }).toBuffer();
      bin = new Uint8Array(out);
      outMime = "image/jpeg";
      console.log(`[gallery] oversized original re-encoded: ${base64.length} b64 → ${out.length} bytes jpeg`);
    } catch (e) {
      console.error("[gallery re-encode failed]", e?.message || e);
    }
  }

  // 2) Storage 경로: <user_id>/<timestamp>_<conceptId>.<ext>
  const ext = outMime.split("/")[1] || "png";
  const path = `${user.id}/${Date.now()}_${conceptId}.${ext}`;

  const up = await admin.storage
    .from("gallery")
    .upload(path, bin, { contentType: outMime, upsert: false });

  if (up.error) return { error: "upload: " + up.error.message };

  // 3) DB 기록
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();
  const ins = await admin.from("user_gallery").insert({
    user_id: user.id,
    concept_id: conceptId,
    concept_title: conceptTitle || null,
    storage_path: path,
    mime_type: outMime,
    expires_at: expiresAt,
  }).select("id").single();

  if (ins.error) {
    // 롤백 — Storage 에서도 지움
    await admin.storage.from("gallery").remove([path]).catch(() => {});
    return { error: "db: " + ins.error.message };
  }

  return { ok: true, id: ins.data.id, expiresAt };
}

// 사용자 갤러리 조회 — 만료 안 된 것만, signed URL 포함.
// 호출할 때마다 이 사용자의 만료된 것을 lazy purge (cron 대체).
export async function listGallery(admin, userId) {
  const nowIso = new Date().toISOString();

  // 0) 이 사용자의 만료된 row 들을 먼저 진짜 삭제 (lazy purge)
  const { data: expired } = await admin
    .from("user_gallery")
    .select("id, storage_path")
    .eq("user_id", userId)
    .lte("expires_at", nowIso)
    .limit(100);
  if (expired && expired.length > 0) {
    const paths = expired.map((r) => r.storage_path);
    const ids = expired.map((r) => r.id);
    await admin.storage.from("gallery").remove(paths).catch(() => {});
    await admin.from("user_gallery").delete().in("id", ids);
  }

  const { data, error } = await admin
    .from("user_gallery")
    .select("id, concept_id, concept_title, storage_path, mime_type, created_at, expires_at")
    .eq("user_id", userId)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false });

  if (error) return { error: error.message };

  // 각 항목에 signed URL 발급 (1시간 유효)
  const items = await Promise.all(
    (data || []).map(async (row) => {
      const { data: sig } = await admin.storage
        .from("gallery")
        .createSignedUrl(row.storage_path, 60 * 60);
      return {
        id: row.id,
        conceptId: row.concept_id,
        conceptTitle: row.concept_title,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        url: sig?.signedUrl || null,
      };
    })
  );

  return { items };
}

// 사용자가 직접 삭제
export async function deleteItem(admin, userId, itemId) {
  // 본인 것인지 확인 + storage_path 가져오기
  const { data: row, error } = await admin
    .from("user_gallery")
    .select("storage_path")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();
  if (error || !row) return { error: "not found" };

  await admin.storage.from("gallery").remove([row.storage_path]).catch(() => {});
  await admin.from("user_gallery").delete().eq("id", itemId);
  return { ok: true };
}

// cron 용: 만료된 모든 항목 진짜 삭제
export async function purgeExpired(admin) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await admin
    .from("user_gallery")
    .select("id, storage_path")
    .lte("expires_at", nowIso)
    .limit(500); // 한 번에 너무 많이 안 잡게

  if (error) return { error: error.message };
  if (!rows || rows.length === 0) return { deleted: 0 };

  const paths = rows.map((r) => r.storage_path);
  const ids = rows.map((r) => r.id);

  await admin.storage.from("gallery").remove(paths).catch(() => {});
  await admin.from("user_gallery").delete().in("id", ids);

  return { deleted: rows.length };
}
