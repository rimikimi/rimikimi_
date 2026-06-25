import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rimikimi.app',
  appName: 'rimikimi',
  webDir: 'dist',
  // 웹뷰 기본 배경을 크림으로 (로딩 직전/안전영역에 검은 배경 노출 방지)
  backgroundColor: '#fffdf9',
  ios: {
    // 'never' = 웹뷰가 안전영역 인셋을 자동 추가하지 않음. 안전영역은 CSS env() 로 직접 처리하므로
    // (헤더/네비가 이미 env() 사용) 시각적 간격은 동일하고, 인셋 영역에 검은 배경이 드러나지 않는다.
    contentInset: 'never',
    scheme: 'rimikimi',
    backgroundColor: '#fffdf9',
  },
  server: {
    // 베타 동안: vercel 사이트를 그대로 띄움 (네이티브 셸 안에 웹뷰)
    // 정식 출시 시 server.url 제거하고 dist 번들로 전환 가능
    // 일단 dist 번들 모드 (cap sync 가 dist/ 를 ios/App/App/public 으로 복사)
  },
};

export default config;
