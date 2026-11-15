// Exercise the actual warning, with the feature OFF and then ON in one session.
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const path = require("node:path");
(async () => {
  const url = new URL(process.argv.slice(2).find(value => value.startsWith("https://")) || "https://www.youtube.com/watch?v=NtKX__-qPSI");
  const coldStart = process.argv.includes("--cold");
  assert.equal(url.hostname, "www.youtube.com");
  assert.equal(url.pathname, "/watch");
  const root = path.resolve(__dirname, "..");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    // Wait for onInstalled defaults before saving the OFF preference.
    for (let i = 0; i < 30; i++) {
      if ((await worker.evaluate(() => chrome.storage.sync.get("ytvr_ratio"))).ytvr_ratio) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await worker.evaluate(enabled => chrome.storage.sync.set({ su_warningBypass: enabled }), coldStart);
    const page = await context.newPage();
    const extensionErrors = [];
    page.on("pageerror", error => { if (error.stack?.includes("chrome-extension://")) extensionErrors.push(error.message); });
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45000 });
    const snapshot = () => page.evaluate(() => {
      const player = document.getElementById("movie_player");
      const video = player?.querySelector("video");
      const prompt = document.querySelector("#error-screen");
      return {
        title: document.title,
        playability: player?.getPlayerResponse?.()?.playabilityStatus?.status,
        warningVisible: !!(prompt?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && prompt.getBoundingClientRect().width),
        readyState: video?.readyState, currentTime: video?.currentTime, paused: video?.paused
      };
    });
    if (!coldStart) {
      await page.waitForFunction(() => document.getElementById("movie_player")?.getPlayerResponse?.()?.playabilityStatus?.status === "CONTENT_CHECK_REQUIRED", null, { timeout: 15000 });
      await page.locator("yt-player-interstitial-renderer a[href*='rco=1']").waitFor({ state: "visible", timeout: 15000 });
      const before = await snapshot();
      assert.equal(before.warningVisible, true, "Expected a real warning with bypass OFF");
      console.log(JSON.stringify({ stage: "OFF", ...before }));
      await worker.evaluate(() => chrome.storage.sync.set({ su_warningBypass: true }));
    }
    await page.waitForFunction(() => {
      const player = document.getElementById("movie_player");
      return player?.getPlayerResponse?.()?.playabilityStatus?.status === "OK" && player.querySelector("video")?.readyState >= 2;
    }, null, { timeout: 30000 });
    const after = await snapshot();
    await page.waitForTimeout(2500);
    const later = await snapshot();
    const playbackConfirmed = later.currentTime > after.currentTime && !later.paused;
    console.log(JSON.stringify({ stage: coldStart ? "COLD START ON" : "ON", after, later, playbackConfirmed, extensionErrors }, null, 2));
    assert.equal(later.warningVisible, false);
    assert.equal(playbackConfirmed, true, "Video did not actually advance after confirmation");
    assert.deepEqual(extensionErrors, []);
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
