import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

// ─────────────────────────────────────────────────────────────
// 로컬 개발용 작은 다리:
// /api/<이름> 요청이 오면 api/<이름>.js 파일을 동적으로 불러와서
// Vercel 의 (req, res) 약속과 똑같이 동작하도록 해줌.
// 배포 후엔 Vercel 이 같은 일을 자동으로 해주므로
// 우리 api/*.js 코드는 한 줄도 바꾸지 않아도 됨.
// ─────────────────────────────────────────────────────────────
function vercelApiMiddleware(envVars) {
  return {
    name: "vercel-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();

        // URL 에서 함수 경로 뽑기 (예: /api/auth/naver/start?x=1 → "auth/naver/start")
        const subPath = req.url.split("?")[0].slice("/api/".length);
        if (!subPath) return next();
        // 안전: 상위 디렉토리 탈출 차단
        if (subPath.includes("..") || subPath.startsWith("/")) return next();
        // _ 또는 . 으로 시작하는 경로는 endpoint 아님 (공유 모듈 폴더)
        if (subPath.split("/").some((s) => s.startsWith("_") || s.startsWith(".")))
          return next();

        const filePath = resolve(process.cwd(), "api", `${subPath}.js`);

        // 요청 본문 모으기
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = raw;
        }

        // Vercel 스타일 응답 메서드 흉내내기
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (obj) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
          return res;
        };

        // 환경변수 주입 (.env.local 에서 읽은 값)
        for (const [k, v] of Object.entries(envVars)) {
          if (k.startsWith("VITE_")) continue; // VITE_ 는 브라우저용
          if (process.env[k] === undefined) process.env[k] = v;
        }

        try {
          // 파일 변경 시 새로 읽도록 캐시 깨기
          const mod = await server.ssrLoadModule(filePath);
          const handler = mod.default;
          if (typeof handler !== "function") {
            res.statusCode = 500;
            return res.end(
              JSON.stringify({ error: `${subPath}.js 에 default export 함수가 없습니다.` })
            );
          }
          await handler(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e?.message || String(e) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env, .env.local 등을 모두 읽음 ("" 접두사 = 모든 변수)
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), vercelApiMiddleware(env)],
  };
});
