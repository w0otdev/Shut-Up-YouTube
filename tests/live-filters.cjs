// Optional network check against real YouTube cards in a temporary profile.
const { chromium, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");

(async () => {
  const root = path.resolve(__dirname, "..");
  const output = path.join(root, "test-results");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get("su_hideAI"))).toEqual({ su_hideAI: true });
    await worker.evaluate(() => chrome.storage.sync.set({ su_hideShorts: false, su_hideAI: false }));
    const page = await context.newPage();
    const errors = [];
    context.on("page", tab => tab.on("pageerror", error => {
      if (error.stack?.includes("chrome-extension://")) errors.push(error.message);
    }));
    page.on("pageerror", error => {
      if (error.stack?.includes("chrome-extension://")) errors.push(error.message);
    });
    await page.goto("https://www.youtube.com/results?search_query=AI-generated+video&hl=en", {
      waitUntil: "domcontentloaded", timeout: 45000
    });
    const aiTitle = page.locator("ytd-video-renderer #video-title").filter({ hasText: /\bAI[- ]generated\b/i }).first();
    await expect(aiTitle).toBeVisible({ timeout: 20000 });
    const href = await aiTitle.getAttribute("href");
    const title = (await aiTitle.textContent()).trim();
    const aiCard = page.locator("ytd-video-renderer").filter({ has: page.locator(`#video-title[href=${JSON.stringify(href)}]`) }).first();
    const shortsNav = page.locator("ytd-mini-guide-entry-renderer").filter({ has: page.locator('a[href="/shorts/"]') }).first();
    await expect(shortsNav).toBeVisible();
    const shortsShelf = page.locator("grid-shelf-view-model, ytd-reel-shelf-renderer").filter({ has: page.locator("ytm-shorts-lockup-view-model") }).first();
    await expect(shortsShelf).toBeVisible({ timeout: 15000 });
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 360, height: 600 });
    await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
    const shortsToggle = popup.getByRole("checkbox", { name: "Hide Shorts / Reels", exact: true });
    const aiToggle = popup.getByRole("checkbox", { name: "Hide AI-generated videos", exact: true });
    await shortsToggle.check({ force: true });
    await expect(shortsNav).toBeHidden();
    await expect(shortsShelf).toBeHidden();
    await expect(aiCard).toBeVisible();
    await aiToggle.check({ force: true });
    await expect(aiCard).toBeHidden();
    const filtered = await page.evaluate(() => ({
      shortCards: document.querySelectorAll("ytm-shorts-lockup-view-model[data-su-hide-shorts]").length,
      shortsShelves: document.querySelectorAll("ytd-reel-shelf-renderer[data-su-hide-shorts], grid-shelf-view-model[data-su-hide-shorts]").length,
      aiCards: document.querySelectorAll("ytd-video-renderer[data-su-hide-ai]").length
    }));
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "live-filters-youtube.png") });
    await popup.screenshot({ path: path.join(output, "live-filters-popup.png"), fullPage: true });
    await shortsToggle.uncheck({ force: true });
    await aiToggle.uncheck({ force: true });
    await expect(shortsNav).toBeVisible();
    await expect(shortsShelf).toBeVisible();
    await expect(aiCard).toBeVisible();
    expect(errors).toEqual([]);
    console.log(JSON.stringify({ url: page.url(), matchedVideo: { title, href }, filtered, restored: true, extensionErrors: errors }, null, 2));
  } finally {
    await context.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
