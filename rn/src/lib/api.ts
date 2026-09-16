import { getEnv } from "./env";
import type { EncodedPhoto } from "./photo";

// ============================================================================
// 서버 계약 — SPEC §4 "그대로". 요청 필드는 웹 src/PortraitStudio.jsx 의 generateImage() 와
// 각 fetch 호출을 그대로 옮겼다. 모든 URL 은 절대 경로(apiBase) — 상대 fetch 금지.
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly extra: { networkFail?: boolean; quotaExceeded?: boolean; quotaUsed?: number; quotaLimit?: number } = {}
  ) {
    super(message);
  }
  get networkFail() { return !!this.extra.networkFail; }
  get quotaExceeded() { return !!this.extra.quotaExceeded; }
}

function auth(token: string): Record<string, string> {
  return { Authorization: "Bearer " + token };
}

// ---- /api/quota -------------------------------------------------------------
export interface Quota {
  used: number;
  limit: number;
  credits: number;
  unlimited: boolean;
  blocked: boolean;
  referralCount?: number;
  referralCode?: string;
  untilNext?: number;
}

export async function fetchQuota(token: string): Promise<Quota> {
  const r = await fetch(`${getEnv().apiBase}/api/quota`, { headers: auth(token) });
  const j = (await r.json()) as Partial<Quota> & { error?: string };
  if (!r.ok) throw new ApiError(j?.error || `quota ${r.status}`, r.status);
  return {
    used: typeof j.used === "number" ? j.used : 0,
    limit: typeof j.limit === "number" ? j.limit : 1,
    credits: typeof j.credits === "number" ? j.credits : 0,
    unlimited: !!j.unlimited,
    blocked: !!j.blocked,
    referralCount: j.referralCount,
    referralCode: j.referralCode,
    untilNext: j.untilNext,
  };
}

// ---- /api/gallery -----------------------------------------------------------
export interface GalleryItem {
  id: string;
  conceptId: number | string | null;
  conceptTitle?: string | null;
  createdAt: string;
  expiresAt?: string;
  url: string | null;
}

export async function fetchGallery(token: string): Promise<GalleryItem[]> {
  let r: Response;
  try {
    r = await fetch(`${getEnv().apiBase}/api/gallery`, { headers: auth(token) });
  } catch {
    throw new ApiError("네트워크 오류", 0, { networkFail: true });
  }
  const j = (await r.json().catch(() => ({}))) as { items?: GalleryItem[]; error?: string };
  if (!r.ok || !j.items) throw new ApiError(j?.error || "불러오기 실패", r.status);
  return j.items;
}

export async function deleteGalleryItem(token: string, id: string): Promise<void> {
  await fetch(`${getEnv().apiBase}/api/gallery?id=${encodeURIComponent(id)}`, { method: "DELETE", headers: auth(token) });
}

// ---- /api/iap/grant ---------------------------------------------------------
/** 서버가 RevenueCat 을 재검증해 크레딧을 지급한다. 202 = 아직 RC 에 반영 전 → "pending". */
export async function iapGrant(token: string, productId: string, transactionId: string | null): Promise<"ok" | "pending"> {
  const r = await fetch(`${getEnv().apiBase}/api/iap/grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({ productId, transactionId }),
  });
  if (r.status === 202) return "pending";
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(j?.error || "적립 실패", r.status);
  return "ok";
}

// ---- /api/referral/claim ----------------------------------------------------
export async function referralClaim(token: string, ref: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await fetch(`${getEnv().apiBase}/api/referral/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({ ref }),
  });
  const j = (await r.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
  if (!j) return { ok: false, reason: "db_error" };
  return { ok: !!j.ok, reason: j.reason };
}

// ---- /api/account/delete ----------------------------------------------------
export async function accountDelete(token: string): Promise<void> {
  const r = await fetch(`${getEnv().apiBase}/api/account/delete`, { method: "POST", headers: auth(token) });
  const j = (await r.json().catch(() => ({}))) as { error?: string };
  if (!r.ok) throw new ApiError(j?.error || "삭제 실패", r.status);
}

