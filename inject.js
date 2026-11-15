"use strict";
{
  // MAIN-world hooks are required to see player responses. Preferences arrive
  // from the isolated script; an unknown preference must never mean enabled.
  const adKeys = ["adPlacements", "playerAds", "adSlots"];
  const cachedPlayers = new WeakMap();
  let filteredCount = 0;
  const enabled = () => document.documentElement?.getAttribute("data-su-adblock") === "1";

  function playerEndpoint(url) {
    try {
      const parsed = new URL(url, location.href);
      return /(^|\.)youtube(?:-nocookie)?\.com$/.test(parsed.hostname) &&
        /^\/youtubei\/v\d+\/player\/?$/.test(parsed.pathname);
    } catch { return false; }
  }

  function cleanPlayer(value) {
    if (!value || typeof value !== "object" || !enabled()) return value;
    if (Array.isArray(value)) {
      const items = value.map(cleanPlayer);
      return items.some((item, index) => item !== value[index]) ? items : value;
    }
    let result = value;
    for (const key of adKeys) {
      if (Object.hasOwn(value, key)) {
        if (result === value) result = { ...value };
        delete result[key];
      }
    }
    if (value.playerResponse) {
      const playerResponse = cleanPlayer(value.playerResponse);
      if (playerResponse !== value.playerResponse) result = { ...result, playerResponse };
    }
    // Never manufacture an OK playability status or a missing media URL.
    if (result !== value) {
      document.documentElement?.setAttribute("data-su-filtered-count", String(++filteredCount));
    }
    return result;
  }

  function cleanText(text) {
    try {
      const value = JSON.parse(text);
      const cleaned = cleanPlayer(value);
      return cleaned === value ? text : JSON.stringify(cleaned);
    } catch { return text; }
  }

  const initialDescriptor = Object.getOwnPropertyDescriptor(window, "ytInitialPlayerResponse");
  if (!initialDescriptor || (initialDescriptor.configurable && "value" in initialDescriptor)) {
    let initial = initialDescriptor?.value;
    Object.defineProperty(window, "ytInitialPlayerResponse", {
      configurable: true,
      enumerable: true,
      get() {
        if (!enabled() || !initial || typeof initial !== "object") return initial;
        if (!cachedPlayers.has(initial)) cachedPlayers.set(initial, cleanPlayer(initial));
        return cachedPlayers.get(initial);
      },
      set(value) { initial = value; }
    });
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await Reflect.apply(originalFetch, this, args);
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    if (!enabled() || !playerEndpoint(url) || !response.ok) return response;
    try {
      const original = await response.clone().text();
      const cleaned = cleanText(original);
      if (cleaned === original) return response;
      const headers = new Headers(response.headers);
      headers.delete("content-length");
      headers.delete("content-encoding");
      const replacement = new Response(cleaned, {
        status: response.status, statusText: response.statusText, headers
      });
      for (const key of ["url", "type", "redirected"]) {
        Object.defineProperty(replacement, key, { value: response[key] });
      }
      return replacement;
    } catch { return response; }
  };

  // YouTube also uses XHR, including responseType=json, during SPA navigation.
  for (const property of ["response", "responseText"]) {
    const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, property);
    if (!descriptor?.get || !descriptor.configurable) continue;
    const cache = new WeakMap();
    Object.defineProperty(XMLHttpRequest.prototype, property, {
      ...descriptor,
      get() {
        const original = descriptor.get.call(this);
        if (!enabled() || this.readyState !== 4 || !playerEndpoint(this.responseURL)) return original;
        if (this.responseType && this.responseType !== "text" && this.responseType !== "json") return original;
        const previous = cache.get(this);
        if (previous && previous.original === original) return previous.cleaned;
        const cleaned = typeof original === "string" ? cleanText(original) : cleanPlayer(original);
        cache.set(this, { original, cleaned });
        return cleaned;
      }
    });
  }
}
