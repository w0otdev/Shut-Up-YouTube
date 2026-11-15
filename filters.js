"use strict";
globalThis.SU_FILTERS = (() => {
  const videoCards = [
    "ytd-rich-item-renderer", "ytd-video-renderer", "ytd-grid-video-renderer",
    "ytd-compact-video-renderer", "ytd-playlist-video-renderer",
    "ytd-playlist-panel-video-renderer", "yt-lockup-view-model",
    "ytm-video-with-context-renderer", "ytm-video-renderer", "ytm-compact-video-renderer",
    "ytd-reel-item-renderer", "ytm-shorts-lockup-view-model", "ytm-shorts-lockup-view-model-v2",
    ".ytGridShelfViewModelGridShelfItem"
  ].join(",");
  const shortsCards = "ytd-reel-item-renderer, ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2";
  const shortsShelves = "ytd-reel-shelf-renderer, ytm-reel-shelf-renderer, ytm-shorts-shelf-renderer, ytd-rich-shelf-renderer[is-shorts]";
  const navigation = "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytm-pivot-bar-item-renderer";
  const shelves = "grid-shelf-view-model, ytd-shelf-renderer, ytd-rich-shelf-renderer, ytd-rich-section-renderer";
  const targets = `${videoCards},${shortsShelves},${navigation},${shelves},[data-su-hide-shorts],[data-su-hide-ai]`;
  // Inspect video metadata only: channel names, comments, menus and the active
  // player's description must not cause unrelated videos or the player to vanish.
  const metadata = [
    "#video-title", "#video-title-link", "h3", "#description-text",
    ".metadata-snippet-text", ".metadata-snippet-text-navigation",
    ".yt-lockup-metadata-view-model__title", ".yt-content-metadata-view-model__metadata-text",
    "ytd-badge-supported-renderer", "yt-badge-supported-renderer",
    "yt-badge-view-model", "badge-shape"
  ].join(",");
  const excluded = "ytd-channel-name, #channel-name, #channel-info, #byline-container, ytd-menu-renderer, ytd-comments, ytd-comment-thread-renderer";
  const generated = /\bai[\s-]*generated\b|\b(?:generated|created|made|produced)\s+(?:by|with|using)\s+(?:generative\s+)?ai\b|\b(?:tao|san xuat)(?: ra)?\s+(?:boi|bang|tu)\s+(?:cong nghe\s+)?ai\b|\bdo\s+ai\s+(?:tao|san xuat)\b/g;
  const disclosure = /^(?:altered or synthetic(?: content)?|synthetic content|noi dung (?:da duoc )?chinh sua hoac (?:noi dung )?(?:nhan tao|tong hop)|noi dung nhan tao)$/;
  const negativePrefix = /(?:\b(?:not|no|never|without|isn't|wasn't)\s+(?:(?:entirely|fully|actually|using|any)\s+)*|\b(?:khong|chua)(?:\s+(?:phai|duoc|he|su dung))*\s*)$/;
  let hideShorts = false;
  let hideAI = false;
  let timer = null;
  const pending = new Set();
  const candidates = new Set();
  let discovery = null;
  let rescanOnResume = false;
  const contentLinks = "#description-text, .metadata-snippet-text, .metadata-snippet-text-navigation, ytd-menu-renderer";

  function normalize(text) {
    return (text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()
      .replace(/[\u2010-\u2015]/g, "-").replace(/[’‘]/g, "'")
      .replace(/\s+/g, " ").trim();
  }

  function aiText(text) {
    const value = normalize(text);
    if (disclosure.test(value)) return true;
    generated.lastIndex = 0;
    for (const match of value.matchAll(generated)) {
      if (!negativePrefix.test(value.slice(0, match.index))) return true;
    }
    return false;
  }

  function videoLink(anchor) {
    const href = anchor.getAttribute("href") || "";
    // Most feed links are root-relative. Avoid URL objects for those hot paths.
    if (href.startsWith("/") && !href.startsWith("//") && !/[\\%]|\/\./.test(href)) {
      if (/^\/shorts(?:[/?#]|$)/.test(href)) return 2;
      if (/^\/watch\?(?:[^#]*&)?v=/.test(href)) return 1;
      if (!href.startsWith("/watch?")) return 0;
    }
    try {
      const url = new URL(href, location.href);
      if (!/(^|\.)youtube\.com$/.test(url.hostname)) return 0;
      if (/^\/shorts(?:\/|$)/.test(url.pathname)) return 2;
      return url.pathname === "/watch" && url.searchParams.has("v") ? 1 : 0;
    } catch { return 0; }
  }

  function hasAI(card) {
    for (const element of card.querySelectorAll(metadata)) {
      if (element.closest(excluded)) continue;
      // Modern lockups render channel names in the same metadata class as
      // video labels. Do not treat the linked channel's name as a disclosure.
      let channel = false;
      for (const anchor of element.querySelectorAll("a[href]")) {
        try { channel = /^\/(?:@|channel\/|user\/|c\/)/.test(new URL(anchor.getAttribute("href"), location.href).pathname); }
        catch { /* Ignore malformed links. */ }
        if (channel) break;
      }
      if (channel) continue;
      // Preserve separate fields rather than concatenating channel names/titles.
      if (aiText(element.textContent) || aiText(element.getAttribute("title")) || aiText(element.getAttribute("aria-label"))) return true;
      for (const child of element.querySelectorAll("[title], [aria-label]")) {
        if (!child.closest(excluded) && (aiText(child.getAttribute("title")) || aiText(child.getAttribute("aria-label")))) return true;
      }
    }
    return false;
  }

  function mark(element, name, hidden) {
    if (hidden !== element.hasAttribute(name)) element.toggleAttribute(name, hidden);
  }

  function filter(element) {
    const card = element.matches(videoCards);
    let shorts = hideShorts && element.matches(`${shortsShelves},${shortsCards}`);
    let hasVideo = false;
    if ((hideAI && card) || (hideShorts && !shorts && (card || element.matches(`${navigation},${shelves}`)))) {
      // Only content/navigation links count; a description linking to a Short
      // must not hide an otherwise regular video card.
      let hasContentVideo = false;
      let regular = false;
      for (const anchor of element.querySelectorAll("a[href]")) {
        const kind = videoLink(anchor);
        if (!kind) continue;
        hasVideo = true;
        if (!anchor.closest(contentLinks)) {
          hasContentVideo = true;
          regular ||= kind === 1;
        }
        if (regular || !hideShorts) break;
      }
      shorts ||= hasContentVideo && !regular;
      // Hide an unhydrated dedicated shelf's outer section as well, without
      // treating a mixed shelf containing regular videos as Shorts-only.
      shorts ||= element.matches("ytd-rich-section-renderer") && !hasContentVideo && !!element.querySelector(shortsShelves);
    }
    mark(element, "data-su-hide-shorts", hideShorts && shorts);
    mark(element, "data-su-hide-ai", hideAI && card && hasVideo && hasAI(element));
  }

  function ancestors(node) {
    for (let element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement; element; element = element.parentElement) {
      if (element.matches(targets)) candidates.add(element);
    }
  }

  function clear() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
    candidates.clear();
    discovery = null;
  }

  function schedule() {
    if (timer === null && !document.hidden) timer = setTimeout(flush, 16);
  }

  function flush() {
    timer = null;
    const deadline = performance.now() + 4;
    // Yield between small batches so a large feed doesn't monopolize a frame.
    do {
      if (candidates.size) {
        const element = candidates.values().next().value;
        candidates.delete(element);
        if (element.isConnected) filter(element);
      } else if (discovery) {
        const next = discovery.next();
        if (next.done) discovery = null;
        else candidates.add(next.value);
      } else if (pending.size) {
        const root = pending.values().next().value;
        pending.delete(root);
        if (!root.isConnected) continue;
        // A queued ancestor will discover this subtree once.
        let covered = false;
        for (let parent = root.parentNode; parent; parent = parent.parentNode) {
          if (pending.has(parent)) { covered = true; break; }
        }
        if (covered) continue;
        if (root.nodeType === Node.ELEMENT_NODE && root.matches(targets)) candidates.add(root);
        discovery = root.querySelectorAll(targets).values();
      } else return;
    } while (performance.now() < deadline);
    schedule();
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "childList") {
        // Rescan existing cards on removal/text replacement, but avoid scanning
        // the whole feed each time an infinite-scroll continuation is appended.
        ancestors(record.target);
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) pending.add(node);
        }
      } else ancestors(record.target);
    }
    // Bound retained roots during exceptionally large mutation bursts.
    if (pending.size > 256 || candidates.size > 2048) {
      clear();
      pending.add(document);
    }
    if (pending.size || candidates.size) schedule();
  });

  function observe() {
    observer.observe(document, {
      subtree: true, childList: true, characterData: hideAI, attributes: true,
      attributeFilter: hideAI ? ["href", "title", "aria-label", "is-shorts"] : ["href", "is-shorts"]
    });
    pending.add(document);
    schedule();
  }

  function suspend() {
    observer.disconnect();
    clear();
    rescanOnResume = hideShorts || hideAI;
  }

  function resume() {
    if (rescanOnResume && !document.hidden) {
      rescanOnResume = false;
      observe();
    }
  }
  document.addEventListener("visibilitychange", () => document.hidden ? suspend() : resume());
  window.addEventListener("pagehide", suspend);
  window.addEventListener("pageshow", resume);

  function sync(settings) {
    if (hideShorts === settings.su_hideShorts && hideAI === settings.su_hideAI) return;
    hideShorts = settings.su_hideShorts;
    hideAI = settings.su_hideAI;
    observer.disconnect();
    clear();
    rescanOnResume = false;
    // Remove our own markers only; never overwrite YouTube's native visibility.
    for (const element of document.querySelectorAll("[data-su-hide-shorts], [data-su-hide-ai]")) {
      if (!hideShorts) element.removeAttribute("data-su-hide-shorts");
      if (!hideAI) element.removeAttribute("data-su-hide-ai");
    }
    if (!hideShorts && !hideAI) return;
    if (document.hidden) rescanOnResume = true;
    else observe();
  }

  return { sync };
})();
