// Check sustained playback after real recommendation clicks, not just a cold URL.
const { chromium, expect } = require("@playwright/test");
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
    await worker.evaluate(() => chrome.storage.sync.set({ su_adblockFix: true }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => { if (error.stack?.includes("chrome-extension://")) errors.push(error.message); });
    const samples = [];
    const snapshot = () => page.evaluate(() => {
      const player = document.getElementById("movie_player");
      const video = player?.querySelector("video");
      return {
        url: location.href, videoId: player?.getVideoData?.().video_id,
        time: video?.currentTime, duration: video?.duration, ready: video?.readyState,
        state: player?.getPlayerState?.(), error: video?.error?.message,
        errorText: document.getElementById("error-screen")?.textContent.trim(),
        filteringEnabled: document.documentElement.getAttribute("data-su-adblock")
      };
    });
    await page.goto(process.argv[2] || "https://www.youtube.com/watch?v=-waNz9GKgkU", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.evaluate(() => { window.navigationSentinel = "keep-document"; });
    for (let index = 0; index < 3; index++) {
      const id = new URL(page.url()).searchParams.get("v");
      await expect.poll(async () => {
        const value = await snapshot();
        return value.videoId === id && value.ready >= 2 && value.time > 2 && value.state === 1;
      }, { timeout: 25000 }).toBe(true);
      const before = await snapshot();
      await page.waitForTimeout(7000);
      const after = await snapshot();
      samples.push({ before, after });
      console.log(JSON.stringify({ step: index, before, after }));
      expect(after.filteringEnabled).toBe("1");
      expect(after.videoId).toBe(id);
      expect(after.time).toBeGreaterThan(before.time + 3);
      expect(after.duration).toBeGreaterThan(0);
      expect(after.error).toBeUndefined();
      expect(await page.evaluate(() => window.navigationSentinel)).toBe("keep-document");
      if (index < 2) {
        const links = page.locator("#secondary a[href*='/watch?']");
        await links.first().waitFor({ timeout: 15000 });
        const href = await links.evaluateAll((anchors, id) => anchors.find(anchor => {
          const url = new URL(anchor.href);
          return anchor.getClientRects().length && url.searchParams.get("v") !== id;
        })?.getAttribute("href"), id);
        if (!href) throw new Error("No visible recommendation to click");
        const next = new URL(href, page.url()).searchParams.get("v");
        await page.locator(`#secondary a[href=${JSON.stringify(href)}]`).first().click();
        await page.waitForURL(url => url.searchParams.get("v") === next, { timeout: 15000 });
      }
    }
    expect(errors).toEqual([]);
    fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
    fs.writeFileSync(path.join(root, "test-results", "live-navigation.json"), JSON.stringify({ samples, errors }, null, 2));
    await page.screenshot({ path: path.join(root, "test-results", "live-navigation.png") });
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
