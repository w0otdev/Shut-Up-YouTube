"use strict";
// Follow YouTube's own confirmation controls. The current interstitial uses
// <button-view-model><a href="/watch?...&rco=1">, not a <button>.
globalThis.SU_WARNINGS = (() => {
  const rootsSelector = [
    "yt-playability-error-supported-renderers", "yt-player-interstitial-renderer",
    "yt-interstitial-view-model", "yt-player-error-message-renderer",
    "ytd-player-error-message-renderer", "ytd-enforcement-message-view-model",
    "#error-screen", "#content-warning", "#player-error-message-container", ".ytp-error",
    "yt-confirm-dialog-renderer", "ytd-confirm-dialog-renderer", "tp-yt-paper-dialog"
  ].join(",");
  const controls = "a[href], button, tp-yt-paper-button, [role='button']";
  const explicitSelector = "#content-warning-ok-button, [id='id.interstitial_continue_button']";
  const warningText = /viewer discretion|content warning|may be inappropriate|age.restricted|confirm your age|người xem.*(?:cẩn trọng|cân nhắc)|cân nhắc trước khi xem|cảnh báo nội dung|giới hạn độ tuổi|không phù hợp với một số/i;
  const ageRequirement = /sign in to confirm your age|verify your age|age verification|đăng nhập.*(?:tuổi|độ tuổi)|xác minh.*(?:tuổi|độ tuổi)/i;
  const confirmLabel = /^(?:i understand|i wish to proceed|tôi (?:đã )?hiểu)(?:\s|$|[.!])/i;
  const shortConfirmLabel = /^(?:continue|proceed|confirm|tiếp tục|xác nhận)(?:[.!])?$/i;
  const excludedLabel = /sign in|log in|verify.*age|learn more|cancel|đăng nhập|xác minh.*tuổi|tìm hiểu|hủy/i;
  const retryDelay = 1200;
  const maxAttempts = 4;
  let attempts = new Map();
  let lastVideo = null;
  let wasEnabled = false;
  let attempted = false;
  let state = "idle";
  let retryTimer = null;

  function suspend() {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  function retry(delay) {
    if (!document.hidden) retryTimer = setTimeout(() => tick(wasEnabled), delay);
  }

  function normalize(text) {
    return (text || "").normalize("NFKC").replace(/[\u200B-\u200F\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  }

  function videoId(url = new URL(location.href)) {
    return url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
  }

  function visible(element) {
    if (!element.isConnected || !element.getClientRects().length || element.closest("[hidden], [inert]")) return false;
    if (element.checkVisibility) return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function confirmationLink(element) {
    const anchor = element.closest("a[href]");
    if (!anchor) return { allowed: true, consent: false, href: "" };
    try {
      const url = new URL(anchor.href, location.href);
      const id = videoId();
      return {
        allowed: !!id && /^https?:$/.test(url.protocol) && url.origin === location.origin && videoId(url) === id,
        consent: url.searchParams.get("rco") === "1" || url.searchParams.get("has_verified") === "1",
        href: url.href
      };
    } catch { return { allowed: false }; }
  }

  function tick(enabled) {
    suspend();
    const currentVideo = videoId() || location.pathname;
    if (lastVideo !== currentVideo || wasEnabled !== enabled) {
      attempts = new Map();
      attempted = false;
      lastVideo = currentVideo;
      wasEnabled = enabled;
    }
    if (!enabled) { state = "off"; return; }

    const candidates = new Map();
    let ageBlocked = false;
    let warningVisible = false;
    function consider(element, root, explicit = false) {
      const button = element.matches(controls) ? element : element.querySelector(controls);
      if (!button || !visible(button) || button.disabled || button.closest('[aria-disabled="true"]')) return;
      const labels = [normalize(button.textContent), normalize(button.getAttribute("aria-label"))].filter(Boolean);
      if (labels.some(label => excludedLabel.test(label))) return;
      const link = confirmationLink(button);
      if (!link.allowed) return;
      const inWarning = warningText.test(normalize(root?.textContent));
      const primary = button.closest(".interstitialViewModelPrimaryButtonItem");
      if (explicit || labels.some(label => confirmLabel.test(label)) ||
          (inWarning && labels.some(label => shortConfirmLabel.test(label))) ||
          (primary && link.consent)) {
        candidates.set(button, `${button.id}|${labels.join("|")}|${link.href}`);
      }
    }
    for (const root of document.querySelectorAll(rootsSelector)) {
      if (!visible(root)) continue;
      const text = normalize(root.textContent);
      ageBlocked ||= ageRequirement.test(text);
      warningVisible ||= warningText.test(text);
      for (const button of root.querySelectorAll(controls)) consider(button, root);
    }
    for (const element of document.querySelectorAll(explicitSelector)) {
      consider(element, element.closest(rootsSelector), true);
    }

    if (candidates.size) {
      state = "confirming";
      let exhausted = true;
      for (const [button, signature] of candidates) {
        const previous = attempts.get(signature) || { count: 0, time: 0 };
        if (previous.count >= maxAttempts) continue;
        exhausted = false;
        const remaining = retryDelay - (Date.now() - previous.time);
        if (remaining > 0) { retry(remaining); return; }
        attempts.set(signature, { count: previous.count + 1, time: Date.now() });
        attempted = true;
        // Preserve the native href, player parameters, and YouTube event handler.
        // A click can happen before hydration; retry only while the prompt remains.
        button.click();
        retry(retryDelay);
        return;
      }
      if (exhausted) state = "failed";
    } else if (ageBlocked) {
      state = "age-required";
    } else if (warningVisible) {
      state = "waiting";
    } else if (attempted) {
      const media = document.querySelector("#movie_player video");
      state = media?.readyState >= 2 ? "confirmed" : "loading";
    } else {
      state = "idle";
    }
  }

  function status() {
    const messages = {
      off: "Warning bypass is off.",
      idle: "No content confirmation is currently needed.",
      waiting: "Waiting for YouTube's content confirmation control.",
      confirming: "Confirming YouTube's content warning…",
      failed: "Automatic confirmation did not dismiss the warning. Use its Continue button.",
      "age-required": "YouTube requires sign-in or age verification; no content confirmation is available.",
      loading: "Confirmation sent; waiting for video to load.",
      confirmed: "Content warning confirmed; video is ready."
    };
    return { state, message: messages[state] };
  }
  return { tick, status, suspend, selector: `${rootsSelector},${explicitSelector}` };
})();
