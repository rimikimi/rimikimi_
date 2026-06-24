import React, { useState, useRef, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { isNative, nativePickPhoto, nativeShare } from "./nativeBridge";
import { initAds, showInterstitial, requestATT } from "./ads";
import { initIap, loginIap, logoutIap, getIapPacks, purchaseIap, iapAvailable } from "./iap";
import { FOURCUT_COUNTS, FOURCUT_STYLES, composeStrip, todayStr } from "./fourcut";
import { t, useLang, getLang, localizedTitle, localizedCategory, getLangPreference, setLang } from "./i18n";
import LoginGate from "./LoginGate";

/* 약관/방침/환불 정적 페이지의 절대 경로 베이스.
   웹: 같은 출처라 새 탭으로, 네이티브(번들): 시스템 브라우저로 열림.
   rimikimi.com 은 별도 홈페이지라 앱은 Vercel 도메인을 사용. */
const LEGAL_BASE = "https://rimikimi-app.vercel.app";

/* 사업자/통신판매업 고지는 한국 전자상거래법상 한국 접속자에게만 필요.
   해외 접속자에겐 표시하지 않는다. (판단 불가 시엔 안전하게 표시)
   국가 추정: 표준시간대 Asia/Seoul 또는 브라우저 언어 ko */
const IS_KOREA = (() => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz === "Asia/Seoul") return true;
    const langs =
      navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language || ""];
    return langs.some((l) => String(l).toLowerCase().startsWith("ko"));
  } catch {
    return true;
  }
})();

/* ============================================================
   rimikimi 로고 — 일러스트레이터 SVG 원본 (투명 배경, 벡터)
   ============================================================ */
function Logo({ height = 30, mono = false }) {
  return (
    <svg
      viewBox="0 0 1200 400"
      height={height}
      style={{ display: "block", width: "auto" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <path fill="#231f20" d="M73.67,265.97v36.69c0,8.91-2.09,15.59-6.25,20.04-4.16,4.45-9.45,6.68-15.85,6.68s-11.48-2.26-15.54-6.76c-4.06-4.51-6.08-11.16-6.08-19.97v-122.35c0-19.75,7.1-29.62,21.3-29.62,7.26,0,12.49,2.31,15.69,6.93,3.2,4.62,4.96,11.44,5.29,20.47,5.25-9.02,10.64-15.84,16.16-20.47,5.52-4.62,12.9-6.93,22.12-6.93s18.17,2.31,26.86,6.93c8.69,4.62,13.03,10.74,13.03,18.36,0,5.37-1.85,9.8-5.55,13.29s-7.69,5.23-11.98,5.23c-1.61,0-5.5-.99-11.66-2.97-6.17-1.98-11.61-2.97-16.33-2.97-6.43,0-11.69,1.69-15.76,5.07-4.07,3.38-7.24,8.4-9.49,15.04-2.25,6.65-3.8,14.56-4.66,23.74s-1.29,20.36-1.29,33.56Z"/>
        <path fill="#231f20" d="M205.28,175.64v127.01c0,8.8-2.09,15.46-6.25,19.97-4.16,4.5-9.45,6.76-15.85,6.76s-11.61-2.31-15.62-6.92-6.01-11.22-6.01-19.8v-125.73c0-8.69,2-15.24,6.01-19.64s9.21-6.6,15.62-6.6,11.69,2.2,15.85,6.6,6.25,10.52,6.25,18.35Z"/>
        <path fill="#231f20" d="M383.56,243.27v58.43c0,9.23-2.09,16.15-6.28,20.77-4.19,4.61-9.71,6.92-16.59,6.92s-12.05-2.31-16.18-6.92c-4.13-4.62-6.2-11.54-6.2-20.77v-70.01c0-11.05-.38-19.64-1.13-25.76-.75-6.12-2.79-11.13-6.11-15.05-3.32-3.92-8.58-5.87-15.76-5.87-14.37,0-23.83,4.94-28.38,14.81s-6.83,24.04-6.83,42.49v59.39c0,9.12-2.07,16.02-6.2,20.68-4.13,4.67-9.58,7-16.34,7s-12.1-2.34-16.34-6.99c-4.24-4.66-6.36-11.55-6.36-20.66v-125.6c0-8.25,1.9-14.52,5.72-18.81s8.83-6.43,15.06-6.43,11.03,2.01,15.05,6.01c4.03,4.01,6.04,9.54,6.04,16.58v4.17c7.61-9.08,15.76-15.75,24.45-20.02,8.69-4.27,18.34-6.41,28.96-6.41s20.54,2.19,28.48,6.57c7.94,4.38,14.48,11,19.63,19.87,7.39-8.97,15.32-15.62,23.79-19.95,8.46-4.33,17.84-6.49,28.13-6.49,12,0,22.34,2.35,31.01,7.05,8.68,4.7,15.16,11.43,19.45,20.19,3.75,7.94,5.63,20.44,5.63,37.5v85.77c0,9.23-2.09,16.14-6.27,20.76-4.18,4.61-9.7,6.92-16.56,6.92s-12.09-2.34-16.32-7c-4.23-4.67-6.35-11.56-6.35-20.68v-73.88c0-9.44-.41-17.01-1.21-22.69-.8-5.69-2.97-10.46-6.51-14.33-3.53-3.86-8.89-5.79-16.07-5.79-5.78,0-11.27,1.72-16.47,5.15-5.19,3.44-9.24,8.05-12.13,13.84-3.21,7.4-4.82,20.49-4.82,39.27Z"/>
        <path fill="#231f20" d="M559.66,175.64v127.01c0,8.8-2.09,15.46-6.25,19.97-4.16,4.5-9.45,6.76-15.85,6.76s-11.61-2.31-15.62-6.92-6.01-11.22-6.01-19.8v-125.73c0-8.69,2-15.24,6.01-19.64s9.21-6.6,15.62-6.6,11.69,2.2,15.85,6.6,6.25,10.52,6.25,18.35Z"/>
        <path fill="#231f20" d="M701.13,309.26l-38.77-63.76-23.81,22.54v34.94c0,8.48-2.22,15-6.67,19.56-4.45,4.56-9.56,6.84-15.35,6.84-6.75,0-12.06-2.26-15.91-6.76-3.86-4.5-5.79-11.16-5.79-19.96V115.3c0-9.76,1.87-17.19,5.62-22.29,3.75-5.1,9.11-7.65,16.08-7.65s12.11,2.31,16.07,6.92c3.96,4.62,5.95,11.43,5.95,20.45v106.58l49.38-51.87c6.11-6.44,10.78-10.85,13.99-13.21s7.13-3.55,11.74-3.55c5.46,0,10.02,1.75,13.67,5.23,3.65,3.49,5.47,7.86,5.47,13.12,0,6.44-5.95,15.02-17.85,25.76l-23.33,21.41,45.04,70.83c3.32,5.26,5.71,9.26,7.16,11.99s2.17,5.34,2.17,7.8c0,6.98-1.91,12.48-5.71,16.5s-8.82,6.04-15.04,6.04c-5.36,0-9.49-1.45-12.39-4.34-2.9-2.9-6.81-8.16-11.74-15.78Z"/>
        <path fill="#231f20" d="M803.22,175.64v127.01c0,8.8-2.09,15.46-6.25,19.97-4.16,4.5-9.45,6.76-15.85,6.76s-11.61-2.31-15.62-6.92-6.01-11.22-6.01-19.8v-125.73c0-8.69,2-15.24,6.01-19.64s9.21-6.6,15.62-6.6,11.69,2.2,15.85,6.6,6.25,10.52,6.25,18.35Z"/>
        <path fill="#231f20" d="M981.49,243.27v58.43c0,9.23-2.09,16.15-6.28,20.77-4.19,4.61-9.71,6.92-16.59,6.92s-12.05-2.31-16.18-6.92c-4.13-4.62-6.2-11.54-6.2-20.77v-70.01c0-11.05-.38-19.64-1.13-25.76-.75-6.12-2.79-11.13-6.11-15.05-3.32-3.92-8.58-5.87-15.76-5.87-14.37,0-23.83,4.94-28.38,14.81-4.56,9.87-6.83,24.04-6.83,42.49v59.39c0,9.12-2.07,16.02-6.2,20.68-4.13,4.67-9.58,7-16.34,7s-12.1-2.34-16.34-6.99c-4.24-4.66-6.36-11.55-6.36-20.66v-125.6c0-8.25,1.9-14.52,5.72-18.81s8.83-6.43,15.06-6.43,11.03,2.01,15.05,6.01c4.03,4.01,6.04,9.54,6.04,16.58v4.17c7.61-9.08,15.76-15.75,24.45-20.02,8.69-4.27,18.34-6.41,28.96-6.41s20.54,2.19,28.48,6.57c7.94,4.38,14.48,11,19.63,19.87,7.39-8.97,15.32-15.62,23.79-19.95,8.46-4.33,17.84-6.49,28.13-6.49,12,0,22.34,2.35,31.01,7.05,8.68,4.7,15.16,11.43,19.45,20.19,3.75,7.94,5.63,20.44,5.63,37.5v85.77c0,9.23-2.09,16.14-6.27,20.76-4.18,4.61-9.7,6.92-16.56,6.92s-12.09-2.34-16.32-7-6.35-11.56-6.35-20.68v-73.88c0-9.44-.41-17.01-1.21-22.69-.8-5.69-2.97-10.46-6.51-14.33-3.53-3.86-8.89-5.79-16.07-5.79-5.78,0-11.27,1.72-16.47,5.15-5.19,3.44-9.24,8.05-12.13,13.84-3.21,7.4-4.82,20.49-4.82,39.27Z"/>
        <path fill="#231f20" d="M1157.6,175.64v127.01c0,8.8-2.09,15.46-6.25,19.97-4.16,4.5-9.45,6.76-15.85,6.76s-11.61-2.31-15.62-6.92-6.01-11.22-6.01-19.8v-125.73c0-8.69,2-15.24,6.01-19.64s9.21-6.6,15.62-6.6,11.69,2.2,15.85,6.6,6.25,10.52,6.25,18.35Z"/>
      </g>
      <path fill="#f9c83c" d="M558.14,115.67c-6.26,6.11-13.02,10.97-20.34,15.55-9.34-5.82-18.29-12.51-25.25-20.94-6.05-7.34-11.22-17.73-8.15-27.35,2.06-6.46,7.58-11.17,14.31-12.15,5.5-.76,10.81,1.3,14.53,5.39,1.99,2.19,3.36,4.65,4.58,7.53,3.17-8.01,9.44-13.71,18.45-13,7.55.8,13.63,6.3,15.33,13.68,2.7,11.72-5.41,23.42-13.45,31.3Z"/>
      <path fill="#e6403c" d="M203.76,115.67c-6.26,6.11-13.02,10.97-20.34,15.55-9.34-5.82-18.29-12.51-25.25-20.94-6.05-7.34-11.22-17.73-8.15-27.35,2.06-6.46,7.58-11.17,14.31-12.15,5.5-.76,10.81,1.3,14.53,5.39,1.99,2.19,3.36,4.65,4.58,7.53,3.17-8.01,9.44-13.71,18.45-13,7.55.8,13.63,6.3,15.33,13.68,2.7,11.72-5.41,23.42-13.45,31.3Z"/>
      <path fill="#8a5da7" d="M1156.07,115.67c-6.26,6.11-13.02,10.97-20.34,15.55-9.34-5.82-18.29-12.51-25.25-20.94-6.05-7.34-11.22-17.73-8.15-27.35,2.06-6.46,7.58-11.17,14.31-12.15,5.5-.76,10.81,1.3,14.53,5.39,1.99,2.19,3.36,4.65,4.58,7.53,3.17-8.01,9.44-13.71,18.45-13,7.55.8,13.63,6.3,15.33,13.68,2.7,11.72-5.41,23.42-13.45,31.3Z"/>
      <path fill="#60c9de" d="M801.69,115.67c-6.26,6.11-13.02,10.97-20.34,15.55-9.34-5.82-18.29-12.51-25.25-20.94-6.05-7.34-11.22-17.73-8.15-27.35,2.06-6.46,7.58-11.17,14.31-12.15,5.5-.76,10.81,1.3,14.53,5.39,1.99,2.19,3.36,4.65,4.58,7.53,3.17-8.01,9.44-13.71,18.45-13,7.55.8,13.63,6.3,15.33,13.68,2.7,11.72-5.41,23.42-13.45,31.3Z"/>
    </svg>
  );
}

function _OldLogo({ height = 30, mono = false }) {
  return (
    <svg
      viewBox="0 0 640 640"
      height={height}
      style={{ display: "block", width: "auto" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g><path fill="#231f20" d="M48.37,354.05v18.93c0,4.6-1.08,8.04-3.22,10.34-2.15,2.3-4.88,3.45-8.18,3.45s-5.93-1.16-8.02-3.49c-2.09-2.33-3.14-5.76-3.14-10.3v-63.14c0-10.19,3.66-15.29,10.99-15.29,3.75,0,6.45,1.19,8.1,3.58,1.65,2.39,2.56,5.91,2.73,10.56,2.71-4.66,5.49-8.18,8.34-10.56,2.85-2.38,6.66-3.58,11.41-3.58s9.38,1.19,13.86,3.58,6.72,5.54,6.72,9.48c0,2.77-.96,5.06-2.87,6.86s-3.97,2.7-6.18,2.7c-.83,0-2.84-.51-6.02-1.54-3.18-1.02-5.99-1.54-8.43-1.54-3.32,0-6.03.87-8.14,2.62s-3.74,4.33-4.9,7.76c-1.16,3.43-1.96,7.52-2.41,12.25s-.66,10.51-.66,17.32Z"/><path fill="#231f20" d="M116.3,307.43v65.55c0,4.54-1.08,7.98-3.22,10.3-2.15,2.32-4.88,3.49-8.18,3.49s-5.99-1.19-8.06-3.57-3.1-5.79-3.1-10.22v-64.88c0-4.48,1.03-7.86,3.1-10.14s4.75-3.41,8.06-3.41,6.03,1.14,8.18,3.41,3.22,5.43,3.22,9.47Z"/><path fill="#231f20" d="M208.3,342.33v30.15c0,4.76-1.08,8.34-3.24,10.72-2.16,2.38-5.01,3.57-8.56,3.57s-6.22-1.19-8.35-3.57c-2.13-2.38-3.2-5.95-3.2-10.72v-36.13c0-5.7-.19-10.14-.58-13.29s-1.44-5.75-3.15-7.77c-1.72-2.02-4.43-3.03-8.13-3.03-7.41,0-12.3,2.55-14.65,7.64s-3.53,12.4-3.53,21.93v30.65c0,4.71-1.07,8.27-3.2,10.67-2.13,2.41-4.95,3.61-8.43,3.61s-6.25-1.21-8.43-3.61c-2.19-2.41-3.28-5.96-3.28-10.66v-64.82c0-4.26.98-7.5,2.95-9.71s4.56-3.32,7.77-3.32,5.69,1.04,7.77,3.1c2.08,2.07,3.12,4.92,3.12,8.56v2.15c3.93-4.69,8.14-8.13,12.62-10.33s9.47-3.31,14.95-3.31,10.6,1.13,14.7,3.39c4.1,2.26,7.47,5.68,10.13,10.25,3.81-4.63,7.91-8.06,12.28-10.29,4.37-2.23,9.21-3.35,14.52-3.35,6.19,0,11.53,1.21,16.01,3.64,4.48,2.43,7.82,5.9,10.04,10.42,1.93,4.1,2.9,10.55,2.9,19.35v44.26c0,4.76-1.08,8.33-3.24,10.71-2.16,2.38-5.01,3.57-8.55,3.57s-6.24-1.21-8.42-3.61-3.28-5.97-3.28-10.67v-38.13c0-4.87-.21-8.78-.62-11.71s-1.53-5.4-3.36-7.39c-1.82-1.99-4.59-2.99-8.29-2.99-2.98,0-5.82.89-8.5,2.66-2.68,1.77-4.77,4.15-6.26,7.14-1.66,3.82-2.49,10.58-2.49,20.27Z"/><path fill="#231f20" d="M299.18,307.43v65.55c0,4.54-1.08,7.98-3.22,10.3-2.15,2.32-4.88,3.49-8.18,3.49s-5.99-1.19-8.06-3.57-3.1-5.79-3.1-10.22v-64.88c0-4.48,1.03-7.86,3.1-10.14s4.75-3.41,8.06-3.41,6.03,1.14,8.18,3.41,3.22,5.43,3.22,9.47Z"/><path fill="#231f20" d="M372.19,376.38l-20.01-32.9-12.29,11.63v18.03c0,4.38-1.15,7.74-3.44,10.09s-4.94,3.53-7.92,3.53c-3.48,0-6.22-1.16-8.21-3.49-1.99-2.32-2.99-5.76-2.99-10.3v-96.69c0-5.04.97-8.87,2.9-11.5,1.93-2.63,4.7-3.95,8.3-3.95s6.25,1.19,8.29,3.57,3.07,5.9,3.07,10.55v55l25.49-26.77c3.15-3.32,5.56-5.6,7.22-6.82s3.68-1.83,6.06-1.83c2.82,0,5.17.9,7.05,2.7s2.82,4.06,2.82,6.77c0,3.32-3.07,7.75-9.21,13.29l-12.04,11.05,23.24,36.56c1.72,2.71,2.95,4.78,3.69,6.19s1.12,2.75,1.12,4.03c0,3.6-.98,6.44-2.95,8.52s-4.55,3.12-7.76,3.12c-2.77,0-4.9-.75-6.39-2.24-1.49-1.5-3.51-4.21-6.06-8.14Z"/><path fill="#231f20" d="M424.88,307.43v65.55c0,4.54-1.08,7.98-3.22,10.3-2.15,2.32-4.88,3.49-8.18,3.49s-5.99-1.19-8.06-3.57-3.1-5.79-3.1-10.22v-64.88c0-4.48,1.03-7.86,3.1-10.14s4.75-3.41,8.06-3.41,6.03,1.14,8.18,3.41,3.22,5.43,3.22,9.47Z"/><path fill="#231f20" d="M516.88,342.33v30.15c0,4.76-1.08,8.34-3.24,10.72-2.16,2.38-5.01,3.57-8.56,3.57s-6.22-1.19-8.35-3.57c-2.13-2.38-3.2-5.95-3.2-10.72v-36.13c0-5.7-.19-10.14-.58-13.29s-1.44-5.75-3.15-7.77c-1.72-2.02-4.43-3.03-8.13-3.03-7.41,0-12.3,2.55-14.65,7.64s-3.53,12.4-3.53,21.93v30.65c0,4.71-1.07,8.27-3.2,10.67-2.13,2.41-4.95,3.61-8.43,3.61s-6.25-1.21-8.43-3.61c-2.19-2.41-3.28-5.96-3.28-10.66v-64.82c0-4.26.98-7.5,2.95-9.71s4.56-3.32,7.77-3.32,5.69,1.04,7.77,3.1c2.08,2.07,3.12,4.92,3.12,8.56v2.15c3.93-4.69,8.14-8.13,12.62-10.33s9.47-3.31,14.95-3.31,10.6,1.13,14.7,3.39c4.1,2.26,7.47,5.68,10.13,10.25,3.81-4.63,7.91-8.06,12.28-10.29,4.37-2.23,9.21-3.35,14.52-3.35,6.19,0,11.53,1.21,16.01,3.64,4.48,2.43,7.82,5.9,10.04,10.42,1.93,4.1,2.9,10.55,2.9,19.35v44.26c0,4.76-1.08,8.33-3.24,10.71-2.16,2.38-5.01,3.57-8.55,3.57s-6.24-1.21-8.42-3.61-3.28-5.97-3.28-10.67v-38.13c0-4.87-.21-8.78-.62-11.71s-1.53-5.4-3.36-7.39c-1.82-1.99-4.59-2.99-8.29-2.99-2.98,0-5.82.89-8.5,2.66-2.68,1.77-4.77,4.15-6.26,7.14-1.66,3.82-2.49,10.58-2.49,20.27Z"/><path fill="#231f20" d="M607.76,307.43v65.55c0,4.54-1.08,7.98-3.22,10.3-2.15,2.32-4.88,3.49-8.18,3.49s-5.99-1.19-8.06-3.57-3.1-5.79-3.1-10.22v-64.88c0-4.48,1.03-7.86,3.1-10.14s4.75-3.41,8.06-3.41,6.03,1.14,8.18,3.41,3.22,5.43,3.22,9.47Z"/></g><path fill="#f9c83c" d="M298.4,276.48c-3.23,3.15-6.72,5.66-10.5,8.02-4.82-3-9.44-6.46-13.03-10.81-3.12-3.79-5.79-9.15-4.2-14.12,1.06-3.33,3.91-5.77,7.38-6.27,2.84-.39,5.58.67,7.5,2.78,1.03,1.13,1.73,2.4,2.36,3.89,1.63-4.13,4.87-7.07,9.52-6.71,3.9.41,7.03,3.25,7.91,7.06,1.39,6.05-2.79,12.09-6.94,16.15Z"/><path fill="#e6403c" d="M115.51,276.48c-3.23,3.15-6.72,5.66-10.5,8.02-4.82-3-9.44-6.46-13.03-10.81-3.12-3.79-5.79-9.15-4.2-14.12,1.06-3.33,3.91-5.77,7.38-6.27,2.84-.39,5.58.67,7.5,2.78,1.03,1.13,1.73,2.4,2.36,3.89,1.63-4.13,4.87-7.07,9.52-6.71,3.9.41,7.03,3.25,7.91,7.06,1.39,6.05-2.79,12.09-6.94,16.15Z"/><path fill="#8a5da7" d="M606.98,276.48c-3.23,3.15-6.72,5.66-10.5,8.02-4.82-3-9.44-6.46-13.03-10.81-3.12-3.79-5.79-9.15-4.2-14.12,1.06-3.33,3.91-5.77,7.38-6.27,2.84-.39,5.58.67,7.5,2.78,1.03,1.13,1.73,2.4,2.36,3.89,1.63-4.13,4.87-7.07,9.52-6.71,3.9.41,7.03,3.25,7.91,7.06,1.39,6.05-2.79,12.09-6.94,16.15Z"/><path fill="#60c9de" d="M424.09,276.48c-3.23,3.15-6.72,5.66-10.5,8.02-4.82-3-9.44-6.46-13.03-10.81-3.12-3.79-5.79-9.15-4.2-14.12,1.06-3.33,3.91-5.77,7.38-6.27,2.84-.39,5.58.67,7.5,2.78,1.03,1.13,1.73,2.4,2.36,3.89,1.63-4.13,4.87-7.07,9.52-6.71,3.9.41,7.03,3.25,7.91,7.06,1.39,6.05-2.79,12.09-6.94,16.15Z"/>
    </svg>
  );
}

/* ============================================================
   컨셉별 결과 예시 썸네일 (WebP, base64)
   ============================================================ */

/* ============================================================
   프롬프트 데이터 — 앱 코드와 분리되어 있습니다.
   나중에 이 배열만 300개짜리로 교체하면 됩니다.
   각 항목: { id, title, category, text, sensitive }
   브랜드명은 일반 명사로 치환된 상태입니다.
   ============================================================ */

// id 는 서버 (api/_lib/payments/packages.js) 와 1:1 매칭 필수.
// usd 는 PayPal 결제용. krw 는 한국 사용자 참고 표시.
// 결제(크레딧 충전): 네이티브 앱 = 인앱결제(IAP, RevenueCat) 활성. 웹은 숨김.
// (v1.0은 무료+광고로 통과 → v1.1부터 IAP 켬)
const PAYMENTS_ENABLED = isNative();

const CREDIT_PACKS = [
  { id: "credits_10",  count: 10,  krw: 7900,  usd: "7.90",  label: null },
  { id: "credits_30",  count: 30,  krw: 22490, usd: "22.49", label: "가장 인기" },
  { id: "credits_70",  count: 70,  krw: 49900, usd: "49.90", label: null },
  { id: "credits_120", count: 120, krw: 79900, usd: "79.90", label: "최고 가성비" },
];

const FREE_DAILY = 1;

/* 로고에서 추출한 브랜드 컬러 */
const HEARTS = ["#e6403c", "#f9c83c", "#60c9de", "#8a5da7"];

const won = (n) => n.toLocaleString("ko-KR") + "원";
const usd = (s) => "$" + s;
const perImage = (pack) => Math.round(pack.krw / pack.count);
const perImageUsd = (pack) =>
  (parseFloat(pack.usd) / pack.count).toFixed(2);

// 아트 변환 카테고리 = 본인 얼굴이 아닌 임의 사진을 별도로 업로드받는 컨셉.
const ART_CATEGORY = "🪄 매직 부스";
function isArtConcept(concept) {
  if (!concept) return false;
  const cats = concept.categories || (concept.category ? [concept.category] : []);
  return cats.includes(ART_CATEGORY);
}

// 증명사진 = 정장색/배경색을 사용자가 고르는 특수 컨셉.
function isIdPhoto(concept) {
  if (!concept) return false;
  return concept.mode === "idphoto" || /증명사진/.test(concept.title || "");
}

// 인생네컷 = 분할(2/3/4/6/8) + 스타일(5종)을 고르는 특수 컨셉.
function isFourcut(concept) {
  if (!concept) return false;
  return concept.mode === "fourcut" || /인생네컷/.test(concept.title || "");
}
const ID_SUITS = [
  { key: "dark navy", label: "다크 네이비", css: "#1f2a44" },
  { key: "charcoal dark grey", label: "다크 그레이", css: "#3b3e44" },
  { key: "light grey", label: "라이트 그레이", css: "#b7bcc4" },
  { key: "black", label: "블랙", css: "#15171a" },
];
const ID_BGS = [
  { hex: "#FFFFFF", name: "pure white" },
  { hex: "#f7f4f5", name: "soft warm light grey" },
  { hex: "#fff9eb", name: "warm ivory cream" },
  { hex: "#ffeaeb", name: "soft pastel pink" },
  { hex: "#c4ecf0", name: "light sky blue" },
  { hex: "#a5d2d8", name: "soft muted teal" },
  { hex: "#1b3c5a", name: "deep navy blue" },
  { hex: "#4d3f64", name: "deep muted purple" },
];
const ID_DISCLAIMER =
  "AI로 생성된 증명사진이에요. 공공기관·여권·비자 심사 등 공식 제출용으로는 규격 불일치로 거절될 수 있으니 참고용으로 사용해 주세요.";

function buildIdPhotoPrompt(suitKey, bgHex, bgName) {
  return (
    "Create a clean, professional ID / passport-style photograph of the person in the provided photo. " +
    "Keep their exact face, identity, facial features and natural likeness — do not beautify, slim, or change who they are. " +
    "Front-facing head-AND-shoulders headshot, looking straight at the camera, neutral relaxed expression with the mouth closed, " +
    "eyes open and clearly visible, face and both ears visible, hair tidy, no hat and no sunglasses. " +
    "Framing: do not crop tightly on the face — leave a little space above the hair and include the full shoulder line down to the upper chest (standard ID photo crop); never cut off the shoulders. " +
    "Dress the person in a formal " + suitKey + " suit jacket over a crisp collared shirt with a BESPOKE, made-to-measure tailored fit precisely tailored to the person's own frame. " +
    "It must look completely real and natural (realistic fabric texture, natural lapels/folds and shadows, seamless transitions at the neck and shoulders; clean tailored shoulders following the natural shoulder line; never flat, pasted-on, plastic, or costume-like). " +
    "Replace the background with a solid " + bgName + " (" + bgHex + ") studio backdrop that has a very subtle, smooth gradient — " +
    "slightly brighter just behind the head and gently darker toward the edges. " +
    "Soft, even studio lighting with no harsh shadows on the face or the background. " +
    "Sharp focus, high resolution, true-to-life natural skin tones, vertical portrait composition centered like an official ID photo."
  );
}

/* ============================================================
   사진 축소 — API로 보내기 전 용량을 줄임
   - 큰 휴대폰 사진을 그대로 보내면 토큰 한도를 초과할 수 있음
   - 긴 변 기준 maxSize 픽셀로 축소 + JPEG 압축
   ============================================================ */
function shrinkImage(dataUrl, maxSize = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width >= height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("사진을 처리할 수 없어요."));
    img.src = dataUrl;
  });
}

/* ============================================================
   결과 이미지를 정확한 크기로 맞추기 (중앙 크롭 후 리사이즈)
   - 가로/세로 비율이 다르면 가운데를 기준으로 잘라냄 (CSS object-fit: cover)
   - format: "image/png" 또는 "image/jpeg"
   ============================================================ */
function fitToSize(dataUrl, targetW, targetH, format = "image/png") {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const targetRatio = targetW / targetH;
      const srcRatio = sw / sh;

      // 소스에서 잘라낼 영역 (sx, sy, sCropW, sCropH)
      let sCropW, sCropH;
      if (srcRatio > targetRatio) {
        // 소스가 타겟보다 가로로 더 김 → 양옆 잘라냄
        sCropH = sh;
        sCropW = Math.round(sh * targetRatio);
      } else {
        // 소스가 타겟보다 세로로 더 김 → 위아래 잘라냄
        sCropW = sw;
        sCropH = Math.round(sw / targetRatio);
      }
      const sx = Math.round((sw - sCropW) / 2);
      const sy = Math.round((sh - sCropH) / 2);

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      // 부드러운 다운스케일
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, sCropW, sCropH, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL(format));
    };
    img.onerror = () => reject(new Error("결과 이미지 처리 실패"));
    img.src = dataUrl;
  });
}

