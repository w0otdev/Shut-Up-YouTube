"use strict";

function onInstall() {
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
    let data = res || {};
    chrome.storage.sync.set({
      su_adblockFix: data.su_adblockFix !== undefined ? data.su_adblockFix : true,
      su_warningBypass: data.su_warningBypass !== undefined ? data.su_warningBypass : true,
      su_hidePlayables: data.su_hidePlayables !== undefined ? data.su_hidePlayables : true,
      su_premiumLogo: data.su_premiumLogo !== undefined ? data.su_premiumLogo : true,
      ytvr_enabled: data.ytvr_enabled !== undefined ? data.ytvr_enabled : true,
      ytvr_ratio: data.ytvr_ratio || "fill",
      ytvr_autoStretch: data.ytvr_autoStretch !== undefined ? data.ytvr_autoStretch : true
    });
  });
}

chrome.runtime.onInstalled.addListener(onInstall);
