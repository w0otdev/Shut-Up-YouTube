const { test: base, expect, chromium } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const fixture = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");
const warningFixture = fs.readFileSync(path.join(__dirname, "warning-interstitial.html"), "utf8");
const feedFixture = fs.readFileSync(path.join(__dirname, "feed-fixture.html"), "utf8");
const root = path.resolve(__dirname, "..");
const raw = { playabilityStatus: { status: "OK" }, streamingData: { formats: [{ url: "https://example.invalid/video" }] }, adPlacements: [1], playerAds: [2], adSlots: [3] };
const test = base.extend({
  extension: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium", headless: true,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await expect.poll(() => worker.evaluate(() => chrome.storage.sync.get("ytvr_ratio"))).toEqual({ ytvr_ratio: "fill" });
    const errors = [];
    context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
    await context.route("https://www.youtube.com/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/youtubei/")) return route.fulfill({ json: raw });
      return route.fulfill({ contentType: "text/html", headers: { "Content-Security-Policy": "require-trusted-types-for 'script'" }, body: fixture });
    });
    await context.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: fixture }));
    const page = await context.newPage();
    const set = patch => worker.evaluate(patch => chrome.storage.sync.set(patch), patch);
    const read = key => worker.evaluate(key => chrome.storage.sync.get(key), key);
    const open = async () => {
      await page.goto("https://www.youtube.com/watch?v=abcdefghijk");
      await expect(page.locator("#ytvr-stretch-btn")).toBeVisible();
    };
    await use({ context, page, worker, set, read, open, id: new URL(worker.url()).host });
    await context.close();
    expect(errors).toEqual([]);
  }
});

async function openFeed(e) {
  await e.context.route("**/watch?**", route => route.fulfill({
    contentType: "text/html", headers: { "Content-Security-Policy": "require-trusted-types-for 'script'" },
    body: fixture.replace("</body>", feedFixture + "</body>")
  }));
  await e.open();
}

async function isolatedWorld(e) {
  const cdp = await e.context.newCDPSession(e.page);
  const contexts = [];
  cdp.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context));
  await cdp.send("Runtime.enable");
  for (const context of contexts) {
    const check = await cdp.send("Runtime.evaluate", { expression: "typeof SU_WARNINGS !== 'undefined'", contextId: context.id });
    if (check.result.value) return async expression => {
      const result = await cdp.send("Runtime.evaluate", { expression, contextId: context.id, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
  }
  throw new Error("Extension world not found");
}

test("idle pages and unrelated comment updates do not rescan player, warnings or logos", async ({ extension: e }) => {
  await e.open();
  await e.page.waitForTimeout(250);
  const evaluate = await isolatedWorld(e);
  await evaluate(`(() => {
    globalThis.scanCounts = { queries: 0, warnings: 0, logos: 0 };
    const query = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function (...args) { scanCounts.queries++; return Reflect.apply(query, this, args); };
    const tick = SU_WARNINGS.tick;
    SU_WARNINGS.tick = (...args) => { scanCounts.warnings++; return tick(...args); };
    const logo = suSyncLogo;
    globalThis.suSyncLogo = (...args) => { scanCounts.logos++; return logo(...args); };
  })()`);
  await e.page.waitForTimeout(2200);
  await e.page.evaluate(() => new Promise(resolve => {
    const comments = document.createElement("ytd-comments"); document.body.append(comments);
    let updates = 0;
    const timer = setInterval(() => {
      comments.className = `update-${updates}`;
      comments.style.opacity = updates % 2 ? "1" : "0.9";
      comments.textContent = `Comment ${updates++}`;
      if (updates === 30) { clearInterval(timer); setTimeout(resolve, 100); }
    }, 20);
  }));
  expect(await evaluate("scanCounts")).toEqual({ queries: 0, warnings: 0, logos: 0 });
});

test("suspended tabs release queued work and catch up with replaced players and feed cards on resume", async ({ extension: e }) => {
  await openFeed(e);
  await expect(e.page.locator("#ai-title")).toBeHidden();
  const evaluate = await isolatedWorld(e);
  // Model the browser visibility transition in the extension's isolated world.
  await evaluate(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));`);
  await e.page.evaluate(() => {
    const card = document.createElement("ytd-video-renderer"); card.id = "background-card";
    const h3 = document.createElement("h3"); const a = document.createElement("a");
    a.href = "/watch?v=background1"; a.textContent = "Made with AI"; h3.append(a); card.append(h3);
    document.getElementById("feed").append(card);
    const player = document.getElementById("movie_player");
    const next = player.cloneNode(true); next.querySelector(".ytvr-button-container").remove(); player.replaceWith(next);
  });
  await e.page.waitForTimeout(200);
  await expect(e.page.locator("#background-card")).not.toHaveAttribute("data-su-hide-ai");
  await expect(e.page.locator("#ytvr-stretch-btn")).toHaveCount(0);
  await evaluate(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));`);
  await expect(e.page.locator("#background-card")).toBeHidden();
  await expect(e.page.locator("#ytvr-stretch-btn")).toHaveCount(1);
  await e.set({ ytvr_autoStretch: false, ytvr_ratio: "219" });
  await expect.poll(() => e.page.locator("video").evaluate(el => el.clientWidth / el.clientHeight)).toBeCloseTo(21 / 9, 2);
});

