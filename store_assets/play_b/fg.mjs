import pw from "/Users/home/Documents/mimo/node_modules/playwright/index.js"; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1100, height: 600 } });
await p.goto("file://" + process.cwd() + "/fg.html", { waitUntil: "networkidle" }); await p.waitForTimeout(500);
await p.locator("#fg").screenshot({ path: "feature-ko-1024x500.png" }); await b.close();
