"use strict";
// Route only relevant DOM changes to the corresponding feature. Feed changes
// have their own incremental observer and never refresh the player or logo.
globalThis.SU_ACTIVITY = (() => {
  const PLAYER = 1, LOGO = 2, WARNING = 4, ALL = 7;
  const skipSelector = ".ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button";
  const rules = [
    [PLAYER, `#movie_player, ytd-watch-flexy, .ytp-right-controls, ${skipSelector}`],
    [LOGO, "ytd-logo"],
    [WARNING, SU_WARNINGS.selector]
  ];
  let notify = () => {};
  let active = false;
  const attributes = new MutationObserver(records => {
    let dirty = 0;
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!target) continue;
      if (target.id === "movie_player" && record.attributeName === "class") {
        const wasAd = (record.oldValue || "").split(/\s+/).includes("ad-showing");
        if (wasAd === target.classList.contains("ad-showing")) continue;
        dirty |= PLAYER;
      } else if (target.matches("ytd-watch-flexy")) dirty |= PLAYER;
      else dirty |= WARNING;
    }
    if (dirty) notify(dirty);
  });
  const adAttributes = new MutationObserver(() => notify(PLAYER));
  const warningVisibility = new MutationObserver(() => notify(WARNING));
  const structure = new MutationObserver(records => {
    let dirty = 0;
    for (const record of records) {
      const target = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (target?.closest("ytd-logo")) dirty |= LOGO;
      if (target?.closest(".ytp-right-controls")) dirty |= PLAYER;
      if (target?.closest(SU_WARNINGS.selector)) dirty |= WARNING;
      for (const nodes of [record.addedNodes, record.removedNodes]) {
        for (const node of nodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          for (const [bit, selector] of rules) {
            if (!(dirty & bit) && (node.matches(selector) || node.querySelector(selector))) dirty |= bit;
          }
        }
      }
      if (dirty === ALL) break;
    }
    if (dirty) notify(dirty);
  });

  function bind() {
    attributes.disconnect();
    adAttributes.disconnect();
    warningVisibility.disconnect();
    if (!active) return;
    const player = document.getElementById("movie_player");
    if (player) {
      attributes.observe(player, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
      // Skip controls can become enabled/visible without being replaced. Only
      // observe this noisy subtree for the duration of an actual ad.
      if (player.classList.contains("ad-showing")) {
        adAttributes.observe(player, { subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "disabled", "aria-disabled"] });
      }
    }
    const flexy = document.querySelector("ytd-watch-flexy");
    if (flexy) attributes.observe(flexy, { attributes: true, attributeFilter: ["theater", "fullscreen"] });
    const ancestors = new Set();
    for (const root of document.querySelectorAll(SU_WARNINGS.selector)) {
      attributes.observe(root, {
        subtree: true, characterData: true, attributes: true,
        attributeFilter: ["class", "style", "hidden", "inert", "disabled", "aria-disabled", "href", "aria-label"]
      });
      // A dialog may already exist inside a hidden wrapper when it is shown.
      // Observe wrapper visibility only while there is actual warning content.
      if (root.childElementCount || root.textContent.trim()) {
        for (let parent = root.parentElement; parent; parent = parent.parentElement) ancestors.add(parent);
      }
    }
    for (const parent of ancestors) {
      warningVisibility.observe(parent, { attributes: true, attributeFilter: ["class", "style", "hidden", "inert"] });
    }
  }

  function start(callback) {
    notify = callback;
    active = true;
    structure.observe(document, { childList: true, subtree: true });
    bind();
  }

  function stop() {
    active = false;
    structure.disconnect();
    attributes.disconnect();
    adAttributes.disconnect();
    warningVisibility.disconnect();
  }
  return { PLAYER, LOGO, WARNING, ALL, start, stop, bind };
})();
