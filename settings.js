"use strict";
// Shared by the isolated content scripts, popup, and service worker.
globalThis.SU_SETTINGS = (() => {
  const defaults = Object.freeze({
    su_adblockFix: true,
    su_warningBypass: true,
    su_hidePlayables: true,
    su_hideShorts: true,
    su_hideAI: true,
    su_premiumLogo: true,
    ytvr_enabled: true,
    ytvr_ratio: "fill",
    ytvr_autoStretch: true
  });
  const ratios = ["fill", "cover", "169", "219", "329"];
  function normalize(values = {}) {
    const result = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (typeof defaults[key] === "boolean" && typeof values[key] === "boolean") {
        result[key] = values[key];
      }
    }
    if (ratios.includes(values.ytvr_ratio)) result.ytvr_ratio = values.ytvr_ratio;
    return result;
  }
  return { defaults, normalize };
})();
