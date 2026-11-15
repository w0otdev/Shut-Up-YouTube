// Optional network check. A bot/login/age block is reported, never counted as playback success.
const { chromium } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
(async () => {
  const root = path.resolve(__dirname, "..");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const page = await context.newPage();
    const extensionErrors = [];
    page.on("pageerror", error => { if (error.stack?.includes("chrome-extension://")) extensionErrors.push(error.message); });
    await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#movie_player, form[action*='consent']", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(5000);
    await worker.evaluate(() => chrome.storage.sync.set({ ytvr_autoStretch: false, ytvr_ratio: "219" }));
    await page.waitForTimeout(1000);
    const snapshot = () => page.evaluate(() => {
      const video = document.querySelector("#movie_player video");
      const box = video?.getBoundingClientRect();
      return {
        url: location.href, title: document.title,
        buttons: document.querySelectorAll(".ytvr-control-btn").length,
        premiumLogos: document.querySelectorAll("svg[data-su-premium]").length,
        video: video ? { paused: video.paused, currentTime: video.currentTime, readyState: video.readyState, width: box.width, height: box.height, error: video.error?.code } : null,
        errorText: document.querySelector("#error-screen")?.textContent?.trim().slice(0, 600),
        filteredResponses: document.documentElement.getAttribute("data-su-filtered-count"),
        nativeTrustedTypes: trustedTypes.defaultPolicy === null
      };
    });
    const before = await snapshot();
    await page.waitForTimeout(2000);
    const after = await snapshot();
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    await page.screenshot({ path: path.join(root, "test-results", "live-youtube.png") });
    console.log(JSON.stringify({ before, after, playbackConfirmed: !!(after.video?.readyState >= 2 && after.video.currentTime > before.video?.currentTime), extensionErrors }, null, 2));
    if (extensionErrors.length) process.exitCode = 1;
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