// ---- /api/drops (→ /api/concepts?drops=1) -----------------------------------
export interface Drop { at: string; count: number; titles?: string[] }
export async function fetchDrops(days = 30): Promise<Drop[]> {
  const r = await fetch(`${getEnv().apiBase}/api/drops?days=${days}`, { cache: "no-cache" });
  const j = (await r.json()) as unknown;
  return Array.isArray(j) ? (j as Drop[]) : [];
}

// ---- /api/generate ----------------------------------------------------------
export interface GenerateMeta {
  id: number | string;
  title: string;
  skipFacePrecheck?: boolean;
  keepRatio?: boolean;
  count?: number;
  /** 커플: 두 번째 참조 사진(상대) */
  photo2?: EncodedPhoto;
  /** 드레스룸: 의상 1~5장 + 스타일 */
  garments?: EncodedPhoto[];
  dressStyle?: "mirror" | "model";
  /** 인생네컷 */
  fourcutStyle?: string;
  cutCount?: number;
  cutIndex?: number;
  /** 증명사진 */
  idSuit?: string;
  idBg?: string;
  idBgName?: string;
  proSample?: boolean;
  pushToken?: string | null;
  faceRefs?: (EncodedPhoto & { angle?: string })[];
}

/** 페이스 프로필 앵커 생성(1.x faceProfile.requestAnchor) — 서버는 셀카를 저장하지 않는다. */
export async function requestFaceAnchor(token: string, shots: EncodedPhoto[]): Promise<EncodedPhoto> {
  const r = await fetch(`${getEnv().apiBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({ faceAnchor: true, shots: shots.map((s, i) => ({ ...s, angle: "shot" + (i + 1) })) }),
  });
  const j = (await r.json().catch(() => null)) as { base64?: string; mimeType?: string; error?: string } | null;
  if (!r.ok || !j?.base64) throw new ApiError(j?.error || "기준 사진을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.", r.status);
  return { mimeType: j.mimeType || "image/jpeg", base64: j.base64 };
}

// ---- /api/generate?fit=outpaint ---------------------------------------------
export interface OutpaintResult {
  imageDataUrl: string;
  credits?: number;
  quotaUsed?: number;
  quotaLimit?: number;
}

/**
 * 채워 맞춤(SPEC §3 신규): 원본 사진 → 세로 3:4, 1 크레딧. 계약은 고정(서버 작업 중,
 * 아직 미배포일 수 있다) — 같은 /api/generate 에 `fit:"outpaint"` 를 실어 보내고,
 * 응답 모양은 기존 generate 와 같다 `{mimeType, base64, credits, quotaUsed, quotaLimit}`.
 * 크레딧 부족(402/429)은 ApiError.quotaExceeded 로 구분해 기존 크레딧 시트로 넘긴다.
 */
export async function outpaintImage(token: string, photo: EncodedPhoto): Promise<OutpaintResult> {
  if (!token) throw new ApiError("로그인이 필요해요.", 401);
  let res: Response;
  try {
    res = await fetch(`${getEnv().apiBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify({ mimeType: photo.mimeType, base64: photo.base64, fit: "outpaint" }),
    });
  } catch {
    throw new ApiError("네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", 0, { networkFail: true });
  }
  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("서버 응답을 읽을 수 없어요 (오류 " + res.status + ")", res.status);
  }
  if (!res.ok) {
    const msg = (json?.error as string) || "채워 맞춤 실패 (오류 " + res.status + ")";
    throw new ApiError(msg, res.status, {
      quotaExceeded: res.status === 402 || res.status === 429,
      quotaUsed: typeof json?.quotaUsed === "number" ? json.quotaUsed : undefined,
      quotaLimit: typeof json?.quotaLimit === "number" ? json.quotaLimit : undefined,
    });
  }
  if (!json?.base64 || !json?.mimeType) {
    throw new ApiError("채워 맞춤 결과를 받지 못했어요.", res.status);
  }
  return {
    imageDataUrl: "data:" + json.mimeType + ";base64," + json.base64,
    credits: json.credits as number | undefined,
    quotaUsed: json.quotaUsed as number | undefined,
    quotaLimit: json.quotaLimit as number | undefined,
  };
}

export interface GenerateResult {
  imageDataUrl: string;
  batch: { imageDataUrl: string; galleryId?: string; galleryExpiresAt?: string }[] | null;
  requested?: number;
  produced?: number;
  credits?: number;
  quotaUsed?: number;
  quotaLimit?: number;
  unlimited?: boolean;
  engine?: string;
  galleryId?: string;
  galleryExpiresAt?: string;
  busyFallback: boolean;
}