test("an existing warning reacts when its hidden wrapper becomes visible", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    const wrapper = document.createElement("div"); wrapper.id = "warning-wrapper"; wrapper.hidden = true;
    const dialog = document.createElement("yt-confirm-dialog-renderer");
    const button = document.createElement("button"); button.textContent = "I understand";
    button.onclick = () => { clicks.warning++; wrapper.remove(); };
    dialog.append(button); wrapper.append(dialog); document.body.append(wrapper);
  });
  await e.page.waitForTimeout(200);
  expect(await e.page.evaluate(() => clicks.warning)).toBe(0);
  await e.page.locator("#warning-wrapper").evaluate(el => { el.hidden = false; });
  await expect.poll(() => e.page.evaluate(() => clicks.warning)).toBe(1);
});

test("an ad skip button becoming enabled is handled without periodic polling", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    const player = document.getElementById("movie_player"); player.classList.add("ad-showing");
    const skip = document.createElement("button"); skip.className = "ytp-skip-ad-button";
    skip.textContent = "Skip"; skip.disabled = true; skip.hidden = true;
    skip.onclick = () => { clicks.skip++; player.classList.remove("ad-showing"); };
    player.append(skip);
  });
  await e.page.waitForTimeout(200);
  expect(await e.page.evaluate(() => clicks.skip)).toBe(0);
  await e.page.locator(".ytp-skip-ad-button").evaluate(el => { el.hidden = false; el.disabled = false; });
  await expect.poll(() => e.page.evaluate(() => clicks.skip)).toBe(1);
});

test("disabling filters cancels a large in-flight feed batch without leaving hidden cards", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    const feed = document.createElement("div"); feed.id = "large-feed";
    for (let i = 0; i < 1200; i++) {
      const card = document.createElement("ytd-video-renderer");
      const heading = document.createElement("h3"); const a = document.createElement("a");
      a.href = `/watch?v=large${i}`; a.textContent = "AI-generated landscape";
      heading.append(a); card.append(heading); feed.append(card);
    }
    document.body.append(feed);
  });
  await e.set({ su_hideAI: false, su_hideShorts: false });
  await e.page.waitForTimeout(250);
  await expect(e.page.locator("#large-feed [data-su-hide-ai], #large-feed [data-su-hide-shorts]")).toHaveCount(0);
  await e.set({ su_hideAI: true });
  await expect(e.page.locator("#large-feed [data-su-hide-ai]")).toHaveCount(1200);
});

