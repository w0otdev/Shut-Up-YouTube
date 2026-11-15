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
      let items = value;
      for (let index = 0; index < value.length; index++) {
        const item = cleanPlayer(value[index]);
        if (item !== value[index]) {
          if (items === value) items = value.slice();
          items[index] = item;
        }
      }
      return items;
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
    // Most responses have no ad fields. Leave them untouched without allocating
    // a second object graph. Escaped keys still go through the JSON parser.
    if (!enabled() || !/"(?:adPlacements|playerAds|adSlots)"\s*:|\\u/.test(text)) return text;
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

  const wrappedResponses = new WeakSet();
  function wrapResponse(response) {
    if (wrappedResponses.has(response)) return response;
    const json = response.json;
    const text = response.text;
    const clone = response.clone;
    try {
      // Preserve the actual network Response and its byte stream. Replacing it
      // with a synthetic stream breaks BYOB readers and can interfere with the
      // browser/other blockers' body handling during video navigation. Only
      // filter completed JSON/text reads; raw stream consumers pass through.
      Object.defineProperties(response, {
        json: { configurable: true, writable: true, value: async function (...args) {
          const value = await Reflect.apply(json, this, args);
          return this === response ? cleanPlayer(value) : value;
        } },
        text: { configurable: true, writable: true, value: async function (...args) {
          const value = await Reflect.apply(text, this, args);
          return this === response ? cleanText(value) : value;
        } },
        clone: { configurable: true, writable: true, value: function (...args) {
          const copy = Reflect.apply(clone, this, args);
          return this === response ? wrapResponse(copy) : copy;
        } }
      });
      wrappedResponses.add(response);
    } catch {
      // A response protected by another extension stays usable as-is.
      for (const [name, method] of [["json", json], ["text", text], ["clone", clone]]) {
        try {
          if (response[name] !== method) Object.defineProperty(response, name, { configurable: true, writable: true, value: method });
        } catch { /* Leave externally protected properties alone. */ }
      }
    }
    return response;
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await Reflect.apply(originalFetch, this, args);
    if (!enabled() || !response.ok || !response.body) return response;
    try {
      const url = args[0] instanceof Request ? args[0].url : String(args[0]);
      return playerEndpoint(url) ? wrapResponse(response) : response;
    } catch {
      return response;
    }
  };

  // YouTube also uses XHR, including responseType=json, during SPA navigation.
  const xhrCache = new WeakMap();
  for (const property of ["response", "responseText"]) {
    const descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, property);
    if (!descriptor?.get || !descriptor.configurable) continue;
    Object.defineProperty(XMLHttpRequest.prototype, property, {
      ...descriptor,
      get() {
        const original = descriptor.get.call(this);
        if (!enabled() || this.readyState !== 4 || !playerEndpoint(this.responseURL)) return original;
        if (this.responseType && this.responseType !== "text" && this.responseType !== "json") return original;
        const previous = xhrCache.get(this);
        if (previous && previous.original === original) return previous.cleaned;
        const cleaned = typeof original === "string" ? cleanText(original) : cleanPlayer(original);
        xhrCache.set(this, { original, cleaned });
        return cleaned;
      }
    });
  }
}