/* ============================================================
   이미지 생성 — 우리 중간 창구(/api/generate) 호출
   - accessToken: 로그인 사용자의 Supabase 세션 토큰
   - dataUrl: 사용자 사진 (data:image/...;base64,xxx)
   - promptText: 선택한 컨셉의 프롬프트
   - 반환: { imageDataUrl, quotaUsed, quotaLimit }
   - 한도 초과시 throw — err.quotaExceeded = true
   ============================================================ */
async function generateImage(accessToken, dataUrl, promptText, conceptMeta = {}) {
  if (!dataUrl) throw new Error("사진이 없어요. 먼저 사진을 올려주세요.");
  if (!accessToken) throw new Error("로그인이 필요해요.");

  // API로 보내기 전 사진을 적당한 크기로 축소 (요청 용량 줄이기)
  let sendUrl;
  try {
    sendUrl = await shrinkImage(dataUrl, 1024, 0.85);
  } catch (_) {
    sendUrl = dataUrl;
  }

  const m = sendUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!m) throw new Error("사진 형식을 읽을 수 없어요.");
  const mimeType = m[1];
  const base64 = m[2];

  let res;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + accessToken,
      },
      body: JSON.stringify({
        mimeType, base64, prompt: promptText,
        conceptId: conceptMeta.id, conceptTitle: conceptMeta.title,
        skipFacePrecheck: !!conceptMeta.skipFacePrecheck,
        // 증명사진: 선택한 정장/배경 (서버가 프롬프트 조립)
        idSuit: conceptMeta.idSuit, idBg: conceptMeta.idBg, idBgName: conceptMeta.idBgName,
        // 인생네컷: 스타일 + 컷 인덱스 (서버가 컷별 프롬프트 조립)
        fourcutStyle: conceptMeta.fourcutStyle, cutIndex: conceptMeta.cutIndex,
      }),
    });
  } catch (e) {
    throw new Error("네트워크 요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  let json;
  try {
    json = await res.json();
  } catch (_) {
    throw new Error("서버 응답을 읽을 수 없어요 (오류 " + res.status + ")");
  }

  if (!res.ok) {
    const msg = json?.error || "이미지 생성 실패 (오류 " + res.status + ")";
    const detail = json?.detail
      ? "\n\n[원문] " + String(json.detail).slice(0, 300)
      : "";
    const err = new Error(msg + detail);
    if (res.status === 429) err.quotaExceeded = true;
    if (typeof json?.quotaUsed === "number") err.quotaUsed = json.quotaUsed;
    if (typeof json?.quotaLimit === "number") err.quotaLimit = json.quotaLimit;
    throw err;
  }

  if (!json?.base64 || !json?.mimeType) {
    throw new Error("이미지 응답을 받지 못했어요. 다른 컨셉으로 시도해 주세요.");
  }
  const rawDataUrl = "data:" + json.mimeType + ";base64," + json.base64;
  // 결과를 정확히 768×1024 PNG 로 맞춤 (중앙 크롭)
  let imageDataUrl;
  try {
    imageDataUrl = await fitToSize(rawDataUrl, 768, 1024, "image/png");
  } catch (_) {
    imageDataUrl = rawDataUrl; // 리사이즈 실패 시 원본 사용
  }
  return {
    imageDataUrl,
    quotaUsed: json.quotaUsed,
    quotaLimit: json.quotaLimit,
    unlimited: json.unlimited,
  };
}

/* ============================================================
   메인 컴포넌트
   ============================================================ */
// ── 무료 사용자용 애드센스 광고 슬롯 ──
// ADSENSE_SLOT 에 애드센스 승인 후 만든 "광고 단위(slot) ID" 를 넣으면 광고가 나옴.
// 비어 있으면 아무것도 렌더하지 않음(빈 박스 방지) → 승인 전엔 무해.
const ADSENSE_CLIENT = "ca-pub-9458625554324585";
const ADSENSE_SLOT = ""; // 예: "1234567890"

function AdSlot() {
  useEffect(() => {
    if (!ADSENSE_SLOT) return;
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (_) {}
  }, []);
  if (!ADSENSE_SLOT) return null;
  return (
    <div style={{ width: "100%", margin: "18px 0", textAlign: "center" }}>
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

// ── 하단 글래스 탭바 (아이콘 + 텍스트) ──
function BottomNav({ screen, go }) {
  const tabs = [
    { key: "gallery", label: "갤러리", icon: "✦", match: ["gallery", "home", "confirm", "result"] },
    { key: "mygallery", label: "내 사진", icon: "♡", match: ["mygallery"] },
    { key: "profile", label: "프로필", icon: "👤", match: ["profile", "store"] },
  ];
  return (
    <nav style={S.tabbar}>
      <div style={S.tabbarInner}>
        {tabs.map((tb) => {
          const on = tb.match.includes(screen);
          return (
            <button
              key={tb.key}
              style={{ ...S.tabBtn, ...(on ? S.tabBtnOn : {}) }}
              onClick={() => go(tb.key)}
            >
              <span style={S.tabIcon}>{tb.icon}</span>
              <span style={S.tabLabel}>{tb.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default function PortraitStudio() {
  useLang(); // 언어 변경 시 컴포넌트 트리 리렌더
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("gallery");
  // photo: 사용자가 업로드한 본인 사진 (프로필 = 입력 사진, 같은 값)
  // localStorage 에 자동 저장돼서 다음 방문 / 새 탭에서도 그대로 살아있음
  const [photo, setPhoto] = useState(() => {
    try {
      return localStorage.getItem("rimikimi_photo") || null;
    } catch { return null; }
  });
  // 아트 변환 컨셉용 일회용 사진. localStorage 안 함 (휘발성).
  const [artPhoto, setArtPhoto] = useState(null);
  // 증명사진 옵션 (정장색 key / 배경 hex)
  const [idSuit, setIdSuit] = useState(ID_SUITS[0].key);
  const [idBg, setIdBg] = useState(ID_BGS[0].hex);
  // 인생네컷 옵션 (분할 수 / 스타일 key) + 진행 표시
  const [fourcutCount, setFourcutCount] = useState(4);
  const [fourcutStyleKey, setFourcutStyleKey] = useState(FOURCUT_STYLES[0].key);
  const [fourcutProgress, setFourcutProgress] = useState("");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("전체");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [freeUsed, setFreeUsed] = useState(0);
  // 하루 무료 한도 (서버가 역할 따라 알려줌: 테스터 3 / 일반 1). 기본 FREE_DAILY.
  const [freeLimit, setFreeLimit] = useState(FREE_DAILY);
  // quota API 응답 전엔 헤더 사용량 표시를 숨김 (2/2 → ∞ 깜빡임 방지)
  const [quotaLoaded, setQuotaLoaded] = useState(false);
  const [unlimited, setUnlimited] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [concepts, setConcepts] = useState([]);
  const [conceptsLoading, setConceptsLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [referralCount, setReferralCount] = useState(0);
  const [untilNext, setUntilNext] = useState(2);
  const [inviteMsg, setInviteMsg] = useState("");
  const [generating, setGenerating] = useState(false);
  const [resultImage, setResultImage] = useState(null);
  const [genError, setGenError] = useState(null);
  const fileRef = useRef(null);

  // ─── 로그인 세션 ───
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  // 세션이 자리잡는 중인지 — 로그인 직후/리다이렉트 복귀 때 로그인 화면이 잠깐 번쩍이는 것 방지
  const [authSettling, setAuthSettling] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // photo 가 바뀌면 localStorage 에 자동 저장 (없으면 키 삭제)
  useEffect(() => {
    try {
      if (photo) localStorage.setItem("rimikimi_photo", photo);
      else localStorage.removeItem("rimikimi_photo");
    } catch { /* quota 초과 등은 무시 */ }
  }, [photo]);

  // 페이지 로드 시 현재 세션 확인 + 이후 변경 감지
  useEffect(() => {
    let mounted = true;
    // OAuth 리다이렉트로 복귀 중인지 (해시/쿼리에 토큰·코드가 있으면 세션이 곧 들어옴)
    const hasAuthRedirect = /[#&?](access_token|code|provider_token|auth)=/.test(
      window.location.hash + window.location.search
    );
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthChecked(true);
      // 세션도 없고 리다이렉트 복귀도 아니면 진짜 로그아웃 → 바로 로그인 화면 허용
      if (!data.session && !hasAuthRedirect) setAuthSettling(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s) setAuthSettling(false);
    });
    // 안전장치: 5초 안에 세션이 안 들어오면 로그인 화면 보여줌 (로그인 실패 대비)
    const failsafe = setTimeout(() => { if (mounted) setAuthSettling(false); }, 5000);
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(failsafe);
    };
  }, []);

  // 네이티브 앱: OAuth 시스템 브라우저 → 딥링크(com.rimikimi.app://login-callback) 복귀 처리
  useEffect(() => {
    if (!isNative()) return;
    let listener, attListener;
    (async () => {
      const { App } = await import("@capacitor/app");

      // ATT 동의 팝업: 앱이 "활성" 상태일 때만 표시됨 (콜드스타트 중엔 무시됨).
      // 추적 데이터 수집 전에 띄워야 하므로 ATT → 그다음 광고 초기화 순서.
      const startTracking = async () => {
        await requestATT();   // notDetermined 면 팝업, 이미 결정됐으면 no-op
        await initAds();
      };
      const st = await App.getState();
      if (st?.isActive) setTimeout(startTracking, 600);
      attListener = await App.addListener("appStateChange", ({ isActive }) => {
        if (isActive) setTimeout(startTracking, 600);
      });

      listener = await App.addListener("appUrlOpen", async ({ url }) => {
        if (!url || !url.includes("login-callback")) return;
        try {
          const { Browser } = await import("@capacitor/browser");
          await Browser.close();
        } catch (_) {}
        try {
          const code = new URL(url).searchParams.get("code");
          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (url.includes("#")) {
            const h = new URLSearchParams(url.split("#")[1]);
            const at = h.get("access_token");
            const rt = h.get("refresh_token");
            if (at && rt) await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          }
        } catch (_) {}
      });
    })();
    return () => { if (listener) listener.remove(); if (attListener) attListener.remove(); };
  }, []);

  // 인앱결제(IAP/RevenueCat) 초기화 — 네이티브에서 앱 시작 시 1회
  useEffect(() => {
    if (!iapAvailable()) return;
    initIap();
  }, []);

  // 로그인/로그아웃에 맞춰 RevenueCat 식별자(app_user_id = 우리 user.id) 정렬
  useEffect(() => {
    if (!iapAvailable()) return;
    const uid = session?.user?.id;
    if (uid) loginIap(uid);
    else logoutIap();
  }, [session?.user?.id]);

  // 초대 링크(?ref=...)로 들어왔으면 기억해뒀다가 로그인 후 처리
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) {
      localStorage.setItem("pending_ref", ref);
      // URL 에서 ref 제거 (깔끔하게)
      params.delete("ref");
      const qs = params.toString();
      const clean =
        window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
      window.history.replaceState({}, "", clean);
    }
  }, []);

  // 로그인 직후, 기억해둔 초대 ref 를 서버에 전달
  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    const pendingRef = localStorage.getItem("pending_ref");
    if (!pendingRef) return;
    fetch("/api/referral/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ ref: pendingRef }),
    })
      .then((r) => r.json())
      .then(() => {
        localStorage.removeItem("pending_ref");
      })
      .catch(() => {});
  }, [session?.access_token]);

  // 컨셉 목록을 public/concepts.json 에서 불러옴 (앱 시작 시 1회)
  useEffect(() => {
    let cancelled = false;
    fetch("/concepts.json", { cache: "no-cache" })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setConcepts(data);
        setConceptsLoading(false);
      })
      .catch(() => {
        if (!cancelled) setConceptsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 추천 = 최근 많이 만든 컨셉 TOP5 (서버 집계 /api/popular)
  const [popular, setPopular] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/popular")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && Array.isArray(j?.popular)) setPopular(j.popular.map((x) => x.id));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // 결제 후 토스트
  const [payToast, setPayToast] = useState("");

  // 로그인된 사용자의 오늘 사용량을 서버에서 받아옴 (페이지 로드 / 로그인 직후)
  // refreshTick 이 바뀌면 강제로 다시 fetch (결제 완료 후 잔액 갱신용)
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setFreeUsed(0);
      setUnlimited(false);
      setBlocked(false);
      setQuotaLoaded(false);
      return;
    }
    let cancelled = false;
    fetch("/api/quota", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setUnlimited(!!j?.unlimited);
        setBlocked(!!j?.blocked);
        if (typeof j?.used === "number") setFreeUsed(j.used);
        if (typeof j?.limit === "number" && !j?.unlimited) setFreeLimit(j.limit);
        if (typeof j?.credits === "number") setCredits(j.credits);
        if (typeof j?.referralCount === "number") setReferralCount(j.referralCount);
        if (typeof j?.untilNext === "number") setUntilNext(j.untilNext);
        setQuotaLoaded(true);
      })
      .catch(() => {
        // 실패 시 칩을 잘못된 기본값(예: 2/2)으로 드러내지 않음.
        // 토큰이 자리잡으면(자동 갱신/세션 변경) 이 effect 가 다시 돌며 재시도됨.
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token, refreshTick]);

  // ─── PayPal 결제 후 처리 ───
  // PayPal 이 /checkout/success?token=ORDER_ID&PayerID=... 로 돌려보냄.
  // /checkout/cancel  은 사용자가 취소한 경우.
  // 둘 다 SPA 라우팅 없이 URL 만 보고 처리.
  useEffect(() => {
    const path = window.location.pathname;
    if (path !== "/checkout/success" && path !== "/checkout/cancel") return;

    const params = new URLSearchParams(window.location.search);
    const provider = params.get("provider") || "paypal";
    const externalId = params.get("token"); // PayPal 은 'token' 이라는 이름으로 order id 줌

    // URL 깨끗하게 (브라우저 뒤로가기 시 다시 capture 안 되게)
    function cleanUrl() {
      window.history.replaceState({}, "", "/");
    }

    if (path === "/checkout/cancel") {
      cleanUrl();
      setPayToast(t("pay.cancelled"));
      setScreen("store");
      setTimeout(() => setPayToast(""), 3500);
      return;
    }

    // success 인데 로그인 세션이 아직 안 잡혔으면 다음 렌더에서 다시
    const token = session?.access_token;
    if (!token || !externalId) {
      if (!externalId) cleanUrl();
      return;
    }

    cleanUrl();
    setPayToast(t("pay.checking"));
    fetch("/api/checkout/capture", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ provider, externalId }),
    })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j?.error || "capture failed");
        const got = j?.credits || 0;
        setPayToast(
          j?.alreadyPaid
            ? t("pay.already", { n: got })
            : t("pay.success", { n: got })
        );
        setScreen("store");
        setRefreshTick((n) => n + 1); // /api/quota 다시 불러서 잔액 갱신
      })
      .catch((e) => {
        setPayToast(t("pay.fail", { msg: e.message || e }));
        setScreen("store");
      })
      .finally(() => {
        setTimeout(() => setPayToast(""), 4500);
      });
  }, [session?.access_token]);

  async function handleLogout() {
    await supabase.auth.signOut();
    // 메인 화면 상태 초기화
    setScreen("home");
    setPhoto(null);
    setSelected(null);
    setResultImage(null);
  }

  async function handleDeleteAccount() {
    if (!window.confirm(t("profile.deleteConfirm"))) return;
    const token = session?.access_token;
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "삭제 실패");
      // 로컬 사진/상태 정리 후 로그아웃
      try { localStorage.clear(); } catch (_) {}
      await supabase.auth.signOut();
      setScreen("home");
      setPhoto(null);
      setSelected(null);
      setResultImage(null);
      window.alert(t("profile.deleteDone"));
    } catch (e) {
      window.alert((e && e.message) || "계정 삭제에 실패했어요.");
    }
  }

  const visiblePool = useMemo(() => {
    // hidden 컨셉은 어드민(무제한 사용자)에게만 노출 — 일반/테스터는 안 보임
    return unlimited ? concepts : concepts.filter((p) => !p.hidden);
  }, [concepts, unlimited]);

  // 카테고리에 개수 같이 계산 — [{ name, count }]
  // 컨셉은 categories 배열을 가질 수 있음 (다중 카테고리). 호환을 위해 category(단일)도 fallback.
  const categories = useMemo(() => {
    const counts = new Map();
    counts.set(t("step1.all"), counts.get(t("step1.all")) || visiblePool.length);
    for (const p of visiblePool) {
      const cats = p.categories || (p.category ? [p.category] : []);
      for (const cat of cats) {
        counts.set(cat, (counts.get(cat) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [visiblePool]);

  const filtered = useMemo(() => {
    return visiblePool.filter((p) => {
      const cats = p.categories || (p.category ? [p.category] : []);
      const catOk = (activeCat === "전체" || activeCat === t("step1.all")) || cats.includes(activeCat);
      const q = query.trim().toLowerCase();
      const qOk =
        !q ||
        p.title.toLowerCase().includes(q) ||
        cats.some((c) => c.toLowerCase().includes(q)) ||
        p.text.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [visiblePool, query, activeCat]);

  // 무한 스크롤 흉내 — 처음엔 30개, 스크롤 시 + 30개씩
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // 필터/검색 바뀌면 다시 처음부터
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCat, query]);

  // 현재 카테고리가 더 이상 존재하지 않으면 "전체" 로 폴백
  useEffect(() => {
    if (!categories.some((c) => c.name === activeCat)) setActiveCat("전체");
  }, [categories, activeCat]);

  // 스크롤 불필요한 화면에서 페이지 스크롤 차단
  const NO_SCROLL_SCREENS = ["home", "confirm", "store"];
  useEffect(() => {
    const el = document.documentElement;
    if (NO_SCROLL_SCREENS.includes(screen)) {
      el.style.overflow = "hidden";
    } else {
      el.style.overflow = "";
    }
    return () => { el.style.overflow = ""; };
  }, [screen]);

  function resetFilters() {
    setQuery("");
    setActiveCat("전체");
  }

  const freeLeft = unlimited ? Infinity : Math.max(0, freeLimit - freeUsed);
  const canGenerateFree = !blocked && freeLeft > 0;
  const canGenerate = !blocked && (unlimited || canGenerateFree || credits > 0);
  // 무료 사용자(관리자·유료크레딧 보유자 제외)에게만 광고 노출
  const showAds = quotaLoaded && !unlimited && credits === 0;

  // 어느 사진 슬롯에 저장할지를 ref 로 결정 (handleFile 이 한 input 을 공유하기 때문)
  const photoTargetRef = useRef("profile"); // "profile" | "art"

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (photoTargetRef.current === "art") setArtPhoto(reader.result);
      else setPhoto(reader.result);
    };
    reader.readAsDataURL(f);
  }

  function pickPrompt(p) {
    setSelected(p);
    // 아트 변환 컨셉이면 이전 일회용 사진 비우고 들어감 (매번 새로 받음)
    if (isArtConcept(p)) setArtPhoto(null);
    setScreen("home"); // 컨셉 선택 후 사진 업로드 화면으로
  }

  async function startGenerate() {
    if (!canGenerate) {
      if (PAYMENTS_ENABLED) {
        setScreen("store");
      } else {
        setPayToast("오늘 무료 횟수를 다 썼어요. 친구를 초대하면 크레딧을 받을 수 있어요 🙂");
        setTimeout(() => setPayToast(""), 3500);
      }
      return;
    }

    // ── 인생네컷: N컷 = N장 차감. 잔여 확인 후 N장 병렬 생성 → 코드로 합성 ──
    if (isFourcut(selected)) {
      const available = unlimited ? Infinity : freeLeft + credits;
      if (available < fourcutCount) {
        setPayToast(
          `${fourcutCount}컷은 ${fourcutCount}장이 필요해요. 남은 건 ${available === Infinity ? "∞" : available}장이에요 🙂`
        );
        setTimeout(() => setPayToast(""), 4000);
        return;
      }
      setGenError(null);
      setResultImage(null);
      setGenerating(true);
      setScreen("result");
      setFourcutProgress(`0/${fourcutCount}`);
      try {
        const accessToken = session?.access_token;
        let done = 0;
        const tasks = Array.from({ length: fourcutCount }, (_, i) =>
          generateImage(accessToken, photo, "인생네컷", {
            id: selected.id,
            title: selected.title,
            fourcutStyle: fourcutStyleKey,
            cutIndex: i,
          }).then((r) => {
            done += 1;
            setFourcutProgress(`${done}/${fourcutCount}`);
            return r;
          })
        );
        const results = await Promise.all(tasks);
        const strip = await composeStrip(
          results.map((r) => r.imageDataUrl),
          fourcutStyleKey,
          fourcutCount,
          todayStr()
        );
        setResultImage(strip);
        const last = results[results.length - 1];
        if (typeof last?.unlimited === "boolean") setUnlimited(last.unlimited);
        if (typeof last?.quotaUsed === "number") setFreeUsed(last.quotaUsed);
        setRefreshTick((n) => n + 1); // 크레딧/잔여 정확히 재조회
        if (showAds) showInterstitial();
      } catch (err) {
        if (typeof err.quotaUsed === "number") setFreeUsed(err.quotaUsed);
        setGenError(err.message || "인생네컷 생성에 실패했어요.");
      } finally {
        setGenerating(false);
        setFourcutProgress("");
      }
      return;
    }

    // 인증 + 횟수 체크는 서버(/api/generate)가 처리
    setGenError(null);
    setResultImage(null);
    setGenerating(true);
    setScreen("result");

    try {
      const accessToken = session?.access_token;
      const art = isArtConcept(selected);
      const photoToUse = art ? artPhoto : photo;
      // 증명사진이면 선택한 정장색/배경색으로 프롬프트를 동적 생성
      let promptText = selected.text;
      const idMeta = {};
      if (isIdPhoto(selected)) {
        const bg =
          ID_BGS.find((b) => b.hex.toLowerCase() === idBg.toLowerCase()) ||
          { hex: idBg, name: "custom solid" };
        // 서버가 idSuit/idBg 로 조립하지만, 구버전 호환용 프롬프트도 함께 보냄
        promptText = buildIdPhotoPrompt(idSuit, bg.hex, bg.name);
        idMeta.idSuit = idSuit;
        idMeta.idBg = bg.hex;
        idMeta.idBgName = bg.name;
      }
      const result = await generateImage(accessToken, photoToUse, promptText, {
        id: selected.id,
        title: selected.title,
        // 아트 변환은 풍경/물건 등 얼굴 없는 사진도 가능해야 하므로 face precheck 우회
        skipFacePrecheck: art,
        ...idMeta,
      });
      setResultImage(result.imageDataUrl);
      // 서버가 알려준 진짜 사용량으로 업데이트
      if (typeof result.unlimited === "boolean") setUnlimited(result.unlimited);
      if (typeof result.quotaUsed === "number") setFreeUsed(result.quotaUsed);
      // 무료 사용자 → 생성 후 전면광고 (네이티브에서만, 웹은 no-op)
      if (showAds) showInterstitial();
    } catch (err) {
      // 서버가 한도 정보를 같이 줬으면 화면 카운터도 반영
      if (typeof err.quotaUsed === "number") setFreeUsed(err.quotaUsed);
      setGenError(err.message || "이미지 생성에 실패했어요.");
    } finally {
      setGenerating(false);
    }
  }

  function resetToHome() {
    setScreen("gallery"); // 첫 화면 = 컨셉 선택
    setSelected(null);
    setResultImage(null);
    setGenError(null);
  }

  // 친구 초대 — 네이티브 시트 우선, 그 다음 웹 공유, 마지막 클립보드
  async function shareInvite() {
    const uid = session?.user?.id;
    if (!uid) return;
    const link = window.location.origin + "/?ref=" + uid;
    const shareData = {
      title: t("invite.shareTitle"),
      text: t("invite.shareText"),
      url: link,
    };
    try {
      // 1) iOS / Android 네이티브 시트
      if (await nativeShare(shareData)) return;
      // 2) 웹 공유 API
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      // 3) 클립보드 fallback
      await navigator.clipboard.writeText(link);
      setInviteMsg(t("invite.copied"));
      setTimeout(() => setInviteMsg(""), 4000);
    } catch (_) {
      /* 사용자가 공유 취소 — 무시 */
    }
  }

  // 사진 선택 — 네이티브에서는 진짜 카메라/앨범 시트, 웹에서는 file input
  async function pickPhoto() {
    if (isNative()) {
      const dataUrl = await nativePickPhoto("prompt");
      if (dataUrl) setPhoto(dataUrl);
      return;
    }
    fileRef.current?.click();
  }

  // 스플래시는 부팅 타이머 + 세션 확인이 끝날 때까지 유지 (빈 화면 깜빡임 방지)
  if (booting || !authChecked) return <Splash />;

  // 로그인 안 됐어도, 세션이 자리잡는 중이면 로그인 화면 대신 스플래시 유지
  // (로그인 직후/리다이렉트 복귀 때 로그인 화면이 잠깐 번쩍이는 것 방지)
  if (!session && authSettling) return <Splash />;

  // 로그인 안 됐으면 로그인 화면
  if (!session) {
    return (
      <>
        <style>{CSS}</style>
        <LoginGate Logo={Logo} />
      </>
    );
  }

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* 사진 업로드 input — 어느 화면에서든 fileRef.current?.click() 으로 호출 가능 */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: "none" }}
      />

      <header style={S.header}>
        <button
          style={S.logoBtn}
          onClick={() => setScreen("gallery")}
          aria-label="홈"
        >
          <Logo height={35} />
        </button>
        <div style={S.headerRight}>
          <button
            style={{ ...S.creditChip, visibility: quotaLoaded ? "visible" : "hidden" }}
            onClick={shareInvite}
          >
            <span style={S.creditDot} />
            {unlimited
              ? t("header.unlimited")
              : blocked
              ? t("header.blocked")
              : t("header.beta", { used: freeLeft, limit: freeLimit }) + (credits > 0 ? t("header.credits", { credits }) : "")}
          </button>
          <button
            style={S.profileBtn}
            onClick={() => setScreen("profile")}
            aria-label="프로필"
            title="프로필"
          >
            {photo ? (
              <img src={photo} alt="프로필" style={S.profileBtnImg} />
            ) : (
              <span style={S.profileBtnPlaceholder}>👤</span>
            )}
          </button>
        </div>
      </header>

      {payToast && (
        <div style={S.payToast} onClick={() => setPayToast("")}>
          {payToast}
        </div>
      )}

      <main style={S.main}>
        {screen === "home" && (() => {
          const art = isArtConcept(selected);
          const currentPhoto = art ? artPhoto : photo;
          const onPickAny = () => {
            photoTargetRef.current = art ? "art" : "profile";
            pickPhoto();
          };
          const onClearAny = () => {
            if (art) setArtPhoto(null);
            else setPhoto(null);
          };
          return (
            <HomeScreen
              isArt={art}
              photo={currentPhoto}
              fileRef={fileRef}
              onFile={handleFile}
              onPick={onPickAny}
              onClear={onClearAny}
              ageConfirmed={ageConfirmed}
              setAgeConfirmed={setAgeConfirmed}
              onContinue={() => setScreen("confirm")}
              onBack={() => setScreen("gallery")}
              showAds={showAds}
            />
          );
        })()}
        {screen === "gallery" && (
          <GalleryScreen
            categories={categories}
            activeCat={activeCat}
            setActiveCat={setActiveCat}
            query={query}
            setQuery={setQuery}
            onResetFilters={resetFilters}
            prompts={filtered.slice(0, visibleCount)}
            totalFiltered={filtered.length}
            visibleCount={visibleCount}
            onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
            total={concepts.length}
            poolTotal={visiblePool.length}
            fullPool={visiblePool}
            onPick={pickPrompt}
            onBack={null}
            credits={credits}
            referralCount={referralCount}
            untilNext={untilNext}
            onInvite={shareInvite}
            inviteMsg={inviteMsg}
            unlimited={unlimited}
            popular={popular}
          />
        )}
        {screen === "confirm" && selected && (
          <ConfirmScreen
            photo={isArtConcept(selected) ? artPhoto : photo}
            prompt={selected}
            freeLeft={freeLeft}
            credits={credits}
            canGenerate={canGenerate}
            idPhoto={isIdPhoto(selected)}
            idSuit={idSuit} setIdSuit={setIdSuit}
            idBg={idBg} setIdBg={setIdBg}
            fourcut={isFourcut(selected)}
            fourcutCount={fourcutCount} setFourcutCount={setFourcutCount}
            fourcutStyleKey={fourcutStyleKey} setFourcutStyleKey={setFourcutStyleKey}
            onBack={() => setScreen("home")}
            onGenerate={startGenerate}
            onStore={PAYMENTS_ENABLED ? () => setScreen("store") : () => { setPayToast("오늘 무료 횟수를 다 썼어요. 친구 초대로 크레딧을 받아보세요 🙂"); setTimeout(() => setPayToast(""), 3500); }}
          />
        )}
        {screen === "result" && selected && (
          <ResultScreen
            generating={generating}
            fourcutProgress={fourcutProgress}
            prompt={selected}
            resultImage={resultImage}
            genError={genError}
            onRetry={startGenerate}
            onAgain={() => setScreen("gallery")}
            onHome={resetToHome}
            showAds={showAds}
          />
        )}
        {screen === "profile" && (
          <ProfileScreen
            session={session}
            photo={photo}
            onPickPhoto={pickPhoto}
            onClearPhoto={() => setPhoto(null)}
            unlimited={unlimited}
            blocked={blocked}
            freeUsed={freeUsed}
            freeLeft={freeLeft}
            credits={credits}
            referralCount={referralCount}
            untilNext={untilNext}
            onInvite={shareInvite}
            inviteMsg={inviteMsg}
            onBack={() => setScreen("gallery")}
            onOpenGallery={() => setScreen("mygallery")}
            onOpenStore={PAYMENTS_ENABLED ? () => setScreen("store") : null}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
          />
        )}
        {screen === "mygallery" && (
          <MyGalleryScreen
            accessToken={session?.access_token}
            onBack={() => setScreen("profile")}
          />
        )}
        {screen === "store" && PAYMENTS_ENABLED && (
          <StoreScreen
            packs={CREDIT_PACKS}
            credits={credits}
            session={session}
            freeLimit={freeLimit}
            onCredited={() => setRefreshTick((n) => n + 1)}
            onBack={() => setScreen(selected ? "confirm" : "gallery")}
          />
        )}
      </main>

      <footer style={S.footer}>
        <div style={S.footerLinks}>
          {/* 절대 URL + 새 창: 웹은 새 탭, 네이티브 앱은 시스템 브라우저로 열림.
              (네이티브는 번들 모드라 상대경로 /privacy 가 rewrite 없이 404 나므로 절대 URL 필요) */}
          <a href={`${LEGAL_BASE}/terms`} target="_blank" rel="noopener noreferrer" style={S.footerLink}>{t("footer.terms")}</a>
          <span style={S.footerDot}>·</span>
          <a href={`${LEGAL_BASE}/privacy`} target="_blank" rel="noopener noreferrer" style={S.footerLink}>{t("footer.privacy")}</a>
          <span style={S.footerDot}>·</span>
          <a href={`${LEGAL_BASE}/refund`} target="_blank" rel="noopener noreferrer" style={S.footerLink}>{t("footer.refund")}</a>
        </div>
        {IS_KOREA && (
          <div style={S.footerBiz}>
            {t("footer.biz.company")}<br />
            {t("footer.biz.reg")} · {t("footer.biz.sales")}<br />
            {t("footer.biz.addr")}<br />
            {t("footer.biz.contact")}
          </div>
        )}
      </footer>

      <BottomNav screen={screen} go={setScreen} />
    </div>
  );
}