test("feed defaults hide Shorts and explicit AI metadata without hiding mixed shelves, channels or the player", async ({ extension: e }) => {
  await openFeed(e);
  for (const id of ["shorts-nav", "shorts-mini-nav", "shorts-section", "shorts-search", "shorts-card", "shorts-absolute", "short-mixed",
    "modern-shorts-grid", "modern-ai-cell", "ai-title", "ai-badge", "ai-description", "ai-vietnamese", "ai-disclosure", "ai-vietnamese-label", "ai-short"]) {
    await expect(e.page.locator(`#${id}`)).toBeHidden();
  }
  for (const id of ["mixed-shelf", "modern-mixed-grid", "modern-normal-cell", "normal-mixed", "normal-ai-topic", "normal-ai-channel", "normal-negation", "normal-vietnamese", "normal-query", "normal-external", "recycled", "movie_player"]) {
    await expect(e.page.locator(`#${id}`)).toBeVisible();
  }
});

test("popup feed filters are independent, reversible and persist across reloads", async ({ extension: e }) => {
  await openFeed(e);
  const popup = await e.context.newPage();
  await popup.goto(`chrome-extension://${e.id}/popup.html`);
  const shorts = popup.getByRole("checkbox", { name: "Hide Shorts / Reels", exact: true });
  const ai = popup.getByRole("checkbox", { name: "Hide AI-generated videos", exact: true });
  await expect(shorts).toBeEnabled();
  await expect(shorts).toBeChecked();
  await expect(ai).toBeChecked();
  await shorts.uncheck({ force: true });
  await expect(e.page.locator("#shorts-section")).toBeVisible();
  await expect(e.page.locator("#shorts-card")).toBeVisible();
  await expect(e.page.locator("#modern-shorts-grid")).toBeVisible();
  await expect(e.page.locator("#modern-ai-cell")).toBeHidden();
  await expect(e.page.locator("#ai-short")).toBeHidden();
  await ai.uncheck({ force: true });
  await expect(e.page.locator("#ai-short")).toBeVisible();
  await expect(e.page.locator("#ai-title")).toBeVisible();
  await expect(e.page.locator("#modern-ai-cell")).toBeVisible();
  await expect(e.page.locator("#native-hidden")).toBeHidden();
  await e.page.reload();
  await popup.reload();
  await expect(popup.locator("#shortsToggle")).not.toBeChecked();
  await expect(popup.locator("#aiToggle")).not.toBeChecked();
  await expect(e.page.locator("#ai-title")).toBeVisible();
  await shorts.check({ force: true });
  await expect(e.page.locator("#ai-short")).toBeHidden();
  await expect(e.page.locator("#ai-title")).toBeVisible();
  await ai.check({ force: true });
  await expect(e.page.locator("#ai-title")).toBeHidden();
  await expect(e.page.locator("#native-hidden")).toHaveAttribute("hidden", "");
});

test("saved disabled feed filters are respected on the initial load", async ({ extension: e }) => {
  await e.set({ su_hideShorts: false, su_hideAI: false });
  await openFeed(e);
  await expect(e.page.locator("#shorts-section")).toBeVisible();
  await expect(e.page.locator("#ai-title")).toBeVisible();
  await expect(e.page.locator("[data-su-hide-shorts], [data-su-hide-ai]")).toHaveCount(0);
  await e.set({ su_hideAI: true });
  await expect(e.page.locator("#ai-title")).toBeHidden();
  await expect(e.page.locator("#shorts-section")).toBeVisible();
});

