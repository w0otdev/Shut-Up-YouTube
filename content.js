"use strict";
{
  let settings = {
    adblockFix: true,
    warningBypass: true,
    hidePlayables: true,
    premiumLogo: true,
    enabled: true,
    ratio: "fill",
    autoStretch: true
  };
  let lastMode = null;
  let applyQueued = false;
  let stretchBtn = null;
  let autoBtn = null;
  let flexyObserver = null;

  let baseCss =
    "#cinematics,#cinematics-container{display:none!important}" +
    "html.su-adblock-on #player-ads,html.su-adblock-on .video-ads," +
    "html.su-adblock-on .ytp-ad-module,html.su-adblock-on .ytp-ad-overlay-container," +
    "html.su-adblock-on ytd-ad-slot-renderer,html.su-adblock-on ytd-in-feed-ad-layout-renderer," +
    "html.su-adblock-on ytd-banner-promo-renderer,html.su-adblock-on ytd-display-ad-renderer," +
    "html.su-adblock-on ytd-statement-banner-renderer,html.su-adblock-on ytd-masthead-ad-v3-renderer," +
    "html.su-adblock-on #masthead-ad{display:none!important}" +
    "html.su-playables-on ytd-merch-shelf-renderer,html.su-playables-on #ticket-shelf," +
    "html.su-playables-on ytd-mini-game-card-view-model," +
    "html.su-playables-on ytd-rich-section-renderer:has(a[href*='/playables'])," +
    "html.su-playables-on ytd-rich-shelf-renderer:has(a[href*='/playables'])," +
    "html.su-playables-on ytd-reel-shelf-renderer:has(a[href*='/playables'])," +
    "html.su-playables-on ytd-horizontal-card-list-renderer:has(a[href*='/playables'])," +
    "html.su-playables-on ytd-rich-section-renderer:has(ytd-mini-game-card-view-model)," +
    "html.su-playables-on ytd-rich-shelf-renderer:has(ytd-mini-game-card-view-model)," +
    "html.su-playables-on ytd-reel-shelf-renderer:has(ytd-mini-game-card-view-model)," +
    "html.su-playables-on ytd-guide-entry-renderer:has(a[href*='/playables'])," +
    "html.su-playables-on ytd-mini-guide-entry-renderer:has(a[href*='/playables']){" +
    "display:none!important}" +
    "#movie_player,.html5-video-player,video{transform:translateZ(0);backface-visibility:hidden}" +
    "#movie_player.ytvr-stretch-enabled{overflow:visible!important;contain:layout}" +
    "#movie_player.ytvr-stretch-enabled .html5-video-container{overflow:visible!important}" +
    "#movie_player.ytvr-stretch-enabled video{width:100vw!important;max-width:100vw!important;left:50%!important;transform:translateX(-50%)!important;object-fit:fill!important;contain:layout style}" +
    "#movie_player.ytvr-ratio-fill video{object-fit:fill!important}" +
    "#movie_player.ytvr-ratio-cover video{object-fit:cover!important}" +
    "#movie_player.ytvr-ratio-169 video{aspect-ratio:16/9!important}" +
    "#movie_player.ytvr-ratio-219 video{aspect-ratio:21/9!important}" +
    "#movie_player.ytvr-ratio-329 video{aspect-ratio:32/9!important}" +
    ".ytvr-button-container{display:inline-flex!important;align-items:center!important;height:100%!important;vertical-align:top}" +
    ".ytvr-control-btn{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:48px!important;height:100%!important;padding:0!important;background:transparent!important;border:none!important;cursor:pointer;opacity:0.9;position:relative;transition:opacity 0.1s ease}" +
    ".ytvr-control-btn:hover{opacity:1}" +
    ".ytvr-control-btn svg{width:24px!important;height:24px!important;fill:#fff;display:block;margin:auto;pointer-events:none;transition:fill 0.15s ease}" +
    ".ytvr-control-btn.active svg{fill:#ff0033}" +
    ".ytvr-control-btn::before{content:attr(data-tooltip);position:absolute;bottom:calc(100% + 12px);left:50%;transform:translateX(-50%) scale(0.92);background:rgba(28,28,28,0.95);color:#fff;padding:6px 10px;border-radius:4px;font-size:12px;font-weight:500;font-family:'Google Sans','Roboto',sans-serif;white-space:nowrap;opacity:0;visibility:hidden;transition:opacity 0.15s ease,transform 0.15s ease,visibility 0.15s;pointer-events:none;z-index:2147483647;line-height:1.2}" +
    ".ytvr-control-btn:hover::before{opacity:1;visibility:visible;transform:translateX(-50%) scale(1)}" +
    ".ytvr-divider{width:1px;height:22px;background:rgba(255,255,255,0.2);margin:0 4px}";

  let confirmSelectors = [
    "yt-playability-error-supported-renderers button.yt-spec-button-shape-next--filled",
    "yt-player-error-message-renderer button.yt-spec-button-shape-next--filled",
    "#error-screen button.yt-spec-button-shape-next--filled",
    "#content-warning-ok-button",
    "tp-yt-paper-button#content-warning-ok-button",
    "yt-button-renderer#content-warning-ok-button button",
    "ytd-button-renderer#content-warning-ok-button button",
    "#error-screen #proceed-button button",
    "#error-screen #confirm-button button",
    "yt-playability-error-supported-renderers #confirm-button button"
  ];

  function createSvgIcon(type) {
    let ns = "http://www.w3.org/2000/svg";
    let svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    let paths = type === "stretch"
      ? [
          "M9 5L3 5L3 7L7 7L7 9L9 9L9 5Z",
          "M15 5L21 5L21 7L17 7L17 9L15 9L15 5Z",
          "M9 19L3 19L3 17L7 17L7 15L9 15L9 19Z",
          "M15 19L21 19L21 17L17 17L17 15L15 15L15 19Z"
        ]
      : [
          "M4 6L2 6L2 8L4 8L4 10L6 10L6 6L4 6Z",
          "M20 6L22 6L22 8L20 8L20 10L18 10L18 6L20 6Z",
          "M4 18L2 18L2 16L4 16L4 14L6 14L6 18L4 18Z",
          "M20 18L22 18L22 16L20 16L20 14L18 14L18 18L20 18Z"
        ];
    for (let i = 0; i < paths.length; i++) {
      let p = document.createElementNS(ns, "path");
      p.setAttribute("d", paths[i]);
      svg.appendChild(p);
    }
    if (type === "stretch") {
      let rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "10");
      rect.setAttribute("y", "8");
      rect.setAttribute("width", "4");
      rect.setAttribute("height", "8");
      rect.setAttribute("rx", "0.5");
      svg.appendChild(rect);
    } else {
      let txt = document.createElementNS(ns, "text");
      txt.setAttribute("x", "12");
      txt.setAttribute("y", "15");
      txt.setAttribute("text-anchor", "middle");
      txt.setAttribute("font-size", "8");
      txt.setAttribute("font-weight", "bold");
      txt.setAttribute("font-family", "Google Sans, Arial, sans-serif");
      txt.textContent = "A";
      svg.appendChild(txt);
    }
    return svg;
  }

  function syncHtmlFlags() {
    let docEl = document.documentElement;
    if (!docEl) {
      return;
    }
    docEl.classList.toggle("su-adblock-on", Boolean(settings.adblockFix));
    docEl.classList.toggle("su-playables-on", Boolean(settings.hidePlayables));
    docEl.setAttribute("data-su-adblock", settings.adblockFix ? "1" : "0");
    docEl.setAttribute("data-su-logo", settings.premiumLogo ? "1" : "0");
    window.dispatchEvent(new CustomEvent("su-yt-update"));
  }

  function injectStyleAndPreconnect() {
    syncHtmlFlags();
    let root = document.head || document.documentElement;
    if (!root) {
      return;
    }
    let existingStyle = document.getElementById("su-yt-style");
    if (existingStyle) {
      existingStyle.textContent = baseCss;
      return;
    }
    let style = document.createElement("style");
    style.id = "su-yt-style";
    style.textContent = baseCss;
    root.appendChild(style);
    let urls = ["https://i.ytimg.com", "https://yt3.ggpht.com", "https://www.gstatic.com"];
    for (let i = 0; i < urls.length; i++) {
      let link = document.createElement("link");
      link.rel = "preconnect";
      link.href = urls[i];
      link.crossOrigin = "anonymous";
      root.appendChild(link);
    }
  }

  function isVisible(el) {
    if (!el || typeof el.getBoundingClientRect !== "function") {
      return false;
    }
    let rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clickWarning() {
    if (!settings.warningBypass) {
      return false;
    }
    for (let i = 0; i < confirmSelectors.length; i++) {
      let btns = document.querySelectorAll(confirmSelectors[i]);
      for (let j = 0; j < btns.length; j++) {
        if (isVisible(btns[j])) {
          btns[j].click();
          return true;
        }
      }
    }
    let all = document.querySelectorAll("button, tp-yt-paper-button");
    for (let i = 0; i < all.length; i++) {
      let b = all[i];
      let t = ((b.getAttribute("aria-label") || "") + " " + (b.textContent || "")).trim().toLowerCase();
      if ((t.indexOf("t\u00f4i hi\u1ec3u") !== -1 || t.indexOf("i understand") !== -1) && isVisible(b)) {
        b.click();
        return true;
      }
    }
    return false;
  }

  function startWarningBypass() {
    if (!settings.warningBypass || clickWarning()) {
      return;
    }
    let tries = 0;
    let timer = setInterval(function () {
      tries = tries + 1;
      if (!settings.warningBypass || clickWarning() || tries > 40) {
        clearInterval(timer);
      }
    }, 100);
  }

  function getMode() {
    if (document.fullscreenElement) {
      return "fullscreen";
    }
    let flexy = document.querySelector("ytd-watch-flexy");
    if (flexy) {
      if (flexy.hasAttribute("fullscreen")) {
        return "fullscreen";
      }
      if (flexy.hasAttribute("theater")) {
        return "theater";
      }
    }
    return "default";
  }

  function applyRatio() {
    let player = document.getElementById("movie_player");
    if (!player) {
      return;
    }
    let mode = getMode();
    let active = settings.enabled && (!settings.autoStretch || mode === "theater" || mode === "fullscreen");
    let cls = player.classList;
    cls.remove("ytvr-ratio-fill", "ytvr-ratio-cover", "ytvr-ratio-169", "ytvr-ratio-219", "ytvr-ratio-329");
    if (!active) {
      cls.remove("ytvr-stretch-enabled");
    } else {
      cls.add("ytvr-stretch-enabled", "ytvr-ratio-" + settings.ratio);
    }
    lastMode = mode;
  }

  function scheduleApply() {
    if (applyQueued) {
      return;
    }
    applyQueued = true;
    window.requestAnimationFrame(function () {
      applyQueued = false;
      applyRatio();
    });
  }

  function updateButtons() {
    if (stretchBtn) {
      let tip = settings.enabled
        ? "Stretch Video (ON) - Click to disable"
        : "Stretch Video (OFF) - Click to enable";
      stretchBtn.classList.toggle("active", settings.enabled);
      stretchBtn.setAttribute("data-tooltip", tip);
      stretchBtn.setAttribute("aria-label", tip);
    }
    if (autoBtn) {
      let tip = settings.autoStretch
        ? "Auto Stretch in Cinema/Fullscreen (ON)"
        : "Auto Stretch in Cinema/Fullscreen (OFF)";
      autoBtn.classList.toggle("active", settings.autoStretch);
      autoBtn.setAttribute("data-tooltip", tip);
      autoBtn.setAttribute("aria-label", tip);
    }
  }

  function saveSettings(patch) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set(patch);
      }
    } catch (e) {}
  }

  function injectPlayerButtons() {
    let right = document.querySelector(".ytp-right-controls");
    if (!right) {
      return;
    }
    let existing = document.getElementById("ytvr-stretch-btn");
    if (existing) {
      if (!existing.querySelector("svg")) {
        let oldBox = existing.closest(".ytvr-button-container");
        if (oldBox) oldBox.remove();
        else existing.remove();
      } else {
        stretchBtn = existing;
        autoBtn = document.getElementById("ytvr-auto-stretch-btn");
        updateButtons();
        return;
      }
    }
    let box = document.createElement("div");
    box.className = "ytvr-button-container";
    stretchBtn = document.createElement("button");
    stretchBtn.id = "ytvr-stretch-btn";
    stretchBtn.className = "ytp-button ytvr-control-btn";
    stretchBtn.appendChild(createSvgIcon("stretch"));
    stretchBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      settings.enabled = !settings.enabled;
      saveSettings({ ytvr_enabled: settings.enabled });
      scheduleApply();
      updateButtons();
    });
    autoBtn = document.createElement("button");
    autoBtn.id = "ytvr-auto-stretch-btn";
    autoBtn.className = "ytp-button ytvr-control-btn";
    autoBtn.appendChild(createSvgIcon("auto"));
    autoBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      settings.autoStretch = !settings.autoStretch;
      saveSettings({ ytvr_autoStretch: settings.autoStretch });
      scheduleApply();
      updateButtons();
    });
    let div = document.createElement("div");
    div.className = "ytvr-divider";
    box.appendChild(stretchBtn);
    box.appendChild(autoBtn);
    box.appendChild(div);
    right.insertBefore(box, right.firstChild);
    updateButtons();
  }

  function watchFlexy() {
    let flexy = document.querySelector("ytd-watch-flexy");
    if (!flexy) {
      return;
    }
    if (flexyObserver) {
      flexyObserver.disconnect();
    }
    flexyObserver = new MutationObserver(scheduleApply);
    flexyObserver.observe(flexy, { attributes: true, attributeFilter: ["theater", "fullscreen"] });
  }

  function loadSettings() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        let keys = [
          "su_adblockFix",
          "su_warningBypass",
          "su_hidePlayables",
          "su_premiumLogo",
          "ytvr_enabled",
          "ytvr_ratio",
          "ytvr_autoStretch"
        ];
        chrome.storage.sync.get(keys, function (res) {
          if (!res) {
            return;
          }
          settings.adblockFix = res.su_adblockFix !== undefined ? res.su_adblockFix : true;
          settings.warningBypass = res.su_warningBypass !== undefined ? res.su_warningBypass : true;
          settings.hidePlayables = res.su_hidePlayables !== undefined ? res.su_hidePlayables : true;
          settings.premiumLogo = res.su_premiumLogo !== undefined ? res.su_premiumLogo : true;
          settings.enabled = res.ytvr_enabled !== undefined ? res.ytvr_enabled : true;
          settings.ratio = res.ytvr_ratio || "fill";
          settings.autoStretch = res.ytvr_autoStretch !== undefined ? res.ytvr_autoStretch : true;
          syncHtmlFlags();
          if (settings.warningBypass) {
            startWarningBypass();
          }
          scheduleApply();
          updateButtons();
        });
      }
    } catch (e) {}
  }

  function setupPage() {
    injectStyleAndPreconnect();
    loadSettings();
    startWarningBypass();
    injectPlayerButtons();
    watchFlexy();
    setTimeout(function () {
      injectPlayerButtons();
      watchFlexy();
      scheduleApply();
    }, 600);
  }

  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== "sync" || !changes) {
          return;
        }
        if (changes.su_adblockFix) settings.adblockFix = changes.su_adblockFix.newValue;
        if (changes.su_warningBypass) {
          settings.warningBypass = changes.su_warningBypass.newValue;
          if (settings.warningBypass) startWarningBypass();
        }
        if (changes.su_hidePlayables) settings.hidePlayables = changes.su_hidePlayables.newValue;
        if (changes.su_premiumLogo) settings.premiumLogo = changes.su_premiumLogo.newValue;
        if (changes.ytvr_enabled) settings.enabled = changes.ytvr_enabled.newValue;
        if (changes.ytvr_ratio) settings.ratio = changes.ytvr_ratio.newValue;
        if (changes.ytvr_autoStretch) settings.autoStretch = changes.ytvr_autoStretch.newValue;
        syncHtmlFlags();
        scheduleApply();
        updateButtons();
      });
    }
  } catch (e) {}

  if (document.head || document.documentElement) {
    injectStyleAndPreconnect();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPage, { once: true });
  } else {
    setupPage();
  }
  window.addEventListener("yt-navigate-finish", setupPage);
}
