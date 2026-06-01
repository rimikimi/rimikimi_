import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rimikimi.app',
  appName: 'rimikimi',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    scheme: 'rimikimi',
  },
  server: {
    // 베타 동안: vercel 사이트를 그대로 띄움 (네이티브 셸 안에 웹뷰)
    // 정식 출시 시 server.url 제거하고 dist 번들로 전환 가능
    // 일단 dist 번들 모드 (cap sync 가 dist/ 를 ios/App/App/public 으로 복사)
  },
};

export default config;