test("infinite scroll and SPA replacement filter new cards and collapse their outer grid cells", async ({ extension: e }) => {
  await openFeed(e);
  await e.page.evaluate(() => {
    window.feedNavigationSentinel = 42;
    history.pushState({}, "", "/results?search_query=landscape");
    const container = document.createElement("div");
    for (const [id, title, href] of [["late-ai", "AI-generated music", "/watch?v=late0000001"], ["late-short", "A Short", "/shorts/late0000002"], ["late-normal", "Real music", "/watch?v=late0000003"]]) {
      const card = document.createElement("ytd-rich-item-renderer"); card.id = id;
      const inner = document.createElement("yt-lockup-view-model");
      const heading = document.createElement("h3"); const link = document.createElement("a");
      link.textContent = title; link.href = href; heading.append(link); inner.append(heading); card.append(inner); container.append(card);
    }
    document.getElementById("feed").replaceChildren(container);
    window.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect(e.page.locator("#late-ai")).toBeHidden();
  await expect(e.page.locator("#late-short")).toBeHidden();
  await expect(e.page.locator("#late-normal")).toBeVisible();
  await e.set({ su_hideShorts: false, su_hideAI: false });
  await expect(e.page.locator("#late-ai")).toBeVisible();
  await expect(e.page.locator("#late-short")).toBeVisible();
  expect(await e.page.evaluate(() => feedNavigationSentinel)).toBe(42);
});

test("recycled cards react to text, title, aria-label and href changes and restore after removal", async ({ extension: e }) => {
  await openFeed(e);
  const card = e.page.locator("#recycled");
  const title = card.locator("h3 a");
  await title.evaluate(el => { el.firstChild.data = "AI-generated landscape"; });
  await expect(card).toBeHidden();
  await title.evaluate(el => { el.firstChild.data = "Real landscape"; });
  await expect(card).toBeVisible();
  await title.evaluate(el => el.setAttribute("title", "Video do AI tạo"));
  await expect(card).toBeHidden();
  await title.evaluate(el => el.removeAttribute("title"));
  await expect(card).toBeVisible();
  await card.locator("badge-shape").evaluate(el => el.setAttribute("aria-label", "Made with AI"));
  await expect(card).toBeHidden();
  await card.locator("ytd-badge-supported-renderer").evaluate(el => el.remove());
  await expect(card).toBeVisible();
  await title.evaluate(el => el.setAttribute("href", "/shorts/reused00001"));
  await expect(card).toBeHidden();
  await title.evaluate(el => el.setAttribute("href", "/watch?v=reused00001"));
  await expect(card).toBeVisible();
});

test("a repurposed Shorts shelf loses its filter marker when YouTube removes its Shorts identity", async ({ extension: e }) => {
  await openFeed(e);
  await e.page.locator("#shorts-section ytd-rich-shelf-renderer").evaluate(el => {
    el.removeAttribute("is-shorts");
    el.textContent = "Regular videos";
  });
  await expect(e.page.locator("#shorts-section")).toBeVisible();
  await expect(e.page.locator("#shorts-section ytd-rich-shelf-renderer")).toBeVisible();
});

test("saved OFF preferences are respected on first load, including MAIN-world responses", async ({ extension: e }) => {
  await e.set({ su_adblockFix: false, su_warningBypass: false, su_hidePlayables: false, su_premiumLogo: false, ytvr_enabled: false });
  await e.open();
  await expect(e.page.locator("html")).toHaveAttribute("data-su-adblock", "0");
  await expect(e.page.locator("#original-logo")).toHaveCount(1);
  await expect(e.page.locator("#games")).toBeVisible();
  await expect(e.page.locator("#ad-slot")).toBeVisible();
  await expect(e.page.locator("#movie_player")).not.toHaveClass(/ytvr-stretch-enabled/);
  const result = await e.page.evaluate(async () => ({ initial: ytInitialPlayerResponse, fetched: await (await fetch("/youtubei/v1/player")).json(), storageOverridden: Object.hasOwn(document, "hasStorageAccess"), policy: trustedTypes.defaultPolicy }));
  expect(result.initial.adPlacements).toEqual([{ id: 1 }]);
  expect(result.fetched).toEqual(raw);
  expect(result.storageOverridden).toBe(false);
  expect(result.policy).toBe(null);
});

test("popup toggles affect page immediately and follow the player controls", async ({ extension: e }) => {
  await e.open();
  const popup = await e.context.newPage();
  await popup.goto(`chrome-extension://${e.id}/popup.html`);
  await expect(popup.locator("#adblockToggle")).toBeEnabled();
  for (const [id, target] of [["playablesToggle", "#games"], ["adblockToggle", "#ad-slot"]]) {
    await popup.locator(`#${id}`).uncheck({ force: true });
    await expect(e.page.locator(target)).toBeVisible();
    await popup.locator(`#${id}`).check({ force: true });
    await expect(e.page.locator(target)).toBeHidden();
  }
  await popup.locator("#logoToggle").uncheck({ force: true });
  await expect(e.page.locator("#original-logo")).toHaveCount(1);
  await popup.locator("#logoToggle").check({ force: true });
  await expect(e.page.locator("svg[data-su-premium]")).toHaveCount(1);
  await popup.locator("#autoStretchToggle").uncheck({ force: true });
  await expect(e.page.locator("#movie_player")).toHaveClass(/ytvr-stretch-enabled/);
  await popup.getByRole("button", { name: "21:9", exact: true }).click();
  await expect.poll(() => e.page.locator("video").evaluate(video => video.clientWidth / video.clientHeight)).toBeCloseTo(21 / 9, 2);
  await e.page.locator("#ytvr-stretch-btn").click();
  await expect(popup.locator("#enableToggle")).not.toBeChecked();
  await expect(popup.getByRole("button", { name: "21:9", exact: true })).toBeDisabled();
});

test("fit modes use player bounds, respond to resize, and restore native geometry", async ({ extension: e }) => {
  await e.open();
  await expect(e.page.locator("#ytvr-stretch-btn")).toHaveAttribute("title", /waiting/);
  await e.page.locator("ytd-watch-flexy").evaluate(el => el.setAttribute("theater", ""));
  const video = e.page.locator("video");
  await expect.poll(() => video.evaluate(el => el.getBoundingClientRect().width)).toBe(800);
  for (const [ratio, value] of [["169", 16 / 9], ["219", 21 / 9], ["329", 32 / 9]]) {
    await e.set({ ytvr_ratio: ratio });
    await expect.poll(() => video.evaluate(el => { const box = el.getBoundingClientRect(); return box.width / box.height; })).toBeCloseTo(value, 3);
  }
  await e.set({ ytvr_ratio: "cover" });
  await expect(video).toHaveCSS("object-fit", "cover");
  await e.page.locator("#movie_player").evaluate(el => { el.style.width = "600px"; el.style.height = "400px"; });
  await expect.poll(() => video.evaluate(el => el.getBoundingClientRect().width)).toBe(600);
  await e.set({ ytvr_ratio: "fill" });
  await expect(video).toHaveCSS("object-fit", "fill");
  await expect.poll(() => video.evaluate(el => el.getBoundingClientRect().height)).toBe(400);
  await e.page.locator("ytd-watch-flexy").evaluate(el => el.removeAttribute("theater"));
  await expect(video).toHaveCSS("width", "640px");
  await e.page.locator("ytd-watch-flexy").evaluate(el => el.setAttribute("fullscreen", ""));
  await expect(video).toHaveCSS("width", "600px");
  await e.set({ ytvr_enabled: false });
  await expect(video).toHaveCSS("width", "640px");
  await expect(video).toHaveCSS("transform", "none");
});

test("delayed warning buttons work after the old four-second deadline, without clicking unrelated CTAs", async ({ extension: e }) => {
  await e.open();
  await e.page.waitForTimeout(4500);
  await e.page.evaluate(() => {
    const error = document.createElement("div"); error.id = "error-screen";
    for (const label of ["Sign in", "Get YouTube Premium", "I understand"]) {
      const button = document.createElement("button"); button.textContent = label;
      button.className = "yt-spec-button-shape-next--filled";
      button.onclick = () => {
        if (label === "I understand") { clicks.warning++; button.remove(); }
        else clicks.unrelated++;
      };
      error.append(button);
    }
    document.getElementById("movie_player").append(error);
  });
  await expect.poll(() => e.page.evaluate(() => clicks)).toEqual({ warning: 1, unrelated: 0, skip: 0 });
  await e.set({ su_warningBypass: false });
  await e.page.evaluate(() => {
    const button = document.createElement("button"); button.id = "content-warning-ok-button";
    button.textContent = "Tôi hiểu"; button.onclick = () => clicks.warning++;
    document.getElementById("error-screen").append(button);
  });
  await e.page.waitForTimeout(300);
  expect(await e.page.evaluate(() => clicks.warning)).toBe(1);
  await e.set({ su_warningBypass: true });
  await expect.poll(() => e.page.evaluate(() => clicks.warning)).toBe(2);
});

test("SPA player/logo replacement reattaches controls without reloading or duplicating them", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    window.navigationSentinel = 42;
    history.pushState({}, "", "/watch?v=lmnopqrstuv");
    const player = document.getElementById("movie_player");
    const replacement = player.cloneNode(true);
    replacement.querySelector(".ytvr-button-container").remove();
    player.replaceWith(replacement);
    const logo = document.querySelector("ytd-logo");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("data-new-original", ""); logo.replaceChildren(svg);
    window.dispatchEvent(new Event("yt-navigate-finish"));
  });
  await expect(e.page.locator(".ytvr-button-container")).toHaveCount(1);
  await e.page.locator("#ytvr-stretch-btn").click();
  await expect.poll(() => e.read("ytvr_enabled")).toEqual({ ytvr_enabled: false });
  expect(await e.page.evaluate(() => window.navigationSentinel)).toBe(42);
  await expect(e.page.locator("svg[data-su-premium]")).toHaveCount(1);
  await e.set({ su_premiumLogo: false });
  await expect(e.page.locator("svg[data-new-original]")).toHaveCount(1);
  expect(await e.page.evaluate(() => trustedTypes.defaultPolicy)).toBe(null);
});

