const { withAndroidManifest } = require("expo/config-plugins");

// expo-notifications and @react-native-firebase/messaging both declare
//   com.google.firebase.messaging.default_notification_channel_id
//   com.google.firebase.messaging.default_notification_color
// as <meta-data> on <application>, with different values — our app's
// AndroidManifest.xml sets them (channel "default", our brand color) while
// react-native-firebase_messaging's own packaged manifest sets different
// defaults ("" / @color/white). The manifest merger fails on the conflict
// unless our copy explicitly wins with tools:replace. expo-notifications'
// addMetaDataItemToMainApplication() doesn't add that attribute, so we patch
// it in ourselves after all other manifest plugins have run (must be last
// in app.config.ts's plugins array).
const FCM_META_DATA_REPLACE = {
  "com.google.firebase.messaging.default_notification_channel_id": "android:value",
  "com.google.firebase.messaging.default_notification_color": "android:resource",
};

const withFcmManifestFix = (config) => {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    const metaDataList = app?.["meta-data"];
    if (metaDataList) {
      for (const metaData of metaDataList) {
        const name = metaData.$?.["android:name"];
        const replaceAttr = name ? FCM_META_DATA_REPLACE[name] : undefined;
        if (replaceAttr) {
          metaData.$["tools:replace"] = replaceAttr;
        }
      }
    }
    return config;
  });
};

module.exports = withFcmManifestFix;
