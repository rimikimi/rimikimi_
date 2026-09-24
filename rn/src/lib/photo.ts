import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { File, Paths } from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { copy } from "./copy";

// ============================================================================
// 사진 — 등록된 내 사진(기기 안에만 보관, 서버 전송 안 함) + 일회용 슬롯(상대·의상·변환).
// 생성 API 는 data URL 이 아니라 {mimeType, base64} 를 받으므로 여기서 축소·인코딩한다
// (웹 shrinkImage(1024, 0.85) / 의상 896 과 같은 값).
// ============================================================================

export interface PhotoRef {
  /** file:// URI — 화면 표시용 */
  uri: string;
  width?: number;
  height?: number;
}

export interface EncodedPhoto { mimeType: string; base64: string }

const PROFILE_KEY = "rimikimi_photo_uri";
const PROFILE_FILE = "profile.jpg";

function profileFile(): File {
  return new File(Paths.document, PROFILE_FILE);
}

export async function loadRegisteredPhoto(): Promise<PhotoRef | null> {
  try {
    const uri = await AsyncStorage.getItem(PROFILE_KEY);
    if (!uri) return null;
    const f = new File(uri);
    if (!f.exists) return null;
    return { uri };
  } catch {
    return null;
  }
}

/** 시스템 Photo Picker — 권한 0개. `multiple` 이면 최대 `limit` 장. */
export async function pickPhotos(opts: { multiple?: boolean; limit?: number } = {}): Promise<PhotoRef[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: !!opts.multiple,
    selectionLimit: opts.multiple ? opts.limit ?? 5 : 1,
    quality: 1,
    exif: false,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/**
 * OS 기본 카메라로 한 장. **후면이 기본**이다 — 오너 지시로 아이폰도 후면이고
 * (ios2/rimikimi/UI/Camera/SystemCamera.swift `cameraDevice = .rear`), 앞뒤 전환은 기본
 * 카메라 화면에서 사용자가 직접 한다. (2.0 초기엔 front 였는데 아이폰과 달라 맞췄다.)
 */
export async function takeSelfie(): Promise<PhotoRef | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], cameraType: ImagePicker.CameraType.back, quality: 1 });
  if (res.canceled) return null;
  const a = res.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

/** 고른 사진을 앱 문서 폴더로 복사해 등록 사진으로 삼는다(피커 URI 는 임시라 다음 실행에 사라진다). */
export async function registerPhoto(p: PhotoRef): Promise<PhotoRef> {
  const dst = profileFile();
  if (dst.exists) dst.delete();
  // 원본 그대로 두지 않고 1024 로 줄여 저장 — 생성 때마다 다시 줄이지 않기 위해서.
  const shrunk = await ImageManipulator.manipulateAsync(p.uri, [{ resize: { width: 1024 } }], { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG });
  new File(shrunk.uri).copy(dst);
  await AsyncStorage.setItem(PROFILE_KEY, dst.uri);
  return { uri: dst.uri, width: shrunk.width, height: shrunk.height };
}

export async function clearRegisteredPhoto(): Promise<void> {
  try {
    const f = profileFile();
    if (f.exists) f.delete();
  } catch { /* ignore */ }
  await AsyncStorage.removeItem(PROFILE_KEY);
}

/** 웹 shrinkImage(dataUrl, max, 0.85) 와 같은 결과 — 긴 변 `max` 로 줄인 JPEG base64. */
export async function encodeForUpload(p: PhotoRef, max = 1024): Promise<EncodedPhoto> {
  const w = p.width ?? 0;
  const h = p.height ?? 0;
  const resize = w && h ? (w >= h ? { width: Math.min(max, w) } : { height: Math.min(max, h) }) : { width: max };
  const out = await ImageManipulator.manipulateAsync(p.uri, [{ resize }], {
    compress: 0.85,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!out.base64) throw new Error(copy.errors.photoFormat);
  return { mimeType: "image/jpeg", base64: out.base64 };
}