test("MAIN-world filtering handles initial, fetch, Request, cloned response and XHR; OFF restores passthrough", async ({ extension: e }) => {
  await e.open();
  const initial = await e.page.evaluate(() => ytInitialPlayerResponse);
  expect(initial.adPlacements).toBeUndefined();
  expect(initial.streamingData).toEqual(raw.streamingData);
  const fetched = await e.page.evaluate(async () => {
    const response = await fetch(new Request(location.origin + "/youtubei/v1/player?prettyPrint=false"));
    return { value: await response.clone().json(), text: JSON.parse(await response.text()), url: response.url, status: response.status };
  });
  const clean = { playabilityStatus: raw.playabilityStatus, streamingData: raw.streamingData };
  expect(fetched.value).toEqual(clean); expect(fetched.text).toEqual(clean);
  expect(fetched.url).toContain("/youtubei/v1/player?"); expect(fetched.status).toBe(200);
  for (const type of ["", "text", "json"]) {
    const result = await e.page.evaluate(type => new Promise(resolve => {
      const xhr = new XMLHttpRequest(); xhr.open("GET", "/youtubei/v1/player"); xhr.responseType = type;
      xhr.onload = () => resolve(type === "json" ? xhr.response : JSON.parse(xhr.responseText)); xhr.send();
    }), type);
    expect(result).toEqual(clean);
  }
  expect(await e.page.evaluate(async () => (await fetch("/youtubei/v1/next")).json())).toEqual(raw);
  await e.set({ su_adblockFix: false });
  await expect(e.page.locator("html")).toHaveAttribute("data-su-adblock", "0");
  expect(await e.page.evaluate(async () => (await fetch("/youtubei/v1/player")).json())).toEqual(raw);
  expect(await e.page.evaluate(() => ytInitialPlayerResponse.adSlots)).toEqual([{ id: 3 }]);
});

