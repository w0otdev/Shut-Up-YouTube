// Local, reproducible extension overhead measurement; never contacts YouTube.
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const fixture = fs.readFileSync(path.join(__dirname, "fixture.html"), "utf8");

(async () => {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`]
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(() => chrome.storage.sync.set({ su_hideAI: true, su_hideShorts: true }));
    await context.route("https://www.youtube.com/**", route => route.fulfill({ contentType: "text/html", body: fixture }));
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const contexts = [];
    cdp.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context));
    await cdp.send("Runtime.enable");
    await cdp.send("Performance.enable");
    await page.goto("https://www.youtube.com/watch?v=abcdefghijk");
    await page.waitForSelector("#ytvr-stretch-btn");
    let isolated;
    for (const context of contexts) {
      const check = await cdp.send("Runtime.evaluate", { expression: "typeof SU_WARNINGS !== 'undefined'", contextId: context.id }).catch(() => null);
      if (check?.result.value) { isolated = context; break; }
    }
    if (!isolated) throw new Error("Extension execution context not found");
    const evaluate = async expression => {
      const result = await cdp.send("Runtime.evaluate", { expression, contextId: isolated.id, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    await evaluate(`(() => {
      globalThis.perfCounts = { documentQueries: 0, elementQueries: 0, warnings: 0, logos: 0 };
      for (const [prototype, key] of [[Document.prototype, 'documentQueries'], [Element.prototype, 'elementQueries']]) {
        const original = prototype.querySelectorAll;
        prototype.querySelectorAll = function (...args) { perfCounts[key]++; return Reflect.apply(original, this, args); };
      }
      const tick = SU_WARNINGS.tick;
      SU_WARNINGS.tick = function (...args) { perfCounts.warnings++; return tick(...args); };
      const logo = suSyncLogo;
      globalThis.suSyncLogo = function (...args) { perfCounts.logos++; return logo(...args); };
    })()`);
    await page.waitForTimeout(250);
    const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));
    async function sample(work) {
      await evaluate("Object.keys(perfCounts).forEach(key => perfCounts[key] = 0)");
      const before = await metrics();
      await work();
      const after = await metrics();
      return { ...await evaluate("perfCounts"), taskMs: +(1000 * (after.TaskDuration - before.TaskDuration)).toFixed(2) };
    }
    const idle = await sample(() => page.waitForTimeout(2200));
    await page.evaluate(() => {
      const comments = document.createElement("ytd-comments"); comments.id = "churn"; document.body.append(comments);
    });
    await page.waitForTimeout(250);
    const unrelatedChurn = await sample(() => page.evaluate(() => new Promise(resolve => {
      let step = 0;
      const target = document.getElementById("churn");
      const timer = setInterval(() => {
        target.className = `frame-${step}`;
        target.style.opacity = step % 2 ? "0.99" : "1";
        target.textContent = `Live comment ${step++}`;
        if (step === 120) { clearInterval(timer); setTimeout(resolve, 150); }
      }, 16);
    })));
    const feed = await sample(async () => {
      await page.evaluate(() => {
        const feed = document.createElement("div"); feed.id = "benchmark-feed";
        for (let i = 0; i < 600; i++) {
          const card = document.createElement("ytd-video-renderer");
          const heading = document.createElement("h3");
          const link = document.createElement("a"); link.href = `/watch?v=bench${i}`;
          link.textContent = i % 3 ? "Real landscape" : "AI-generated landscape";
          heading.append(link); card.append(heading); feed.append(card);
        }
        document.body.append(feed);
      });
      await page.waitForFunction(() => document.querySelectorAll("#benchmark-feed [data-su-hide-ai]").length === 200);
      await page.waitForTimeout(200);
    });
    // Keep detached nodes strongly reachable only if the extension leaks them.
    await page.evaluate(() => document.getElementById("benchmark-feed").remove());
    await page.waitForTimeout(250);
    await cdp.send("HeapProfiler.collectGarbage");
    const beforeLogos = await cdp.send("Memory.getDOMCounters");
    for (let i = 0; i < 24; i++) {
      await page.evaluate(() => {
        const logo = document.createElement("ytd-logo");
        logo.append(document.createElementNS("http://www.w3.org/2000/svg", "svg"));
        document.querySelector("ytd-logo").replaceWith(logo);
      });
      await page.waitForTimeout(100);
    }
    await cdp.send("HeapProfiler.collectGarbage");
    const afterLogos = await cdp.send("Memory.getDOMCounters");
    const report = {
      idle, unrelatedChurn, feed,
      retainedNodesAfter24LogoReplacements: afterLogos.nodes - beforeLogos.nodes,
      heapUsedBytes: (await cdp.send("Runtime.getHeapUsage")).usedSize
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(report, null, 2) + "\n");
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
