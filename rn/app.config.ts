import type { ExpoConfig } from "expo/config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const withFcmManifestFix = require("./plugins/withFcmManifestFix");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const withReleaseSigning = require("./plugins/withReleaseSigning");

// rimikimi 2.0 — Android (React Native / Expo) native config.
//
// · package = com.rimikimi.app (1.x Capacitor 앱과 같은 패키지 — 업데이트로 이어져야
//   로그인·크레딧·내 사진이 유지된다, SPEC §6-5).
// · OAuth 딥링크 = com.rimikimi.app://login-callback (SPEC §3, Supabase Redirect URL 에
//   이미 등록돼 있는 값 그대로).
// · Supabase anon key 는 공개 키(브라우저에도 노출되는 값)라 여기 리터럴로 둔다. 다른
//   비밀은 절대 이 파일에 넣지 않는다.
// · 글꼴: 시스템(Roboto / Noto Sans KR). 번들 글꼴 없음 → expo-font 플러그인 없음.

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://rimikimi-app.vercel.app";
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://hedgjzdrivilclmwumoc.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlZGdqemRyaXZpbGNsbXd1bW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTk1MjksImV4cCI6MjA5NTI3NTUyOX0.Hp88oUR53x4dEwnfYoxreDHUvZWZHiA4Skm_2nozVa8";

// RevenueCat 공개 키(goog_…) — 1.x .env.local VITE_RC_ANDROID_KEY 와 같은 값. 공개 키다(비밀 아님).
const RC_ANDROID_KEY = process.env.EXPO_PUBLIC_RC_ANDROID_KEY ?? "goog_YIKsqWRnzWfBZURnwnGHSBqeauh";

// SPEC §1 바탕색. theme/tokens.ts 의 color.bg 와 손으로 같게 유지한다(네이티브 설정은
// RN 토큰 모듈을 import 할 수 없다). 스플래시·어댑티브 아이콘은 라이트 값 그대로(이 플러그인
// 버전엔 안드로이드 다크 스플래시 옵션이 없다 — 부팅 스플래시는 아주 잠깐이라 범위 밖으로 둔다).
const BG = "#FBF8F3";

const config: ExpoConfig = {
  name: "리미키미",
  slug: "rimikimi",
  version: "2.0.0",
  orientation: "portrait",
  scheme: "com.rimikimi.app",
  icon: "./assets/images/icon.png",
  // 4주차: 기기 다크 모드를 따라간다(SPEC §1 다크 토큰). 화면 쪽은 src/theme/tokens.ts 가
  // 시스템 설정을 읽어 반영한다 — 여기는 네이티브 셸(상태바 배경 등)이 같은 방향을 보게만 한다.
  userInterfaceStyle: "automatic",

  ios: {
    bundleIdentifier: "com.rimikimi.app",
    supportsTablet: false,
  },

  android: {
    package: "com.rimikimi.app",
    versionCode: 101,
    // FCM (rimikimi-ad8aa) — 1.x android/app/google-services.json 사본. 완료 푸시 + 드롭 토픽(drop_p540).
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      backgroundColor: BG,
      foregroundImage: "./assets/images/adaptive-icon.png",
    },
    // OAuth 딥링크: com.rimikimi.app://login-callback — scheme 만으로 intent-filter 가 생긴다.
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: false,
        data: [{ scheme: "com.rimikimi.app", host: "login-callback" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
    // CAMERA: 3주차 확인 — expo-image-picker cameraPermission 문자열만으로는 매니페스트에
    // 안 붙는다(prebuild 로 실측: 이 줄 빼고 생성한 AndroidManifest.xml 에 CAMERA 없음).
    // 여기 명시해야 카메라 탭(웹뷰 getUserMedia)과 사진 찍기 둘 다 된다.
    permissions: ["android.permission.INTERNET", "android.permission.CAMERA"],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.ACCESS_MEDIA_LOCATION",
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_MEDIA_AUDIO",
      "android.permission.READ_MEDIA_VIDEO",
      // 고르기는 시스템 Photo Picker(권한 0개), 저장은 writeOnly 라 읽기 권한이 필요 없다.
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
      "android.permission.READ_EXTERNAL_STORAGE",
    ],
  },

  plugins: [
    // Registered first so its mod wraps (and runs after) every other manifest
    // mod below — expo-config-plugins' mod stack executes last-registered-first,
    // so "runs after everything else" means "declared before everything else".
    withFcmManifestFix,
    "expo-router",
    "expo-web-browser",
    "expo-secure-store",
    "@react-native-firebase/app",
    "@react-native-firebase/messaging",
    // Android 8+ 상태바 알림 아이콘: 흰색·투명 배경 단색 96×96 PNG(로고 하트 실루엣) — 3주차 교체.
    ["expo-notifications", { icon: "./assets/images/notification-icon.png", color: "#E6403C", defaultChannel: "default" }],
    [
      "expo-splash-screen",
      { backgroundColor: BG, image: "./assets/images/splash-icon.png", imageWidth: 160 },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "내 사진과 의상 사진을 골라 컨셉 사진을 만들기 위해 사진 접근이 필요해요.",
        cameraPermission: "셀카를 바로 찍어 컨셉 사진을 만들기 위해 카메라를 사용해요.",
        microphonePermission: false,
      },
    ],
    [
      "expo-media-library",
      {
        savePhotosPermission: "완성한 사진을 앨범에 저장하기 위해 사진 추가 권한이 필요해요.",
        photosPermission: "완성한 사진을 앨범에 저장하기 위해 사진 접근이 필요해요.",
        isAccessMediaLocationEnabled: false,
      },
    ],
    ["expo-build-properties", { android: { compileSdkVersion: 36, targetSdkVersion: 36 } }],
    // AdMob 전면광고 (src/lib/ads.ts). 이 플러그인이 하는 일은 매니페스트에
    //   <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" .../>
    // 를 넣는 것뿐이다 — **이게 없으면 광고 SDK 가 앱 시작 때 크래시한다**(구글 SDK 사양).
    // 값은 1.x android/app/src/main/AndroidManifest.xml 과 같은 AdMob 앱 ID (앱 ID `~`,
    // 광고단위 ID `/` — 헷갈리면 크래시한다. 광고단위는 src/lib/ads.ts 에 있다).
    // iosAppId: 이 워크트리는 안드로이드 전용(prebuild --platform android)이라 Info.plist 는
    // 만들어지지 않는다. 안 주면 플러그인이 매번 경고를 찍어서 1.x 의 iOS 앱 ID 를 같이 둔다.
    [
      "react-native-google-mobile-ads",
      {
        androidAppId: "ca-app-pub-9458625554324585~7815250725",
        iosAppId: "ca-app-pub-9458625554324585~5856129775",
      },
    ],
    // 1.x 업로드 키로 release 서명 (app/build.gradle 수정, 매니페스트와 무관 — 순서 상관없음).
    withReleaseSigning,
  ],

  experiments: { typedRoutes: true },

  extra: {
    apiBase: API_BASE,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    rcAndroidKey: RC_ANDROID_KEY,
    router: {},
  },
};

export default config;