test("hard blocks remain visible with an honest status and never trigger reload loops", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    window.navigationSentinel = 42;
    const error = document.createElement("div"); error.id = "error-screen";
    error.textContent = "Ad blockers violate YouTube's Terms of Service";
    document.getElementById("movie_player").append(error);
  });
  const status = () => e.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
    return chrome.tabs.sendMessage(tab.id, { type: "su-status" }, { frameId: 0 });
  });
  await expect.poll(async () => (await status()).playback).toContain("cannot override");
  await expect(e.page.locator("#error-screen")).toBeVisible();
  await expect(e.page.locator("iframe")).toHaveCount(0);
  await e.set({ su_adblockFix: false });
  await expect.poll(async () => (await status()).playback).toContain("off");
  await e.set({ su_adblockFix: true });
  await expect.poll(async () => (await status()).playback).toContain("cannot override");
  expect(await e.page.evaluate(() => window.navigationSentinel)).toBe(42);
});

test("login/age/unavailable errors stay intact, malformed player responses pass through", async ({ extension: e }) => {
  await e.open();
  await e.context.route("**/youtubei/v1/player**", route => route.fulfill({ json: { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm your age" }, adSlots: [1] } }));
  const response = await e.page.evaluate(async () => (await fetch("/youtubei/v1/player")).json());
  expect(response.playabilityStatus.status).toBe("LOGIN_REQUIRED");
  expect(response.streamingData).toBeUndefined();
  await e.page.evaluate(() => {
    const error = document.createElement("div"); error.id = "error-screen";
    error.textContent = "Sign in to confirm your age"; document.getElementById("movie_player").append(error);
  });
  await e.page.waitForTimeout(300);
  await expect(e.page.locator("#error-screen")).toBeVisible();
  await e.context.route("**/youtubei/v1/player**", route => route.fulfill({ contentType: "application/json", body: "not json" }));
  expect(await e.page.evaluate(async () => (await fetch("/youtubei/v1/player")).text())).toBe("not json");
});

test("visible ad skip control is clicked only while ad bypass is enabled", async ({ extension: e }) => {
  await e.set({ su_adblockFix: false }); await e.open();
  await e.page.evaluate(() => {
    const player = document.getElementById("movie_player"); player.classList.add("ad-showing");
    const skip = document.createElement("button"); skip.className = "ytp-skip-ad-button"; skip.textContent = "Skip";
    skip.onclick = () => { clicks.skip++; player.classList.remove("ad-showing"); };
    player.append(skip);
  });
  await e.page.waitForTimeout(300);
  expect(await e.page.evaluate(() => clicks.skip)).toBe(0);
  await e.set({ su_adblockFix: true });
  await expect.poll(() => e.page.evaluate(() => clicks.skip)).toBe(1);
});

test("existing YouTube embeds receive the same controls and live settings", async ({ extension: e }) => {
  await e.set({ ytvr_autoStretch: false, ytvr_ratio: "219" });
  await e.open();
  await e.page.evaluate(() => {
    const frame = document.createElement("iframe");
    frame.id = "existing-embed";
    frame.src = "https://www.youtube-nocookie.com/embed/abcdefghijk";
    document.body.append(frame);
  });
  const frame = e.page.frameLocator("#existing-embed");
  await expect(frame.locator("#ytvr-stretch-btn")).toHaveCount(1);
  await expect.poll(() => frame.locator("video").evaluate(el => { const box = el.getBoundingClientRect(); return box.width / box.height; })).toBeCloseTo(21 / 9, 3);
  await e.set({ ytvr_enabled: false, su_adblockFix: false, su_premiumLogo: false });
  await expect(frame.locator("video")).toHaveCSS("width", "640px");
  await expect(frame.locator("html")).toHaveAttribute("data-su-adblock", "0");
  await expect(frame.locator("#original-logo")).toHaveCount(1);
});

test("real interstitial anchors confirm the current video with original parameters and respect OFF", async ({ extension: e }) => {
  await e.set({ su_warningBypass: false });
  await e.context.route("**/watch?**", route => route.fulfill({ contentType: "text/html", body: fixture.replace("</body>", warningFixture + "</body>") }));
  await e.open();
  await expect(e.page.locator("#native-confirmation")).toBeVisible();
  expect(await e.page.evaluate(() => clicks.warning)).toBe(0);
  await e.set({ su_warningBypass: true });
  await expect(e.page.locator("#error-screen")).toHaveCount(0);
  expect(await e.page.evaluate(() => clicks)).toEqual({ warning: 1, unrelated: 0, skip: 0 });
  expect(await e.page.evaluate(() => confirmationHref)).toBe("/watch?v=abcdefghijk&pp=original-player-params&rco=1");
});

test("late hydration retries the same confirmation but stops after it succeeds", async ({ extension: e }) => {
  // The first click has no ready application handler, as on a hydrating page.
  const delayed = warningFixture.replace("window.clicks.warning++;", "window.clicks.warning++; if (window.clicks.warning < 2) return;");
  await e.context.route("**/watch?**", route => route.fulfill({ contentType: "text/html", body: fixture.replace("</body>", delayed + "</body>") }));
  await e.open();
  await expect.poll(() => e.page.evaluate(() => clicks.warning)).toBe(2);
  await expect(e.page.locator("#error-screen")).toHaveCount(0);
  await e.page.waitForTimeout(1500);
  expect(await e.page.evaluate(() => clicks.warning)).toBe(2);
});

test("a warning that refuses confirmation stays visible and retries are bounded", async ({ extension: e }) => {
  const refused = warningFixture.replace("document.getElementById('error-screen').remove();", "// The simulated server refuses to dismiss this warning.");
  await e.context.route("**/watch?**", route => route.fulfill({ contentType: "text/html", body: fixture.replace("</body>", refused + "</body>") }));
  await e.open();
  await expect.poll(() => e.page.evaluate(() => clicks.warning), { timeout: 12000 }).toBe(4);
  await e.page.waitForTimeout(1600);
  expect(await e.page.evaluate(() => clicks.warning)).toBe(4);
  await expect(e.page.locator("#error-screen")).toBeVisible();
  const status = await e.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
    return chrome.tabs.sendMessage(tab.id, { type: "su-status" }, { frameId: 0 });
  });
  expect(status.warning.state).toBe("failed");
});

test("a consent link is not followed to another video or an age-verification service", async ({ extension: e }) => {
  const refused = warningFixture.replace("v=abcdefghijk&amp;pp=", "v=lmnopqrstuv&amp;pp=");
  await e.context.route("**/watch?**", route => route.fulfill({ contentType: "text/html", body: fixture.replace("</body>", refused + "</body>") }));
  await e.open();
  await e.page.waitForTimeout(300);
  expect(await e.page.evaluate(() => clicks.warning)).toBe(0);
  await e.page.locator("#native-confirmation").evaluate(el => { el.href = "https://accounts.google.com/ServiceLogin"; el.textContent = "Đăng nhập để xác nhận độ tuổi"; });
  const status = () => e.worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
    return chrome.tabs.sendMessage(tab.id, { type: "su-status" }, { frameId: 0 });
  });
  await expect.poll(async () => (await status()).warning.state).toBe("age-required");
  await expect(e.page.locator("#error-screen")).toBeVisible();
  expect(await e.page.evaluate(() => clicks.warning)).toBe(0);
});

test("Vietnamese Continue in an age-warning dialog works and never clicks Sign in or Learn more", async ({ extension: e }) => {
  await e.open();
  await e.page.evaluate(() => {
    const dialog = document.createElement("yt-confirm-dialog-renderer");
    const heading = document.createElement("p"); heading.textContent = "Video có giới hạn độ tuổi. Người xem nên cẩn trọng.";
    dialog.append(heading);
    for (const label of ["Đăng nhập", "Tìm hiểu thêm", "Tiếp tục"]) {
      const button = document.createElement("button"); button.textContent = label;
      button.onclick = () => {
        if (label === "Tiếp tục") { clicks.warning++; dialog.remove(); }
        else clicks.unrelated++;
      };
      dialog.append(button);
    }
    document.body.append(dialog);
  });
  await expect.poll(() => e.page.evaluate(() => clicks)).toEqual({ warning: 1, unrelated: 0, skip: 0 });
  await expect(e.page.locator("yt-confirm-dialog-renderer")).toHaveCount(0);
});
