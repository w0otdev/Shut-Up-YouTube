"use strict";
{
  let settings = SU_SETTINGS.normalize();
  let ready = false;
  let timer = null;
  let dirty = 0;
  let observedPlayer = null;
  const changesDuringLoad = {};
  const ratioValues = { "169": 16 / 9, "219": 21 / 9, "329": 32 / 9 };
  const errorSelectors = "yt-playability-error-supported-renderers, yt-player-error-message-renderer, #error-screen, ytd-enforcement-message-view-model";
  const { PLAYER, LOGO, WARNING, ALL } = SU_ACTIVITY;
  const resizeObserver = new ResizeObserver(() => schedule(PLAYER));

  function setAttribute(element, name, value) {
    if (element.getAttribute(name) !== String(value)) element.setAttribute(name, String(value));
  }

  function visible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
  }

  function mode() {
    const flexy = document.querySelector("ytd-watch-flexy");
    if (document.fullscreenElement || flexy?.hasAttribute("fullscreen")) return "fullscreen";
    return flexy?.hasAttribute("theater") ? "theater" : "default";
  }

  function stretchActive() {
    return settings.ytvr_enabled && (!settings.ytvr_autoStretch || mode() !== "default");
  }

  function applyRatio(player) {
    if (player !== observedPlayer) {
      resizeObserver.disconnect();
      observedPlayer = player;
      if (player) resizeObserver.observe(player);
    }
    if (!player) return;
    const active = stretchActive();
    player.classList.toggle("ytvr-stretch-enabled", active);
    player.classList.toggle("ytvr-ratio-cover", active && settings.ytvr_ratio === "cover");
    if (!active) {
      player.style.removeProperty("--su-video-width");
      player.style.removeProperty("--su-video-height");
      return;
    }
    const width = player.clientWidth;
    const height = player.clientHeight;
    const ratio = ratioValues[settings.ytvr_ratio];
    // Fixed ratios fit inside the player; fill/cover use the full player bounds.
    const videoWidth = ratio ? Math.min(width, height * ratio) : width;
    const videoHeight = ratio ? videoWidth / ratio : height;
    for (const [name, value] of [["--su-video-width", videoWidth], ["--su-video-height", videoHeight]]) {
      const pixels = `${value}px`;
      if (player.style.getPropertyValue(name) !== pixels) player.style.setProperty(name, pixels);
    }
  }

  function save(patch) {
    settings = SU_SETTINGS.normalize({ ...settings, ...patch });
    applySettings();
    chrome.storage.sync.set(patch).catch(() => {
      // Reflect the persisted state if sync storage rejected the write.
      chrome.storage.sync.get(Object.keys(SU_SETTINGS.defaults)).then(data => {
        settings = SU_SETTINGS.normalize(data);
        applySettings();
      }).catch(() => {});
    });
  }

  function playerButtons(player) {
    const right = player?.querySelector(".ytp-right-controls");
    if (!right) return;
    let box = right.querySelector(".ytvr-button-container");
    if (!box) {
      box = document.createElement("div");
      box.className = "ytvr-button-container";
      for (const [id, text, key] of [["ytvr-stretch-btn", "FIT", "ytvr_enabled"], ["ytvr-auto-stretch-btn", "AUTO", "ytvr_autoStretch"]]) {
        const button = document.createElement("button");
        button.id = id;
        button.type = "button";
        button.className = "ytp-button ytvr-control-btn";
        button.textContent = text;
        button.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          save({ [key]: !settings[key] });
        });
        box.appendChild(button);
      }
      right.prepend(box);
    }
    const fit = box.querySelector("#ytvr-stretch-btn");
    const auto = box.querySelector("#ytvr-auto-stretch-btn");
    const fitTitle = !settings.ytvr_enabled ? "Video fit OFF" : stretchActive() ?
      `Video fit ON (${settings.ytvr_ratio})` : "Video fit waiting for theater/fullscreen (AUTO is on)";
    for (const [button, on, title] of [[fit, settings.ytvr_enabled, fitTitle], [auto, settings.ytvr_autoStretch, settings.ytvr_autoStretch ? "AUTO ON: fit only in theater/fullscreen" : "AUTO OFF: fit in every player mode"]]) {
      button.classList.toggle("active", on);
      setAttribute(button, "aria-pressed", on);
      setAttribute(button, "aria-label", title);
      setAttribute(button, "title", title);
    }
  }

  function blockerVisible() {
    return [...document.querySelectorAll(errorSelectors)].some(error => visible(error) &&
      /ad\s*block(?:er|ing)?|adblock|chặn quảng cáo|bloqueur de publicit|bloqueador de anuncios|werbeblocker/i.test(error.textContent || ""));
  }

  function skipAd(player) {
    if (!settings.su_adblockFix || !player?.classList.contains("ad-showing")) return;
    const skip = player.querySelector(".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button");
    if (visible(skip) && !skip.disabled) skip.click();
  }

  function status() {
    const player = document.getElementById("movie_player");
    let playback = "Ad filtering is ready for the next player response.";
    if (!settings.su_adblockFix) playback = "Adblock bypass is off.";
    else if (blockerVisible()) playback = "YouTube denied playback. Ad filtering cannot override a server-side block.";
    else if (Number(document.documentElement.getAttribute("data-su-filtered-count")) > 0) playback = "Ad fields removed from player responses on this page.";
    return {
      warning: SU_WARNINGS.status(),
      playback,
      stretch: !settings.ytvr_enabled ? "Video fit is off." : !player ? "No video player on this page." :
        !stretchActive() ? "AUTO is on: switch to theater/fullscreen, or turn AUTO off." : `Video fit is active: ${settings.ytvr_ratio}.`
    };
  }

  function applySettings() {
    if (!ready || !document.documentElement) return;
    const root = document.documentElement;
    root.classList.toggle("su-adblock-on", settings.su_adblockFix);
    root.classList.toggle("su-playables-on", settings.su_hidePlayables);
    SU_FILTERS.sync(settings);
    if (!settings.su_warningBypass) SU_WARNINGS.tick(false);
    setAttribute(root, "data-su-adblock", settings.su_adblockFix ? "1" : "0");
    schedule(ALL);
  }

  function refresh() {
    timer = null;
    if (!ready || !document.documentElement || document.hidden) return;
    const work = dirty;
    dirty = 0;
    if (work & (PLAYER | WARNING)) SU_ACTIVITY.bind();
    if (work & LOGO) suSyncLogo(settings.su_premiumLogo);
    if (work & PLAYER) {
      const player = document.getElementById("movie_player");
      playerButtons(player);
      applyRatio(player);
      skipAd(player);
    }
    if (work & WARNING) SU_WARNINGS.tick(settings.su_warningBypass);
  }

  function schedule(work = ALL) {
    dirty |= work;
    if (timer !== null || !ready || document.hidden) return;
    timer = setTimeout(refresh, 16);
  }

  function resume() {
    SU_ACTIVITY.start(schedule);
    applySettings();
  }

  function suspend() {
    SU_ACTIVITY.stop();
    resizeObserver.disconnect();
    observedPlayer = null;
    SU_WARNINGS.suspend();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const patch = {};
    for (const key of Object.keys(SU_SETTINGS.defaults)) {
      if (changes[key]) patch[key] = changes[key].newValue;
    }
    if (!Object.keys(patch).length) return;
    if (!ready) Object.assign(changesDuringLoad, patch);
    settings = SU_SETTINGS.normalize({ ...settings, ...patch });
    applySettings();
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "su-status") sendResponse(status());
  });

  document.addEventListener("fullscreenchange", () => schedule(PLAYER));
  window.addEventListener("resize", () => schedule(PLAYER), { passive: true });
  window.addEventListener("yt-navigate-finish", () => schedule(ALL));
  window.addEventListener("popstate", () => schedule(ALL));
  document.addEventListener("DOMContentLoaded", applySettings, { once: true });
  document.addEventListener("loadeddata", event => {
    if (event.target.matches?.("#movie_player video")) schedule(WARNING);
  }, true);
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : resume());
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", () => { if (!document.hidden) resume(); });
  chrome.storage.sync.get(Object.keys(SU_SETTINGS.defaults)).then(data => {
    settings = SU_SETTINGS.normalize({ ...data, ...changesDuringLoad });
    ready = true;
    if (!document.hidden) resume();
    else applySettings();
  }).catch(() => {
    // Keep hooks disabled if saved preferences cannot be read.
  });
}
