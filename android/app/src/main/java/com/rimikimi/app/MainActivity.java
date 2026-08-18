package com.rimikimi.app;

import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 전면광고(AdMob) 등 풀스크린 네이티브 액티비티에서 이 액티비티로 복귀할 때
    // WebView 가 터치 포커스를 잃어 결과화면 버튼이 안 눌리는 프리즈가 있었음.
    // 복귀(onResume)마다 WebView 에 터치 포커스를 되돌려줘 프리즈를 방지한다.
    @Override
    public void onResume() {
        super.onResume();
        if (bridge != null) {
            final WebView wv = bridge.getWebView();
            if (wv != null) {
                final Runnable regain = new Runnable() {
                    @Override
                    public void run() {
                        wv.requestFocusFromTouch();
                        wv.requestFocus();
                    }
                };
                wv.post(regain);
                // onResume 시점엔 앞 액티비티(결제창·광고)가 아직 완전히 안 떨어져
                // 포커스 회수가 먹지 않는 경우가 있다 → 조금 뒤 한 번 더.
                wv.postDelayed(regain, 350);
            }
        }
    }
}
