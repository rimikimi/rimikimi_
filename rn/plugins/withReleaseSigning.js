const { withAppBuildGradle } = require("expo/config-plugins");

// expo prebuild 로 새로 생성되는 android/app/build.gradle 은 release 빌드도 debug
// 키(androiddebugkey)로 서명한다 — 이대로 올리면 Play 가 거부하고, 설령 받아줘도
// 1.x Capacitor 앱(같은 패키지 com.rimikimi.app)과 인증서가 달라 "새 앱"이 되어
// 기존 사용자의 로그인·크레딧·내 사진이 끊긴다.
//
// 그래서 1.x 가 쓰던 업로드 키를 그대로 재사용한다:
//   - keystore: 레포 루트 keystore/rimikimi-upload.jks
//   - 비밀번호/별칭: 레포 루트 android/keystore.properties (git 추적 안 함, 로컬에만 존재)
// 이 플러그인은 비밀번호를 소스에 절대 담지 않고, 빌드 시점에 그 properties 파일을
// 읽도록 하는 Groovy 코드만 주입한다. keystore.properties 가 없으면(다른 사람 체크아웃 등)
// 조용히 debug 서명으로 폴백한다 — 로컬 개발 빌드가 깨지지 않게.
const MARKER = "// __rimikimi_release_signing__";

const PROPS_BLOCK = `${MARKER}
// release 서명 = 1.x Capacitor 앱과 같은 업로드 키. 패키지명뿐 아니라 서명
// 인증서도 1.x 와 같아야 기존 사용자가 "업데이트"로 받고 로그인/크레딧이 이어진다.
def rimikimiSharedAndroidDir = rootProject.file('../../android')
def rimikimiKeystorePropsFile = new File(rimikimiSharedAndroidDir, 'keystore.properties')
def hasRimikimiKeystore = rimikimiKeystorePropsFile.exists()
def rimikimiKeystoreProps = new Properties()
if (hasRimikimiKeystore) {
    rimikimiKeystoreProps.load(new FileInputStream(rimikimiKeystorePropsFile))
}
`;

const OLD_SIGNING_CONFIGS = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const NEW_SIGNING_CONFIGS = `signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        if (hasRimikimiKeystore) {
            release {
                storeFile new File(rimikimiSharedAndroidDir, rimikimiKeystoreProps['storeFile'])
                storePassword rimikimiKeystoreProps['storePassword']
                keyAlias rimikimiKeystoreProps['keyAlias']
                keyPassword rimikimiKeystoreProps['keyPassword']
            }
        }
    }`;

const OLD_RELEASE_BUILDTYPE_SIGNING = `// Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug`;

const NEW_RELEASE_BUILDTYPE_SIGNING = `// Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig hasRimikimiKeystore ? signingConfigs.release : signingConfigs.debug`;

const withReleaseSigning = (config) => {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes(MARKER)) {
      // already injected (e.g. plugin ran twice in one prebuild) — no-op.
      return config;
    }

    const pluginAnchor = 'apply plugin: "com.facebook.react"\n';
    if (!contents.includes(pluginAnchor)) {
      throw new Error(
        "withReleaseSigning: app/build.gradle 상단 anchor(apply plugin: \"com.facebook.react\")를 못 찾음 — expo 템플릿이 바뀐 듯. 플러그인을 다시 확인하세요."
      );
    }
    contents = contents.replace(pluginAnchor, `${pluginAnchor}\n${PROPS_BLOCK}`);

    if (!contents.includes(OLD_SIGNING_CONFIGS)) {
      throw new Error(
        "withReleaseSigning: signingConfigs 블록 모양이 예상과 다름 — expo 템플릿이 바뀐 듯. 플러그인을 다시 확인하세요."
      );
    }
    contents = contents.replace(OLD_SIGNING_CONFIGS, NEW_SIGNING_CONFIGS);

    if (!contents.includes(OLD_RELEASE_BUILDTYPE_SIGNING)) {
      throw new Error(
        "withReleaseSigning: release buildType 의 signingConfig 줄을 못 찾음 — expo 템플릿이 바뀐 듯. 플러그인을 다시 확인하세요."
      );
    }
    contents = contents.replace(OLD_RELEASE_BUILDTYPE_SIGNING, NEW_RELEASE_BUILDTYPE_SIGNING);

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withReleaseSigning;
