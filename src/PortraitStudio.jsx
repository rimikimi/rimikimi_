import React, { useState, useRef, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";
import LoginGate from "./LoginGate";

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

const CREDIT_PACKS = [
  { id: "s", count: 10, price: 4900, label: null },
  { id: "m", count: 30, price: 9900, label: "가장 인기" },
  { id: "l", count: 70, price: 19900, label: null },
];

const FREE_DAILY = 3;

/* 로고에서 추출한 브랜드 컬러 */
const HEARTS = ["#e6403c", "#f9c83c", "#60c9de", "#8a5da7"];

const won = (n) => n.toLocaleString("ko-KR") + "원";
const perImage = (pack) => Math.round(pack.price / pack.count);

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
async function generateImage(accessToken, dataUrl, promptText) {
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
      body: JSON.stringify({ mimeType, base64, prompt: promptText }),
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
export default function PortraitStudio() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("home");
  const [photo, setPhoto] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState("전체");
  const [hideSensitive, setHideSensitive] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [freeUsed, setFreeUsed] = useState(0);
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

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2200);
    return () => clearTimeout(t);
  }, []);

  // 페이지 로드 시 현재 세션 확인 + 이후 변경 감지
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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

  // 로그인된 사용자의 오늘 사용량을 서버에서 받아옴 (페이지 로드 / 로그인 직후)
  useEffect(() => {
    const token = session?.access_token;
    if (!token) {
      setFreeUsed(0);
      setUnlimited(false);
      setBlocked(false);
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
        if (typeof j?.credits === "number") setCredits(j.credits);
        if (typeof j?.referralCount === "number") setReferralCount(j.referralCount);
        if (typeof j?.untilNext === "number") setUntilNext(j.untilNext);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  async function handleLogout() {
    await supabase.auth.signOut();
    // 메인 화면 상태 초기화
    setScreen("home");
    setPhoto(null);
    setSelected(null);
    setResultImage(null);
  }

  // 18+ 토글 적용 후 풀(전체 풀에서 자동 제외)
  const visiblePool = useMemo(() => {
    return hideSensitive ? concepts.filter((p) => !p.sensitive) : concepts;
  }, [concepts, hideSensitive]);

  // 카테고리에 개수 같이 계산 — [{ name, count }]
  const categories = useMemo(() => {
    const counts = new Map();
    counts.set("전체", visiblePool.length);
    for (const p of visiblePool) {
      counts.set(p.category, (counts.get(p.category) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [visiblePool]);

  const filtered = useMemo(() => {
    return visiblePool.filter((p) => {
      const catOk = activeCat === "전체" || p.category === activeCat;
      const q = query.trim().toLowerCase();
      const qOk =
        !q ||
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.text.toLowerCase().includes(q);
      return catOk && qOk;
    });
  }, [visiblePool, query, activeCat]);

  // 무한 스크롤 흉내 — 처음엔 30개, 스크롤 시 + 30개씩
  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // 필터/검색/토글 바뀌면 다시 처음부터
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCat, query, hideSensitive]);

  // 현재 카테고리가 더 이상 존재하지 않으면 "전체" 로 폴백
  useEffect(() => {
    if (!categories.some((c) => c.name === activeCat)) setActiveCat("전체");
  }, [categories, activeCat]);

  function resetFilters() {
    setQuery("");
    setActiveCat("전체");
    setHideSensitive(false);
  }

  const freeLeft = unlimited ? Infinity : Math.max(0, FREE_DAILY - freeUsed);
  const canGenerateFree = !blocked && freeLeft > 0;
  const canGenerate = !blocked && (unlimited || canGenerateFree || credits > 0);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(f);
  }

  function pickPrompt(p) {
    setSelected(p);
    setScreen("confirm");
  }

  async function startGenerate() {
    if (!canGenerate) {
      setScreen("store");
      return;
    }

    // 인증 + 횟수 체크는 서버(/api/generate)가 처리
    setGenError(null);
    setResultImage(null);
    setGenerating(true);
    setScreen("result");

    try {
      const accessToken = session?.access_token;
      const result = await generateImage(accessToken, photo, selected.text);
      setResultImage(result.imageDataUrl);
      // 서버가 알려준 진짜 사용량으로 업데이트
      if (typeof result.unlimited === "boolean") setUnlimited(result.unlimited);
      if (typeof result.quotaUsed === "number") setFreeUsed(result.quotaUsed);
    } catch (err) {
      // 서버가 한도 정보를 같이 줬으면 화면 카운터도 반영
      if (typeof err.quotaUsed === "number") setFreeUsed(err.quotaUsed);
      setGenError(err.message || "이미지 생성에 실패했어요.");
    } finally {
      setGenerating(false);
    }
  }

  function resetToHome() {
    setScreen("home");
    setSelected(null);
    setResultImage(null);
    setGenError(null);
  }

  // 친구 초대 — 휴대폰 기본 공유창 (카톡/문자 등 자동 노출)
  async function shareInvite() {
    const uid = session?.user?.id;
    if (!uid) return;
    const link = window.location.origin + "/?ref=" + uid;
    const shareData = {
      title: "rimikimi",
      text: "내 얼굴로 인생 프로필 만들기 ✨ rimikimi 같이 해요!",
      url: link,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(link);
        setInviteMsg("초대 링크가 복사됐어요! 친구에게 붙여넣어 보내주세요 📋");
        setTimeout(() => setInviteMsg(""), 4000);
      }
    } catch (_) {
      /* 사용자가 공유 취소 — 무시 */
    }
  }

  if (booting) return <Splash />;

  // 세션 확인 중엔 잠깐 빈 화면 (깜빡임 방지)
  if (!authChecked) return <div style={{ ...S.app, background: BG }} />;

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

      <header style={S.header}>
        <Logo height={35} />
        <div style={S.headerRight}>
          <button style={S.creditChip} onClick={shareInvite}>
            <span style={S.creditDot} />
            {unlimited
              ? "∞ 무제한"
              : blocked
              ? "🔒 베타 전용"
              : "베타 " +
                freeLeft +
                "/" +
                FREE_DAILY +
                (credits > 0 ? " ·🎟" + credits : "")}
          </button>
          <button
            style={S.logoutBtn}
            onClick={handleLogout}
            aria-label="로그아웃"
            title={
              session?.user?.email
                ? session.user.email + " — 로그아웃"
                : "로그아웃"
            }
          >
            로그아웃
          </button>
        </div>
      </header>

      <main style={S.main}>
        {screen === "home" && (
          <HomeScreen
            photo={photo}
            fileRef={fileRef}
            onFile={handleFile}
            onPick={() => fileRef.current?.click()}
            onClear={() => setPhoto(null)}
            ageConfirmed={ageConfirmed}
            setAgeConfirmed={setAgeConfirmed}
            onContinue={() => setScreen("gallery")}
          />
        )}
        {screen === "gallery" && (
          <GalleryScreen
            categories={categories}
            activeCat={activeCat}
            setActiveCat={setActiveCat}
            query={query}
            setQuery={setQuery}
            hideSensitive={hideSensitive}
            setHideSensitive={setHideSensitive}
            onResetFilters={resetFilters}
            prompts={filtered.slice(0, visibleCount)}
            totalFiltered={filtered.length}
            visibleCount={visibleCount}
            onShowMore={() => setVisibleCount((c) => c + PAGE_SIZE)}
            total={concepts.length}
            poolTotal={visiblePool.length}
            onPick={pickPrompt}
            onBack={() => setScreen("home")}
          />
        )}
        {screen === "confirm" && selected && (
          <ConfirmScreen
            photo={photo}
            prompt={selected}
            freeLeft={freeLeft}
            credits={credits}
            canGenerate={canGenerate}
            onBack={() => setScreen("gallery")}
            onGenerate={startGenerate}
            onStore={() => setScreen("store")}
          />
        )}
        {screen === "result" && selected && (
          <ResultScreen
            generating={generating}
            prompt={selected}
            resultImage={resultImage}
            genError={genError}
            onRetry={startGenerate}
            onAgain={() => setScreen("gallery")}
            onHome={resetToHome}
          />
        )}
        {screen === "store" && (
          <StoreScreen
            packs={CREDIT_PACKS}
            credits={credits}
            onBuy={(pack) => {
              setCredits((c) => c + pack.count);
              setScreen(selected ? "confirm" : "gallery");
            }}
            onBack={() => setScreen(selected ? "confirm" : "gallery")}
          />
        )}
      </main>

      <footer style={S.footer}>
        프로토타입 · 사진은 기기 안에서만 처리되며 서버에 저장되지 않습니다
      </footer>
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
  ageConfirmed, setAgeConfirmed, onContinue,
}) {
  const ready = photo && ageConfirmed;
  return (
    <div className="fade">
      <div style={S.hero}>
        <div style={S.heroKicker}>
          <span style={{ ...S.kickerHeart, background: HEARTS[0] }} />
          STEP 01
        </div>
        <h1 style={S.heroTitle}>내 얼굴로 만드는 인생 프로필</h1>
        <p style={S.heroDesc}>
          증명사진이나 셀카 한 장이면 충분해요.<br />
          정확한 분석과 이미지 생성을 위해<br />
          필터 또는 보정이 없는 정면 모습을 업로드해 주세요🙂<br />
          사진 데이터는 저장되지 않으니 안심하세요😀
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        style={{ display: "none" }}
      />

      {!photo ? (
        <button style={S.uploadBox} onClick={onPick}>
          <div style={S.uploadIcon}>＋</div>
          <div style={S.uploadText}>사진 올리기 / 셀카 찍기</div>
          <div style={S.uploadHint}>JPG · PNG</div>
        </button>
      ) : (
        <div style={S.previewWrap}>
          <img src={photo} alt="업로드한 사진" style={S.previewImg} />
          <button style={S.previewClear} onClick={onClear}>사진 변경</button>
        </div>
      )}

      <label style={S.consentRow}>
        <input
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => setAgeConfirmed(e.target.checked)}
          style={S.checkbox}
        />
        <span style={S.consentText}>
          본인 사진이며, 만 18세 이상입니다. 타인의 사진을 동의 없이 사용하지
          않습니다.
        </span>
      </label>

      <button
        style={{ ...S.primaryBtn, opacity: ready ? 1 : 0.35 }}
        disabled={!ready}
        onClick={onContinue}
      >
        컨셉 고르기 →
      </button>

      <p style={S.privacyNote}>
        업로드한 사진은 서버에 저장되지 않으며, 이미지 생성 직후 폐기됩니다.
      </p>
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
  hideSensitive, setHideSensitive, onResetFilters,
  prompts, total, totalFiltered, visibleCount, onShowMore,
  poolTotal, onPick, onBack,
}) {
  const [cols, setCols] = useState(2);
  const hasFilter =
    query.trim() !== "" || activeCat !== "전체" || hideSensitive;
  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>STEP 02</div>
          <div style={S.screenTitle}>컨셉 선택</div>
        </div>
      </div>

      <div style={S.galleryControls}>
        <div style={S.searchWrap}>
          <span style={S.searchIcon}>⌕</span>
          <input
            style={S.searchInput}
            placeholder={poolTotal + "개의 컨셉 검색"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              style={S.searchClear}
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
            >
              ×
            </button>
          )}
        </div>
        <button
          style={S.colToggle}
          onClick={() => setCols((c) => (c === 2 ? 4 : 2))}
          aria-label={cols === 2 ? "4열로 보기" : "2열로 보기"}
        >
          <GridIcon cells={cols === 2 ? 4 : 2} />
        </button>
      </div>

      <div style={S.catRow}>
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
            {c.name} <span style={S.catChipCount}>{c.count}</span>
          </button>
        ))}
      </div>

      <div style={S.filterMetaRow}>
        <span style={S.resultCount}>
          {hasFilter
            ? totalFiltered + "개 결과"
            : "총 " + poolTotal + "개"}
        </span>
        <button
          style={{
            ...S.sensitiveToggle,
            ...(hideSensitive ? S.sensitiveToggleOn : {}),
          }}
          onClick={() => setHideSensitive((v) => !v)}
        >
          {hideSensitive ? "🙈 18+ 숨김" : "👁 18+ 표시"}
        </button>
      </div>

      {prompts.length === 0 ? (
        <div style={S.emptyState}>
          <div>검색 결과가 없어요</div>
          {hasFilter && (
            <button
              style={{ ...S.moreBtn, marginTop: 14 }}
              onClick={onResetFilters}
            >
              필터 초기화
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
                  alt={p.title}
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
                {p.sensitive && (
                  <div
                    style={{
                      ...S.sensitiveTag,
                      fontSize: cols === 2 ? 9 : 7.5,
                      padding: cols === 2 ? "3px 7px" : "2px 5px",
                    }}
                  >
                    18+
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {totalFiltered > visibleCount && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button style={S.moreBtn} onClick={onShowMore}>
            더 보기 ({totalFiltered - visibleCount}개 남음)
          </button>
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
  onBack, onGenerate, onStore,
}) {
  const useFree = freeLeft > 0;
  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>STEP 03</div>
          <div style={S.screenTitle}>생성 확인</div>
        </div>
      </div>

      <div style={S.confirmPreview}>
        <img src={photo} alt="내 사진" style={S.confirmPhoto} />
        <div style={S.confirmArrow}>♥</div>
        {(prompt.id) ? (
          <img
            src={`/thumbs/${prompt.id}.webp`}
            alt={prompt.title}
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
        <div style={S.confirmTitle}>{prompt.title}</div>
        <div style={S.confirmCat}>{prompt.category}</div>
        {prompt.sensitive && (
          <div style={S.sensitiveNotice}>
            이 스타일은 노출도가 있는 연출을 포함해요. 본인 사진에 한해
            사용해 주세요.
          </div>
        )}
        <div style={S.promptPeek}>
          선택한 컨셉으로 내 얼굴 특징을 살린 이미지를 만들어 드려요.
        </div>
      </div>

      <div style={S.costRow}>
        <span style={S.costLabel}>이번 생성</span>
        <span style={S.costValue}>
          {useFree ? "무료 " + freeLeft + "장 중 1장 사용" : "크레딧 1장 사용"}
        </span>
      </div>

      {canGenerate ? (
        <button style={S.primaryBtn} onClick={onGenerate}>
          이미지 생성하기
        </button>
      ) : (
        <button style={S.primaryBtn} onClick={onStore}>
          크레딧 충전하고 생성하기
        </button>
      )}
    </div>
  );
}

/* ============================================================
   결과 — 생성 중 / 실패 / 성공
   ============================================================ */
function ResultScreen({
  generating, prompt, resultImage, genError, onRetry, onAgain, onHome,
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
          <div style={S.genTitle}>이미지를 만들고 있어요</div>
          <div style={S.genSub}>#{prompt.id} · {prompt.title}</div>
          <div style={S.genHint}>최대 30초 정도 걸릴 수 있어요</div>
        </div>
      ) : genError ? (
        <div className="fade">
          <div style={S.screenKicker}>생성 실패</div>
          <div style={S.screenTitle}>다시 시도해 주세요</div>
          <div style={S.errorCard}>{genError}</div>
          <div style={S.resultActions}>
            <button style={S.secondaryBtn} onClick={onHome}>처음으로</button>
            <button style={S.primaryBtn} onClick={onRetry}>다시 시도</button>
          </div>
        </div>
      ) : resultImage ? (
        <div className="fade">
          <div style={S.screenKicker}>완성!</div>
          <div style={S.screenTitle}>{prompt.title}</div>
          <div style={S.resultImage}>
            <img src={resultImage} alt={prompt.title} style={S.resultImg} />
          </div>
          <a
            href={resultImage}
            download={"rimikimi_" + prompt.id + ".png"}
            style={S.downloadBtn}
          >
            이미지 저장하기
          </a>
          <div style={S.resultActions}>
            <button style={S.secondaryBtn} onClick={onHome}>처음으로</button>
            <button style={S.primaryBtn} onClick={onAgain}>다른 컨셉으로</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================
   상점
   ============================================================ */
function StoreScreen({ packs, credits, onBuy, onBack }) {
  const cheapest = Math.max(...packs.map((p) => perImage(p)));
  return (
    <div className="fade">
      <div style={S.navRow}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.screenKicker}>크레딧</div>
          <div style={S.screenTitle}>충전하기</div>
        </div>
      </div>

      <p style={S.storeIntro}>
        하루 무료 {FREE_DAILY}장을 모두 사용했어요. 크레딧 1장으로 이미지 한
        장을 만들 수 있어요. 현재 보유: <strong>{credits}크레딧</strong>
      </p>

      <div style={S.packList}>
        {packs.map((pack, i) => {
          const per = perImage(pack);
          const save = Math.round((1 - per / cheapest) * 100);
          return (
            <div
              key={pack.id}
              style={{ ...S.pack, ...(pack.label ? S.packFeatured : {}) }}
            >
              {pack.label && <div style={S.packBadge}>{pack.label}</div>}
              <div style={S.packCount}>
                <span style={{ color: HEARTS[i % HEARTS.length] }}>♥</span>{" "}
                {pack.count}장
              </div>
              <div style={S.packPrice}>{won(pack.price)}</div>
              <div style={S.packPer}>
                장당 {won(per)}
                {save > 0 && <span style={S.packSave}> · {save}% 절약</span>}
              </div>
              <button style={S.packBtn} onClick={() => onBuy(pack)}>구매</button>
            </div>
          );
        })}
      </div>

      <p style={S.storeNote}>
        프로토타입 단계입니다 · 실제 결제는 연동되어 있지 않으며, 버튼을 누르면
        크레딧이 시뮬레이션으로 충전됩니다.
      </p>
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
    minHeight: "100vh", maxWidth: 440, margin: "0 auto",
    background: BG, color: INK,
    fontFamily: "'Quicksand', 'Jua', sans-serif",
    display: "flex", flexDirection: "column", position: "relative",
  },
  splash: {
    minHeight: "100vh", maxWidth: 440, margin: "0 auto",
    background: BG, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 26,
  },
  splashDots: { display: "flex", gap: 9 },
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "15px 20px 13px",
    borderBottom: "1px solid rgba(35,31,32,0.08)",
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
  creditChip: {
    display: "flex", alignItems: "center", gap: 7,
    background: INK, color: "#fff", border: "none", borderRadius: 999,
    padding: "9px 15px", fontSize: 12.5, fontFamily: "'Quicksand', sans-serif",
    fontWeight: 600, letterSpacing: "0.02em", cursor: "pointer",
  },
  creditDot: {
    width: 7, height: 7, borderRadius: "50%",
    background: "#f9c83c", display: "inline-block",
  },
  main: { flex: 1, padding: "24px 20px 28px" },
  footer: {
    fontSize: 10, letterSpacing: "0.02em", textAlign: "center",
    padding: "12px 20px 20px", opacity: 0.45, lineHeight: 1.6,
    fontFamily: "'Quicksand', sans-serif", fontWeight: 500,
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
    width: "100%", aspectRatio: "4/3", background: "#fff",
    border: "2.5px dashed " + ACCENT + "55", borderRadius: 22,
    display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", gap: 8, cursor: "pointer",
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
  consentRow: {
    display: "flex", gap: 10, alignItems: "flex-start",
    margin: "18px 0", cursor: "pointer",
  },
  checkbox: { marginTop: 1, width: 17, height: 17, accentColor: ACCENT },
  consentText: { fontSize: 11.5, lineHeight: 1.6, opacity: 0.7, fontWeight: 500 },
  primaryBtn: {
    width: "100%", background: ACCENT, color: "#fff", border: "none",
    borderRadius: 16, padding: "16px", fontSize: 15, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", letterSpacing: "0.02em",
    cursor: "pointer", boxShadow: "0 6px 18px " + ACCENT + "40",
  },
  secondaryBtn: {
    width: "100%", background: "#fff", color: INK,
    border: "2px solid " + INK + "22", borderRadius: 16, padding: "15px",
    fontSize: 15, fontWeight: 700, fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer",
  },
  moreBtn: {
    background: "#fff", color: INK,
    border: "1.5px solid " + INK + "22", borderRadius: 999,
    padding: "10px 22px", fontSize: 12.5, fontWeight: 700,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    letterSpacing: "0.02em",
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
  catChip: {
    flexShrink: 0, background: "#fff",
    border: "2px solid " + INK + "16", borderRadius: 999,
    padding: "8px 15px", fontSize: 12.5, fontWeight: 600,
    fontFamily: "'Quicksand', sans-serif", cursor: "pointer",
    color: INK, whiteSpace: "nowrap",
    display: "inline-flex", alignItems: "center", gap: 6,
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
  sensitiveToggle: {
    background: "#fff", border: "1.5px solid " + INK + "16",
    borderRadius: 999, padding: "6px 12px", fontSize: 11,
    fontWeight: 600, fontFamily: "'Quicksand', sans-serif",
    cursor: "pointer", color: INK + "cc",
  },
  sensitiveToggleOn: {
    background: INK, color: "#fff", borderColor: "transparent",
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
  sensitiveTag: {
    position: "absolute", top: 8, right: 8, fontWeight: 700,
    letterSpacing: "0.06em", background: ACCENT, color: "#fff",
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
  confirmTitle: {
    fontFamily: "'Jua', sans-serif", fontSize: 20, fontWeight: 400,
    lineHeight: 1.2,
  },
  confirmCat: {
    fontSize: 11, fontWeight: 700, color: ACCENT,
    marginTop: 4, marginBottom: 11,
  },
  sensitiveNotice: {
    fontSize: 11, lineHeight: 1.55, background: ACCENT + "12",
    color: ACCENT, padding: "9px 11px", borderRadius: 10,
    marginBottom: 11, fontWeight: 600,
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