/**
 * 웹 generateImage() 의 요청 본문을 그대로 보낸다. 사진은 호출부가 이미 축소·인코딩했다.
 * fetch 자체가 던지면 `networkFail` — 서버 판정을 못 받은 것이므로 호출부는 갤러리를 폴링한다.
 */
export async function generateImage(token: string, photo: EncodedPhoto, promptText: string, meta: GenerateMeta): Promise<GenerateResult> {
  if (!token) throw new ApiError("로그인이 필요해요.", 401);
  const garments = meta.garments && meta.garments.length ? meta.garments.slice(0, 5) : null;
  const body = {
    mimeType: photo.mimeType,
    base64: photo.base64,
    prompt: promptText,
    ...(meta.photo2 ? { mimeType2: meta.photo2.mimeType, base64_2: meta.photo2.base64, couple: true } : {}),
    conceptId: meta.id,
    conceptTitle: meta.title,
    skipFacePrecheck: !!meta.skipFacePrecheck,
    idSuit: meta.idSuit,
    idBg: meta.idBg,
    idBgName: meta.idBgName,
    fourcutStyle: meta.fourcutStyle,
    cutIndex: meta.cutIndex,
    count: meta.count,
    cutCount: meta.cutCount,
    ...(garments ? { garments, dressStyle: meta.dressStyle } : {}),
    proSample: !!meta.proSample,
    ...(meta.pushToken ? { pushToken: meta.pushToken } : {}),
    ...(meta.faceRefs && meta.faceRefs.length ? { faceRefs: meta.faceRefs } : {}),
  };

  let res: Response;
  try {
    res = await fetch(`${getEnv().apiBase}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth(token) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.", 0, { networkFail: true });
  }

  let json: Record<string, unknown>;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError("서버 응답을 읽을 수 없어요 (오류 " + res.status + ")", res.status);
  }

  if (!res.ok) {
    const msg = (json?.error as string) || "이미지 생성 실패 (오류 " + res.status + ")";
    const detail = json?.detail ? "\n\n[원문] " + String(json.detail).slice(0, 300) : "";
    throw new ApiError(msg + detail, res.status, {
      quotaExceeded: res.status === 429,
      quotaUsed: typeof json?.quotaUsed === "number" ? json.quotaUsed : undefined,
      quotaLimit: typeof json?.quotaLimit === "number" ? json.quotaLimit : undefined,
    });
  }

  if (!json?.base64 || !json?.mimeType) {
    throw new ApiError("이미지 응답을 받지 못했어요. 다른 컨셉으로 시도해 주세요.", res.status);
  }
  const imageDataUrl = "data:" + json.mimeType + ";base64," + json.base64;

  // 묶음(3/6/12장): 서버가 images[] 를 주면 전부 잇는다. 웹은 768×1024 로 재크롭하지만 네이티브는
  // 서버 결과를 그대로 쓴다(서버가 이미 3:4 로 만든다) — 크롭은 편집기(2단계) 몫.
  let batch: GenerateResult["batch"] = null;
  const images = json.images as { mimeType: string; base64: string; galleryId?: string; galleryExpiresAt?: string }[] | undefined;
  if (Array.isArray(images) && images.length > 1) {
    batch = [{ imageDataUrl, galleryId: json.galleryId as string | undefined, galleryExpiresAt: json.galleryExpiresAt as string | undefined }];
    for (const it of images.slice(1)) {
      batch.push({ imageDataUrl: "data:" + it.mimeType + ";base64," + it.base64, galleryId: it.galleryId, galleryExpiresAt: it.galleryExpiresAt });
    }
  }

  return {
    imageDataUrl,
    batch,
    requested: json.requested as number | undefined,
    produced: json.produced as number | undefined,
    credits: json.credits as number | undefined,
    quotaUsed: json.quotaUsed as number | undefined,
    quotaLimit: json.quotaLimit as number | undefined,
    unlimited: json.unlimited as boolean | undefined,
    engine: json.engine as string | undefined,
    galleryId: json.galleryId as string | undefined,
    galleryExpiresAt: json.galleryExpiresAt as string | undefined,
    busyFallback: !!json.busyFallback,
  };
}