/* ============================================================
   스플래시
   ============================================================ */
function Splash() {
  return (
    <div style={S.splash}>
      <style>{CSS}</style>
      <div className="splashLogo">
        <Logo height={74} />
      </div>
      <div style={S.splashDots}>
        {HEARTS.map((c, i) => (
          <span
            key={i}
            className="splashDot"
            style={{ background: c, animationDelay: i * 0.15 + "s" }}
          />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   홈
   ============================================================ */
function HomeScreen({
  photo, fileRef, onFile, onPick, onClear,
  ageConfirmed, setAgeConfirmed, onContinue, onBack,
  isArt = false, showAds = false,
}) {
  const ready = photo && ageConfirmed;
  return (
    <div className="fade">
      <div style={S.navRow}>
        {onBack && (
          <button style={S.backBtn} onClick={onBack}>←</button>
        )}
        <div>
          <div style={S.screenKicker}>STEP 02</div>
          <div style={S.screenTitle}>
            {isArt ? t("art.step.title") : t("step2.title")}
          </div>
        </div>
      </div>

      <div style={S.hero}>
        {isArt ? (
          <>
            <h1 style={S.heroTitle}>{t("art.hero.title")}</h1>
            <p style={S.heroDesc}>
              {t("art.hero.desc1")}<br />
              {t("art.hero.desc2")}<br />
              {t("art.hero.desc3")}<br />
              {t("art.hero.desc4")}
            </p>
          </>
        ) : (
          <>
            <h1 style={S.heroTitle}>{t("step2.heroTitle")}</h1>
            <p style={S.heroDesc}>
              {t("step2.heroDesc1")}<br />
              {t("step2.heroDesc2")}<br />
              {t("step2.heroDesc3")}<br />
              {t("step2.heroDesc4")}
            </p>
          </>
        )}
      </div>

      {!photo ? (
        <button style={S.uploadBox} onClick={onPick}>
          <div style={S.uploadIcon}>＋</div>
          <div style={S.uploadText}>{t("step2.uploadCta")}</div>
          <div style={S.uploadHint}>{t("step2.uploadHint")}</div>
        </button>
      ) : (
        <>
          <div style={S.previewWrap}>
            <img src={photo} alt="업로드한 사진" style={S.previewImg} />
          </div>
          <button style={S.changePhotoBtn} onClick={onPick}>
            {t("step2.changePhoto")}
          </button>
        </>
      )}

      <label style={S.consentRow}>
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          style={S.checkbox}
        />
        <span style={S.consentText}>
          {isArt ? t("art.consent") : t("step2.consent")}
        </span>
      </label>

      <button
        style={{ ...S.primaryBtn, opacity: ready ? 1 : 0.35 }}
        disabled={!ready}
        onClick={onContinue}
      >
        {t("step2.continue")}
      </button>

      <p style={S.privacyNote}>{t("step2.privacyNote")}</p>

      {showAds && <AdSlot />}
    </div>
  );
}

/* ============================================================
   격자 아이콘
   ============================================================ */
function GridIcon({ cells }) {
  const two = cells === 2;
  const rects = two
    ? [[3, 3, 7, 12], [12, 3, 7, 12]]
    : [[3, 3, 7, 7], [12, 3, 7, 7], [3, 12, 7, 7], [12, 12, 7, 7]];
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
      {rects.map(([x, y, w, h], i) => (
        <rect key={i} x={x} y={y} width={w} height={h} rx={1.6} fill="currentColor" />
      ))}
    </svg>
  );
}

/* ============================================================
   갤러리
   ============================================================ */
function GalleryScreen({
  categories, activeCat, setActiveCat, query, setQuery,
  onResetFilters,
  prompts, total, totalFiltered, visibleCount, onShowMore,
  poolTotal, onPick, onBack,
  credits = 0, referralCount = 0, untilNext = 2,
  onInvite, inviteMsg = "", unlimited = false,
  fullPool = [], popular = [],
}) {
  const [cols, setCols] = useState(2);
  const hasFilter =
    query.trim() !== "" || activeCat !== "전체";

  // G 레이아웃: 추천 + 카테고리별 카로셀
  // 필터 없을 때(=첫 진입) 보여줌. 필터 켜지면 기존 그리드로 폴백.
  // 추천: 가장 큰 ID 8개 (최신 우선)
  // 카테고리 순서: 각 카테고리에서 가장 큰 ID 기준으로 카테고리 정렬 (= 최근에 새 컨셉이 추가된 카테고리 먼저)
  const showHomeLayout = !hasFilter;
  const homeData = useMemo(() => {
    if (!showHomeLayout) return null;
    const pool = fullPool;
    // 1) 추천: 최근 많이 만든 컨셉 5개 (데이터 부족하면 최신 ID로 채움)
    const byId = new Map(pool.map((p) => [p.id, p]));
    let featured = popular.map((id) => byId.get(id)).filter(Boolean).slice(0, 5);
    if (featured.length < 5) {
      const have = new Set(featured.map((p) => p.id));
      const fill = [...pool].sort((a, b) => b.id - a.id).filter((p) => !have.has(p.id));
      featured = [...featured, ...fill].slice(0, 5);
    }
    // 2) 카테고리별 컨셉 모음
    const byCat = new Map(); // catName -> { items, latestId }
    for (const p of pool) {
      const cats = p.categories || (p.category ? [p.category] : []);
      for (const cat of cats) {
        if (!byCat.has(cat)) byCat.set(cat, { items: [], latestId: 0 });
        const g = byCat.get(cat);
        g.items.push(p);
        if (p.id > g.latestId) g.latestId = p.id;
      }
    }
    // 카테고리 정렬: 최근 업데이트(=최대 ID) 큰 순
    const rows = Array.from(byCat.entries())
      .map(([name, g]) => ({
        name,
        latestId: g.latestId,
        count: g.items.length,
        items: g.items.sort((a, b) => b.id - a.id).slice(0, 10), // 각 줄에 최신 10개
      }))
      .sort((a, b) => b.latestId - a.latestId);
    return { featured, rows };
  }, [showHomeLayout, fullPool, popular]);
  return (
    <div className="fade">
      <button style={S.inviteBanner} onClick={onInvite}>
        <div style={S.inviteBannerLeft}>
          <div style={S.inviteBannerTitle}>
            {unlimited ? t("invite.adminTitle") : t("invite.testerTitle")}
          </div>
          <div style={S.inviteBannerDesc}>
            {unlimited
              ? t("invite.adminDesc")
              : (credits > 0
                  ? t("invite.testerDescWithCredits", { credits, n: untilNext, now: referralCount })
                  : t("invite.testerDesc", { n: untilNext, now: referralCount }))}
          </div>
        </div>
        <div style={S.inviteBannerBtn}>{t("invite.btn")}</div>
      </button>
      {inviteMsg && <div style={S.inviteToast}>{inviteMsg}</div>}

      <div style={S.navRow}>
        {onBack && (
          <button style={S.backBtn} onClick={onBack}>←</button>
        )}
        <div>
          <div style={S.screenKicker}>{t("step1.kicker")}</div>
          <div style={S.screenTitle}>{t("step1.title")}</div>
        </div>
      </div>

      <div style={S.stickyBar}>
        <div style={S.catRowSticky}>
          {categories.map((c, i) => (
            <button
              key={c.name}
              style={{
                ...S.catChip,
                ...(activeCat === c.name
                  ? { ...S.catChipActive, background: HEARTS[i % HEARTS.length] }
                  : {}),
              }}
              onClick={() => setActiveCat(c.name)}
            >
              {localizedCategory(c.name)} <span style={S.catChipCount}>{c.count}</span>
            </button>
          ))}
          <button
            style={{ ...S.catChip, flexShrink: 0, marginLeft: 4 }}
            onClick={() => setCols((c) => (c === 2 ? 4 : 2))}
            aria-label={cols === 2 ? "4열로 보기" : "2열로 보기"}
            title={cols === 2 ? "4열로 보기" : "2열로 보기"}
          >
            <GridIcon cells={cols === 2 ? 4 : 2} />
          </button>
        </div>
      </div>

      <div style={S.filterMetaRow}>
        <span style={S.resultCount}>
          {hasFilter
            ? t("step1.resultCount", { n: totalFiltered })
            : t("step1.totalCount", { n: poolTotal })}
        </span>
      </div>

      {showHomeLayout && homeData ? (
        <HomeLayout
          data={homeData}
          onPick={onPick}
          onMore={(catName) => setActiveCat(catName)}
        />
      ) : prompts.length === 0 ? (
        <div style={S.emptyState}>
          <div>{t("step1.empty")}</div>
          {hasFilter && (
            <button
              style={{ ...S.moreBtn, marginTop: 14 }}
              onClick={onResetFilters}
            >
              {t("step1.resetFilters")}
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            ...S.grid,
            gridTemplateColumns: "repeat(" + cols + ", 1fr)",
            gap: cols === 2 ? 13 : 8,
          }}
        >
          {prompts.map((p, i) => (
            <button key={p.id} style={S.card} onClick={() => onPick(p)}>
              <div style={S.thumb}>
                <img
                  src={`/thumbs/${p.id}.webp`}
                  alt={localizedTitle(p)}
                  style={S.thumbImg}
                  loading="lazy"
                  onError={(e) => {
                    // 썸네일 파일이 없으면 그라데이션 fallback 으로 대체
                    e.currentTarget.style.display = "none";
                    const fb = e.currentTarget.nextElementSibling;
                    if (fb) fb.style.display = "flex";
                  }}
                />
                <div
                  style={{
                    ...S.thumbFallback,
                    display: "none",
                    background:
                      "linear-gradient(150deg, " +
                      HEARTS[i % HEARTS.length] + "22, " +
                      HEARTS[(i + 1) % HEARTS.length] + "33)",
                  }}
                >
                  <div style={S.thumbGlyph}>♡</div>
                </div>
                {p.hidden && (
                  <div
                    style={{
                      ...S.hiddenTag,
                      fontSize: cols === 2 ? 9 : 7.5,
                      padding: cols === 2 ? "3px 7px" : "2px 5px",
                      top: 8,
                    }}
                  >
                    {t("step1.hiddenBadge")}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {!showHomeLayout && totalFiltered > visibleCount && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button style={S.moreBtn} onClick={onShowMore}>
            {t("step1.more", { n: totalFiltered - visibleCount })}
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   홈 레이아웃 (필터 없을 때 첫 화면)
   - 추천 영역 (가장 큰 ID 8개, 큰 카드 가로 스크롤)
   - 카테고리별 1줄씩 (최근 업데이트 카테고리 먼저)
   ============================================================ */
function HomeLayout({ data, onPick, onMore }) {
  return (
    <div>
      {/* 추천 */}
      {data.featured.length > 0 && (
        <div style={S.homeSection}>
          <div style={S.homeRowHead}>
            <div style={S.homeRowTitle}>{t("step1.featured")}</div>
          </div>
          <div style={S.homeRailFeatured}>
            {data.featured.map((p) => (
              <button
                key={p.id}
                style={S.featuredCard}
                onClick={() => onPick(p)}
                aria-label={p.title}
              >
                <img
                  src={`/thumbs/${p.id}.webp`}
                  alt={localizedTitle(p)}
                  style={S.featuredImg}
                  loading="lazy"
                />
                <div style={S.featuredOverlay}>
                  <div style={S.featuredTitle}>{localizedTitle(p)}</div>
                </div>
                {p.hidden && <div style={{ ...S.hiddenTag, top: 8 }}>{t("step1.hiddenBadge")}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 카테고리별 줄 */}
      {data.rows.map((row) => (
        <div key={row.name} style={S.homeSection}>
          <div style={S.homeRowHead}>
            <div style={S.homeRowTitle}>
              {localizedCategory(row.name)}
              <span style={S.homeRowCount}>{row.count}</span>
            </div>
            <button style={S.homeRowMore} onClick={() => onMore(row.name)}>
              {t("step1.rowMore")}
            </button>
          </div>
          <div style={S.homeRail}>
            {row.items.map((p) => (
              <button
                key={p.id}
                style={S.railCard}
                onClick={() => onPick(p)}
                aria-label={p.title}
              >
                <img
                  src={`/thumbs/${p.id}.webp`}
                  alt={localizedTitle(p)}
                  style={S.railImg}
                  loading="lazy"
                />
                {p.hidden && (
                  <div style={{ ...S.hiddenTag, fontSize: 8.5, padding: "2px 5px", top: 8 }}>
                    {t("step1.hiddenBadge")}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   프로필
   ============================================================ */
function ProfileScreen({
  session, photo, onPickPhoto, onClearPhoto,
  unlimited, blocked, freeUsed, freeLeft, credits,
  referralCount, untilNext,
  onInvite, inviteMsg = "",
  onBack, onLogout, onDeleteAccount, onOpenGallery, onOpenStore,
}) {
  const u = session?.user || {};
  const meta = u.user_metadata || {};
  const provider = u.app_metadata?.provider || meta.provider || "email";
  const displayName =
    meta.full_name || meta.name || meta.user_name || u.email?.split("@")[0] || "사용자";
  const email = u.email || "(이메일 없음)";

  const providerLabel = {
    google: t("profile.provider.google"),
    kakao: t("profile.provider.kakao"),
    naver: t("profile.provider.naver"),
    apple: t("profile.provider.apple"),
    email: t("profile.provider.email"),
  }[provider] || provider;

  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>{t("profile.kicker")}</div>
          <div style={S.screenTitle}>{t("profile.title")}</div>
        </div>
      </div>

      {/* 프로필 카드 */}
      <div style={S.profileCard}>
        <div style={S.profileAvatar}>
          {photo ? (
            <img src={photo} alt={t("profile.kicker")} style={S.profileAvatarImg} />
          ) : (
            <div style={S.profileAvatarEmpty}>📷</div>
          )}
        </div>
        <div style={S.profileName}>{displayName}</div>
        <div style={S.profileMeta}>{providerLabel} · {email}</div>

        <div style={S.profilePhotoActions}>
          <button style={S.secondaryBtn} onClick={onPickPhoto}>
            {photo ? t("profile.photo.change") : t("profile.photo.register")}
          </button>
          {photo && (
            <button
              style={{ ...S.secondaryBtn, color: ACCENT, borderColor: ACCENT + "44" }}
              onClick={onClearPhoto}
            >
              {t("common.delete")}
            </button>
          )}
        </div>
        <div style={S.profileHint}>
          {t("profile.photo.hint1")}
          <br />
          {t("profile.photo.hint2")}
        </div>
      </div>

      {/* 사용량 / 크레딧 */}
      <div style={S.statRow}>
        <div style={S.statCard}>
          <div style={S.statLabel}>{t("profile.stat.todayUsed")}</div>
          <div style={S.statValue}>
            {unlimited ? "∞" : `${freeUsed} / ${freeUsed + freeLeft}`}
          </div>
          <div style={S.statSub}>
            {unlimited ? t("profile.stat.unlimited") : blocked ? t("profile.stat.beta") : t("profile.stat.todayLeft", { n: freeLeft })}
          </div>
        </div>
        <div style={S.statCard}>
          <div style={S.statLabel}>{t("profile.stat.credits")}</div>
          <div style={S.statValue}>{credits}</div>
          <div style={S.statSub}>{t("profile.stat.creditsSub")}</div>
        </div>
      </div>

      {/* 크레딧 충전 (항상 노출) */}
      {onOpenStore && (
        <button style={S.galleryEntry} onClick={onOpenStore}>
          <div style={S.galleryEntryLeft}>
            <div style={S.galleryEntryTitle}>{t("profile.store.title")}</div>
            <div style={S.galleryEntryDesc}>
              {t("profile.store.desc")}
            </div>
          </div>
          <div style={S.galleryEntryArrow}>→</div>
        </button>
      )}

      {/* 언어 선택 */}
      <LangSelector />

      {/* 내 갤러리 */}
      <button style={S.galleryEntry} onClick={onOpenGallery}>
        <div style={S.galleryEntryLeft}>
          <div style={S.galleryEntryTitle}>{t("profile.gallery.title")}</div>
          <div style={S.galleryEntryDesc}>
            {t("profile.gallery.desc")}
          </div>
        </div>
        <div style={S.galleryEntryArrow}>→</div>
      </button>

      {/* 친구 초대 */}
      <button style={S.inviteBanner} onClick={onInvite}>
        <div style={S.inviteBannerLeft}>
          <div style={S.inviteBannerTitle}>
            {unlimited ? t("invite.adminTitle") : t("invite.testerTitle")}
          </div>
          <div style={S.inviteBannerDesc}>
            {unlimited
              ? t("invite.adminDesc")
              : t("invite.testerDesc", { n: untilNext, now: referralCount })}
          </div>
        </div>
        <div style={S.inviteBannerBtn}>{t("common.share")}</div>
      </button>
      {inviteMsg && <div style={S.inviteToast}>{inviteMsg}</div>}

      {/* 로그아웃 */}
      <button
        style={{ ...S.secondaryBtn, marginTop: 18, color: ACCENT + "cc" }}
        onClick={onLogout}
      >
        {t("profile.logout")}
      </button>

      {/* 계정 삭제 (App Store 요구: 인앱 즉시 삭제) */}
      <button
        style={{
          ...S.secondaryBtn, marginTop: 10,
          color: "#9aa0a6", borderColor: "#e3e3e3",
          fontSize: 13,
        }}
        onClick={onDeleteAccount}
      >
        {t("profile.deleteAccount")}
      </button>
    </div>
  );
}

/* ============================================================
   언어 선택 (프로필 안에 표시)
   ============================================================ */
function LangSelector() {
  const lang = useLang();
  const pref = getLangPreference();
  const options = [
    { value: "auto", label: t("profile.lang.auto") },
    { value: "ko", label: t("profile.lang.ko") },
    { value: "en", label: t("profile.lang.en") },
  ];
  return (
    <div style={S.langBox}>
      <div style={S.langTitle}>{t("profile.lang.title")}</div>
      <div style={S.langOptions}>
        {options.map((o) => {
          const active = pref === o.value;
          return (
            <button
              key={o.value}
              style={{
                ...S.langOpt,
                ...(active ? S.langOptActive : {}),
              }}
              onClick={() => setLang(o.value)}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   내 갤러리 (1시간 보관)
   ============================================================ */
function MyGalleryScreen({ accessToken, onBack }) {
  const [items, setItems] = useState(null); // null=로딩, []=빈, [...]=있음
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0); // 1초마다 남은시간 갱신

  // 1초마다 리렌더 (남은 시간 카운트다운)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // 갤러리 로드
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetch("/api/gallery", {
      headers: { Authorization: "Bearer " + accessToken },
    })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.items) setItems(j.items);
        else setError(j.error || "불러오기 실패");
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "네트워크 오류");
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  async function handleDelete(id) {
    if (!confirm(t("gallery.deleteConfirm"))) return;
    await fetch("/api/gallery?id=" + id, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + accessToken },
    });
    setItems((prev) => (prev || []).filter((it) => it.id !== id));
  }

  function remainingLabel(expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return t("gallery.timer.expiring");
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min >= 1) return t("gallery.timer.minSec", { min, sec: String(sec).padStart(2, "0") });
    return t("gallery.timer.sec", { sec });
  }

  // tick 사용 (eslint 경고 회피 + 의존성)
  void tick;

  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>{t("profile.kicker")}</div>
          <div style={S.screenTitle}>{t("gallery.title")}</div>
        </div>
      </div>

      <div style={S.galleryNotice}>
        {t("gallery.notice1")}<br />
        {t("gallery.notice2")}
      </div>

      {items === null && !error && (
        <div style={S.emptyState}>{t("common.loading")}</div>
      )}

      {error && (
        <div style={S.errorCard}>{error}</div>
      )}

      {items && items.length === 0 && (
        <div style={S.emptyState}>
          <div>{t("gallery.empty")}</div>
          <button
            style={{ ...S.moreBtn, marginTop: 14 }}
            onClick={onBack}
          >
            {t("gallery.emptyCta")}
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div style={S.myGalleryGrid}>
          {items.map((it) => {
            const expMs = new Date(it.expiresAt).getTime() - Date.now();
            const isExpiring = expMs < 10 * 60 * 1000; // 10분 이하면 임박
            return (
              <div key={it.id} style={S.myGalleryCard}>
                <div style={S.myGalleryImgWrap}>
                  {it.url ? (
                    <img src={it.url} alt={it.conceptTitle || ""} style={S.myGalleryImg} />
                  ) : (
                    <div style={S.thumbFallback}>♡</div>
                  )}
                  <div
                    style={{
                      ...S.myGalleryTimer,
                      ...(isExpiring ? S.myGalleryTimerWarn : {}),
                    }}
                  >
                    {remainingLabel(it.expiresAt)}
                  </div>
                </div>
                <div style={S.myGalleryFooter}>
                  <div style={S.myGalleryTitle}>
                    {it.conceptTitle || `컨셉 ${it.conceptId}`}
                  </div>
                  <div style={S.myGalleryActions}>
                    <a
                      href={it.url}
                      download={`rimikimi_${it.conceptId}.png`}
                      style={S.myGalleryDownload}
                    >
                      {t("gallery.action.save")}
                    </a>
                    <button
                      style={S.myGalleryDelete}
                      onClick={() => handleDelete(it.id)}
                    >
                      {t("gallery.action.delete")}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   확인
   ============================================================ */
function ConfirmScreen({
  photo, prompt, freeLeft, credits, canGenerate,
  idPhoto, idSuit, setIdSuit, idBg, setIdBg,
  fourcut, fourcutCount, setFourcutCount, fourcutStyleKey, setFourcutStyleKey,
  onBack, onGenerate, onStore,
}) {
  const useFree = freeLeft > 0;
  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>{t("step3.kicker")}</div>
          <div style={S.screenTitle}>{t("step3.title")}</div>
        </div>
      </div>

      <div style={S.confirmPreview}>
        <img src={photo} alt={t("profile.kicker")} style={S.confirmPhoto} />
        <div style={S.confirmArrow}>♥</div>
        {(prompt.id) ? (
          <img
            src={`/thumbs/${prompt.id}.webp`}
            alt={localizedTitle(prompt)}
            style={S.confirmPhoto}
          />
        ) : (
          <div style={S.confirmStyle}>
            <div style={S.thumbGlyph}>♡</div>
            <div style={S.confirmStyleId}>#{prompt.id}</div>
          </div>
        )}
      </div>

      <div style={S.confirmCard}>
        <div style={S.confirmTitle}>{localizedTitle(prompt)}</div>
        <div style={S.confirmCat}>{localizedCategory(prompt.category)}</div>
        <div style={S.promptPeek}>
          선택한 컨셉으로 내 얼굴 특징을 살린 이미지를 만들어 드려요.
        </div>
      </div>

      {fourcut && (
        <div style={S.idOptCard}>
          <div style={S.idOptLabel}>컷 수 (선택한 컷 수만큼 차감돼요)</div>
          <div style={S.idSuitRow}>
            {FOURCUT_COUNTS.map((n) => (
              <button
                key={n}
                onClick={() => setFourcutCount(n)}
                style={{
                  ...S.idSuitChip,
                  ...(fourcutCount === n ? S.idSuitChipOn : null),
                }}
              >
                {n}컷
              </button>
            ))}
          </div>

          <div style={{ ...S.idOptLabel, marginTop: 14 }}>스타일</div>
          <div style={S.idSuitRow}>
            {FOURCUT_STYLES.map((s) => (
              <button
                key={s.key}
                onClick={() => setFourcutStyleKey(s.key)}
                style={{
                  ...S.idSuitChip,
                  ...(fourcutStyleKey === s.key ? S.idSuitChipOn : null),
                }}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
          <div style={{ ...S.promptPeek, marginTop: 12 }}>
            컷마다 포즈·표정이 다양하게 나오고, 프레임·날짜·rimikimi 로고가 자동으로 합성돼요.
          </div>
        </div>
      )}

      {idPhoto && (
        <div style={S.idOptCard}>
          <div style={S.idOptLabel}>정장 색상</div>
          <div style={S.idSuitRow}>
            {ID_SUITS.map((s) => (
              <button
                key={s.key}
                onClick={() => setIdSuit(s.key)}
                style={{
                  ...S.idSuitChip,
                  ...(idSuit === s.key ? S.idSuitChipOn : null),
                }}
              >
                <span style={{ ...S.idSuitDot, background: s.css }} />
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ ...S.idOptLabel, marginTop: 14 }}>배경 색상</div>
          <div style={S.idBgRow}>
            {ID_BGS.map((b) => (
              <button
                key={b.hex}
                onClick={() => setIdBg(b.hex)}
                title={b.hex}
                style={{
                  ...S.idBgSwatch,
                  background: `linear-gradient(160deg, ${b.hex} 0%, ${b.hex} 45%, rgba(0,0,0,0.14) 140%)`,
                  ...(idBg.toLowerCase() === b.hex.toLowerCase() ? S.idBgSwatchOn : null),
                }}
              >
                {idBg.toLowerCase() === b.hex.toLowerCase() ? (
                  <span style={{ ...S.idBgCheck, color: ["#1b3c5a", "#4d3f64"].includes(b.hex) ? "#fff" : "#333" }}>✓</span>
                ) : null}
              </button>
            ))}
          </div>

          {(() => {
            const isCustom = !ID_BGS.some((b) => b.hex.toLowerCase() === idBg.toLowerCase());
            return (
              <label style={{ ...S.idCustomRow, ...(isCustom ? S.idCustomRowOn : null) }}>
                <span
                  style={{
                    ...S.idCustomSwatch,
                    background: isCustom
                      ? idBg
                      : "conic-gradient(from 0deg, #ff3b3b, #ffec3b, #4bff3b, #3bffe1, #3b6bff, #c43bff, #ff3bb0, #ff3b3b)",
                  }}
                />
                <span style={S.idCustomText}>
                  직접 선택{isCustom ? ` · ${idBg.toUpperCase()}` : ""}
                </span>
                <input
                  type="color"
                  value={isCustom ? idBg : "#cccccc"}
                  onChange={(e) => setIdBg(e.target.value)}
                  style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                />
              </label>
            );
          })()}

          <div style={S.idDisclaimer}>⚠️ {ID_DISCLAIMER}</div>
        </div>
      )}

      <div style={S.costRow}>
        <span style={S.costLabel}>{t("step3.use")}</span>
        <span style={S.costValue}>
          {useFree ? t("step3.useFree", { n: freeLeft }) : t("step3.useCredit")}
        </span>
      </div>

      {canGenerate ? (
        <button style={S.primaryBtn} onClick={onGenerate}>
          {t("step3.generate")}
        </button>
      ) : (
        <button style={S.primaryBtn} onClick={onStore}>
          {PAYMENTS_ENABLED ? t("step3.topupGenerate") : "오늘 무료 횟수 소진 · 친구 초대로 크레딧 받기"}
        </button>
      )}
    </div>
  );
}

/* ============================================================
   결과 — 생성 중 / 실패 / 성공
   ============================================================ */
function ResultScreen({
  generating, fourcutProgress = "", prompt, resultImage, genError, onRetry, onAgain, onHome, showAds = false,
}) {
  return (
    <div className="fade">
      {generating ? (
        <div style={S.genWrap}>
          <div style={S.genHearts}>
            {HEARTS.map((c, i) => (
              <span
                key={i}
                className="genHeart"
                style={{ background: c, animationDelay: i * 0.16 + "s" }}
              />
            ))}
          </div>
          <div style={S.genTitle}>{t("result.generating")}</div>
          <div style={S.genSub}>
            {fourcutProgress
              ? `인생네컷 ${fourcutProgress} 컷 생성 중...`
              : `#${prompt.id} · ${localizedTitle(prompt)}`}
          </div>
          <div style={S.genHint}>{t("result.generatingHint")}</div>
          {showAds && <AdSlot />}
        </div>
      ) : genError ? (
        <div className="fade">
          <div style={S.screenKicker}>{t("result.fail")}</div>
          <div style={S.screenTitle}>{t("result.failHint")}</div>
          <div style={S.errorCard}>{genError}</div>
          <div style={S.resultActions}>
            <button style={S.secondaryBtn} onClick={onHome}>{t("result.home")}</button>
            <button style={S.primaryBtn} onClick={onRetry}>다시 시도</button>
          </div>
        </div>
      ) : resultImage ? (
        <div className="fade">
          <div style={S.screenKicker}>{t("result.done")}</div>
          <div style={S.screenTitle}>{localizedTitle(prompt)}</div>
          <div style={S.resultImage}>
            <img src={resultImage} alt={localizedTitle(prompt)} style={S.resultImg} />
          </div>
          <div style={S.saveNotice}>
            {t("result.saveNotice1")}
            <br />
            {t("result.saveNotice2")}
            <br />
            {t("result.saveNotice3")}
            <br />
            {t("result.saveNotice4")}
          </div>
          <a
            href={resultImage}
            download={"rimikimi_" + prompt.id + ".png"}
            style={S.downloadBtn}
          >
            {t("result.download")}
          </a>
          <div style={S.resultActions}>
            <button style={S.secondaryBtn} onClick={onHome}>{t("result.home")}</button>
            <button style={S.primaryBtn} onClick={onAgain}>{t("result.again")}</button>
          </div>
          {/* 부적절 콘텐츠 신고 (App Store Guideline 1.2) */}
          <a
            href={
              "mailto:enquiry@rimikimi.com?subject=" +
              encodeURIComponent("[신고] 부적절한 생성 결과 #" + (prompt?.id ?? "")) +
              "&body=" +
              encodeURIComponent(
                "신고 사유를 적어주세요.\n\n컨셉: " + (prompt?.title || "") +
                " (#" + (prompt?.id ?? "") + ")\n"
              )
            }
            style={S.reportLink}
          >
            {t("result.report")}
          </a>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================
   상점
   ============================================================ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function StoreScreen({ packs, credits, session, freeLimit = FREE_DAILY, onCredited, onBack }) {
  const cheapest = Math.max(...packs.map((p) => perImage(p)));
  // 한국어 = 원화(₩) 주 표시, 그 외 = 달러($) 주 표시
  const ko = getLang() === "ko";
  const native = isNative();
  const [busyId, setBusyId] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [okMsg, setOkMsg] = useState("");
  // 네이티브: 스토어 실제 상품/가격 (productId → priceString, 결제 객체)
  const [iapById, setIapById] = useState(null); // null=로딩중, {}=상품없음

  useEffect(() => {
    if (!native) return;
    let on = true;
    (async () => {
      const list = await getIapPacks();
      if (!on) return;
      const map = {};
      list.forEach((p) => { map[p.id] = p; });
      setIapById(map);
    })();
    return () => { on = false; };
  }, [native]);

  // 결제 직후 서버 적립 (RevenueCat 반영 지연 대비 재시도)
  async function grantWithRetry(productId, transactionId) {
    const token = session?.access_token;
    for (let i = 0; i < 6; i++) {
      const r = await fetch("/api/iap/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ productId, transactionId }),
      });
      if (r.status === 202) { await sleep(1800); continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "적립 실패");
      return j;
    }
    throw new Error("구매 반영이 조금 늦어지고 있어요. 잠시 후 자동으로 들어와요.");
  }

  // 네이티브 인앱결제
  async function startIap(pack) {
    setErrMsg(""); setOkMsg("");
    if (!session?.access_token) { setErrMsg("로그인이 필요해요."); return; }
    const rc = iapById?.[pack.id];
    if (!rc) { setErrMsg("스토어 상품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."); return; }
    setBusyId(pack.id);
    try {
      const res = await purchaseIap(rc);
      if (res?.cancelled) { setBusyId(null); return; }
      const g = await grantWithRetry(pack.id, res?.transactionId);
      setOkMsg(`크레딧 ${pack.count}개가 충전됐어요! 🎉`);
      onCredited && onCredited();
    } catch (e) {
      setErrMsg(e.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  // 웹 PayPal (현재 라이브 비활성 — 네이티브가 아닐 때만 도달)
  async function startPayPal(pack) {
    setErrMsg("");
    const token = session?.access_token;
    if (!token) {
      setErrMsg("로그인이 필요해요.");
      return;
    }
    setBusyId(pack.id);
    try {
      const r = await fetch("/api/checkout/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          provider: "paypal",
          packageId: pack.id,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.redirectUrl) {
        throw new Error(j?.error || "결제 시작 실패");
      }
      // PayPal 결제창으로 이동 (완료/취소 시 /checkout/success|cancel 로 돌아옴)
      window.location.assign(j.redirectUrl);
    } catch (e) {
      setErrMsg(e.message || String(e));
      setBusyId(null);
    }
  }

  const onBuy = native ? startIap : startPayPal;

  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>{t("store.kicker")}</div>
          <div style={S.screenTitle}>{t("store.title")}</div>
        </div>
      </div>

      <p style={S.storeIntro}>
        {t("store.intro", { n: freeLimit })}{" "}
        <strong>{t("store.held", { credits })}</strong>
      </p>

      <div style={S.packList}>
        {packs.map((pack, i) => {
          const per = perImage(pack);
          const save = Math.round((1 - per / cheapest) * 100);
          const busy = busyId === pack.id;
          // 네이티브: 스토어 실제 가격 문자열(현지통화 자동). 로딩 전엔 우리 표시가로 폴백.
          const rc = native ? iapById?.[pack.id] : null;
          const storePrice = rc?.priceString;
          return (
            <div
              key={pack.id}
              style={{ ...S.pack, ...(pack.label ? S.packFeatured : {}) }}
            >
              {pack.label && <div style={S.packBadge}>{t("store.badge.popular")}</div>}
              <div style={S.packCount}>
                <span style={{ color: HEARTS[i % HEARTS.length] }}>♥</span>{" "}
                {t("store.count", { n: pack.count })}
              </div>
              <div style={S.packPrice}>
                {storePrice
                  ? storePrice
                  : ko ? won(pack.krw) : usd(pack.usd)}
                {!storePrice && (
                  <span style={S.packPriceSub}>
                    ({ko ? usd(pack.usd) : "≈ " + won(pack.krw)})
                  </span>
                )}
              </div>
              <div style={S.packPer}>
                {t("store.per", { price: ko ? won(perImage(pack)) : usd(perImageUsd(pack)) })}
                {save > 0 && <span style={S.packSave}>{t("store.save", { n: save })}</span>}
              </div>
              <button
                style={{
                  ...S.packBtn,
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? "wait" : "pointer",
                }}
                disabled={busy || !!busyId || (native && iapById && !rc)}
                onClick={() => onBuy(pack)}
              >
                {busy ? t("store.paying") : t("store.pay")}
              </button>
            </div>
          );
        })}
      </div>

      {okMsg && (
        <p style={{ ...S.storeNote, color: "#1e8e3e", fontWeight: 700 }}>{okMsg}</p>
      )}
      {errMsg && (
        <p style={{ ...S.storeNote, color: "#c0392b" }}>{errMsg}</p>
      )}

      <p style={S.storeNote}>{t("store.note")}</p>
    </div>
  );
}

/* ============================================================
   스타일
   ============================================================ */
const INK = "#231f20";
const BG = "#fffdf9";
const ACCENT = "#e6403c";

const S = {
  app: {
    minHeight: "100dvh", maxWidth: 440, margin: "0 auto",
    background:
      "radial-gradient(600px 420px at 12% 4%, rgba(255,209,160,.50), transparent 55%)," +
      "radial-gradient(600px 520px at 92% 18%, rgba(255,193,214,.45), transparent 55%)," +
      "radial-gradient(640px 620px at 60% 100%, rgba(183,224,255,.45), transparent 60%)," +
      "linear-gradient(160deg,#fff6ec,#fdeef6 55%,#eef4ff)",
    color: INK,
    fontFamily: "'Quicksand', 'Jua', sans-serif",
    display: "flex", flexDirection: "column", position: "relative",
    paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 88px)",
  },
  splash: {
    minHeight: "100dvh", maxWidth: 440, margin: "0 auto",
    background: BG, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 26,
  },
  splashDots: { display: "flex", gap: 9 },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    // 노치/상태바 안전영역만큼 위 여백 추가 (기종 자동 대응)
    padding: "calc(env(safe-area-inset-top, 0px) + 15px) 20px 13px",
    position: "sticky", top: 0, zIndex: 60,
    background: "rgba(255,253,249,0.6)",
    backdropFilter: "blur(18px) saturate(180%)",
    WebkitBackdropFilter: "blur(18px) saturate(180%)",
    borderBottom: "1px solid rgba(255,255,255,0.6)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  logoutBtn: {
    background: "transparent",
    color: INK,
    opacity: 0.55,
    border: "1px solid " + INK + "22",
    borderRadius: 999,
    padding: "8px 13px",
    fontSize: 11.5,
    fontWeight: 600,
    fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer",
    letterSpacing: "0.02em",
  },
  logoBtn: {
    background: "transparent", border: "none", padding: 0,
    cursor: "pointer", display: "flex", alignItems: "center",
  },
  profileBtn: {
    width: 38, height: 38, borderRadius: "50%",
    border: "2px solid " + INK + "18", background: "#fff",
    padding: 0, cursor: "pointer", overflow: "hidden",
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  profileBtnImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  profileBtnPlaceholder: { fontSize: 16, opacity: 0.5, lineHeight: 1 },

  /* === 프로필 화면 === */
  profileCard: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 18, padding: "24px 20px",
    display: "flex", flexDirection: "column", alignItems: "center",
    textAlign: "center", marginBottom: 16,
    boxShadow: "0 4px 14px rgba(35,31,32,0.04)",
  },
  profileAvatar: {
    width: 96, height: 96, borderRadius: "50%",
    background: "#f0ece4", overflow: "hidden",
    border: "3px solid " + ACCENT + "22",
    display: "flex", alignItems: "center", justifyContent: "center",
    marginBottom: 14,
  },
  profileAvatarImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  profileAvatarEmpty: { fontSize: 32, opacity: 0.4 },
  profileName: {
    fontSize: 18, fontWeight: 700, color: INK, marginBottom: 4,
    fontFamily: "'Quicksand', sans-serif",
  },
  profileMeta: {
    fontSize: 11.5, opacity: 0.55, fontWeight: 500, marginBottom: 16,
  },
  profilePhotoActions: {
    display: "flex", gap: 8, width: "100%", marginBottom: 12,
  },
  profileHint: {
    fontSize: 10.5, lineHeight: 1.6, opacity: 0.5, fontWeight: 500,
  },
  statRow: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
    marginBottom: 14,
  },
  statCard: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 14, padding: "14px 12px", textAlign: "center",
  },
  statLabel: {
    fontSize: 11, opacity: 0.6, fontWeight: 600, marginBottom: 6,
    fontFamily: "'Quicksand', sans-serif",
  },
  statValue: {
    fontSize: 22, fontWeight: 700, color: INK, lineHeight: 1.1,
    fontFamily: "'Quicksand', sans-serif",
  },
  statSub: { fontSize: 10.5, opacity: 0.5, fontWeight: 500, marginTop: 4 },

  /* === 언어 선택 === */
  langBox: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 14, padding: "14px 16px", marginBottom: 14,
  },
  langTitle: {
    fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 10,
    fontFamily: "'Quicksand', sans-serif",
  },
  langOptions: {
    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6,
  },
  langOpt: {
    background: "#fff", color: INK,
    border: "1.5px solid " + INK + "18", borderRadius: 10,
    padding: "9px 8px", fontSize: 12, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
  },
  langOptActive: {
    background: INK, color: "#fff", borderColor: "transparent",
  },

  /* === 내 갤러리 진입 버튼 (프로필 내) === */
  galleryEntry: {
    width: "100%", display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 12,
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 14, padding: "14px 16px", marginBottom: 14,
    cursor: "pointer", textAlign: "left",
    boxShadow: "0 2px 8px rgba(35,31,32,0.03)",
  },
  galleryEntryLeft: { flex: 1, minWidth: 0 },
  galleryEntryTitle: {
    fontSize: 14, fontWeight: 700, color: INK, marginBottom: 3,
    fontFamily: "'Quicksand', sans-serif",
  },
  galleryEntryDesc: {
    fontSize: 11, opacity: 0.6, fontWeight: 500, lineHeight: 1.5,
  },
  galleryEntryArrow: {
    fontSize: 18, color: INK + "55", flexShrink: 0,
  },

  /* === 내 갤러리 화면 === */
  galleryNotice: {
    background: "#f9c83c22", color: "#8a6a16",
    border: "1.5px solid #f9c83c66", borderRadius: 14,
    padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6,
    fontWeight: 600, fontFamily: "'Quicksand', sans-serif",
    margin: "0 0 16px", textAlign: "center",
  },
  myGalleryGrid: {
    display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
  },
  myGalleryCard: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 14, overflow: "hidden",
    boxShadow: "0 3px 10px rgba(35,31,32,0.04)",
  },
  myGalleryImgWrap: {
    position: "relative", aspectRatio: "3/4",
    background: "#f0ece4",
  },
  myGalleryImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  myGalleryTimer: {
    position: "absolute", left: 8, bottom: 8,
    background: "rgba(35,31,32,0.78)", color: "#fff",
    borderRadius: 999, padding: "4px 9px",
    fontSize: 10, fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
    letterSpacing: "0.02em",
  },
  myGalleryTimerWarn: { background: ACCENT },
  myGalleryFooter: { padding: "10px 11px 12px" },
  myGalleryTitle: {
    fontSize: 12, fontWeight: 700, color: INK,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    marginBottom: 8,
  },
  myGalleryActions: {
    display: "grid", gridTemplateColumns: "1fr auto", gap: 6,
  },
  myGalleryDownload: {
    background: INK, color: "#fff", textAlign: "center",
    textDecoration: "none", borderRadius: 8, padding: "7px 0",
    fontSize: 11.5, fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
  },
  myGalleryDelete: {
    background: "transparent", color: ACCENT,
    border: "1px solid " + ACCENT + "44", borderRadius: 8,
    padding: "7px 10px", fontSize: 11.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
  },
  creditChip: {
    display: "flex", alignItems: "center", gap: 7,
    background: "rgba(255,255,255,0.55)", color: INK,
    border: "1px solid rgba(255,255,255,0.7)", borderRadius: 999,
    backdropFilter: "blur(14px) saturate(180%)",
    WebkitBackdropFilter: "blur(14px) saturate(180%)",
    boxShadow: "0 6px 18px -6px rgba(40,30,30,0.25), inset 0 1px 0 rgba(255,255,255,0.85)",
    padding: "9px 15px", fontSize: 12.5, fontFamily: "'Quicksand', sans-serif",
    fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer",
  },
  creditDot: {
    width: 7, height: 7, borderRadius: "50%",
    background: "#f9c83c", display: "inline-block",
  },
  main: { flex: 1, padding: "24px 20px 28px" },
  tabbar: {
    position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100,
    display: "flex", justifyContent: "center",
    padding: "0 14px calc(env(safe-area-inset-bottom, 0px) + 12px)",
    pointerEvents: "none",
  },
  tabbarInner: {
    width: "100%", maxWidth: 412, pointerEvents: "auto",
    display: "flex", justifyContent: "space-around", alignItems: "center",
    background: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(22px) saturate(180%)",
    WebkitBackdropFilter: "blur(22px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.7)",
    borderRadius: 26,
    boxShadow: "0 12px 30px -8px rgba(40,30,30,0.32), inset 0 1px 0 rgba(255,255,255,0.85)",
    padding: "9px 8px",
  },
  tabBtn: {
    flex: 1, background: "transparent", border: "none", cursor: "pointer",
    display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
    color: INK, opacity: 0.5, padding: "4px 0",
    fontFamily: "'Quicksand', sans-serif",
  },
  tabBtnOn: { opacity: 1, color: ACCENT },
  tabIcon: { fontSize: 18, lineHeight: 1 },
  tabLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: "0.01em" },
  footer: {
    textAlign: "center",
    // 홈 인디케이터 안전영역만큼 아래 여백 추가
    padding: "16px 20px calc(env(safe-area-inset-bottom, 0px) + 28px)",
    fontFamily: "'Quicksand', sans-serif",
  },
  footerLinks: {
    display: "flex", justifyContent: "center", alignItems: "center",
    gap: 8, marginBottom: 10, flexWrap: "wrap",
  },
  footerLink: {
    fontSize: 11.5, fontWeight: 700, color: INK, opacity: 0.65,
    textDecoration: "none",
  },
  footerDot: { fontSize: 11, opacity: 0.3 },
  footerBiz: {
    fontSize: 10, letterSpacing: "0.01em", opacity: 0.4,
    lineHeight: 1.7, fontWeight: 500,
  },
  hero: { marginBottom: 24 },
  heroKicker: {
    display: "flex", alignItems: "center", gap: 7,
    fontSize: 11, fontWeight: 700, letterSpacing: "0.18em",
    color: ACCENT, marginBottom: 12,
  },
  kickerHeart: {
    width: 9, height: 9, borderRadius: "2px 9px 9px 9px",
    transform: "rotate(45deg)", display: "inline-block",
  },
  heroTitle: {
    fontFamily: "'Jua', sans-serif", fontSize: 27, lineHeight: 1.25,
    fontWeight: 400, margin: 0, letterSpacing: "-0.02em",
    whiteSpace: "nowrap",
  },
  heroDesc: {
    fontSize: 13.5, lineHeight: 1.7, opacity: 0.65, marginTop: 12,
    fontWeight: 500,
  },
  uploadBox: {
    width: "100%", aspectRatio: "4/3",
    background: "rgba(255,255,255,0.4)",
    backdropFilter: "blur(12px) saturate(160%)",
    WebkitBackdropFilter: "blur(12px) saturate(160%)",
    border: "2px dashed " + ACCENT + "66", borderRadius: 22,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 8, cursor: "pointer",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  },
  uploadIcon: { fontSize: 42, color: ACCENT, fontWeight: 300, lineHeight: 1 },
  uploadText: { fontSize: 14.5, fontWeight: 600 },
  uploadHint: {
    fontSize: 10.5, letterSpacing: "0.18em", opacity: 0.4, fontWeight: 600,
  },
  previewWrap: { position: "relative" },
  previewImg: {
    width: "100%", aspectRatio: "4/3", objectFit: "cover",
    borderRadius: 22, display: "block",
  },
  previewClear: {
    position: "absolute", bottom: 12, right: 12,
    background: "rgba(35,31,32,0.88)", color: "#fff", border: "none",
    borderRadius: 999, padding: "8px 16px", fontSize: 11.5,
    fontWeight: 600, fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
  },
  changePhotoBtn: {
    width: "100%", boxSizing: "border-box", marginTop: 10,
    background: "#fff", color: INK, border: "2px solid " + INK + "22",
    borderRadius: 14, padding: "13px", fontSize: 13.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
  },
  consentRow: {
    display: "flex", gap: 10, alignItems: "flex-start",
    margin: "18px 0", cursor: "pointer",
  },
  checkbox: { marginTop: 1, width: 17, height: 17, accentColor: ACCENT },
  consentText: { fontSize: 11.5, lineHeight: 1.6, opacity: 0.7, fontWeight: 500 },
  primaryBtn: {
    width: "100%", color: "#fff", border: "none",
    background: "linear-gradient(135deg, #ff6b66, " + ACCENT + ")",
    borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", letterSpacing: "0.02em",
    cursor: "pointer",
    boxShadow: "0 10px 24px -8px " + ACCENT + "b0, inset 0 1px 0 rgba(255,255,255,0.5)",
  },
  secondaryBtn: {
    width: "100%", color: INK,
    background: "rgba(255,255,255,0.55)",
    backdropFilter: "blur(12px) saturate(170%)",
    WebkitBackdropFilter: "blur(12px) saturate(170%)",
    border: "1px solid rgba(255,255,255,0.7)", borderRadius: 16, padding: "15px",
    fontSize: 15, fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer",
    boxShadow: "0 6px 18px -6px rgba(40,30,30,0.2), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  moreBtn: {
    background: "#fff", color: INK,
    border: "1.5px solid " + INK + "22", borderRadius: 999,
    padding: "10px 22px", fontSize: 12.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    letterSpacing: "0.02em",
  },

  /* === 홈 레이아웃 (G) === */
  homeSection: { marginBottom: 24 },
  homeRowHead: {
    display: "flex", justifyContent: "space-between", alignItems: "baseline",
    marginBottom: 10, padding: "0 2px",
  },
  homeRowTitle: {
    fontSize: 15, fontWeight: 700, color: INK,
    fontFamily: "'Quicksand', sans-serif",
    display: "flex", alignItems: "baseline", gap: 7,
  },
  homeRowCount: {
    fontSize: 11.5, opacity: 0.45, fontWeight: 600,
  },
  homeRowMore: {
    background: "transparent", border: "none", color: ACCENT,
    fontSize: 12, fontWeight: 700, cursor: "pointer",
    fontFamily: "'Quicksand', sans-serif",
  },
  homeRail: {
    display: "flex", gap: 8, overflowX: "auto",
    scrollSnapType: "x mandatory",
    paddingBottom: 8,
    margin: "0 -20px", paddingLeft: 20, paddingRight: 20,
  },
  homeRailFeatured: {
    display: "flex", gap: 12, overflowX: "auto",
    scrollSnapType: "x mandatory",
    paddingBottom: 8,
    margin: "0 -20px", paddingLeft: 20, paddingRight: 20,
  },
  railCard: {
    flexShrink: 0, width: 110, aspectRatio: "3/4",
    background: "#f0ece4", borderRadius: 12, overflow: "hidden",
    border: "none", padding: 0, cursor: "pointer", position: "relative",
    scrollSnapAlign: "start",
  },
  railImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  featuredCard: {
    flexShrink: 0, width: 200, aspectRatio: "3/4",
    background: "#f0ece4", borderRadius: 16, overflow: "hidden",
    border: "none", padding: 0, cursor: "pointer", position: "relative",
    scrollSnapAlign: "start",
    boxShadow: "0 4px 14px rgba(35,31,32,0.08)",
  },
  featuredImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  featuredOverlay: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    padding: "20px 12px 11px",
    background: "linear-gradient(to top, rgba(35,31,32,0.78), rgba(35,31,32,0))",
  },
  featuredTitle: {
    color: "#fff", fontSize: 12.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", letterSpacing: "-0.01em",
    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  inviteBanner: {
    width: "100%", display: "flex", alignItems: "center",
    justifyContent: "space-between", gap: 12,
    background: "linear-gradient(120deg, " + ACCENT + "14, " + HEARTS[2] + "1f)",
    border: "1.5px solid " + ACCENT + "33", borderRadius: 16,
    padding: "13px 15px", marginBottom: 18, cursor: "pointer",
    textAlign: "left",
  },
  inviteBannerLeft: { flex: 1, minWidth: 0 },
  inviteBannerTitle: {
    fontSize: 13.5, fontWeight: 700, color: INK,
    fontFamily: "'Quicksand', sans-serif", marginBottom: 3,
  },
  inviteBannerDesc: {
    fontSize: 11, opacity: 0.7, fontWeight: 500, lineHeight: 1.5,
  },
  inviteBannerBtn: {
    flexShrink: 0, background: ACCENT, color: "#fff",
    borderRadius: 999, padding: "8px 14px", fontSize: 12,
    fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
  },
  inviteToast: {
    background: INK, color: "#fff", borderRadius: 12,
    padding: "11px 14px", fontSize: 12, fontWeight: 600,
    marginBottom: 16, textAlign: "center", lineHeight: 1.5,
  },
  payToast: {
    position: "fixed", top: 70, left: "50%",
    transform: "translateX(-50%)",
    background: INK, color: "#fff", borderRadius: 999,
    padding: "11px 22px", fontSize: 13, fontWeight: 700,
    boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
    cursor: "pointer", zIndex: 999, maxWidth: "90vw",
    textAlign: "center",
  },
  packPriceSub: {
    fontSize: 11, fontWeight: 500, opacity: 0.55, marginLeft: 4,
  },
  privacyNote: {
    fontSize: 10.5, lineHeight: 1.6, opacity: 0.45,
    textAlign: "center", marginTop: 14, fontWeight: 500,
  },
  navRow: { display: "flex", alignItems: "center", gap: 13, marginBottom: 20 },
  backBtn: {
    width: 40, height: 40, borderRadius: "50%",
    border: "2px solid " + INK + "1f", background: "#fff",
    fontSize: 17, cursor: "pointer", color: INK,
  },
  screenKicker: {
    fontSize: 10.5, fontWeight: 700, letterSpacing: "0.2em", color: ACCENT,
  },
  screenTitle: {
    fontFamily: "'Jua', sans-serif", fontSize: 25, fontWeight: 400,
    lineHeight: 1.2,
  },
  galleryControls: {
    display: "flex", gap: 9, alignItems: "stretch", marginBottom: 13,
  },
  searchWrap: {
    flex: 1, display: "flex", alignItems: "center", gap: 8,
    background: "#fff", border: "2px solid " + INK + "14",
    borderRadius: 14, padding: "0 14px",
  },
  colToggle: {
    flexShrink: 0, width: 48, display: "flex",
    alignItems: "center", justifyContent: "center",
    background: "#fff", border: "2px solid " + INK + "14",
    borderRadius: 14, cursor: "pointer", color: INK,
  },
  searchIcon: { fontSize: 17, opacity: 0.4 },
  searchInput: {
    flex: 1, border: "none", background: "transparent", padding: "13px 0",
    fontSize: 14, fontFamily: "'Quicksand', sans-serif", fontWeight: 500,
    outline: "none", color: INK, minWidth: 0,
  },
  searchClear: {
    flexShrink: 0, background: INK + "16", color: INK,
    border: "none", borderRadius: "50%",
    width: 22, height: 22, fontSize: 14, lineHeight: 1,
    cursor: "pointer", marginRight: 4,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "system-ui, sans-serif",
  },
  catRow: {
    display: "flex", gap: 8, overflowX: "auto",
    paddingBottom: 6, marginBottom: 10,
  },
  stickyBar: {
    position: "sticky", top: 0, zIndex: 50,
    background: BG, marginBottom: 10,
    paddingTop: 6,
    margin: "0 -20px 10px",
    paddingLeft: 20, paddingRight: 20,
    borderBottom: "1px solid " + INK + "10",
    boxShadow: "0 2px 8px rgba(35,31,32,0.04)",
  },
  catRowSticky: {
    display: "flex", gap: 8, overflowX: "auto",
    paddingTop: 8, paddingBottom: 8,
    margin: "0 -20px", paddingLeft: 20, paddingRight: 20,
    WebkitOverflowScrolling: "touch",
  },
  catChip: {
    flexShrink: 0,
    background: "rgba(255,255,255,0.5)",
    backdropFilter: "blur(12px) saturate(170%)",
    WebkitBackdropFilter: "blur(12px) saturate(170%)",
    border: "1px solid rgba(255,255,255,0.7)", borderRadius: 999,
    padding: "8px 15px", fontSize: 12.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    color: INK, whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 6,
    boxShadow: "0 4px 12px -4px rgba(40,30,30,0.18), inset 0 1px 0 rgba(255,255,255,0.8)",
  },
  catChipActive: { color: "#fff", borderColor: "transparent" },
  catChipCount: {
    fontSize: 10.5, opacity: 0.6, fontWeight: 700,
  },
  filterMetaRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    marginBottom: 14, gap: 8,
  },
  resultCount: {
    fontSize: 11.5, opacity: 0.55, fontWeight: 600,
    fontFamily: "'Quicksand', sans-serif", letterSpacing: "0.02em",
  },
  grid: { display: "grid" },
  card: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 16, overflow: "hidden", padding: 0, cursor: "pointer",
    textAlign: "left", boxShadow: "0 3px 12px rgba(35,31,32,0.05)",
  },
  thumb: {
    aspectRatio: "3/4", position: "relative", overflow: "hidden",
    background: "#f0ece4",
  },
  thumbImg: {
    width: "100%", height: "100%", objectFit: "cover", display: "block",
  },
  thumbFallback: {
    width: "100%", height: "100%", display: "flex",
    alignItems: "center", justifyContent: "center",
  },
  thumbGlyph: { fontSize: 32, color: "#fff", opacity: 0.75 },
  hiddenTag: {
    position: "absolute", right: 8, fontWeight: 700,
    letterSpacing: "0.02em", background: INK, color: "#fff",
    borderRadius: 999,
  },
  emptyState: {
    fontSize: 13, textAlign: "center", opacity: 0.45,
    padding: "50px 0", fontWeight: 500,
  },
  confirmPreview: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 14, marginBottom: 20,
  },
  confirmPhoto: {
    width: 112, height: 142, objectFit: "cover", borderRadius: 16,
  },
  confirmArrow: { fontSize: 20, color: ACCENT },
  confirmStyle: {
    width: 112, height: 142,
    background: "linear-gradient(150deg, #f9c83c33, #60c9de44)",
    borderRadius: 16, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 6,
  },
  confirmStyleId: { fontSize: 11, fontWeight: 700, opacity: 0.5 },
  confirmCard: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 18, padding: "16px 16px 18px", marginBottom: 15,
    boxShadow: "0 3px 12px rgba(35,31,32,0.05)",
  },
  idOptCard: {
    background: "#fff", border: "1px solid " + INK + "10",
    borderRadius: 18, padding: "16px 16px 18px", marginBottom: 15,
    boxShadow: "0 3px 12px rgba(35,31,32,0.05)",
  },
  idOptLabel: { fontSize: 13, fontWeight: 800, color: INK, marginBottom: 9 },
  idSuitRow: { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 },
  idSuitChip: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    gap: 7, padding: "10px 8px", borderRadius: 12, cursor: "pointer",
    border: "1.5px solid " + INK + "18", background: "#fafafa",
    fontSize: 13, fontWeight: 700, color: INK,
  },
  idSuitChipOn: { border: "1.5px solid " + ACCENT, background: ACCENT + "12" },
  idSuitDot: { width: 16, height: 16, borderRadius: "50%", display: "inline-block", border: "1px solid rgba(0,0,0,0.12)" },
  idBgRow: { display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 },
  idBgSwatch: {
    aspectRatio: "1 / 1", borderRadius: 10, cursor: "pointer",
    border: "1.5px solid " + INK + "1a", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 0,
  },
  idBgSwatchOn: { border: "2.5px solid " + ACCENT, boxShadow: "0 0 0 2px " + ACCENT + "30" },
  idBgCheck: { fontSize: 13, fontWeight: 900 },
  idCustomRow: {
    position: "relative", display: "flex", alignItems: "center", gap: 9,
    marginTop: 9, padding: "9px 11px", borderRadius: 12, cursor: "pointer",
    border: "1.5px solid " + INK + "18", background: "#fafafa",
  },
  idCustomRowOn: { border: "1.5px solid " + ACCENT, background: ACCENT + "10" },
  idCustomSwatch: {
    width: 22, height: 22, borderRadius: "50%", flex: "0 0 auto",
    border: "1px solid rgba(0,0,0,0.15)",
  },
  idCustomText: { fontSize: 13, fontWeight: 700, color: INK },
  idDisclaimer: {
    marginTop: 14, fontSize: 11.5, lineHeight: 1.5, color: INK + "99",
    background: "#fff7ed", border: "1px solid #f6c98a55",
    borderRadius: 12, padding: "9px 11px",
  },
  confirmTitle: {
    fontFamily: "'Jua', sans-serif", fontSize: 20, fontWeight: 400,
    lineHeight: 1.2,
  },
  confirmCat: {
    fontSize: 11, fontWeight: 700, color: ACCENT,
    marginTop: 4, marginBottom: 11,
  },
  promptPeek: {
    fontSize: 11.5, lineHeight: 1.6, opacity: 0.55, fontWeight: 500,
  },
  costRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "13px 4px", borderTop: "1px solid " + INK + "14",
    borderBottom: "1px solid " + INK + "14", marginBottom: 17,
  },
  costLabel: { fontSize: 12.5, fontWeight: 600, opacity: 0.55 },
  costValue: { fontSize: 13, fontWeight: 700 },
  genWrap: {
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", padding: "76px 0", gap: 22,
  },
  genHearts: { display: "flex", gap: 10 },
  genTitle: {
    fontFamily: "'Jua', sans-serif", fontSize: 21, fontWeight: 400,
  },
  genSub: { fontSize: 11.5, fontWeight: 600, opacity: 0.5 },
  genHint: { fontSize: 10.5, fontWeight: 500, opacity: 0.4, marginTop: -8 },
  reportLink: {
    display: "block", textAlign: "center", marginTop: 14,
    fontSize: 12, color: "#9aa0a6", textDecoration: "none",
  },
  resultImage: { margin: "18px 0" },
  resultImg: {
    width: "100%", aspectRatio: "3/4", objectFit: "cover",
    borderRadius: 20, display: "block",
  },
  resultActions: { display: "flex", gap: 10 },
  downloadBtn: {
    display: "block", width: "100%", boxSizing: "border-box",
    background: "#fff", color: INK, border: "2px solid " + INK + "22",
    borderRadius: 16, padding: "14px", fontSize: 14, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    textAlign: "center", textDecoration: "none", marginBottom: 10,
  },
  saveNotice: {
    background: "#f9c83c22", color: "#8a6a16",
    border: "1.5px solid #f9c83c66", borderRadius: 14,
    padding: "13px 15px", fontSize: 12.5, lineHeight: 1.7,
    fontWeight: 600, fontFamily: "'Quicksand', sans-serif",
    margin: "14px 0", textAlign: "center",
    wordBreak: "keep-all",
  },
  errorCard: {
    background: ACCENT + "10", color: ACCENT, borderRadius: 14,
    padding: "16px 16px", fontSize: 12.5, lineHeight: 1.65,
    fontWeight: 600, margin: "16px 0 18px",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  storeIntro: {
    fontSize: 12.5, lineHeight: 1.7, opacity: 0.7,
    marginBottom: 20, fontWeight: 500,
  },
  packList: { display: "flex", flexDirection: "column", gap: 13 },
  pack: {
    background: "#fff", border: "1px solid " + INK + "12",
    borderRadius: 18, padding: "18px", position: "relative",
    display: "grid", gridTemplateColumns: "1fr 1fr auto",
    alignItems: "center", gap: 10,
    boxShadow: "0 3px 12px rgba(35,31,32,0.05)",
  },
  packFeatured: {
    border: "2px solid #f9c83c",
    boxShadow: "0 8px 24px rgba(249,200,60,0.28)",
  },
  packBadge: {
    position: "absolute", top: -10, left: 18, background: "#f9c83c",
    color: INK, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
    padding: "4px 12px", borderRadius: 999,
  },
  packCount: {
    fontFamily: "'Jua', sans-serif", fontSize: 23, fontWeight: 400,
    lineHeight: 1,
  },
  packPrice: { fontSize: 17, fontWeight: 700 },
  packPer: {
    fontSize: 10.5, fontWeight: 600, opacity: 0.55,
    gridColumn: "1 / 3", marginTop: -4,
  },
  packSave: { color: ACCENT, fontWeight: 700 },
  packBtn: {
    gridRow: "1 / 3", gridColumn: 3, background: INK, color: "#fff",
    border: "none", borderRadius: 13, padding: "13px 22px",
    fontSize: 13.5, fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer",
  },
  storeNote: {
    fontSize: 10, lineHeight: 1.65, opacity: 0.45,
    marginTop: 18, textAlign: "center", fontWeight: 500,
  },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Jua&family=Quicksand:wght@400;500;600;700&display=swap');
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
body { margin: 0; background: ${BG}; }
.fade { animation: fadeIn .35s ease; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.splashLogo { animation: pop .6s cubic-bezier(.34,1.56,.64,1); }
@keyframes pop {
  0% { opacity: 0; transform: scale(.7); }
  100% { opacity: 1; transform: scale(1); }
}
.splashDot {
  width: 11px; height: 11px; border-radius: 3px 11px 11px 11px;
  transform: rotate(45deg); display: inline-block;
  animation: bounce 1s ease-in-out infinite;
}
@keyframes bounce {
  0%, 100% { transform: rotate(45deg) translateY(0); opacity: .55; }
  50% { transform: rotate(45deg) translateY(-9px); opacity: 1; }
}
.genHeart {
  width: 14px; height: 14px; border-radius: 3px 14px 14px 14px;
  transform: rotate(45deg); display: inline-block;
  animation: bounce 1s ease-in-out infinite;
}
input[type=checkbox] { cursor: pointer; }
button:active { transform: scale(0.98); }
::-webkit-scrollbar { height: 0; width: 0; }
`;
