import pw from "/Users/home/Documents/mimo/node_modules/playwright/index.js"; const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 2000 } });
await p.goto("file://" + process.cwd() + "/index.html", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
for (let i = 1; i <= 7; i++) await p.locator("#s" + i).screenshot({ path: `0${i}.png` });
await b.close();
