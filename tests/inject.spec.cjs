const { test, expect } = require("@playwright/test");
const path = require("node:path");

async function hooks(page) {
  await page.goto("about:blank");
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-su-adblock", "1");
    window.bodyPulls = 0;
    window.cancelled = false;
    window.fetch = async () => new Response(new ReadableStream({
      start(controller) { window.bodyController = controller; },
      pull() { window.bodyPulls++; },
      cancel() { window.cancelled = true; }
    }, { highWaterMark: 0 }), { headers: { "content-type": "application/json" } });
  });
  await page.addScriptTag({ path: path.join(__dirname, "..", "inject.js") });
}

test("fetch resolves at headers without pulling or cloning an unread player body", async ({ page }) => {
  await hooks(page);
  const result = await page.evaluate(async () => {
    const pending = fetch("https://www.youtube.com/youtubei/v1/player");
    const response = await Promise.race([pending, new Promise(resolve => setTimeout(() => resolve(null), 150))]);
    if (!response) return { resolved: false };
    window.playerResponse = response;
    return { resolved: true, pulls: bodyPulls, bodyUsed: response.bodyUsed };
  });
  expect(result).toEqual({ resolved: true, pulls: 0, bodyUsed: false });
  const data = await page.evaluate(async () => {
    const clone = playerResponse.clone();
    const a = playerResponse.json(); const b = clone.text();
    bodyController.enqueue(new TextEncoder().encode('{"adSlots":[1],"playabilityStatus":{"status":"OK"},"title":"cảnh đẹp"}'));
    bodyController.close();
    return { json: await a, text: JSON.parse(await b), bodyUsed: playerResponse.bodyUsed };
  });
  expect(data.json).toEqual({ playabilityStatus: { status: "OK" }, title: "cảnh đẹp" });
  expect(data.text).toEqual(data.json);
  expect(data.bodyUsed).toBe(true);
});

test("cancelling a player body propagates to the original stream", async ({ page }) => {
  await hooks(page);
  expect(await page.evaluate(async () => {
    const response = await fetch("https://www.youtube.com/youtubei/v1/player");
    await response.body.cancel("navigation");
    return cancelled;
  })).toBe(true);
});

test("text reads filter escaped ad keys and preserve errors and malformed text", async ({ page }) => {
  await hooks(page);
  for (const [input, expected] of [
    ['{"ad\\u0053lots":[1],"playabilityStatus":{"status":"LOGIN_REQUIRED"}}', '{"playabilityStatus":{"status":"LOGIN_REQUIRED"}}'],
    ['not json with "adSlots":', 'not json with "adSlots":'],
    ['{"title":"Nothing to filter"}', '{"title":"Nothing to filter"}']
  ]) {
    expect(await page.evaluate(async input => {
      const response = await fetch("https://www.youtube.com/youtubei/v1/player");
      const result = response.text();
      const bytes = new TextEncoder().encode(input);
      // Decode across arbitrary network chunk boundaries.
      bodyController.enqueue(bytes.slice(0, 7)); bodyController.enqueue(bytes.slice(7)); bodyController.close();
      return result;
    }, input)).toBe(expected);
  }
});

test("player responses retain native identity, metadata and BYOB byte-stream reads", async ({ page }) => {
  const raw = '{"adSlots":[1],"videoDetails":{"videoId":"second-video"},"streamingData":{"formats":[{"url":"https://example.invalid/video"}]}}';
  await page.route("https://www.youtube.com/**", route => route.fulfill({
    contentType: route.request().url().includes("/player") ? "application/json" : "text/html",
    body: route.request().url().includes("/player") ? raw : "<!doctype html><html><body></body></html>"
  }));
  await page.goto("https://www.youtube.com/");
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-su-adblock", "1");
    const nativeFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      window.nativeResponse = response;
      window.nativeBody = response.body;
      return response;
    };
  });
  await page.addScriptTag({ path: path.join(__dirname, "..", "inject.js") });
  const result = await page.evaluate(async () => {
    const response = await fetch("/youtubei/v1/player");
    const sameResponse = response === nativeResponse;
    const sameBody = response.body === nativeBody;
    const clone = response.clone();
    const filtered = await clone.json();
    const reader = response.body.getReader({ mode: "byob" });
    const decoder = new TextDecoder();
    let raw = "";
    while (true) {
      const { value, done } = await reader.read(new Uint8Array(32));
      if (value) raw += decoder.decode(value, { stream: true });
      if (done) break;
    }
    raw += decoder.decode();
    reader.releaseLock();
    return { sameResponse, sameBody, raw, filtered, url: response.url, cloneUrl: clone.url, type: response.type, cloneType: clone.type };
  });
  expect(result.sameResponse).toBe(true);
  expect(result.sameBody).toBe(true);
  expect(result.raw).toBe(raw);
  expect(result.filtered.adSlots).toBeUndefined();
  expect(result.filtered.videoDetails.videoId).toBe("second-video");
  expect(result.url).toBe("https://www.youtube.com/youtubei/v1/player");
  expect(result.cloneUrl).toBe(result.url);
  expect(result.cloneType).toBe(result.type);
});

test("responses protected by another hook remain readable", async ({ page }) => {
  await hooks(page);
  // A frozen native Response must pass through without becoming a broken body.
  await page.evaluate(() => {
    window.fetch = async () => Object.freeze(new Response('{"adSlots":[1],"videoDetails":{"videoId":"protected"}}'));
  });
  await page.addScriptTag({ path: path.join(__dirname, "..", "inject.js") });
  expect(await page.evaluate(async () => (await fetch("https://www.youtube.com/youtubei/v1/player")).json()))
    .toEqual({ adSlots: [1], videoDetails: { videoId: "protected" } });
});
